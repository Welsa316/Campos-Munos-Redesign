// "Today" on the Calls page and the Home card starts at midnight in New
// Orleans, whatever time zone the browser is in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoneMidnight, zoneMidnightDaysAgo } from '../src/utils/firmTime.js'

const iso = (d) => d.toISOString()

test('midnight is New Orleans midnight (CST, six hours behind UTC)', () => {
  assert.equal(iso(zoneMidnight('2026-11-06T15:00:00Z')), '2026-11-06T06:00:00.000Z')
})

test('late evening in New Orleans is still that day, though UTC has moved on', () => {
  // 21:00 on Nov 6 in New Orleans is 03:00 on Nov 7 in UTC.
  assert.equal(iso(zoneMidnight('2026-11-07T03:00:00Z')), '2026-11-06T06:00:00.000Z')
})

test('on the day clocks go forward, midnight is the CST midnight before the change', () => {
  // 8 March 2026: 2 a.m. CST becomes 3 a.m. CDT. At 10 a.m. CDT the day began at 00:00 CST.
  assert.equal(iso(zoneMidnight('2026-03-08T15:00:00Z')), '2026-03-08T06:00:00.000Z')
  // The next day starts at 00:00 CDT, five hours behind UTC.
  assert.equal(iso(zoneMidnight('2026-03-09T15:00:00Z')), '2026-03-09T05:00:00.000Z')
})

test('days back land on that day\'s midnight across a clock change', () => {
  assert.equal(iso(zoneMidnightDaysAgo(1, '2026-03-09T15:00:00Z')), '2026-03-08T06:00:00.000Z')
  assert.equal(iso(zoneMidnightDaysAgo(6, '2026-11-06T15:00:00Z')), '2026-10-31T05:00:00.000Z')
})
