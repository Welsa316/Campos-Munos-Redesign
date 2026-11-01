// Profile pictures: the catalogue, defaults, and PUT /api/auth/avatar over
// real HTTP and Postgres (that part needs TEST_DATABASE_URL; own database
// <name>_avatars).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { FLUENT_AVATARS, EMOJI_AVATARS, AVATAR_COLORS, parseAvatar, avatarFor } from './auth/avatars.js'
import { THEMES, themeFor } from './auth/themes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ADMIN = join(__dirname, '..', 'admin')

test('the portal offers exactly what the API accepts, and every 3D animal is bundled', async () => {
  const portal = await import(join(ADMIN, 'src', 'data', 'avatars.js'))
  assert.deepEqual(portal.FLUENT_AVATARS.map((a) => a.key), [...FLUENT_AVATARS])
  assert.deepEqual(portal.EMOJI_AVATARS, [...EMOJI_AVATARS])
  assert.deepEqual(portal.AVATAR_COLORS.map((c) => c.key), [...AVATAR_COLORS])
  for (const key of FLUENT_AVATARS) {
    const file = join(ADMIN, 'public', 'avatars', 'fluent', `${key}.png`)
    assert.ok(fs.existsSync(file), `${key}.png is missing`)
    assert.deepEqual([...fs.readFileSync(file).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${key}.png is not a PNG`)
  }
  assert.match(fs.readFileSync(join(ADMIN, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /Fluent Emoji[\s\S]*MIT License/)
})

test('themes: the portal offers exactly what the API accepts; Classic by default', async () => {
  const portal = await import(join(ADMIN, 'src', 'data', 'themes.js'))
  assert.deepEqual(portal.THEMES.map((t) => t.key), [...THEMES])
  assert.equal(portal.DEFAULT_THEME, 'classic')
  assert.equal(themeFor(null), 'classic')
  assert.equal(themeFor('neon'), 'classic')
  assert.equal(themeFor('midnight-dark'), 'midnight-dark')
  // Every theme other than Classic has its colours in the stylesheet.
  const css = fs.readFileSync(join(ADMIN, 'src', 'style.css'), 'utf8')
  for (const key of THEMES.filter((k) => k !== 'classic')) assert.match(css, new RegExp(`data-theme="${key}"`), key)
})

test('only catalogue values parse', () => {
  assert.deepEqual(parseAvatar('fluent:fox'), { kind: 'fluent', key: 'fox' })
  assert.deepEqual(parseAvatar('emoji:🦊'), { kind: 'emoji', key: '🦊' })
  for (const bad of ['fluent:dragon', 'emoji:<script>', 'emoji:', 'https://example.test/x.png', 'fox', '', null, 'fluent:../../etc/passwd']) {
    assert.equal(parseAvatar(bad), null, String(bad))
  }
})

test('until someone chooses, colleagues get different stable defaults', () => {
  const a = avatarFor({ id: 1 })
  const b = avatarFor({ id: 2 })
  const c = avatarFor({ id: 3 })
  assert.equal(a.chosen, false)
  assert.equal(new Set([a.key, b.key, c.key]).size, 3)
  assert.deepEqual(avatarFor({ id: 2 }), b, 'stable')
  assert.ok(AVATAR_COLORS.includes(a.bg))
  assert.deepEqual(avatarFor({ id: 2, avatar: 'emoji:🐙', avatar_bg: 'navy' }), { kind: 'emoji', key: '🐙', bg: 'navy', chosen: true })
  // A stored value that is no longer offered falls back to the default.
  assert.equal(avatarFor({ id: 2, avatar: 'fluent:dragon', avatar_bg: 'neon' }).chosen, false)
})

// --- over HTTP --------------------------------------------------------------------

const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_avatars`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
let server, base, db
const users = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'avatars-test-secret-0123456789abcdef0123'
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
    ('a@example.test', 'x', 'admin'), ('f@example.test', 'x', 'front_desk'), ('b@example.test', 'x', 'billing_paralegal'), ('s@example.test', 'x', 'staff')
    RETURNING id, token_version, role`)).rows
  for (const u of rows) users[u.role] = { ...u, cookie: `token=${jwt.sign({ id: u.id, email: 'x', tv: u.token_version }, process.env.JWT_SECRET)}` }

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

const put = (cookie, body) => fetch(`${base}/api/auth/avatar`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })

test('every role sets its own picture; only catalogue values; nothing else changes', { skip: SKIP }, async () => {
  const verify = async (u) => (await (await fetch(`${base}/api/auth/verify`, { headers: { Cookie: u.cookie } })).json())
  assert.equal((await verify(users.front_desk)).avatar.chosen, false, 'a default before choosing')
  assert.equal((await verify(users.front_desk)).displayName, null, 'no display name set')
  await db.query("UPDATE admin_users SET display_name = 'Rio' WHERE id = $1", [users.front_desk.id])
  const named = await verify(users.front_desk)
  assert.equal(named.displayName, 'Rio', 'shown even when it matches the email (rio@…)')

  for (const [role, avatar] of [['admin', 'fluent:fox'], ['front_desk', 'emoji:🦉'], ['billing_paralegal', 'fluent:panda'], ['staff', 'emoji:☕']]) {
    const res = await put(users[role].cookie, { avatar, bg: 'mint' })
    assert.equal(res.status, 200, role)
    const body = await res.json()
    assert.equal(`${body.avatar.kind}:${body.avatar.key}`, avatar)
    assert.equal(body.avatar.chosen, true)
    assert.equal((await verify(users[role])).avatar.bg, 'mint', 'kept across sign-ins')
  }

  assert.equal((await put(users.admin.cookie, { avatar: 'fluent:dragon', bg: 'mint' })).status, 400)
  assert.equal((await put(users.admin.cookie, { avatar: 'emoji:<img src=x>', bg: 'mint' })).status, 400)
  assert.equal((await put(users.admin.cookie, { avatar: 'fluent:fox', bg: 'red; background:url(x)' })).status, 400)
  assert.equal((await put(null, { avatar: 'fluent:fox', bg: 'mint' })).status, 401)

  // One person's choice never touches another's.
  const row = (await db.query('SELECT avatar FROM admin_users WHERE id = $1', [users.front_desk.id])).rows[0]
  assert.equal(row.avatar, 'emoji:🦉')
  const audits = (await db.query("SELECT details FROM billing_audit_events WHERE action = 'admin_user.avatar_changed'")).rows
  assert.equal(audits.length, 4)
})

test('every role saves its own theme; it comes back on sign-in; only listed themes', { skip: SKIP }, async () => {
  const putTheme = (cookie, theme) => fetch(`${base}/api/auth/theme`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ theme }) })
  const verify = async (u) => (await (await fetch(`${base}/api/auth/verify`, { headers: { Cookie: u.cookie } })).json())
  assert.equal((await verify(users.admin)).theme, 'classic', 'Classic until chosen')
  for (const [role, theme] of [['admin', 'midnight-dark'], ['front_desk', 'coastal-teal'], ['billing_paralegal', 'violet'], ['staff', 'graphite']]) {
    const res = await putTheme(users[role].cookie, theme)
    assert.equal(res.status, 200, role)
    assert.equal((await verify(users[role])).theme, theme, `${role} keeps ${theme}`)
  }
  assert.equal((await verify(users.front_desk)).theme, 'coastal-teal', "one person's theme never changes another's")
  assert.equal((await putTheme(users.admin.cookie, 'neon')).status, 400)
  assert.equal((await putTheme(users.admin.cookie, '"><script>')).status, 400)
  assert.equal((await putTheme(null, 'violet')).status, 401)
  assert.equal((await verify(users.admin)).theme, 'midnight-dark', 'a refused value changes nothing')
})

