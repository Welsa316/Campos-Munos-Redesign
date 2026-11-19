// All calls can look back up to 12 months, in whole New Orleans days.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RANGE_KEYS, rangeBounds, rangeLabel, customDays, dateKey } from '../src/modules/calls/callRanges.js'

// 10:00 on Thursday 19 November 2026 in New Orleans (CST, UTC-6).
const NOW = Date.parse('2026-11-19T16:00:00Z')
const iso = (d) => d.toISOString()

test('the long ranges reach back 90 days, 6 months and 12 months from today’s midnight', () => {
  for (const k of ['quarter', 'half', 'year']) assert.ok(RANGE_KEYS.includes(k), k)
  // 90 days = today and the 89 before: from 22 August (still CDT, UTC-5).
  assert.equal(iso(rangeBounds('quarter', {}, NOW).from), '2026-08-22T05:00:00.000Z')
  assert.equal(iso(rangeBounds('half', {}, NOW).from), '2026-05-22T05:00:00.000Z')
  assert.equal(iso(rangeBounds('year', {}, NOW).from), '2025-11-20T06:00:00.000Z')
  // Each runs to just after now.
  assert.equal(rangeBounds('year', {}, NOW).to.getTime(), NOW + 60 * 1000)
  // The short ones are unchanged.
  assert.equal(iso(rangeBounds('month', {}, NOW).from), '2026-10-21T05:00:00.000Z')
  assert.equal(iso(rangeBounds('today', {}, NOW).from), '2026-11-19T06:00:00.000Z')
})

test('a custom range covers both days whole, in New Orleans time', () => {
  const b = rangeBounds('custom', { from: '2026-07-01', to: '2026-08-31' }, NOW)
  assert.equal(iso(b.from), '2026-07-01T05:00:00.000Z')
  assert.equal(iso(b.to), '2026-09-01T05:00:00.000Z', 'up to midnight that ends the last day')
  // Ending today: up to now, not tomorrow.
  assert.equal(rangeBounds('custom', { from: '2026-11-01', to: '2026-11-19' }, NOW).to.getTime(), NOW + 60 * 1000)
  // One day.
  const one = rangeBounds('custom', { from: '2026-09-15', to: '2026-09-15' }, NOW)
  assert.equal(one.to - one.from, 24 * 3600e3)
})

test('custom days are cleaned: real dates, in order, not in the future, not before calls are kept', () => {
  assert.deepEqual(customDays({ from: '2026-09-30', to: '2026-09-01' }, NOW), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(customDays({ from: '2026-11-01', to: '2027-01-01' }, NOW), { from: '2026-11-01', to: '2026-11-19' })
  assert.deepEqual(customDays({ from: '2024-01-01', to: '2026-01-31' }, NOW), { from: '2025-11-20', to: '2026-01-31' })
  assert.deepEqual(customDays({ from: 'nope', to: '2026-02-30' }, NOW), { from: '2026-10-21', to: '2026-11-19' }, 'junk falls back to the last 30 days')
  assert.equal(dateKey('2026-02-29'), null)
  assert.equal(dateKey('2028-02-29'), '2028-02-29')
})

test('the list says which range it shows', () => {
  assert.equal(rangeLabel('quarter', {}, NOW), 'last 90 days')
  assert.equal(rangeLabel('half', {}, NOW), 'last 6 months')
  assert.equal(rangeLabel('today', {}, NOW), 'today')
  assert.equal(rangeLabel('custom', { from: '2026-07-01', to: '2026-08-31' }, NOW), 'Jul 1 – Aug 31')
  assert.equal(rangeLabel('custom', { from: '2025-12-01', to: '2026-01-31' }, NOW), 'Dec 1, 2025 – Jan 31, 2026')
  assert.equal(rangeLabel('custom', { from: '2026-09-15', to: '2026-09-15' }, NOW), 'Sep 15')
})
