// Signing out must reach the server before the portal says it has; the
// sign-in address is kept only for "Keep me signed in" (utils/session.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signOutReached, saveLoginEmail, readLoginEmail, LOGIN_EMAIL_KEY } from '../src/utils/session.js'

test('a sign-out counts only when the server answered it', async () => {
  assert.equal(await signOutReached(async () => ({ ok: true })), true)
  assert.equal(await signOutReached(async () => ({ ok: false, status: 502 })), false, 'a gateway error is not a sign-out')
  assert.equal(await signOutReached(async () => { throw new TypeError('Failed to fetch') }), false, 'offline is not a sign-out')
})

const memoryStorage = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }
}

test('the sign-in address is remembered only with "Keep me signed in"', () => {
  const s = memoryStorage()
  saveLoginEmail(s, 'reception@example.test', false)
  assert.equal(readLoginEmail(s), '', 'not remembered without the box')
  saveLoginEmail(s, '  reception@example.test ', true)
  assert.equal(s.getItem(LOGIN_EMAIL_KEY), 'reception@example.test')
  // Signing in later without the box forgets what was kept before.
  saveLoginEmail(s, 'reception@example.test', false)
  assert.equal(readLoginEmail(s), '')
})

test('storage that throws (a private window) changes nothing', () => {
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
  assert.doesNotThrow(() => saveLoginEmail(broken, 'a@example.test', true))
  assert.equal(readLoginEmail(broken), '')
})
