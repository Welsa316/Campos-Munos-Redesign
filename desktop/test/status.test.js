'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { describe, createStatus, ERRORS_BEFORE_PAUSED } = require('../src/status')

test('signing out after being signed in alerts once and shows paused', () => {
  const s = createStatus()
  assert.equal(s.report('ok').alert, false)
  const out = s.report('signed-out')
  assert.deepEqual(out, { state: 'signed-out', changed: true, alert: true })
  // Still signed out on the next slow poll: no second alert.
  assert.deepEqual(s.report('signed-out'), { state: 'signed-out', changed: false, alert: false })
  assert.equal(describe(out.state, 'App').label, 'Signed out: notifications paused')
  assert.equal(describe(out.state, 'App').badge, '!')
})

test('first launch before anyone signs in stays quiet', () => {
  const s = createStatus()
  const r = s.report('signed-out')
  assert.equal(r.alert, false)
  assert.equal(r.state, 'signed-out') // the tray still says so
})

test('signing back in clears the paused state', () => {
  const s = createStatus()
  s.report('ok')
  s.report('signed-out')
  assert.deepEqual(s.report('ok'), { state: 'ok', changed: true, alert: false })
  assert.deepEqual(describe('ok', 'App'), { tooltip: 'App', label: null, badge: '' })
})

test('a network blip is not reported; repeated failures are', () => {
  const s = createStatus()
  s.report('ok')
  for (let i = 1; i < ERRORS_BEFORE_PAUSED; i++) assert.equal(s.report('error').state, 'ok')
  const r = s.report('error')
  assert.equal(r.state, 'error')
  assert.equal(r.changed, true)
  assert.equal(r.alert, false)
  assert.match(describe('error', 'App').tooltip, /paused/)
  // One success resets the count.
  s.report('ok')
  assert.equal(s.report('error').state, 'ok')
})
