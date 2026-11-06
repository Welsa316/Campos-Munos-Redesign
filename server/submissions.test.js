// Website leads in the portal, over real HTTP and a real Postgres. Email goes
// to a fake Resend on localhost (RESEND_BASE_URL), never to Resend itself.
// Synthetic people only.
//
// Own database: <TEST_DATABASE_URL's name>_leads (created if missing; must
// contain "test"; schema dropped and rebuilt).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import pg from 'pg'
import pino from 'pino'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_leads`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

let server, base, db, resendServer, cookie
const emails = []

before(async () => {
  if (SKIP) return
  // The fake Resend: records each email, answers like the real one.
  resendServer = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/emails') emails.push(JSON.parse(raw))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: `fake-${emails.length}` }))
    })
  })
  resendServer.listen(0)
  await new Promise((r) => resendServer.once('listening', r))
  // Read by the Resend SDK when it loads, so before the app is imported.
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${resendServer.address().port}`
  process.env.RESEND_API_KEY = 're_test_not_a_real_key'
  process.env.ADMIN_EMAIL = 'office@example.test'
  process.env.JWT_SECRET = 'leads-test-secret-0123456789abcdef01234'
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

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}

async function lead(first, { createdAt = new Date(), archived = false } = {}) {
  return (await db.query(
    `INSERT INTO submissions (first_name, last_name, email, phone, message, is_archived, created_at)
     VALUES ($1, 'Prueba', $2, '504-555-0101', 'Hola', $3, $4) RETURNING id`,
    [first, `${first.toLowerCase()}@example.test`, archived, createdAt]
  )).rows[0].id
}

const repliesTo = async (id) => (await db.query('SELECT id, body FROM replies WHERE submission_id = $1 ORDER BY id', [id])).rows

test('a reply sent twice with the same key is stored and emailed once', { skip: SKIP }, async () => {
  const id = await lead('Ana')
  const clientKey = crypto.randomUUID()
  const sentBefore = emails.length

  const first = await call('POST', `/api/submissions/${id}/reply`, { body: 'Hola Ana, gracias por escribir.', clientKey })
  assert.equal(first.status, 201, first.text)
  assert.equal(first.json.emailFailed, false)
  assert.equal(first.json.duplicate, undefined)

  const again = await call('POST', `/api/submissions/${id}/reply`, { body: 'Hola Ana, gracias por escribir.', clientKey })
  assert.equal(again.status, 200, again.text)
  assert.equal(again.json.duplicate, true)
  assert.equal(again.json.id, first.json.id, 'the reply already sent')
  assert.equal(again.json.body, first.json.body)
  assert.equal(again.json.sent_by_name, 'Desk')

  assert.equal((await repliesTo(id)).length, 1)
  assert.equal(emails.length - sentBefore, 1, 'one email')
  assert.equal(emails.at(-1).to, 'ana@example.test')
})

test('two sends with the same key at the same moment still make one reply and one email', { skip: SKIP }, async () => {
  const id = await lead('Bea')
  const clientKey = crypto.randomUUID()
  const sentBefore = emails.length
  const both = await Promise.all([1, 2].map(() => call('POST', `/api/submissions/${id}/reply`, { body: 'Hola Bea', clientKey })))
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 201])
  assert.equal((await repliesTo(id)).length, 1)
  assert.equal(emails.length - sentBefore, 1)
})

test('a key is per lead, a reply without a key is sent every time, and a bad key is refused', { skip: SKIP }, async () => {
  const a = await lead('Cata')
  const b = await lead('Dora')
  const clientKey = crypto.randomUUID()
  assert.equal((await call('POST', `/api/submissions/${a}/reply`, { body: 'Hola', clientKey })).status, 201)
  assert.equal((await call('POST', `/api/submissions/${b}/reply`, { body: 'Hola', clientKey })).status, 201, 'same key, another lead')

  assert.equal((await call('POST', `/api/submissions/${a}/reply`, { body: 'Una más' })).status, 201)
  assert.equal((await call('POST', `/api/submissions/${a}/reply`, { body: 'Una más' })).status, 201)
  assert.equal((await repliesTo(a)).length, 3)

  const sentBefore = emails.length
  for (const bad of ['not-a-uuid', '', 42, { id: 1 }]) {
    const r = await call('POST', `/api/submissions/${a}/reply`, { body: 'Hola', clientKey: bad })
    assert.equal(r.status, 400, `clientKey ${JSON.stringify(bad)}`)
  }
  assert.equal(emails.length, sentBefore, 'nothing sent for a refused request')
  assert.equal((await repliesTo(a)).length, 3)
})

// --- the list: a total for the inbox ---------------------------------------------

