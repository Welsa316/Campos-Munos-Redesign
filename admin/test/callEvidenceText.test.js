// The words the Calls page uses for a call's evidence-based classification.
// What matters: a call the evidence cannot settle never reads as missed, a
// hang-up with nobody shown rung never claims nobody was rung, and nobody is
// named as not answering unless a step says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusLine, factText, gapText, who, stepTarget, offset } from '../src/modules/calls/callEvidenceText.js'

const yoletty = { extensionId: '9101', extension: '101', name: 'Yoletty' }

test('not confirmed reads as not confirmed, with RingCentral’s own result beside it', () => {
  const line = statusLine({ classification: 'unknown', result: 'Missed', offeredTo: [], notAnsweredBy: [] })
  assert.equal(line, 'Not confirmed · RingCentral’s result: Missed')
  assert.doesNotMatch(line, /^Missed|not answered/i)
})

test('a hang-up with no step to anyone does not claim nobody was rung', () => {
  const line = statusLine({ classification: 'caller_hung_up', offeredTo: [], notAnsweredBy: [] })
  assert.match(line, /no record of anyone being rung/)
  assert.doesNotMatch(line, /before (it )?rang|before ringing|nobody was rung/i)
})

test('a hang-up while offered to someone names them, without saying they failed to answer', () => {
  const line = statusLine({ classification: 'caller_hung_up', offeredTo: [{ ...yoletty, reason: 'Hang Up' }], notAnsweredBy: [] })
  assert.equal(line, 'Caller hung up before an answer · offered to Yoletty, ext. 101')
})

test('not answered lists each person with what their step says', () => {
  const line = statusLine({ classification: 'not_answered', offeredTo: [{ ...yoletty, reason: 'No Answer' }, { name: 'Ciro', extension: '102', reason: 'Line Busy' }] })
  assert.equal(line, 'Not answered · offered to Yoletty, ext. 101 · no answer; Ciro, ext. 102 · busy')
})

test('answered at a forwarded phone shows only its last 4 digits', () => {
  assert.equal(statusLine({ classification: 'answered', answeredBy: { kind: 'external', numberEnd: '9876', onBehalfOf: 'Yoletty' } }),
    'Answered by a forwarded phone ending 9876 (Yoletty’s forwarding)')
})

test('facts and gaps in plain words', () => {
  const to = { kind: 'extension', name: 'Yoletty', number: '101', type: 'User' }
  assert.equal(factText({ code: 'not_answered_by', reason: 'No Answer', to }), 'Yoletty, ext. 101 did not answer (No Answer).')
  assert.match(factText({ code: 'accepted_by_system', to: { kind: 'extension', name: 'CML', number: '1', type: 'Department' } }), /part of the phone system \(call queue\), so this is not an answer/)
  assert.match(factText({ code: 'stopped_ambiguous', to }), /not counted either way/)
  assert.match(gapText('alerting_unknown'), /does not prove nobody was rung/)
  assert.equal(gapText('made_up'), null)
})

test('targets and offsets', () => {
  assert.equal(who(yoletty), 'Yoletty, ext. 101')
  assert.equal(stepTarget({ kind: 'extension', name: 'CML', number: '1', type: 'Department' }), 'CML, ext. 1 (call queue)')
  assert.equal(stepTarget({ kind: 'extension', name: 'X', number: '7', type: null }), 'X, ext. 7')
  assert.equal(stepTarget({ kind: 'extension', name: 'Yoletty', rcName: 'Office CML', number: '101', type: 'User' }),
    'Yoletty, ext. 101 (person, “Office CML” in RingCentral)')
  assert.equal(stepTarget({ kind: 'external', numberEnd: '9876' }), 'Phone ending 9876')
  assert.equal(offset('2026-10-26T15:03:01Z', '2026-10-26T15:00:00Z'), '+3m 01s')
  assert.equal(offset('2026-10-26T15:00:09Z', '2026-10-26T15:00:00Z'), '+9s')
  assert.equal(offset(null, '2026-10-26T15:00:00Z'), '')
})

test('accepted at a forwarded phone reads as not confirmed, and says why', () => {
  assert.equal(statusLine({ classification: 'unknown', gaps: ['forward_answer_unconfirmed'], result: 'Accepted' }), 'Not confirmed · accepted at a phone it was forwarded to')
  assert.match(factText({ code: 'accepted_by_forwarded_phone', to: { kind: 'external', numberEnd: '9876' }, onBehalfOf: 'Yoletty' }),
    /phone ending 9876 .*\(Yoletty’s forwarding\) accepted it\. That is either the person or that phone’s own voicemail/)
  assert.equal(stepTarget({ kind: 'caller', numberEnd: '0142' }), 'Back to the caller (ending 0142)')
  assert.match(gapText('system_accepted'), /may have been passed to someone/)
})

test('a not-confirmed call that reached only the phone system says so, and claims nothing more', () => {
  const line = statusLine({ classification: 'unknown', result: 'Missed', systemOnly: ['the main line', 'the voicemail box'], offeredTo: [] })
  assert.equal(line, 'Not confirmed · reached only the phone system (the main line, the voicemail box); no one was shown as rung')
  assert.doesNotMatch(line, /hung up|abandon|missed/i)
})
