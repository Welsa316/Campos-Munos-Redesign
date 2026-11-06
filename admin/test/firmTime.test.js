// "Today" on the Calls page and the Home card starts at midnight in New
// Orleans, whatever time zone the browser is in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zoneMidnight, zoneMidnightDaysAgo, firmInstant, firmDateKey, sameFirmDay } from '../src/utils/firmTime.js'

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

test('a New Orleans wall time is the right instant, either side of a clock change', () => {
  assert.equal(iso(firmInstant(2026, 11, 6, 9, 0)), '2026-11-06T15:00:00.000Z', 'CST')
  assert.equal(iso(firmInstant(2026, 7, 1, 9, 0)), '2026-07-01T14:00:00.000Z', 'CDT')
  // 1 November 2026: 2 a.m. CDT becomes 1 a.m. CST. 9 a.m. that day is CST.
  assert.equal(iso(firmInstant(2026, 11, 1, 9, 0)), '2026-11-01T15:00:00.000Z')
})

test('the same day means the same day in New Orleans, not in UTC', () => {
  // 23:30 on Nov 6 in New Orleans is already Nov 7 in UTC.
  assert.equal(firmDateKey('2026-11-07T05:30:00Z'), '2026-11-06')
  assert.equal(sameFirmDay('2026-11-07T05:30:00Z', '2026-11-07T00:00:00Z'), true)
  // 00:30 on Nov 7 in New Orleans is the next day there.
  assert.equal(sameFirmDay('2026-11-07T06:30:00Z', '2026-11-07T05:30:00Z'), false)
})
