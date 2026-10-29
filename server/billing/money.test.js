import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMoneyToCents, formatCents } from './money.js'

const cents = (s) => {
  const r = parseMoneyToCents(s)
  assert.equal(r.error, null, `unexpected error for ${JSON.stringify(s)}: ${r.error}`)
  return r.cents
}
const rejects = (s) => {
  const r = parseMoneyToCents(s)
  assert.equal(r.cents, null, `${JSON.stringify(s)} should not parse, got ${r.cents}`)
  assert.equal(typeof r.error, 'string')
  return r.error
}

test('US formats parse to exact cents', () => {
  assert.equal(cents('$1,234.56'), 123456)
  assert.equal(cents('1234.5'), 123450)
  assert.equal(cents('1234'), 123400)
  assert.equal(cents('0.01'), 1)
  assert.equal(cents('.5'), 50)
  assert.equal(cents('1,234,567.89'), 123456789)
  assert.equal(cents('  $ 12.30  '), 1230)
  assert.equal(cents('1,234'), 123400)
  assert.equal(cents('$0.00'), 0)
})

test('negatives: parentheses, leading minus, minus around the dollar sign', () => {
  assert.equal(cents('(50.00)'), -5000)
  assert.equal(cents('($1,050.25)'), -105025)
  assert.equal(cents('-50'), -5000)
  assert.equal(cents('-$50.10'), -5010)
  assert.equal(cents('$-50.10'), -5010)
  assert.equal(cents('50.10-'), -5010)
  rejects('(-50.00)')
  rejects('--5')
})

test('currency codes are stripped', () => {
  assert.equal(cents('USD 10'), 1000)
  assert.equal(cents('10 USD'), 1000)
  assert.equal(cents('US$10.5'), 1050)
  assert.equal(cents('usd 1,000.00'), 100000)
})

test('blank is null with no error', () => {
  for (const b of ['', '   ', null, undefined, ' ']) {
    assert.deepEqual(parseMoneyToCents(b), { cents: null, error: null })
  }
})

test('more than two decimals is an error, never rounded', () => {
  assert.match(rejects('1234.567'), /more than 2 decimal/)
  assert.match(rejects('12.345'), /ambiguous/) // could also be 12,345 in European notation
  assert.match(rejects('0.001'), /more than 2 decimal/)
  assert.match(rejects('1,234.567'), /more than 2 decimal/)
})

test('European format accepted only when unambiguous', () => {
  assert.equal(cents('1.234,56'), 123456)
  assert.equal(cents('1.234.567,89'), 123456789)
  assert.equal(cents('1.234.567'), 123456700)
  // A single dot followed by three digits: thousands or three decimals?
  assert.match(rejects('1.234'), /ambiguous/)
  // A comma decimal with no grouping to confirm the locale.
  assert.match(rejects('12,50'), /ambiguous/)
  assert.match(rejects('0,5'), /ambiguous/)
  // "1,234.56" and "1.234,56" are the same amount read in their own locale.
  assert.equal(cents('1,234.56'), cents('1.234,56'))
})

test('malformed numbers and text are errors', () => {
  for (const s of ['abc', '12abc', '1e3', '1,23,456', '1.2.3', '$', '-', '12.34.56', 'N/A', '1 234', 'EUR 10', '1,2345']) {
    rejects(s)
  }
})

test('numbers are accepted and go through the same string path', () => {
  assert.equal(cents(12.5), 1250)
  assert.equal(cents(0.1), 10)
  rejects(Number.NaN)
  rejects(0.30000000000000004)
})

test('0.1 + 0.2 sums exactly in cents', () => {
  const sum = cents('0.1') + cents('0.2')
  assert.equal(sum, 30)
  assert.equal(sum, cents('0.3'))
  // Many small amounts: float dollars would drift here.
  let total = 0
  for (let i = 0; i < 1000; i++) total += cents('0.07')
  assert.equal(total, 7000)
})

test('very large values are refused rather than losing precision', () => {
  assert.equal(cents('9,999,999,999,999.99'), 999999999999999)
  rejects('99999999999999999')
})

test('formatCents', () => {
  assert.equal(formatCents(123456), '$1,234.56')
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(5), '$0.05')
  assert.equal(formatCents(-105025), '-$1,050.25')
  assert.equal(formatCents(100000000), '$1,000,000.00')
  assert.throws(() => formatCents(1.5), TypeError)
  // Round trip
  for (const s of ['$1,234.56', '$0.07', '-$12.00']) assert.equal(formatCents(cents(s)), s)
})
