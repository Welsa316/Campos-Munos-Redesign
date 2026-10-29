import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDate, excelSerialToDate } from './dates.js'

const ok = (s) => {
  const r = parseDate(s)
  assert.equal(r.error, null, `unexpected error for ${JSON.stringify(s)}: ${r.error}`)
  return r.date
}
const bad = (s) => {
  const r = parseDate(s)
  assert.equal(r.date, null, `${JSON.stringify(s)} should not parse, got ${r.date}`)
  assert.equal(typeof r.error, 'string')
  return r.error
}

test('ISO dates, with and without time', () => {
  assert.equal(ok('2026-01-05'), '2026-01-05')
  assert.equal(ok('2026/1/5'), '2026-01-05')
  assert.equal(ok('2026-01-05T23:30:00Z'), '2026-01-05')
  assert.equal(ok('2026-01-05 00:00:00'), '2026-01-05')
})

test('US month-first dates', () => {
  assert.equal(ok('1/5/2026'), '2026-01-05')
  assert.equal(ok('01/05/2026'), '2026-01-05')
  assert.equal(ok('12/31/2026'), '2026-12-31')
  assert.equal(ok('1-5-2026'), '2026-01-05')
  assert.equal(ok('1/5/2026 10:30 AM'), '2026-01-05')
})

test('two-digit years are 20xx', () => {
  assert.equal(ok('1/5/26'), '2026-01-05')
  assert.equal(ok('12/31/99'), '2099-12-31')
})

test('day-first dates are not silently reinterpreted', () => {
  assert.match(bad('13/01/2026'), /no month 13/)
  assert.match(bad('31/12/2026'), /no month 31/)
})

test('impossible dates are rejected', () => {
  bad('2/30/2026')
  bad('2026-02-29')
  bad('4/31/2026')
  bad('0/10/2026')
  bad('2026-13-01')
  assert.equal(ok('2/29/2028'), '2028-02-29')
  assert.equal(ok('2000-02-29'), '2000-02-29')
  bad('1900-02-29')
})

test('month names in English and Spanish', () => {
  assert.equal(ok('Jan 5, 2026'), '2026-01-05')
  assert.equal(ok('January 5 2026'), '2026-01-05')
  assert.equal(ok('Sept. 30, 2026'), '2026-09-30')
  assert.equal(ok('5 Jan 2026'), '2026-01-05')
  assert.equal(ok('05-Mar-2026'), '2026-03-05')
  assert.equal(ok('5 de enero de 2026'), '2026-01-05')
  assert.equal(ok('15 de diciembre de 2026'), '2026-12-15')
  assert.equal(ok('Diciembre 15, 2026'), '2026-12-15')
  bad('Feb 30, 2026')
  bad('Foo 5, 2026')
})

test('Excel serials as numbers and numeric strings', () => {
  assert.equal(ok(46027), '2026-01-05')
  assert.equal(ok('46027'), '2026-01-05')
  assert.equal(ok('46027.75'), '2026-01-05') // time of day dropped
  assert.equal(ok(1), '1900-01-01')
  assert.equal(ok(59), '1900-02-28')
  assert.equal(ok(61), '1900-03-01')
  assert.equal(ok(45658), '2025-01-01')
  assert.equal(ok(2958465), '9999-12-31')
})

test('Excel serial 60 (the fake 1900-02-29) is rejected', () => {
  assert.match(bad(60), /1900-02-29/)
  assert.match(bad('60'), /1900-02-29/)
})

test('out-of-range serials and junk', () => {
  bad(0)
  bad('20260105')
  bad(-5)
  bad('yesterday')
  // A bare number is read as an Excel serial: "2026" is 1905-07-18. The
  // normalizer flags dates outside 2000-2100 as implausible for that reason.
  assert.equal(ok('2026'), '1905-07-18')
})

test('1904 date system', () => {
  assert.equal(excelSerialToDate(0, { date1904: true }).date, '1904-01-01')
  assert.equal(excelSerialToDate(46027 - 1462, { date1904: true }).date, '2026-01-05')
})

test('blank is null with no error', () => {
  for (const b of ['', '  ', null, undefined]) assert.deepEqual(parseDate(b), { date: null, error: null })
})
