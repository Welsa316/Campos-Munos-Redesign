// RingCentral OAuth end to end over real HTTP and a real Postgres, against a
// fake RingCentral (no network). Synthetic accounts and tokens only.
//
// Uses its own database (<TEST_DATABASE_URL's name>_integrations, created if
// missing). The name must contain "test"; the schema is dropped and rebuilt.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_integrations`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

const SECRET = 'client-secret-for-tests-only'
const ENV = {
  NODE_ENV: 'test',
  RINGCENTRAL_CLIENT_ID: 'test-client-id',
  RINGCENTRAL_CLIENT_SECRET: SECRET,
  RINGCENTRAL_SERVER_URL: 'https://platform.devtest.ringcentral.com',
  RINGCENTRAL_REDIRECT_URI: 'https://api.camulaw.com/api/integrations/ringcentral/callback',
}

let server, base, db, clock
const users = {}
const env = { ...ENV }

// Fake RingCentral: issues numbered tokens, rotates refresh tokens, can be
// told to fail. Records every call.
const rc = {
  calls: [], issued: 0, validRefresh: new Set(), codes: new Map(), failNext: null, delayMs: 0,
  reset() { this.calls = []; this.failNext = null },
}
async function fakeFetch(url, init) {
  const body = Object.fromEntries(new URLSearchParams(init.body))
  rc.calls.push({ url, body, auth: init.headers.Authorization })
  const reply = (status, json) => ({ status, text: async () => (json ? JSON.stringify(json) : ''), headers: { get: () => null } })
  if (init.headers.Authorization !== `Basic ${Buffer.from(`test-client-id:${SECRET}`).toString('base64')}`) return reply(401, { error: 'invalid_client' })
  if (rc.failNext) { const f = rc.failNext; rc.failNext = null; return reply(f.status, f.json) }
  const issue = () => {
    rc.issued++
    const rt = `RT-${rc.issued}`
    rc.validRefresh.add(rt)
    return reply(200, { access_token: `AT-${rc.issued}`, refresh_token: rt, token_type: 'bearer', expires_in: 3600, refresh_token_expires_in: 604800, scope: 'ReadCallLog ReadAccounts', owner_id: '400100', endpoint_id: 'ep-1' })
  }
  if (url.endsWith('/restapi/oauth/token') && body.grant_type === 'authorization_code') {
    if (body.redirect_uri !== ENV.RINGCENTRAL_REDIRECT_URI || !rc.codes.has(body.code)) return reply(400, { error: 'invalid_grant' })
    rc.codes.delete(body.code) // single use
    return issue()
  }
  if (url.endsWith('/restapi/oauth/token') && body.grant_type === 'refresh_token') {
    if (rc.delayMs) await new Promise((r) => setTimeout(r, rc.delayMs))
    if (!rc.validRefresh.delete(body.refresh_token)) return reply(400, { error: 'invalid_grant', error_description: `Token ${body.refresh_token} is not valid` })
    return issue()
  }
  if (url.endsWith('/restapi/oauth/revoke')) { rc.validRefresh.delete(body.token); return reply(200) }
  return reply(404)
}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'integrations-test-secret-0123456789abcdef'
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
  const migrate = () => execFileSync(process.execPath, [join(__dirname, '..', '..', 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  migrate()
  migrate() // every deploy runs it
  db = new pg.Pool({ connectionString: URL_ })

  const rows = (await db.query(
    `INSERT INTO admin_users (email, password_hash, role) VALUES
       ('owner@example.test', 'x', 'admin'), ('other-admin@example.test', 'x', 'admin'),
       ('desk@example.test', 'x', 'front_desk'), ('para@example.test', 'x', 'billing_paralegal')
     RETURNING id, token_version`
  )).rows
  const cookie = (u) => `token=${jwt.sign({ id: u.id, email: 'x', tv: u.token_version }, process.env.JWT_SECRET)}`
  ;[users.owner, users.other, users.desk, users.para] = rows.map((u) => ({ ...u, cookie: cookie(u) }))

  clock = { t: new Date('2026-11-01T15:00:00Z') }
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('../../app.js')
  const { createIntegrationsRouter } = await import('../../routes/integrations.js')
  const { createBillingRouter } = await import('../../routes/billing.js')
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/integrations', createIntegrationsRouter({ env, fetchImpl: fakeFetch, now: () => clock.t }))
  // Billing → Integrations shows a RingCentral card from the same env.
  env.MONDAY_PROVIDER = 'mock'
  app.use('/api/billing', createBillingRouter({ env }))
  addFallbackHandlers(app)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  await db?.end()
  const { default: getPool } = await import('../../db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, { cookie = users.owner.cookie, extraCookie = '' } = {}) {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { Cookie: [cookie, extraCookie].filter(Boolean).join('; '), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    body: method !== 'GET' ? '{}' : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* redirects have no JSON */ }
  return { status: res.status, json, text, headers: res.headers }
}

/** Start an authorization as `who`; returns state, binding cookie and the URL. */
async function start(who = users.owner) {
  const r = await call('POST', '/api/integrations/ringcentral/authorize', { cookie: who.cookie })
  assert.equal(r.status, 200, r.text)
  const url = new URL(r.json.authorizeUrl)
  const setCookie = r.headers.get('set-cookie')
  const binding = /cm_rc_oauth=([^;]+)/.exec(setCookie)?.[1]
  return { url, state: url.searchParams.get('state'), binding, setCookie }
}

/** RingCentral redirects the browser back. */
async function callback({ state, code, error, binding, cookie = users.owner.cookie }) {
  const q = new URLSearchParams()
  if (code) q.set('code', code)
  if (state) q.set('state', state)
  if (error) q.set('error', error)
  const r = await call('GET', `/api/integrations/ringcentral/callback?${q}`, { cookie, extraCookie: binding ? `cm_rc_oauth=${binding}` : '' })
  assert.equal(r.status, 303)
  const loc = new URL(r.headers.get('location'))
  return { location: loc, outcome: loc.searchParams.get('ringcentral'), headers: r.headers }
}

const newCode = () => { const c = `code-${Math.random().toString(36).slice(2)}`; rc.codes.set(c, true); return c }
const connection = async () => (await db.query("SELECT * FROM integration_connections WHERE provider = 'ringcentral'")).rows[0]

test('RingCentral OAuth flow', { skip: SKIP }, async (t) => {
  await t.test('only administrators can see or start the connection', async () => {
    for (const who of [users.desk, users.para]) {
      assert.equal((await call('GET', '/api/integrations/ringcentral', { cookie: who.cookie })).status, 403)
      assert.equal((await call('POST', '/api/integrations/ringcentral/authorize', { cookie: who.cookie })).status, 403)
    }
    assert.equal((await call('GET', '/api/integrations/ringcentral', { cookie: '' })).status, 401)
    const s = await call('GET', '/api/integrations/ringcentral')
    assert.equal(s.status, 200)
    assert.equal(s.json.status, 'not_connected')
    assert.equal(s.json.configured, true)
    assert.equal(s.json.clientId, 'test-client-id')
    assert.equal(s.json.serverHost, 'platform.devtest.ringcentral.com')
    assert.equal(s.headers.get('cache-control'), 'no-store')
  })

  await t.test('not configured: refuses to start, names only the missing variables', async () => {
    const saved = env.RINGCENTRAL_CLIENT_SECRET
    delete env.RINGCENTRAL_CLIENT_SECRET
    try {
      const s = await call('GET', '/api/integrations/ringcentral')
      assert.equal(s.json.configured, false)
      assert.ok(s.json.configProblems.some((p) => p.includes('RINGCENTRAL_CLIENT_SECRET')))
      const r = await call('POST', '/api/integrations/ringcentral/authorize')
      assert.equal(r.status, 503)
    } finally { env.RINGCENTRAL_CLIENT_SECRET = saved }
  })

  const card = async (who = users.owner) => {
    const r = await call('GET', '/api/billing/integrations', { cookie: who.cookie })
    assert.equal(r.status, 200, r.text)
    assert.ok(!/AT-\d|RT-\d|client-secret/.test(r.text), 'cards never carry tokens or the secret')
    return r.json.find((c) => c.key === 'ringcentral')
  }

  await t.test('Billing → Integrations card: not configured, misconfigured, not connected', async () => {
    const saved = { ...env }
    for (const k of Object.keys(env)) if (k.startsWith('RINGCENTRAL_')) delete env[k]
    try {
      assert.equal((await card()).state, 'not_configured')
      env.RINGCENTRAL_CLIENT_ID = 'x'
      const bad = await card()
      assert.equal(bad.state, 'configuration_error')
      assert.match(bad.detail, /RINGCENTRAL_CLIENT_SECRET/)
    } finally { Object.assign(env, saved) }
    const c = await card()
    assert.equal(c.state, 'not_connected')
    assert.equal(c.canManage, true)
    // Integrations are the administrator's: a billing paralegal cannot even
    // see the status cards.
    assert.equal((await call('GET', '/api/billing/integrations', { cookie: users.para.cookie })).status, 403)
  })

  await t.test('authorize: RingCentral URL with state; httpOnly binding cookie scoped to the callback; only digests stored', async () => {
    const { url, state, binding, setCookie } = await start()
    assert.equal(url.origin, 'https://platform.devtest.ringcentral.com')
    assert.equal(url.searchParams.get('redirect_uri'), ENV.RINGCENTRAL_REDIRECT_URI)
    assert.equal(url.searchParams.get('client_id'), 'test-client-id')
    assert.match(state, /^[A-Za-z0-9_-]{43}$/)
    assert.ok(!url.toString().includes(SECRET))
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /Path=\/api\/integrations\/ringcentral/)
    assert.match(setCookie, /SameSite=Lax/i)
    const dump = JSON.stringify((await db.query('SELECT * FROM integration_oauth_states')).rows)
    assert.ok(!dump.includes(state) && !dump.includes(binding), 'raw state/binding never stored')
  })

  await t.test('state validation: unknown, missing cookie, other browser, other admin, expired, replay', async () => {
    rc.reset()
    // Unknown / malformed state.
    assert.equal((await callback({ state: 'x'.repeat(43), code: newCode(), binding: 'b' })).outcome, 'invalid_state')
    assert.equal((await callback({ state: 'short', code: newCode() })).outcome, 'invalid_state')
    // Valid state, but no binding cookie (a link opened in another browser).
    let a = await start()
    assert.equal((await callback({ state: a.state, code: newCode() })).outcome, 'invalid_state')
    // ...and that state is now spent.
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding })).outcome, 'invalid_state')
    // Wrong binding cookie.
    a = await start()
    assert.equal((await callback({ state: a.state, code: newCode(), binding: 'not-the-nonce' })).outcome, 'invalid_state')
    // Right browser, but another administrator's session.
    a = await start()
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding, cookie: users.other.cookie })).outcome, 'session_mismatch')
    // No session at all.
    a = await start()
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding, cookie: '' })).outcome, 'session_mismatch')
    // Expired: 11 minutes later.
    a = await start()
    clock.t = new Date(clock.t.getTime() + 11 * 60 * 1000)
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding })).outcome, 'expired_state')
    // The administrator declined on RingCentral's page.
    a = await start()
    assert.equal((await callback({ state: a.state, error: 'access_denied', binding: a.binding })).outcome, 'denied')
    // None of the refused callbacks reached RingCentral or stored anything.
    assert.equal(rc.calls.length, 0)
    assert.equal(await connection(), undefined)
  })

  await t.test('a code RingCentral refuses → exchange_failed, nothing stored', async () => {
    const a = await start()
    assert.equal((await callback({ state: a.state, code: 'forged-code', binding: a.binding })).outcome, 'exchange_failed')
    assert.equal(await connection(), undefined)
  })

  await t.test('success: redirected to the portal, tokens stored encrypted, status shows no secrets', async () => {
    rc.reset()
    const a = await start()
    const r = await callback({ state: a.state, code: newCode(), binding: a.binding })
    assert.equal(r.outcome, 'connected')
    assert.equal(r.location.origin + r.location.pathname, 'https://admin.camulaw.com/integrations')
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
    assert.match(r.headers.get('set-cookie') || '', /cm_rc_oauth=;/, 'binding cookie cleared')
    assert.equal(rc.calls.length, 1)
    assert.equal(rc.calls[0].body.redirect_uri, ENV.RINGCENTRAL_REDIRECT_URI)

    const row = await connection()
    assert.equal(row.status, 'connected')
    assert.equal(row.environment, 'sandbox')
    assert.equal(row.connected_by, users.owner.id)
    const dump = JSON.stringify(row)
    assert.ok(!/AT-\d|RT-\d/.test(dump), 'no plaintext token in the database row')

    const s = await call('GET', '/api/integrations/ringcentral')
    assert.equal(s.json.status, 'connected')
    assert.equal(s.json.connection.ownerId, '400100')
    assert.equal((await card()).state, 'connected', 'the billing Integrations card turns green')
    assert.equal(s.json.connection.encryptionKeyMatches, true)
    assert.ok(!/AT-\d|RT-\d|client-secret/.test(s.text), 'status never carries tokens or the secret')

    // The same callback replayed (browser back button) does nothing.
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding })).outcome, 'invalid_state')
    const audits = (await db.query("SELECT action, details FROM billing_audit_events WHERE entity_type = 'integration' ORDER BY id")).rows
    assert.ok(audits.some((x) => x.action === 'ringcentral.connected'))
    assert.ok(!/AT-\d|RT-\d|code-/.test(JSON.stringify(audits)), 'audit rows carry no tokens or codes')
  })

  await t.test('getAccessToken: valid token reused; near expiry refreshed once, refresh token rotated', async () => {
    const { getAccessToken } = await import('./service.js')
    const { loadRingCentralConfig } = await import('./config.js')
    const cfg = loadRingCentralConfig(env)
    const deps = { fetchImpl: fakeFetch, now: () => clock.t }
    rc.reset()
    const first = await getAccessToken(db, cfg, deps)
    assert.match(first, /^AT-\d+$/)
    assert.equal(rc.calls.length, 0, 'fresh token: no refresh')

    clock.t = new Date(clock.t.getTime() + 59 * 60 * 1000) // 1 minute left
    // Two concurrent callers while RingCentral is slow: one refresh (the
    // second waits on the row lock), both get the new token. Without the lock
    // the second would spend the already-rotated refresh token.
    rc.delayMs = 150
    const [x, y] = await Promise.all([getAccessToken(db, cfg, deps), getAccessToken(db, cfg, deps)])
    assert.equal(rc.calls.filter((c) => c.body.grant_type === 'refresh_token').length, 1, 'refreshed exactly once')
    rc.delayMs = 0
    assert.equal(x, y)
    assert.notEqual(x, first)
    const row = await connection()
    assert.ok(row.last_refreshed_at)
  })

  await t.test('manual refresh from the portal; transient failure keeps the connection', async () => {
    rc.reset()
    const ok = await call('POST', '/api/integrations/ringcentral/refresh')
    assert.equal(ok.status, 200)
    assert.equal(ok.json.refreshed, true)
    rc.failNext = { status: 503 }
    const busy = await call('POST', '/api/integrations/ringcentral/refresh')
    assert.equal(busy.status, 502)
    const s = await call('GET', '/api/integrations/ringcentral')
    assert.equal(s.json.status, 'connected')
    assert.equal(s.json.connection.lastErrorCode, 'http_503')
    assert.equal((await card()).state, 'error', 'a failed token check is not green')
    assert.equal((await call('POST', '/api/integrations/ringcentral/refresh')).status, 200)
    assert.equal((await card()).state, 'connected', 'the next good check clears it')
  })

  await t.test('keep-alive refreshes only when the refresh token nears expiry', async () => {
    const { maintainConnection } = await import('./service.js')
    const { loadRingCentralConfig } = await import('./config.js')
    const cfg = loadRingCentralConfig(env)
    rc.reset()
    let r = await maintainConnection(db, cfg, {}, { fetchImpl: fakeFetch, now: () => clock.t })
    assert.equal(r.refreshed, false)
    const later = new Date(clock.t.getTime() + 5 * 24 * 60 * 60 * 1000)
    r = await maintainConnection(db, cfg, {}, { fetchImpl: fakeFetch, now: () => later })
    assert.equal(r.refreshed, true)
    clock.t = later
  })

  await t.test('a different encryption key never wipes the stored tokens', async () => {
    const { getAccessToken, RingCentralNotConnectedError } = await import('./service.js')
    const { loadRingCentralConfig } = await import('./config.js')
    const wrong = loadRingCentralConfig({ ...env, RINGCENTRAL_TOKEN_ENCRYPTION_KEY: 'cd'.repeat(32) })
    await assert.rejects(getAccessToken(db, wrong, { fetchImpl: fakeFetch, now: () => clock.t }),
      (e) => e instanceof RingCentralNotConnectedError && e.code === 'encryption_key_mismatch')
    const row = await connection()
    assert.equal(row.status, 'connected')
    assert.ok(row.refresh_token_enc)
  })

  await t.test('a revoked refresh token → needs reconnection; tokens dropped', async () => {
    const { maintainConnection } = await import('./service.js')
    const { loadRingCentralConfig } = await import('./config.js')
    rc.validRefresh.clear() // revoked at RingCentral's side
    await assert.rejects(maintainConnection(db, loadRingCentralConfig(env), { force: true }, { fetchImpl: fakeFetch, now: () => clock.t }),
      (e) => e.code === 'needs_reauth')
    const row = await connection()
    assert.equal(row.status, 'needs_reauth')
    assert.equal(row.refresh_token_enc, null)
    assert.equal(row.last_error_code, 'invalid_grant')
    assert.equal((await call('GET', '/api/integrations/ringcentral')).json.status, 'needs_reauth')
    assert.equal((await card()).state, 'needs_reauth')
  })

  await t.test('reconnecting replaces the connection; disconnect revokes and deletes', async () => {
    const a = await start()
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding })).outcome, 'connected')
    rc.reset()
    const d = await call('POST', '/api/integrations/ringcentral/disconnect')
    assert.equal(d.status, 200)
    assert.equal(d.json.disconnected, true)
    assert.equal(d.json.revoked, true)
    assert.equal(rc.calls[0].url, 'https://platform.devtest.ringcentral.com/restapi/oauth/revoke')
    assert.equal(await connection(), undefined)
    assert.equal(d.json.status, 'not_connected')
  })

  await t.test('a front-desk account cannot finish an authorization either', async () => {
    const a = await start()
    assert.equal((await callback({ state: a.state, code: newCode(), binding: a.binding, cookie: users.desk.cookie })).outcome, 'session_mismatch')
    assert.equal(await connection(), undefined)
  })
})
