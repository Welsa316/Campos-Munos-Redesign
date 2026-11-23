// A person's own colours (Home → Themes → Custom): what the API accepts,
// and PUT /api/auth/theme with theme 'custom' over real HTTP and Postgres
// (that part needs TEST_DATABASE_URL; own database <name>_customtheme).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { CUSTOM_KEYS, CUSTOM_MAIN, CUSTOM_ADVANCED, CUSTOM_MAX_BYTES, parseCustomTheme, themeFor } from './auth/themes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ADMIN = join(__dirname, '..', 'admin')

const GOOD = { base: 'light', header: '#3b0a45', primary: '#E8A33D', page: '#F4F1EA', surface: '#FFFFFF', summaryA: '#FFE8D6', summaryB: '#3B0A45' }
const DARK = { base: 'dark', header: '#0D141C', primary: '#5DBB63', page: '#101A16', surface: '#18241F', summaryA: '#20392F', summaryB: '#5DBB63', link: '#A2E3A6', danger: '#B0474D' }

test('the portal and the API agree on the keys; the portal reads what the API keeps', async () => {
  const portal = await import(join(ADMIN, 'src', 'data', 'themes.js'))
  assert.deepEqual([...portal.CUSTOM_KEYS], [...CUSTOM_KEYS])
  assert.deepEqual([...portal.CUSTOM_MAIN], [...CUSTOM_MAIN])
  assert.deepEqual([...portal.CUSTOM_ADVANCED], [...CUSTOM_ADVANCED])
  for (const pick of [GOOD, DARK]) assert.deepEqual(portal.normalizeCustom(pick), parseCustomTheme(pick))
  assert.ok(portal.buildCustomTheme(parseCustomTheme(DARK)))
})

test('only known keys with #RRGGBB values parse; Custom needs valid colours', () => {
  assert.deepEqual(parseCustomTheme(GOOD), { ...GOOD, header: '#3B0A45', primary: '#E8A33D' })
  assert.equal(parseCustomTheme(DARK).link, '#A2E3A6')
  const bad = [
    null, undefined, '', 'custom', 7, [], [GOOD],
    { ...GOOD, base: 'neon' },
    { ...GOOD, header: '#FFF' },
    { ...GOOD, header: 'navy' },
    { ...GOOD, page: '#12345G' },
    { ...GOOD, surface: 'url(https://example.test/x.png)' },
    { ...GOOD, primary: '#003F8D;background:red' },
    { ...GOOD, link: 'blue' },
    { ...GOOD, script: '<script>' },
    { ...GOOD, userId: 2 },
    { ...GOOD, summaryB: undefined },
    { ...GOOD, header: { $gt: '' } },
  ]
  for (const b of bad) assert.equal(parseCustomTheme(b), null, JSON.stringify(b))
  // Size: every key filled is well under the limit; anything past it is refused.
  const full = { ...GOOD }
  for (const k of CUSTOM_ADVANCED) full[k] = '#ABCDEF'
  assert.ok(parseCustomTheme(full))
  assert.ok(Buffer.byteLength(JSON.stringify(full)) < CUSTOM_MAX_BYTES)
  assert.equal(parseCustomTheme({ ...GOOD, header: '#3B0A45' + ' '.repeat(CUSTOM_MAX_BYTES) }), null)

  assert.equal(themeFor('custom', GOOD), 'custom')
  assert.equal(themeFor('custom', null), 'classic', 'custom with no colours shows Classic')
  assert.equal(themeFor('custom', { ...GOOD, header: 'red' }), 'classic')
  assert.equal(themeFor('violet', GOOD), 'violet')
})

// --- over HTTP --------------------------------------------------------------------

