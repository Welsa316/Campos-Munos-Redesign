// Behaviour of the API once it is split from the website and the portal
// (docs/architecture-split.md): who may make credentialed calls, who may write
// with the staff cookie, how the cutover proxy's client IP is honoured, and
// that the transitional single-service mode still serves both frontends.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pino from 'pino'

import { createApp, addFallbackHandlers } from './app.js'
import { mountFrontends } from './frontends.js'
import { sessionCookieOptions, resolveOrigins } from './httpSecurity.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const silent = pino({ level: 'silent' })

const ADMIN = 'https://admin.camulaw.com'
const SITE = 'https://camulaw.com'
const EVIL = 'https://evil.example'
const SECRET = 'test-proxy-secret-0123456789abcdef'

const ENV = {
  NODE_ENV: 'production',
  ADMIN_ORIGINS: ADMIN,
  PUBLIC_ORIGINS: `${SITE},https://www.camulaw.com`,
  SITE_PROXY_SECRET: SECRET,
}

async function listen(app) {
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

let api
before(async () => { api = await listen(addFallbackHandlers(createApp({ env: ENV, log: silent }))) })
after(() => api.server.close())

const preflight = (origin, path = '/api/submissions') => fetch(`${api.base}${path}`, {
  method: 'OPTIONS',
  headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
})

// --- CORS ------------------------------------------------------------------

test('the portal origin gets credentialed CORS', async () => {
  const res = await preflight(ADMIN, '/api/auth/login')
  assert.equal(res.headers.get('access-control-allow-origin'), ADMIN)
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
  assert.equal(res.headers.get('access-control-max-age'), '600', 'browsers may reuse the preflight instead of repeating it')
})

test('the public site gets CORS for the contact form but never credentials', async () => {
  const res = await preflight(SITE)
  assert.equal(res.headers.get('access-control-allow-origin'), SITE)
  assert.equal(res.headers.get('access-control-allow-credentials'), null)
})

test('an unknown origin gets no CORS headers at all', async () => {
  const res = await preflight(EVIL)
  assert.equal(res.headers.get('access-control-allow-origin'), null)
})

test('FRONTEND_URL alone still configures the portal origin (current production env)', () => {
  const o = resolveOrigins({ NODE_ENV: 'production', FRONTEND_URL: 'https://camulaw.com/' })
  assert.deepEqual(o.admin, ['https://camulaw.com'])
  assert.equal(o.openDev, false)
})

// --- cross-origin writes with the staff cookie --------------------------------

const post = (path, { origin, cookie, body = {}, headers = {} } = {}) => fetch(`${api.base}${path}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(origin ? { Origin: origin } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...headers,
  },
  body: JSON.stringify(body),
})

test('login is refused from the public site and from other sites', async () => {
  for (const origin of [SITE, EVIL]) {
    const res = await post('/api/auth/login', { origin, body: { email: 'not-an-email', password: 'x' } })
    assert.equal(res.status, 403, `login from ${origin}`)
  }
})

test('changing the case of the path does not get login past the origin check', async () => {
  for (const path of ['/api/AUTH/login', '/api/Auth/Login', '/API/auth/login']) {
    const res = await post(path, { origin: EVIL, body: { email: 'not-an-email', password: 'x' } })
    assert.equal(res.status, 403, path)
  }
})

test('the public site is never credentialed, even when FRONTEND_URL names it (copied from the old service)', async () => {
  const o = resolveOrigins({ NODE_ENV: 'production', FRONTEND_URL: SITE, ADMIN_ORIGINS: ADMIN, PUBLIC_ORIGINS: SITE })
  assert.deepEqual(o.admin, [ADMIN])
  assert.deepEqual(o.public, [SITE])
  assert.deepEqual(o.conflicts, [SITE])
})

test('a write through the site proxy is accepted only when Origin matches the forwarded host and the secret is valid', async () => {
  const host = 'camulaw.com'
  const viaProxy = { 'x-cm-proxy-secret': SECRET, 'x-cm-client-ip': '203.0.113.50', 'x-forwarded-host': host }
  const ok = await post('/api/submissions/1/notes', { origin: `https://${host}`, cookie: 'token=x', body: { body: 'x' }, headers: viaProxy })
  assert.equal(ok.status, 401, 'origin accepted, then auth rejects the fake token')
  const noSecret = await post('/api/submissions/1/notes', {
    origin: `https://${host}`, cookie: 'token=x', body: { body: 'x' }, headers: { 'x-forwarded-host': host },
  })
  assert.equal(noSecret.status, 403, 'a forwarded host without the secret proves nothing')
})

