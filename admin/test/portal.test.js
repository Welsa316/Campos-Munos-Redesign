import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { safeNextPath } from '../src/utils/safeNext.js'
import { createAdminServer } from '../server.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const servers = []
after(() => servers.forEach((s) => { s.closeAllConnections?.(); s.close() }))

async function start(opts) {
  const server = createAdminServer(opts).listen(0)
  servers.push(server)
  await new Promise((r) => server.once('listening', r))
  return `http://127.0.0.1:${server.address().port}`
}

test('login only returns to in-portal paths', () => {
  assert.equal(safeNextPath('/demo/operations'), '/demo/operations')
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '/login', undefined, ['/x']]) {
    assert.equal(safeNextPath(bad), null, String(bad))
  }
})

test('the portal host locks the page down and falls back to the SPA', async () => {
  const dist = fs.mkdtempSync(join(os.tmpdir(), 'cm-admin-'))
  fs.mkdirSync(join(dist, 'assets'))
  fs.writeFileSync(join(dist, 'index.html'), '<html>PORTAL</html>')
  fs.writeFileSync(join(dist, 'assets', 'index-abc.js'), 'x')
  const base = await start({ distDir: dist, apiOrigin: 'https://api.camulaw.com' })

  const page = await fetch(`${base}/login`)
  assert.equal(page.status, 200)
  assert.equal(await page.text(), '<html>PORTAL</html>')
  const csp = page.headers.get('content-security-policy')
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /script-src 'self'(;|$)/, 'no third-party or inline scripts')
  assert.match(csp, /connect-src 'self' https:\/\/api\.camulaw\.com/)
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(page.headers.get('cache-control'), 'no-store')

  const asset = await fetch(`${base}/assets/index-abc.js`)
  assert.match(asset.headers.get('cache-control'), /immutable/)
  assert.equal((await fetch(`${base}/assets/gone.js`)).status, 404, 'a stale asset is a 404, not HTML')

  const health = await fetch(`${base}/healthz`)
  assert.equal(health.status, 200)
})

test('without a build the host says so instead of serving a blank page', async () => {
  const base = await start({ distDir: fs.mkdtempSync(join(os.tmpdir(), 'cm-admin-empty-')) })
  const res = await fetch(`${base}/`)
  assert.equal(res.status, 503)
})

test('robots.txt disallows everything', () => {
  assert.equal(fs.readFileSync(join(__dirname, '..', 'public', 'robots.txt'), 'utf8').trim(), 'User-agent: *\nDisallow: /')
})
