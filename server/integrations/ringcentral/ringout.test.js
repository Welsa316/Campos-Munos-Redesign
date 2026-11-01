// RingOut rules that need no database: which numbers may be called and how
// RingCentral's statuses read to a person.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDialNumber, ringOutPhase } from './ringout.js'

test('numbers: full numbers only, written any way; no emergency, short or premium numbers', () => {
  for (const [raw, want] of [
    ['(504) 555-0101', '+15045550101'], ['504.555.0101', '+15045550101'], ['1 504 555 0101', '+15045550101'],
    ['+1 (504) 555-0101', '+15045550101'], ['+52 1 55 1234 5678', '+5215512345678'], ['+44 20 7946 0958', '+442079460958'],
  ]) assert.equal(normalizeDialNumber(raw), want, raw)
  for (const raw of ['911', '411', '*67', '555-0101', '1-900-555-0199', '(976) 555-0101', '(504) 976-0101', '(011) 555-0101',
    '(504) 155-0101', '+1 504 555 01011', 'call me', '', null, '+123', '504-555-0101 ext 5', '+1234567890123456']) {
    assert.equal(normalizeDialNumber(raw), null, String(raw))
  }
})

test('status: ringing you → calling the client → connected; failures say whose side', () => {
  assert.deepEqual(ringOutPhase({ callStatus: 'InProgress', callerStatus: 'InProgress', calleeStatus: 'InProgress' }), { phase: 'ringing_you' })
  assert.deepEqual(ringOutPhase({ callStatus: 'InProgress', callerStatus: 'Success', calleeStatus: 'InProgress' }), { phase: 'calling_client' })
  assert.deepEqual(ringOutPhase({ callStatus: 'Success', callerStatus: 'Success', calleeStatus: 'Success' }), { phase: 'connected' })
  assert.deepEqual(ringOutPhase({ callStatus: 'InProgress', callerStatus: 'NoAnswer', calleeStatus: 'InProgress' }), { phase: 'failed', who: 'you', reason: 'NoAnswer' })
  assert.deepEqual(ringOutPhase({ callStatus: 'InProgress', callerStatus: 'Success', calleeStatus: 'Busy' }), { phase: 'failed', who: 'client', reason: 'Busy' })
  assert.deepEqual(ringOutPhase({ callStatus: 'Finished', callerStatus: 'Finished', calleeStatus: 'Finished' }), { phase: 'finished' })
  assert.deepEqual(ringOutPhase(undefined), { phase: 'ringing_you' })
})
