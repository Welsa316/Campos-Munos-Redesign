// How large a person reads chat text: the portal and the API agree on the
// sizes, and PUT /api/auth/text-size saves it to that person's account only
// (over real HTTP and Postgres: needs TEST_DATABASE_URL; own database
// <name>_textsize).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { TEXT_SIZES, DEFAULT_TEXT_SIZE, textSizeFor } from './auth/textSizes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('the portal offers exactly the sizes the API accepts, growing, starting at the size chats always had', async () => {
  const portal = await import(join(__dirname, '..', 'admin', 'src', 'data', 'textSizes.js'))
  assert.deepEqual(portal.TEXT_SIZES.map((s) => s.key), [...TEXT_SIZES])
  assert.equal(portal.DEFAULT_TEXT_SIZE, DEFAULT_TEXT_SIZE)
  const px = portal.TEXT_SIZES.map((s) => s.px)
  assert.equal(px[0], 14, 'standard is unchanged for everyone who never picks a size')
  for (let i = 1; i < px.length; i++) assert.ok(px[i] > px[i - 1], 'each step is bigger than the last')
  assert.equal(portal.textScale('standard'), 1)
  assert.equal(portal.textScale('nonsense'), 1)
  assert.ok(portal.textScale('largest') > 1.5)
  assert.equal(textSizeFor(null), 'standard')
  assert.equal(textSizeFor('huge'), 'standard')
})

const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_textsize`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
let server, base, db
const users = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'textsize-test-secret-0123456789abcdef'
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
  execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  db = new pg.Pool({ connectionString: URL_ })
  const rows = (await db.query(`INSERT INTO admin_users (email, password_hash, role) VALUES
    ('yoletty@example.test', 'x', 'front_desk'), ('other@example.test', 'x', 'staff')
    RETURNING id, token_version, email`)).rows
  for (const u of rows) users[u.email.split('@')[0]] = { ...u, cookie: `token=${jwt.sign({ id: u.id, email: u.email, tv: u.token_version }, process.env.JWT_SECRET)}` }

  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const auth = (await import('./routes/auth.js')).default
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/auth', auth)
  server = app.listen(0)
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

const put = (u, body) => fetch(`${base}/api/auth/text-size`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(u ? { Cookie: u.cookie } : {}) }, body: JSON.stringify(body) })
const verify = async (u) => (await fetch(`${base}/api/auth/verify`, { headers: { Cookie: u.cookie } })).json()

test('a chosen size comes back with the profile on every computer, and is that person’s alone', { skip: SKIP }, async () => {
  const me = users.yoletty
  assert.equal((await verify(me)).textSize, 'standard', 'standard until chosen')

  const res = await put(me, { size: 'very_large' })
  assert.equal(res.status, 200)
  assert.equal((await verify(me)).textSize, 'very_large')
  assert.equal((await verify(users.other)).textSize, 'standard', 'a colleague’s chats are unchanged')

  // A save naming someone else only ever touches the caller's own row.
  assert.equal((await put(users.other, { size: 'largest', id: me.id, userId: me.id })).status, 200)
  assert.equal((await verify(me)).textSize, 'very_large')
  assert.equal((await verify(users.other)).textSize, 'largest')
})

test('sizes not on the list are refused and change nothing; signed out is 401', { skip: SKIP }, async () => {
  const me = users.yoletty
  await put(me, { size: 'larger' })
  for (const b of [{}, { size: '' }, { size: 'huge' }, { size: 40 }, { size: ['large'] }, { size: 'large; DROP TABLE x' }]) {
    assert.equal((await put(me, b)).status, 400, JSON.stringify(b))
  }
  assert.equal((await verify(me)).textSize, 'larger')
  assert.equal((await put(null, { size: 'large' })).status, 401)
})
