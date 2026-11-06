// The sign-in limits, over real HTTP and a real Postgres. The office signs in
// from one shared address, so successful sign-ins must not use up the budget;
// failures are limited per address and, across addresses, per account.
//
// Uses its own database (<TEST_DATABASE_URL's name>_login) and its own
// process, so the limiter's memory is this file's alone. Visitors' addresses
// come through the site proxy header (with its secret), one per test.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import pino from 'pino'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_login`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const PROXY_SECRET = 'login-test-proxy-secret-0123456789abcdef'

let server, base, db
const pw = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'login-test-secret-0123456789abcdef0123'
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
  const keep = (who) => (line) => { const m = /^[A-Za-z0-9_-]{24}$/.exec(line.trim().split('\n').pop()); if (m) pw[who] = m[0] }
  await staffCli.run(db, 'create', { email: 'desk@example.test', name: 'Desk', role: 'front_desk' }, keep('desk'))
  await staffCli.run(db, 'create', { email: 'para@example.test', name: 'Para', role: 'staff' }, keep('para'))
  await staffCli.run(db, 'create', { email: 'owner@example.test', name: 'Owner', role: 'admin' }, keep('owner'))

  const { createApp, addFallbackHandlers } = await import('./app.js')
  const env = { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET, SITE_PROXY_SECRET: PROXY_SECRET }
  server = addFallbackHandlers(createApp({ env, log: pino({ level: 'silent' }) })).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  await db?.end()
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

async function login(ip, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cm-proxy-secret': PROXY_SECRET, 'x-cm-client-ip': ip },
    body: JSON.stringify({ email, password }),
  })
  await res.text()
  return res.status
}

test('six successful sign-ins in a row from one address all go through', { skip: SKIP }, async () => {
  const statuses = []
  for (let i = 0; i < 6; i++) statuses.push(await login('203.0.113.1', 'desk@example.test', pw.desk))
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200])
})

test('six failed sign-ins from one address: the sixth is limited', { skip: SKIP }, async () => {
  const statuses = []
  for (let i = 0; i < 6; i++) statuses.push(await login('203.0.113.2', 'para@example.test', 'wrong-password-1'))
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429])
})

test('failures spread across addresses against one account are limited by the account', { skip: SKIP }, async () => {
  const statuses = []
  // A change of case is the same account.
  for (let i = 0; i < 10; i++) statuses.push(await login(`198.51.100.${i + 1}`, i % 2 ? 'Owner@Example.TEST' : 'owner@example.test', 'wrong-password-1'))
  assert.deepEqual(statuses, Array(10).fill(401))
  assert.equal(await login('198.51.100.50', 'owner@example.test', pw.owner), 429, 'the eleventh attempt, from a fresh address, is refused')
  assert.equal(await login('198.51.100.51', 'desk@example.test', pw.desk), 200, 'another account is unaffected')
})

// The log is written as each response finishes; wait for the rows.
async function logged(where, args = []) {
  let rows = []
  for (let i = 0; i < 80; i++) {
    rows = (await db.query(`SELECT * FROM staff_activity WHERE ${where} ORDER BY id`, args)).rows
    if (rows.length) return rows
    await new Promise((r) => setTimeout(r, 25))
  }
  return rows
}

test('the activity log keeps wrong passwords but not limited or malformed sign-ins', { skip: SKIP }, async () => {
  // The tests above were each refused once with 429; add a malformed one.
  assert.equal(await login('192.0.2.1', 'not-an-email', 'x'), 400)
  assert.equal(await login('192.0.2.2', 'nobody@example.test', 'wrong-password-1'), 401)
  assert.equal((await logged("action = 'auth.sign_in' AND details->>'email' = 'nobody@example.test'")).length, 1)
  await new Promise((r) => setTimeout(r, 100))
  const noise = (await db.query("SELECT status_code FROM staff_activity WHERE action = 'auth.sign_in' AND status_code IN (400, 429)")).rows
  assert.deepEqual(noise, [])
  const wrong = (await db.query("SELECT COUNT(*)::int AS n FROM staff_activity WHERE action = 'auth.sign_in' AND status_code = 401")).rows[0].n
  assert.equal(wrong, 16, 'every wrong password is still logged')
})
