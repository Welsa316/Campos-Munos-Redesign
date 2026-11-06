// Headers and error bodies every API response shares (app.js). No database:
// the routes exercised here answer before touching one.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pino from 'pino'
import { createApp, addFallbackHandlers, readinessCheck } from './app.js'

let server, base
let readyCalls = 0
let readyFails = false

before(async () => {
  const app = createApp({
    env: { NODE_ENV: 'test' },
    log: pino({ level: 'silent' }),
    readyQuery: async () => { readyCalls++; if (readyFails) throw new Error('db down') },
    beforeFallback: (a) => {
      a.get('/boom/:status', (req, _res, next) => next(Object.assign(new Error('upstream db-7.internal refused'), { status: Number(req.params.status) })))
    },
  })
  addFallbackHandlers(app)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

test('no API answer may be stored by a browser or proxy', async () => {
  for (const path of ['/api/auth/verify', '/api/nothing-here']) {
    const res = await fetch(base + path)
    assert.equal(res.headers.get('cache-control'), 'no-store', path)
  }
})

test('a 5xx error never shows its message; a 4xx still does', async () => {
  for (const status of [500, 502, 503, 504]) {
    const body = await (await fetch(`${base}/boom/${status}`)).json()
    assert.equal(body.error, 'Internal server error', String(status))
  }
  const res = await fetch(`${base}/boom/422`)
  assert.equal(res.status, 422)
  assert.equal((await res.json()).error, 'upstream db-7.internal refused')
})

test('a request id from the caller is kept only when it looks like one', async () => {
  const good = await (await fetch(`${base}/boom/500`, { headers: { 'x-request-id': 'abc-123_DEF-456' } })).json()
  assert.equal(good.requestId, 'abc-123_DEF-456')
  const bad = await (await fetch(`${base}/boom/500`, { headers: { 'x-request-id': '<script>alert(1)</script>' } })).json()
  assert.notEqual(bad.requestId, '<script>alert(1)</script>')
  assert.match(bad.requestId, /^[0-9a-f-]{36}$/)
})

test('route-level API errors carry the request id too', async () => {
  const res = await fetch(`${base}/api/auth/verify`, { headers: { 'x-request-id': 'route-err-0001' } })
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { authenticated: false, requestId: 'route-err-0001' })
  const missing = await (await fetch(`${base}/api/nothing-here`, { headers: { 'x-request-id': 'route-err-0002' } })).json()
  assert.deepEqual(missing, { error: 'Not found', requestId: 'route-err-0002' })
})

test('the RingCentral webhook answers without browser headers; the API keeps them', async () => {
  const hook = await fetch(`${base}/webhooks/ringcentral`, { method: 'POST', headers: { 'Validation-Token': 'tok-123' } })
  assert.equal(hook.status, 200)
  assert.equal(hook.headers.get('validation-token'), 'tok-123')
  for (const h of ['content-security-policy', 'x-frame-options', 'cross-origin-opener-policy', 'referrer-policy']) {
    assert.equal(hook.headers.get(h), null, h)
  }
  // RingCentral refuses an answer over 1024 bytes; Railway adds about 150.
  const bytes = [...hook.headers].reduce((n, [k, v]) => n + k.length + v.length + 4, 'HTTP/1.1 200 OK\r\n'.length)
  assert.ok(bytes < 700, `${bytes} bytes of headers`)
  const api = await fetch(`${base}/api/auth/verify`)
  assert.match(api.headers.get('content-security-policy'), /default-src/)
  assert.equal(api.headers.get('x-frame-options'), 'SAMEORIGIN')
})

test('/readyz asks the database at most once every few seconds', async () => {
  readyCalls = 0
  const answers = await Promise.all(Array.from({ length: 20 }, () => fetch(`${base}/readyz`)))
  assert.ok(answers.every((r) => r.status === 200))
  assert.equal(readyCalls, 1, 'twenty probes, one query')
})

test('a cached readiness result expires and a failure is reported', async () => {
  let t = 0
  let fail = false
  let calls = 0
  const check = readinessCheck(async () => { calls++; if (fail) throw new Error('down') }, { ttlMs: 5000, now: () => t })
  assert.equal(await check(), true)
  fail = true
  t = 4000
  assert.equal(await check(), true, 'still cached')
  t = 5001
  assert.equal(await check(), false, 'expired, asked again, database down')
  assert.equal(calls, 2)
})
