// Counts, dates and names in sentences: nothing on screen reads "1 invoices",
// "invoice(s)", "NaN days ago", "Invalid Date" or "null null".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plural, toDate, leadName, daysAgo, isReportFile, known, isComposing } from '../src/utils/text.js'

test('plural agrees with the count', () => {
  assert.equal(plural(1, 'invoice'), '1 invoice')
  assert.equal(plural(0, 'invoice'), '0 invoices')
  assert.equal(plural(3, 'reply', 'replies'), '3 replies')
  assert.equal(plural(1200, 'item'), '1,200 items')
  assert.equal(plural(undefined, 'error'), '0 errors', 'a missing count reads as none, not "undefined errors"')
})

test('toDate accepts real dates only', () => {
  assert.equal(toDate('2026-11-06T15:00:00Z').toISOString(), '2026-11-06T15:00:00.000Z')
  assert.equal(toDate(null), null)
  assert.equal(toDate(''), null)
  assert.equal(toDate('not a date'), null)
})

test('a lead with a missing name falls back instead of printing "null null"', () => {
  assert.equal(leadName({ first_name: 'Ana', last_name: 'Ruiz' }), 'Ana Ruiz')
  assert.equal(leadName({ first_name: 'Ana', last_name: null }), 'Ana')
  assert.equal(leadName({ first_name: null, last_name: null, email: 'ana@example.com' }), 'ana@example.com')
  assert.equal(leadName({ first_name: null, last_name: null }), 'a lead with no name')
  assert.equal(leadName(null, 'Someone'), 'Someone')
})

test('days ago never reads "NaN days ago"', () => {
  const now = Date.parse('2026-11-06T15:00:00Z')
  assert.equal(daysAgo('2026-11-06T09:00:00Z', now), 'today')
  assert.equal(daysAgo('2026-11-05T09:00:00Z', now), 'yesterday')
  assert.equal(daysAgo('2026-11-01T09:00:00Z', now), '5 days ago')
  assert.equal(daysAgo(null, now), '')
  assert.equal(daysAgo('garbage', now), '')
})

test('a status nobody mapped yet shows as itself instead of throwing', () => {
  const STATUS = { applied: { label: 'Applied', tone: 'bg-green-100 text-green-800' } }
  assert.equal(known(STATUS, 'applied').label, 'Applied')
  assert.deepEqual(known(STATUS, 'needs_review'), { label: 'needs review', tone: 'bg-gray-100 text-gray-700' })
  assert.equal(known(STATUS, null).label, 'Unknown')
  assert.equal(known(undefined, 'x').label, 'x')
})

test('Enter while an input method is composing does not count as send', () => {
  assert.equal(isComposing({ key: 'Enter', isComposing: true }), true)
  assert.equal(isComposing({ key: 'Enter', keyCode: 229 }), true, 'Safari reports composition only through keyCode 229')
  assert.equal(isComposing({ key: 'Enter', isComposing: false, keyCode: 13 }), false)
})

test('a dropped file is checked like the file picker checks it', () => {
  assert.equal(isReportFile({ name: 'invoices.CSV' }), true)
  assert.equal(isReportFile({ name: 'report.xlsx' }), true)
  assert.equal(isReportFile({ name: 'photo.png' }), false)
  assert.equal(isReportFile({ name: 'report.xlsx.exe' }), false)
  assert.equal(isReportFile(null), false)
})
