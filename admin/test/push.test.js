// The desktop-notification service worker (public/push-sw.js) run in a
// sandbox with a fake ServiceWorkerGlobalScope, the portal host serving it,
// and the browser-side helpers (src/utils/push.js).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import vm from 'vm'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createAdminServer } from '../server.js'
import { pushOpenPath, keyBytes, blockedHelp, pushSupport } from '../src/utils/push.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SW_SOURCE = fs.readFileSync(join(__dirname, '..', 'public', 'push-sw.js'), 'utf8')
const ORIGIN = 'https://admin.camulaw.com'

function loadWorker({ scope = `${ORIGIN}/`, windows = [] } = {}) {
  const listeners = {}
  const shown = []
  const opened = []
  const posted = []
  const focused = []
  const self = {
    location: new URL(`${scope}push-sw.js`),
    registration: {
      scope,
      showNotification: async (title, options) => { shown.push({ title, options }) },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => windows.map((url) => ({
        url,
        postMessage: (m) => posted.push({ url, m }),
        focus: async () => { focused.push(url) },
      })),
      openWindow: async (url) => { opened.push(url) },
    },
    skipWaiting: () => {},
    addEventListener: (type, fn) => { listeners[type] = fn },
  }
  vm.runInNewContext(SW_SOURCE, { self, URL, console })
  const fire = async (type, event) => {
    const waits = []
    listeners[type]({ ...event, waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
  }
  return { listeners, shown, opened, posted, focused, fire }
}

// Objects made inside the sandbox belong to another realm; compare them as data.
const plain = (v) => JSON.parse(JSON.stringify(v))

const pushEvent = (data) => ({
  data: data === undefined ? null : { json: () => (typeof data === 'string' ? JSON.parse(data) : data) },
})

test('the worker has no fetch handler, so it can never serve or cache the portal', () => {
  const w = loadWorker()
  assert.deepEqual(Object.keys(w.listeners).sort(), ['activate', 'install', 'notificationclick', 'push'])
  assert.doesNotMatch(SW_SOURCE, /caches\.|addEventListener\(\s*['"]fetch/)
})

test('a push shows its generic text with the in-portal path and tag', async () => {
  const w = loadWorker()
  await w.fire('push', pushEvent({ title: 'Callback reminder', body: 'You have a scheduled follow-up ready to review.', url: '/calls', tag: 'callback-reminder:9' }))
  assert.equal(w.shown.length, 1)
  assert.equal(w.shown[0].title, 'Callback reminder')
  assert.equal(w.shown[0].options.body, 'You have a scheduled follow-up ready to review.')
  assert.equal(w.shown[0].options.tag, 'callback-reminder:9')
  assert.equal(w.shown[0].options.renotify, true)
  assert.deepEqual(plain(w.shown[0].options.data), { path: '/calls' })
})

test('a malformed or empty push still shows a plain notification and never throws', async () => {
  for (const bad of [undefined, '{not json', '"a string"', '[1,2]', { title: 42, body: null, url: 'https://evil.example/x' }, { url: '//evil.example' }]) {
    const w = loadWorker()
    const data = bad === '{not json' ? { json: () => { throw new SyntaxError('bad') } } : pushEvent(bad).data
    await w.fire('push', { data })
    assert.equal(w.shown.length, 1, String(bad))
    assert.equal(w.shown[0].title, 'New update')
    assert.equal(w.shown[0].options.body, 'Open the staff portal to see what is new.')
    assert.equal(w.shown[0].options.data.path, '/')
    assert.equal(w.shown[0].options.tag, undefined)
  }
})

test('clicking opens the portal at the path, only ever inside the portal', async () => {
  const click = (w, path) => w.fire('notificationclick', { notification: { data: { path }, close: () => {} } })

  const none = loadWorker()
  await click(none, '/calls')
  assert.deepEqual(none.opened, [`${ORIGIN}/calls`])

  for (const bad of ['https://evil.example', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', undefined]) {
    const w = loadWorker()
    await click(w, bad)
    assert.deepEqual(w.opened, [`${ORIGIN}/`], String(bad))
  }

  // An open portal tab is focused and moved in place, not reloaded.
  const open = loadWorker({ windows: ['https://other.example/', `${ORIGIN}/inbox`] })
  await click(open, '/calls')
  assert.deepEqual(open.opened, [])
  assert.deepEqual(open.focused, [`${ORIGIN}/inbox`])
  assert.deepEqual(plain(open.posted), [{ url: `${ORIGIN}/inbox`, m: { type: 'cm-push-open', path: '/calls' } }])

  // Under the transitional /admin/ mount the scope carries the prefix.
  const sub = loadWorker({ scope: `${ORIGIN}/admin/` })
  await click(sub, '/calls')
  assert.deepEqual(sub.opened, [`${ORIGIN}/admin/calls`])
})

test('the app only routes in-portal paths from the worker', () => {
  assert.equal(pushOpenPath({ type: 'cm-push-open', path: '/calls' }), '/calls')
  for (const bad of [null, {}, { type: 'other', path: '/calls' }, { type: 'cm-push-open', path: '//evil.example' }, { type: 'cm-push-open', path: 'https://evil.example' }, { type: 'cm-push-open', path: '/\\x' }]) {
    assert.equal(pushOpenPath(bad), null, JSON.stringify(bad))
  }
})

test('helpers: key decoding, support check and the blocked explanation', () => {
  assert.deepEqual([...keyBytes('AQID_w')], [1, 2, 3, 255])
  assert.equal(pushSupport({ isSecureContext: false }), 'insecure')
  assert.equal(pushSupport({ isSecureContext: true, navigator: {} }), 'unsupported')
  assert.equal(pushSupport({ isSecureContext: true, navigator: { serviceWorker: {} }, PushManager: 1, Notification: 1 }), 'ok')
  assert.match(blockedHelp('admin.camulaw.com'), /admin\.camulaw\.com.*Notifications to Allow/)
})

const servers = []
after(() => servers.forEach((s) => { s.closeAllConnections?.(); s.close() }))

test('the portal host serves the worker as JavaScript, revalidated on every load', async () => {
  const dist = fs.mkdtempSync(join(os.tmpdir(), 'cm-admin-sw-'))
  fs.writeFileSync(join(dist, 'index.html'), '<html>PORTAL</html>')
  fs.copyFileSync(join(__dirname, '..', 'public', 'push-sw.js'), join(dist, 'push-sw.js'))
  const server = createAdminServer({ distDir: dist, apiOrigin: 'https://api.camulaw.com' }).listen(0)
  servers.push(server)
  await new Promise((r) => server.once('listening', r))
  const res = await fetch(`http://127.0.0.1:${server.address().port}/push-sw.js`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^(application|text)\/javascript/)
  assert.equal(res.headers.get('cache-control'), 'no-cache')
  // Workers fall back to script-src: same-origin only.
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'(;|$)/)
  assert.equal(await res.text(), SW_SOURCE)
})