test('the list with withTotal=1: the same rows, plus a total that ignores limit and offset', { skip: SKIP }, async () => {
  await db.query('TRUNCATE submissions RESTART IDENTITY CASCADE')
  const day = 24 * 60 * 60 * 1000
  for (let i = 0; i < 7; i++) await lead(`Lead${i}`, { createdAt: new Date(Date.now() - i * day) })
  await lead('Archivada', { archived: true })
  await db.query("UPDATE submissions SET status = 'contacted' WHERE first_name IN ('Lead1', 'Lead2')")

  const bare = await call('GET', '/api/submissions?limit=3&offset=2')
  assert.ok(Array.isArray(bare.json), 'without withTotal: a bare array, as before')
  assert.deepEqual(bare.json.map((s) => s.first_name), ['Lead2', 'Lead3', 'Lead4'])

  const page = await call('GET', '/api/submissions?limit=3&offset=2&withTotal=1')
  assert.equal(page.status, 200)
  assert.deepEqual(page.json.rows, bare.json, 'the same rows')
  assert.equal(page.json.total, 7, 'every inbox lead, not the page')

  const filtered = await call('GET', '/api/submissions?status=contacted&limit=1&withTotal=1')
  assert.deepEqual(filtered.json.rows.map((s) => s.first_name), ['Lead1'])
  assert.equal(filtered.json.total, 2, 'the same filters')

  assert.equal((await call('GET', '/api/submissions?archived=true&withTotal=1')).json.total, 1)
  assert.equal((await call('GET', '/api/submissions?scope=all&limit=2&withTotal=1')).json.total, 8)
  const past = await call('GET', '/api/submissions?offset=50&withTotal=1')
  assert.deepEqual(past.json, { rows: [], total: 7 }, 'past the end: no rows, the total still known')
})

// --- public submissions: flood guards ---------------------------------------

const publicPost = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const inquiry = (extra = {}) => ({ firstName: 'Rosa', lastName: 'Prueba', email: 'rosa@example.test', phone: '504-555-0123', message: 'Necesito ayuda con mi caso', ...extra })
const settleEmails = () => new Promise((r) => setTimeout(r, 150))

test('a form with the hidden field filled in looks sent, but nothing is stored or emailed', { skip: SKIP }, async () => {
  await db.query('TRUNCATE submissions RESTART IDENTITY CASCADE')
  const before = emails.length
  const res = await publicPost('/api/submissions', inquiry({ website: 'http://spam.example' }))
  assert.equal(res.status, 201)
  await settleEmails()
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM submissions')).rows[0].n, 0)
  assert.equal(emails.length, before)
})

test('the same inquiry sent again within minutes is stored and emailed once', { skip: SKIP }, async () => {
  await db.query('TRUNCATE submissions RESTART IDENTITY CASCADE')
  const before = emails.length
  const first = await publicPost('/api/submissions', inquiry({ website: '' }))
  const again = await publicPost('/api/submissions', inquiry({ email: 'ROSA@example.test' }))
  assert.equal(first.status, 201)
  assert.equal(again.status, 201)
  assert.equal(again.json.id, first.json.id, 'answered with the first one')
  const other = await publicPost('/api/submissions', inquiry({ message: 'Otra pregunta distinta' }))
  assert.notEqual(other.json.id, first.json.id, 'a different message is a new inquiry')
  await settleEmails()
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM submissions')).rows[0].n, 2)
  assert.equal(emails.length - before, 2, 'one email per inquiry')
  // Outside the window it counts again.
  await db.query("UPDATE submissions SET created_at = NOW() - INTERVAL '11 minutes'")
  const later = await publicPost('/api/submissions', inquiry())
  assert.notEqual(later.json.id, first.json.id)
})

test('a repeated chat start keeps its session; a follow-up needs the exact token', { skip: SKIP }, async () => {
  await db.query('TRUNCATE submissions RESTART IDENTITY CASCADE')
  const chat = inquiry({ source: 'chat', consultationType: 'asilo', location: 'HN' })
  const first = await publicPost('/api/submissions', chat)
  const again = await publicPost('/api/submissions', chat)
  assert.equal(again.json.id, first.json.id)
  assert.equal(again.json.chat_token, first.json.chat_token, 'the widget can carry on with the same session')
  const token = first.json.chat_token
  const wrong = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
  assert.equal((await publicPost(`/api/submissions/${first.json.id}/chat-message`, { body: 'hola', chatToken: wrong })).status, 403)
  assert.equal((await publicPost(`/api/submissions/${first.json.id}/chat-message`, { body: 'hola', chatToken: token })).status, 201)
})

test('unread count: inbox leads not yet read, and the oldest of them', { skip: SKIP }, async () => {
  await db.query('TRUNCATE submissions RESTART IDENTITY CASCADE')
  assert.deepEqual((await call('GET', '/api/submissions/unread-count')).json, { count: 0, oldest: null })
  const day = 24 * 60 * 60 * 1000
  const oldest = new Date(Date.now() - 3 * day)
  await lead('Vieja', { createdAt: oldest })
  await lead('Nueva', { createdAt: new Date(Date.now() - day) })
  const read = await lead('Leida', { createdAt: new Date(Date.now() - 5 * day) })
  await db.query('UPDATE submissions SET is_read = true WHERE id = $1', [read])
  await lead('Archivada', { createdAt: new Date(Date.now() - 9 * day), archived: true })
  const res = await call('GET', '/api/submissions/unread-count')
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { count: 2, oldest: oldest.toISOString() })
  // Same gate as the list.
  const anon = await fetch(`${base}/api/submissions/unread-count`)
  assert.equal(anon.status, 401)
})
