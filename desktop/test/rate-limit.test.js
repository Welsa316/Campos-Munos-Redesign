'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createRateLimit } = require('../src/rate-limit')

test('at most one a second and six a minute', () => {
  let t = 0
  const limit = createRateLimit({ now: () => t })
  assert.equal(limit.allow(), true)
  assert.equal(limit.allow(), false, 'a second straight away')
  t += 1000
  assert.equal(limit.allow(), true)
  for (let i = 0; i < 4; i++) { t += 1000; assert.equal(limit.allow(), true) }
  t += 1000
  assert.equal(limit.allow(), false, 'a seventh within the minute')
  t = 60_001
  assert.equal(limit.allow(), true, 'the oldest has aged out')
})

test('a page opening links in a loop gets only a handful through', () => {
  let t = 0
  const limit = createRateLimit({ now: () => t })
  let opened = 0
  for (let i = 0; i < 1000; i++) { t += 10; if (limit.allow()) opened++ }
  assert.equal(opened, 6)
})
