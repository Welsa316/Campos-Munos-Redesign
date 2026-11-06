// A bounded wait (used for web fonts before the Home greeting is split): a
// stalled promise must give up in time, so the greeting is never left hidden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settleWithin } from '../src/utils/settle.js'

test('a promise that never settles gives up after the limit', { timeout: 1000 }, async () => {
  const started = Date.now()
  assert.equal(await settleWithin(new Promise(() => {}), 40), false)
  assert.ok(Date.now() - started < 500)
})

test('a promise that settles in time reports so, whether it resolved or failed', async () => {
  assert.equal(await settleWithin(Promise.resolve('fonts'), 1000), true)
  assert.equal(await settleWithin(Promise.reject(new Error('font failed')), 1000), true)
})
