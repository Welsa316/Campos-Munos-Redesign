// Fields that take one name from a fixed list refuse a list of names.
// express-validator's isIn checks each item of an array on its own, so
// {"language": ["es"]} used to pass and reach the database as '{es}'. Each
// case here sends a list and expects a 400 with nothing changed; each also
// sends the single name, so a 400 for some unrelated reason cannot pass.
// Real HTTP and Postgres; synthetic people only. Email goes to a fake Resend.
//
// Own database: <TEST_DATABASE_URL's name>_listinputs (must contain "test").
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import pino from 'pino'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_listinputs`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

let server, base, db, resendServer, cookie, meId

before(async () => {
  if (SKIP) return
  resendServer = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"fake"}') })
  })
  resendServer.listen(0)
  await new Promise((r) => resendServer.once('listening', r))
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${resendServer.address().port}`
  process.env.RESEND_API_KEY = 're_test_not_a_real_key'
  process.env.ADMIN_EMAIL = 'office@example.test'
  process.env.JWT_SECRET = 'list-inputs-test-secret-0123456789abcdef'
  process.env.NODE_ENV = 'test'

  const admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])).rowCount) await admin.query(`CREATE DATABASE "${DB_NAME}"`)
  await admin.end()
  const c = new pg.Client({ connectionString: URL_ })
  await c.connect()
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await c.end()
  process.env.DATABASE_URL = URL_
  execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  db = new pg.Pool({ connectionString: URL_ })

  const staffCli = await import('./scripts/staff.js')
  await staffCli.run(db, 'create', { email: 'desk@example.test', name: 'Desk', role: 'front_desk' }, () => {})
  const me = (await db.query("SELECT id, token_version FROM admin_users WHERE email = 'desk@example.test'")).rows[0]
  meId = me.id
  cookie = `token=${jwt.sign({ id: me.id, email: 'desk@example.test', tv: me.token_version }, process.env.JWT_SECRET)}`

  const { createApp, addFallbackHandlers } = await import('./app.js')
  server = addFallbackHandlers(createApp({ env: { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET }, log: pino({ level: 'silent' }) })).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  resendServer?.close()
  await db?.end()
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, body, { signedIn = true } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(signedIn ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, text }
}

const inquiry = (extra = {}) => ({ firstName: 'Rosa', lastName: 'Prueba', email: 'rosa@example.test', phone: '504-555-0123', message: 'Necesito ayuda', ...extra })
const leadCount = async () => (await db.query('SELECT COUNT(*)::int AS n FROM submissions')).rows[0].n
async function lead() {
  return (await db.query(
    `INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0101', 'Hola') RETURNING id`
  )).rows[0].id
}

for (const [field, one] of [['source', 'contact'], ['consultationType', 'asilo'], ['language', 'es']]) {
  test(`the website form refuses ${field} sent as a list, and stores nothing`, { skip: SKIP }, async () => {
    const before_ = await leadCount()
    for (const list of [[one], [one, one]]) {
      const res = await call('POST', '/api/submissions', inquiry({ [field]: list }), { signedIn: false })
      assert.equal(res.status, 400, `${field}: ${JSON.stringify(list)} → ${res.text}`)
    }
    assert.equal(await leadCount(), before_, 'a refused form stores no lead')

    // Its own sender: the same person writing again is one lead, not two.
    const ok = await call('POST', '/api/submissions', inquiry({ [field]: one, email: `${field.toLowerCase()}@example.test`, phone: `504-555-01${field.length}` }), { signedIn: false })
    assert.equal(ok.status, 201, `${field}: the single value is accepted (${ok.text})`)
    assert.equal(await leadCount(), before_ + 1)
  })
}

test("a lead's status sent as a list is refused and the status stays", { skip: SKIP }, async () => {
  const id = await lead()
  assert.equal((await call('PATCH', `/api/submissions/${id}/status`, { status: ['contacted'] })).status, 400)
  assert.equal((await db.query('SELECT status FROM submissions WHERE id = $1', [id])).rows[0].status, 'new')
  assert.equal((await call('PATCH', `/api/submissions/${id}/status`, { status: 'contacted' })).status, 200)
  assert.equal((await db.query('SELECT status FROM submissions WHERE id = $1', [id])).rows[0].status, 'contacted')
})

test('spam or not spam sent as a list is refused and the lead stays as it was', { skip: SKIP }, async () => {
  const id = await lead()
  assert.equal((await call('POST', `/api/submissions/${id}/spam`, { state: ['spam'] })).status, 400)
  assert.equal((await db.query('SELECT spam_state FROM submissions WHERE id = $1', [id])).rows[0].spam_state, null)
  assert.equal((await call('POST', `/api/submissions/${id}/spam`, { state: 'spam' })).status, 200)
  assert.equal((await db.query('SELECT spam_state FROM submissions WHERE id = $1', [id])).rows[0].spam_state, 'spam')
})

test('an avatar colour sent as a list is refused and the picture stays', { skip: SKIP }, async () => {
  const stored = async () => (await db.query('SELECT avatar, avatar_bg FROM admin_users WHERE id = $1', [meId])).rows[0]
  const before_ = await stored()
  assert.equal((await call('PUT', '/api/auth/avatar', { avatar: 'emoji:🐙', bg: ['mint'] })).status, 400)
  assert.deepEqual(await stored(), before_)
  assert.equal((await call('PUT', '/api/auth/avatar', { avatar: 'emoji:🐙', bg: 'mint' })).status, 200)
  assert.equal((await stored()).avatar_bg, 'mint')
})
