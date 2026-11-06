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