test('login from the portal reaches the route (validation answers, not the origin check)', async () => {
  const res = await post('/api/auth/login', { origin: ADMIN, body: { email: 'not-an-email', password: 'x' } })
  assert.equal(res.status, 400)
})

test('a write carrying the staff cookie from the public site is refused before auth runs', async () => {
  const res = await post('/api/submissions/1/notes', { origin: SITE, cookie: 'token=whatever', body: { body: 'x' } })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).error, 'Origin not allowed')
})

test('the same write from the portal gets as far as authentication', async () => {
  const res = await post('/api/submissions/1/notes', { origin: ADMIN, cookie: 'token=whatever', body: { body: 'x' } })
  assert.equal(res.status, 401) // bad token, but the origin was accepted
})

test('the public contact form (no cookie) is not subject to the origin check', async () => {
  const res = await post('/api/submissions', { origin: SITE, body: {} })
  assert.equal(res.status, 400) // validation, i.e. it reached the route
})

test('a cookie-bearing write with no Origin but cross-site fetch metadata is refused', async () => {
  const res = await post('/api/submissions/1/notes', { cookie: 'token=x', headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(res.status, 403)
})

test('same-host writes are allowed (portal served under /admin on the API host)', async () => {
  const host = new URL(api.base).host
  const res = await post('/api/submissions/1/notes', { origin: `http://${host}`, cookie: 'token=x', body: { body: 'x' } })
  assert.equal(res.status, 401)
})

// --- client IP through the website's cutover proxy ----------------------------

async function loginAttempts(n, headers) {
  const statuses = []
  for (let i = 0; i < n; i++) {
    const res = await post('/api/auth/login', { origin: ADMIN, body: { email: 'bad', password: 'x' }, headers })
    statuses.push(res.status)
  }
  return statuses
}

test('proxied visitors are rate-limited by their own IP when the proxy secret matches', async () => {
  const viaProxy = (ip) => ({ 'x-cm-proxy-secret': SECRET, 'x-cm-client-ip': ip })
  const a = await loginAttempts(6, viaProxy('203.0.113.10'))
  assert.deepEqual(a, [400, 400, 400, 400, 400, 429], 'the sixth attempt from one visitor is limited')
  const b = await loginAttempts(1, viaProxy('203.0.113.11'))
  assert.deepEqual(b, [400], 'a different visitor behind the same proxy has their own budget')
})

test('a forged client-IP header without the secret is ignored', async () => {
  // Exhaust the budget for the test runner's real address first.
  await loginAttempts(6, {})
  const forged = await loginAttempts(1, { 'x-cm-proxy-secret': 'wrong', 'x-cm-client-ip': '198.51.100.7' })
  assert.deepEqual(forged, [429], 'spoofing a new IP must not buy a fresh budget')
})

// --- API-only surface ----------------------------------------------------------

test('standalone API serves no pages: / is a JSON 404 and /api is noindex', async () => {
  const root = await fetch(`${api.base}/`)
  assert.equal(root.status, 404)
  assert.match(root.headers.get('content-type'), /json/)
  const apiRes = await fetch(`${api.base}/api/nope`)
  assert.equal(apiRes.status, 404)
  assert.equal(apiRes.headers.get('x-robots-tag'), 'noindex, nofollow')
})

test('session cookie: httpOnly, Lax and Secure in production; None forces Secure', () => {
  const prod = sessionCookieOptions({ NODE_ENV: 'production' })
  assert.equal(prod.httpOnly, true)
  assert.equal(prod.sameSite, 'lax')
  assert.equal(prod.secure, true)
  assert.equal(prod.domain, undefined, 'host-only: never shared with camulaw.com')
  const staging = sessionCookieOptions({ NODE_ENV: 'development', COOKIE_SAMESITE: 'none' })
  assert.equal(staging.secure, true)
  assert.equal(sessionCookieOptions({ COOKIE_SAMESITE: 'bogus' }).sameSite, 'lax')
})

// --- transitional single-service mode -------------------------------------------

test('single-service mode serves the portal under /admin and the site everywhere else', async () => {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'cm-monolith-'))
  // Fake builds; the site router is the real one from site/server.
  fs.mkdirSync(join(root, 'admin', 'dist', 'assets'), { recursive: true })
  fs.writeFileSync(join(root, 'admin', 'dist', 'index.html'), '<html>PORTAL</html>')
  fs.writeFileSync(join(root, 'admin', 'dist', 'assets', 'app.js'), 'console.log(1)')
  fs.mkdirSync(join(root, 'site', 'dist', 'servicios', 'asilo'), { recursive: true })
  fs.writeFileSync(join(root, 'site', 'dist', 'index.html'), '<html>SITE</html>')
  fs.writeFileSync(join(root, 'site', 'dist', 'servicios', 'asilo', 'index.html'), '<html>ASILO HEAD</html>')
  fs.writeFileSync(join(root, 'site', 'dist', 'route-manifest.json'), JSON.stringify({ routes: ['/', '/servicios/asilo'] }))
  fs.symlinkSync(join(__dirname, '..', 'site', 'server'), join(root, 'site', 'server'))

  // Production rules, as on the live service: FRONTEND_URL is the site itself.
  const app = createApp({ env: { NODE_ENV: 'production', FRONTEND_URL: 'https://camulaw.com' }, log: silent })
  const mounted = await mountFrontends(app, { rootDir: root, log: silent })
  addFallbackHandlers(app)
  assert.deepEqual(mounted, { admin: true, site: true })
  const { server, base } = await listen(app)
  try {
    const get = (p, opts) => fetch(base + p, { redirect: 'manual', ...opts })

    for (const p of ['/admin', '/admin/', '/admin/login', '/admin/demo/operations']) {
      const res = await get(p)
      assert.equal(res.status, 200, p)
      assert.equal(await res.text(), '<html>PORTAL</html>', p)
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', p)
      const csp = res.headers.get('content-security-policy')
      assert.match(csp, /frame-ancestors 'none'/, `${p} carries the portal CSP`)
      assert.doesNotMatch(csp, /googletagmanager|elfsight/, `${p} allows no third-party scripts`)
    }
    const wwwAdmin = await get('/admin/login', { headers: { 'x-forwarded-host': 'www.camulaw.com' } })
    assert.equal(wwwAdmin.status, 301, 'www.camulaw.com/admin still folds into the apex, as on main')
    assert.equal(wwwAdmin.headers.get('location'), 'https://camulaw.com/admin/login')
    assert.equal((await get('/admin/assets/app.js')).status, 200)
    assert.equal((await get('/admin/assets/missing.js')).status, 404, 'a missing asset is not index.html')

    const home = await get('/')
    assert.equal(await home.text(), '<html>SITE</html>')
    assert.match(home.headers.get('content-security-policy'), /googletagmanager/, 'site CSP, not the API default')

    assert.equal(await (await get('/servicios/asilo')).text(), '<html>ASILO HEAD</html>', 'prerendered head served')
    const legacy = await get('/asylum')
    assert.equal(legacy.status, 301)
    assert.equal(legacy.headers.get('location'), '/servicios/asilo')
    const www = await get('/greencards', { headers: { 'x-forwarded-host': 'www.camulaw.com' } })
    assert.equal(www.status, 301)
    assert.equal(www.headers.get('location'), 'https://camulaw.com/servicios/green-card')
    assert.equal((await get('/no-such-page')).status, 404, 'real 404 for unknown URLs')
    const apiMiss = await get('/api/nope')
    assert.equal(apiMiss.status, 404)
    assert.match(apiMiss.headers.get('content-type'), /json/, '/api never falls through to a page')
  } finally {
    server.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('SERVE_FRONTENDS=false (or a server-only checkout) mounts nothing', async () => {
  const app = createApp({ env: {}, log: silent })
  assert.deepEqual(await mountFrontends(app, { rootDir: join(__dirname, '..'), enabled: false }), { admin: false, site: false })
  const empty = fs.mkdtempSync(join(os.tmpdir(), 'cm-api-only-'))
  assert.deepEqual(await mountFrontends(app, { rootDir: empty }), { admin: false, site: false })
  fs.rmSync(empty, { recursive: true, force: true })
})
