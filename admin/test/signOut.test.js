// Sign Out goes to the sign-in screen only when the server ended the
// session. A sign-out that never reached it used to look like it worked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signOutAndLeave } from '../src/utils/signOut.js'

const router = () => { const pushed = []; return { pushed, push: (to) => pushed.push(to) } }

test('a sign-out the server confirmed goes to the sign-in screen', async () => {
  const r = router()
  assert.equal(await signOutAndLeave(async () => true, r), true)
  assert.deepEqual(r.pushed, [{ name: 'Login' }])
})

test('a sign-out that did not reach the server stays on the page', async () => {
  const r = router()
  assert.equal(await signOutAndLeave(async () => false, r), false)
  assert.deepEqual(r.pushed, [])
})
