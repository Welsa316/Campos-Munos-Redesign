'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createCrashGuard } = require('../src/crash-guard')

test('reloads after a crash, but stops after three within five minutes', () => {
  let t = 0
  const guard = createCrashGuard({ now: () => t })
  assert.equal(guard.shouldReload(), true)
  t += 10_000
  assert.equal(guard.shouldReload(), true)
  t += 10_000
  assert.equal(guard.shouldReload(), true)
  t += 10_000
  assert.equal(guard.shouldReload(), false, 'a fourth in a row is a loop')
  // Well after the burst, a single crash reloads again.
  t += 10 * 60_000
  assert.equal(guard.shouldReload(), true)
})
