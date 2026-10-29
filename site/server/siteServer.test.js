// The public website's own host (site/server/app.js), as deployed standalone
// at camulaw.com: portal redirect, the cutover proxy to the API, and — against
// the real build when one exists — prerendered heads, real 404s and every Wix
// redirect landing on a page that exists.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSiteApp, adminRedirectTarget } from './app.js'
import { LEGACY_MAP, legacyTarget } from './legacyRedirects.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REAL_DIST = join(__dirname, '..', 'dist')
const quiet = { info() {}, warn() {}, error() {} }

const servers = []
async function listen(server) {
  servers.push(server)
  server.listen(0)
  await new Promise((r) => server.once('listening', r))
  return `http://127.0.0.1:${server.address().port}`
}

function fakeDist() {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'cm-site-'))
  fs.writeFileSync(join(dir, 'index.html'), '<html>SHELL</html>')
  fs.writeFileSync(join(dir, 'route-manifest.json'), JSON.stringify({ routes: ['/'] }))
  return dir
}

// A stand-in API that records what reached it.
let upstream, upstreamUrl
const seen = []
before(async () => {
  upstream = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
      res.setHeader('content-type', 'application/json')
      res.setHeader('set-cookie', 'probe=1; Path=/')
      res.end(JSON.stringify({ ok: true }))
    })
  })
  upstreamUrl = await listen(upstream)
})
after(() => {
  for (const s of servers) { s.closeAllConnections?.(); s.close() }
})

test('/admin and everything under it go to the same place on the portal host', async () => {
  assert.equal(adminRedirectTarget('/admin', 'https://admin.camulaw.com'), 'https://admin.camulaw.com/')
  assert.equal(adminRedirectTarget('/admin/', 'https://admin.camulaw.com/'), 'https://admin.camulaw.com/')
  assert.equal(adminRedirectTarget('/admin/login', 'https://admin.camulaw.com'), 'https://admin.camulaw.com/login')
  assert.equal(adminRedirectTarget('/administracion', 'https://admin.camulaw.com'), null, 'only the /admin segment')

  const dist = fakeDist()
  const base = await listen(http.createServer(createSiteApp({ distDir: dist, adminUrl: 'https://admin.camulaw.com', log: quiet })))
  const res = await fetch(`${base}/admin/demo/operations?x=1`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://admin.camulaw.com/demo/operations?x=1')
})

test('without ADMIN_URL, /admin is just an unknown page (404), never the portal', async () => {
  const dist = fakeDist()
  const base = await listen(http.createServer(createSiteApp({ distDir: dist, log: quiet })))
  const res = await fetch(`${base}/admin/login`, { redirect: 'manual' })
  assert.equal(res.status, 404)
})

test('the cutover proxy forwards the webhook body byte-for-byte, so the signature still verifies', async () => {
  const dist = fakeDist()
  const base = await listen(http.createServer(createSiteApp({ distDir: dist, apiProxyTarget: upstreamUrl, log: quiet })))
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[{"id":"1","note":"señal  "}]}')
  const sig = 'sha256=' + crypto.createHmac('sha256', 'app-secret').update(body).digest('hex')
  seen.length = 0
  const res = await fetch(`${base}/webhooks/whatsapp?x=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
    body,
  })
  assert.equal(res.status, 200)
  const got = seen.at(-1)
  assert.equal(got.url, '/webhooks/whatsapp?x=1')
  assert.ok(got.body.equals(body), 'raw bytes unchanged')
  assert.equal(got.headers['x-hub-signature-256'], sig)
})

test('the proxy passes the visitor IP only with the shared secret, and strips forged copies', async () => {
  const dist = fakeDist()
  const withSecret = await listen(http.createServer(createSiteApp({ distDir: dist, apiProxyTarget: upstreamUrl, proxySecret: 's3cret', log: quiet })))
  seen.length = 0
  const res = await fetch(`${withSecret}/api/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cm-client-ip': '6.6.6.6', 'x-cm-proxy-secret': 'guess' },
    body: '{"firstName":"A"}',
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('set-cookie'), 'probe=1; Path=/', 'API response headers come back')
  const got = seen.at(-1)
  assert.equal(got.headers['x-cm-proxy-secret'], 's3cret')
  assert.match(got.headers['x-cm-client-ip'], /^(::ffff:)?127\.0\.0\.1$|^::1$/, 'the real caller address, not the one they sent')
  assert.equal(got.body.toString(), '{"firstName":"A"}')

  const noSecret = await listen(http.createServer(createSiteApp({ distDir: dist, apiProxyTarget: upstreamUrl, log: quiet })))
  seen.length = 0
  await fetch(`${noSecret}/api/submissions`, { method: 'POST', headers: { 'x-cm-client-ip': '6.6.6.6', 'x-cm-proxy-secret': 'guess' }, body: '{}' })
  assert.equal(seen.at(-1).headers['x-cm-client-ip'], undefined)
  assert.equal(seen.at(-1).headers['x-cm-proxy-secret'], undefined)
})

