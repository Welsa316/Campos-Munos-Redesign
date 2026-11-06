// One set of phone rules for messaging (billing) and dialing (RingOut).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phoneDigits, isPremiumNumber, parseCountryCodes, inCountries } from './phone.js'
import { normalizePhone } from '../billing/reminders.js'
import { normalizeDialNumber } from '../integrations/ringcentral/ringout.js'

test('messaging and dialing agree on what a valid number is', () => {
  // Each of these was accepted by one of the two old validators and refused
  // by the other.
  for (const raw of ['+1 504 555 01011', '+0 504 555 0101', '+5 5555 5555']) {
    assert.equal(normalizePhone(raw), null, `billing: ${raw}`)
    assert.equal(normalizeDialNumber(raw), null, `ringout: ${raw}`)
  }
  for (const raw of ['(504) 555-0101', '+52 1 55 1234 5678', '+502 5555 1234']) {
    assert.equal(`+${normalizePhone(raw)}`, normalizeDialNumber(raw), raw)
  }
})

test('dialing is stricter where a guess would call the wrong person', () => {
  assert.equal(normalizePhone('525512345678'), '525512345678', 'billing reads a stored number as written')
  assert.equal(normalizeDialNumber('525512345678'), null, 'RingOut needs the + for a number outside North America')
  assert.equal(phoneDigits('19005550199'), '19005550199')
  assert.equal(normalizeDialNumber('1-900-555-0199'), null, 'premium rate is never dialed')
})

test('premium and satellite ranges', () => {
  for (const d of ['979123456789', '881612345678', '19005550199', '15049760101', '19765550101', '449098790000', '499001234567', '33891234567', '34806123456', '34905123456', '529001234567']) {
    assert.equal(isPremiumNumber(d), true, d)
  }
  for (const d of ['15045550101', '442079460958', '5215512345678', '18095550101', '34912345678', '33123456789']) {
    assert.equal(isPremiumNumber(d), false, d)
  }
})

test('country allowlist: empty means every country; codes match whole calling codes', () => {
  assert.equal(parseCountryCodes(''), null)
  assert.equal(parseCountryCodes(undefined), null)
  assert.deepEqual(parseCountryCodes(' 1, +52 ,502, junk, 1234'), ['1', '52', '502'])
  const codes = parseCountryCodes('1,52')
  assert.equal(inCountries('15045550101', codes), true)
  assert.equal(inCountries('5215512345678', codes), true)
  assert.equal(inCountries('50255551234', codes), false)
  assert.equal(inCountries('442079460958', null), true)
})