const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_customtheme`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
let server, base, db
const users = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'customtheme-test-secret-0123456789abcdef'
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
  app.use(express.json({ limit: '100kb' }))
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

const put = (u, body) => fetch(`${base}/api/auth/theme`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(u ? { Cookie: u.cookie } : {}) }, body: JSON.stringify(body) })
const verify = async (u) => (await fetch(`${base}/api/auth/verify`, { headers: { Cookie: u.cookie } })).json()
const stored = async (u) => (await db.query('SELECT theme, custom_theme FROM admin_users WHERE id = $1', [u.id])).rows[0]

test('saving a custom theme keeps it on the account and returns it with the profile', { skip: SKIP }, async () => {
  const me = users.yoletty
  assert.deepEqual([(await verify(me)).theme, (await verify(me)).customTheme], ['classic', null], 'nothing until chosen')

  const res = await put(me, { theme: 'custom', custom: GOOD })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.theme, 'custom')
  assert.deepEqual(body.customTheme, parseCustomTheme(GOOD))

  const profile = await verify(me)
  assert.equal(profile.theme, 'custom', 'comes back on every device')
  assert.deepEqual(profile.customTheme, parseCustomTheme(GOOD))
  assert.deepEqual((await stored(me)).custom_theme, parseCustomTheme(GOOD), 'stored cleaned, upper-case')

  // Back to a preset: the colours stay for next time.
  assert.equal((await put(me, { theme: 'coastal-teal' })).status, 200)
  const p2 = await verify(me)
  assert.equal(p2.theme, 'coastal-teal')
  assert.deepEqual(p2.customTheme, parseCustomTheme(GOOD))

  // And to a new custom set, advanced colours included.
  assert.equal((await put(me, { theme: 'custom', custom: DARK })).status, 200)
  assert.deepEqual((await verify(me)).customTheme, parseCustomTheme(DARK))
})

test('bad colours, unknown keys and oversized payloads are refused and change nothing', { skip: SKIP }, async () => {
  const me = users.yoletty
  const before_ = await stored(me)
  const refused = [
    { theme: 'custom' },
    { theme: 'custom', custom: null },
    { theme: 'custom', custom: 'dark' },
    { theme: 'custom', custom: [GOOD] },
    { theme: 'custom', custom: { ...GOOD, header: 'navy' } },
    { theme: 'custom', custom: { ...GOOD, header: '#FFF' } },
    { theme: 'custom', custom: { ...GOOD, primary: 'red;}body{display:none' } },
    { theme: 'custom', custom: { ...GOOD, base: 'sepia' } },
    { theme: 'custom', custom: { ...GOOD, extra: '#FFFFFF' } },
    { theme: 'custom', custom: { ...GOOD, userId: users.other.id } },
    { theme: 'custom', custom: { ...GOOD, notes: 'x'.repeat(60_000) } },
    { theme: 'custom', custom: { ...GOOD, summaryA: undefined } },
    { theme: 'violet', custom: GOOD },
    { theme: 'neon', custom: GOOD },
    // A list where one name is expected: the validator checks each item of
    // a list on its own, so ['violet'] passed and was stored as '{violet}'.
    { theme: ['violet'] },
    { theme: ['classic', 'violet'] },
    { theme: ['custom'], custom: GOOD },
  ]
  for (const b of refused) {
    const res = await put(me, b)
    assert.equal(res.status, 400, JSON.stringify(b).slice(0, 120))
  }
  assert.deepEqual(await stored(me), before_, 'a refused value changes nothing')
  assert.equal((await put(null, { theme: 'custom', custom: GOOD })).status, 401)
})

test("one person's colours are theirs alone: never shown to, or changed by, anyone else", { skip: SKIP }, async () => {
  const me = users.yoletty
  const other = users.other
  await put(me, { theme: 'custom', custom: GOOD })

  const theirs = await verify(other)
  assert.equal(theirs.theme, 'classic')
  assert.equal(theirs.customTheme, null, "someone else's colours never come back in another profile")

  // Their own save, even naming my account, only ever touches their row.
  const res = await put(other, { theme: 'custom', custom: DARK, id: me.id, userId: me.id, email: 'yoletty@example.test' })
  assert.equal(res.status, 200)
  assert.deepEqual((await verify(other)).customTheme, parseCustomTheme(DARK))
  const mine = await verify(me)
  assert.equal(mine.theme, 'custom')
  assert.deepEqual(mine.customTheme, parseCustomTheme(GOOD), 'mine is untouched')
  assert.deepEqual((await stored(me)).custom_theme, parseCustomTheme(GOOD))
})