test('an unreachable API is a 502, not a hung request or a page', async () => {
  const dist = fakeDist()
  const base = await listen(http.createServer(createSiteApp({ distDir: dist, apiProxyTarget: 'http://127.0.0.1:9', log: quiet })))
  const res = await fetch(`${base}/api/submissions`, { method: 'POST', body: '{}' })
  assert.equal(res.status, 502)
})

test('without API_PROXY_TARGET, /api is not forwarded anywhere', async () => {
  const dist = fakeDist()
  const base = await listen(http.createServer(createSiteApp({ distDir: dist, log: quiet })))
  const res = await fetch(`${base}/api/submissions`)
  assert.equal(res.status, 404)
})

test('the API origin is added to connect-src when the site talks to it directly', async () => {
  const dist = fakeDist()
  const base = await listen(http.createServer(createSiteApp({ distDir: dist, apiOrigin: 'https://api.camulaw.com', log: quiet })))
  const csp = (await fetch(`${base}/`)).headers.get('content-security-policy')
  assert.match(csp, /connect-src[^;]*https:\/\/api\.camulaw\.com/)
})

// --- against the real build ---------------------------------------------------

const hasBuild = fs.existsSync(join(REAL_DIST, 'route-manifest.json'))

test('real build: every prerendered route serves its own canonical, unknown URLs 404', { skip: !hasBuild && 'run npm run build first' }, async () => {
  const base = await listen(http.createServer(createSiteApp({ distDir: REAL_DIST, log: quiet })))
  const { routes } = JSON.parse(fs.readFileSync(join(REAL_DIST, 'route-manifest.json'), 'utf8'))
  assert.ok(!routes.some((r) => r.startsWith('/admin')), 'the manifest advertises no portal route')

  for (const path of ['/', '/servicios', '/servicios/asilo', '/acerca-de', '/consulta', '/pago', '/el-equipo/juan']) {
    const res = await fetch(base + path, { redirect: 'manual' })
    assert.equal(res.status, 200, path)
    const html = await res.text()
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
    assert.equal(canonical, `https://camulaw.com${path === '/' ? '/' : path}`, `canonical for ${path}`)
  }
  for (const path of ['/definitely-not-a-page', '/servicios/not-a-service', '/admin', '/admin/login']) {
    assert.equal((await fetch(base + path, { redirect: 'manual' })).status, 404, path)
  }
})

test('real build: every Wix redirect lands on a page that exists', { skip: !hasBuild && 'run npm run build first' }, async () => {
  const { routes } = JSON.parse(fs.readFileSync(join(REAL_DIST, 'route-manifest.json'), 'utf8'))
  const valid = new Set(routes)
  const base = await listen(http.createServer(createSiteApp({ distDir: REAL_DIST, log: quiet })))
  for (const slug of Object.keys(LEGACY_MAP)) {
    for (const path of [`/${slug}`, `/en/${slug}`]) {
      const dest = legacyTarget(path)
      if (!dest || dest === path) continue // a current route; served directly
      const res = await fetch(base + path, { redirect: 'manual' })
      assert.equal(res.status, 301, path)
      const loc = res.headers.get('location')
      assert.equal(loc, dest, path)
      assert.ok(valid.has(loc.split('#')[0]), `${path} → ${loc} is not a real page`)
    }
  }
})
