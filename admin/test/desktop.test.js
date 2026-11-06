// Inside the desktop app the page must not show its own notifications (the
// app shows them from the server's feed) — detected only from the app's flag.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inDesktopApp } from '../src/utils/desktop.js'

test('only the desktop app counts as the desktop app', () => {
  assert.equal(inDesktopApp({ campos: { desktop: true, version: '1.0.0' } }), true)
  assert.equal(inDesktopApp({}), false)
  assert.equal(inDesktopApp({ campos: { desktop: 'yes' } }), false, 'a stray value is not the app')
  assert.equal(inDesktopApp(undefined), false)
})

import { listenForDesktopNavigation, desktopNotificationState } from '../src/utils/desktop.js'

const fakeRouter = () => { const pushed = []; return { pushed, push: async (p) => { pushed.push(p) } } }

test('a notification clicked in the app moves the portal in place, only to its own screens', () => {
  let handler = null
  const w = { campos: { desktop: true, onNavigate: (fn) => { handler = fn } } }
  const router = fakeRouter()
  assert.equal(listenForDesktopNavigation(router, w), true)
  handler('/calls?tab=handled')
  handler('//evil.example/x')
  handler('/\\evil.example')
  handler('https://evil.example')
  handler(42)
  assert.deepEqual(router.pushed, ['/calls?tab=handled'])
})

test('in a browser, or an app without the hook, nothing registers', () => {
  const router = fakeRouter()
  assert.equal(listenForDesktopNavigation(router, {}), false)
  assert.equal(listenForDesktopNavigation(router, { campos: { desktop: true } }), false)
  assert.equal(listenForDesktopNavigation(router, { campos: { desktop: 'yes', onNavigate: () => {} } }), false)
})

test('the app’s badge says paused or blocked when the app says so', async () => {
  const app = (s) => ({ campos: { desktop: true, notificationState: async () => s } })
  assert.equal(await desktopNotificationState(app({ feed: 'ok', supported: true })), 'desktop')
  assert.equal(await desktopNotificationState(app({ feed: 'starting', supported: true })), 'desktop')
  assert.equal(await desktopNotificationState(app({ feed: 'error', supported: true })), 'desktop_paused')
  assert.equal(await desktopNotificationState(app({ feed: 'signed-out', supported: true })), 'desktop_paused')
  assert.equal(await desktopNotificationState(app({ feed: 'ok', supported: false })), 'desktop_blocked')
  // An older app that cannot say, or one whose answer fails, counts as on.
  assert.equal(await desktopNotificationState({ campos: { desktop: true } }), 'desktop')
  assert.equal(await desktopNotificationState({ campos: { desktop: true, notificationState: async () => { throw new Error('x') } } }), 'desktop')
})
