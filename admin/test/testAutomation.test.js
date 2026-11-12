// Test automation mode in the portal: what each step and each history line
// says. The claims that matter are the ones a person would act on: whether
// something really left the portal or was only shown, and why.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TEST_BANNER, stepLabel, stepPlan, stepState, dueText, offsetText, eventLine, listNote, isText, actionLabel,
} from '../src/modules/testChannel/testAutomationText.js'
import { UPDATES, visibleUpdates } from '../src/data/updates.js'
import { ROLES, resolveCapabilities } from '../../server/auth/capabilities.js'
import { TEST_BANNER as SERVER_BANNER, ACTIONS } from '../../server/testChannel/automation.js'

const NOW = Date.parse('2026-11-12T16:00:00Z') // Thursday 10:00 in New Orleans

test('the portal and the server say the same words on everything test mode produces', () => {
  assert.equal(TEST_BANNER, 'TEST MODE — NO PRODUCTION ACTIONS')
  assert.equal(TEST_BANNER, SERVER_BANNER)
})

test('every step and every button has a name in words', () => {
  assert.equal(stepLabel('ack_email'), 'Acknowledgment email')
  assert.equal(stepLabel('followup:followup_2'), 'Follow-up 2 (text)')
  assert.equal(stepLabel('followup:checkin'), 'Follow-up (text)')
  assert.equal(stepLabel('escalation_2'), 'Escalation, level 2')
  assert.equal(stepLabel('no_response'), 'Status changes to No response')
  for (const a of ACTIONS) assert.doesNotMatch(actionLabel(a), /_/, a)
  assert.deepEqual(['ack_email', 'ack_sms', 'followup:followup_1', 'escalation_1', 'no_response'].map(isText), [false, true, true, false, false])
})

test('before a test starts, a step is called real only when it will really be sent', () => {
  assert.match(stepPlan('ack_email', { sendEmail: true }), /really sent, to the test’s address only/)
  assert.equal(stepPlan('ack_email', { sendEmail: false }), 'shown only, not sent')
  for (const type of ['ack_sms', 'followup:followup_1']) {
    // Ticking the email (or anything else) never makes a text real.
    assert.equal(stepPlan(type, { sendEmail: true, notifyMe: true }), 'shown only, not sent')
    assert.equal(stepPlan(type, { sendSms: true }), 'really texted, to the test’s phone only')
  }
  // And ticking the texts never makes the email real.
  assert.equal(stepPlan('ack_email', { sendSms: true }), 'shown only, not sent')
  assert.match(stepPlan('escalation_1', { notifyMe: false }), /nobody is notified/)
  assert.match(stepPlan('escalation_1', { notifyMe: true }), /to you only/)
  assert.match(stepPlan('no_response'), /never a lead’s/)
})

test('a waiting step counts down; a finished one says whether anything left the portal', () => {
  const step = (state, outcome, extra = {}) => stepState({ state, outcome, ...extra }, { test: { email: 'me@example.test' }, now: NOW })
  assert.deepEqual(step('pending', null, { dueAt: new Date(NOW + 42_000) }), { tone: 'wait', text: 'Due in 0:42' })
  assert.equal(step('pending', null, { dueAt: new Date(NOW + 125_000) }).text, 'Due in 2:05')
  assert.equal(step('pending', null, { dueAt: new Date(NOW - 1000) }).text, 'Due now')
  assert.deepEqual(step('done', 'sent'), { tone: 'good', text: 'Really sent to me@example.test' })
  // A text names the phone, never the email address.
  assert.equal(stepState({ type: 'followup:followup_1', state: 'done', outcome: 'sent' }, { test: { email: 'me@example.test', phone: '(504) 555-0100' }, now: NOW }).text, 'Really sent to (504) 555-0100')
  assert.match(step('failed', 'unknown_delivery').text, /may or may not have arrived; it is not sent again/)
  assert.deepEqual(step('done', 'simulated'), { tone: 'shown', text: 'Shown only, nothing was sent' })
  assert.equal(step('done', 'level_1').text, 'Escalated in the test only')
  assert.equal(step('skipped', 'no_sms_consent').text, 'Skipped: they did not agree on the form to be texted')
  assert.equal(step('cancelled', 'client_replied_by_text').text, 'Stopped because they replied by text')
  assert.equal(step('cancelled', 'consultation_booked').text, 'Stopped because they booked a consultation')
  assert.deepEqual(step('failed', 'interrupted'), { tone: 'bad', text: 'Failed: the server restarted mid-way, and a test step is never tried twice' })
  // Only a real send is ever shown as good.
  for (const [s, o] of [['done', 'simulated'], ['done', 'level_2'], ['done', 'no_response'], ['skipped', 'no_phone'], ['cancelled', 'status_closed']]) assert.notEqual(step(s, o).tone, 'good', `${s}:${o}`)
})

test('times read as a countdown close up and as a day and time further out', () => {
  assert.equal(dueText(new Date(NOW + 9 * 60_000 + 59_000), NOW), 'in 9:59')
  assert.equal(dueText(new Date(NOW + 25 * 60_000), NOW), 'in 25 min')
  assert.equal(dueText(new Date(NOW + 3 * 3600_000), NOW), 'today at 1:00 PM')
  assert.match(dueText(new Date(NOW + 24 * 3600_000), NOW), /Nov 13/)
  assert.equal(offsetText(new Date(NOW), new Date(NOW), 'accelerated'), 'at once')
  assert.equal(offsetText(new Date(NOW + 60_000), new Date(NOW), 'accelerated'), 'after about 1 minute')
  assert.equal(offsetText(new Date(NOW + 180_000), new Date(NOW), 'accelerated'), 'after about 3 minutes')
  assert.match(offsetText(new Date(NOW + 24 * 3600_000), new Date(NOW), 'production'), /Nov 13/)
})

test('the history says what was really sent, what was only shown, and why', () => {
  const sent = eventLine({ kind: 'sent', step: 'ack_email', channel: 'email', recipient: 'me@example.test', subject: '[TEST] Hello', body: 'Body', detail: { replyTo: 'admin@example.test' } })
  assert.equal(sent.tone, 'good')
  assert.equal(sent.title, 'Acknowledgment email really sent to me@example.test')
  assert.match(sent.note, /goes to admin@example\.test, not to the office/)
  assert.deepEqual(sent.preview, { to: 'me@example.test', subject: '[TEST] Hello', body: 'Body' })

  const text = eventLine({ kind: 'simulated', step: 'followup:followup_1', channel: 'sms', recipient: '504-555-0100', body: 'Hola STOP', detail: { reason: 'texts_are_never_sent_in_test_mode' } })
  assert.equal(text.tone, 'shown')
  assert.equal(text.title, 'Follow-up 1 (text) shown only')
  assert.equal(text.note, 'Not sent: text messages are never sent in test mode.')
  assert.equal(text.preview.body, 'Hola STOP')

  assert.equal(eventLine({ kind: 'simulated', step: 'ack_email', channel: 'email', body: 'x', detail: { reason: 'opted_out' } }).note, 'Not sent: this address is on the firm’s opt-out list.')
  assert.equal(eventLine({ kind: 'simulated', step: 'escalation_1', subject: 'A website lead is waiting', body: 'b', detail: { level: 1, notified: 'nobody' } }).title, 'Escalation, level 1: nobody was notified')
  assert.equal(eventLine({ kind: 'simulated', step: 'escalation_2', detail: { level: 2, notified: 'starter_only' } }).title, 'Escalation, level 2: only you were notified')
  assert.equal(eventLine({ kind: 'cancelled', detail: { reason: 'client_replied_by_text', steps: ['followup:followup_1', 'no_response'] } }).note, 'Follow-up 1 (text), Status changes to No response')
  assert.equal(eventLine({ kind: 'status', detail: { from: 'new', to: 'no_response', reason: 'follow_up_sequence_completed', auto: true } }).title, 'Test status: New → No response')
  assert.equal(eventLine({ kind: 'status', by: 'Walid', detail: { from: 'new', to: 'closed', reason: 'marked_by_staff', auto: false } }).note, 'Set by Walid.')
  assert.equal(eventLine({ kind: 'action', by: 'Walid', detail: { action: 'client_replied' } }).title, 'Walid pressed “Client replied”')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendEmail: false, emailHeld: 'address_on_a_lead' } }).note, 'The acknowledgment email is shown only: a lead or client already has it, and nobody confirmed it is yours.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendEmail: true, sendSms: false, smsHeld: 'address_on_a_lead' } }).note,
    'You asked for the acknowledgment email to be really sent, to the test’s own address only. The texts are shown only: a lead or client already has it, and nobody confirmed it is yours.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'production', sendEmail: false } }).note, 'Nothing is really sent in this test.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendEmail: true, sendSms: true } }).note, 'You asked for the acknowledgment email and the text messages to be really sent, to the test’s own address and phone only.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendSms: true } }).note, 'You asked for the text messages to be really sent, to the test’s own phone only.')

  const texted = eventLine({ kind: 'sent', step: 'ack_sms', channel: 'sms', recipient: '(504) 555-0100', body: '[TEST] Hola STOP', detail: { from: '+15045550100', providerId: '9' } })
  assert.equal(texted.tone, 'good')
  assert.equal(texted.title, 'Acknowledgment text really sent to (504) 555-0100')
  assert.match(texted.note, /From the firm’s RingCentral number \+15045550100\. It also shows in RingCentral’s own message history\./)
  assert.equal(texted.preview.body, '[TEST] Hola STOP')
  assert.equal(eventLine({ kind: 'simulated', step: 'ack_sms', channel: 'sms', body: 'x', detail: { reason: 'sms_unavailable', why: 'no_sms_number' } }).note,
    'Not sent: RingCentral cannot send text messages from this connection right now (no sms number).')
  assert.equal(eventLine({ kind: 'simulated', step: 'ack_sms', channel: 'sms', body: 'x', detail: { reason: 'texts_not_requested' } }).note, 'Not sent: you chose not to send the texts for real.')
  assert.match(eventLine({ kind: 'failed', step: 'ack_sms', channel: 'sms', body: 'x', detail: { reason: 'unknown_delivery', error: 'timeout' } }).note, /may or may not have arrived; it is not sent again \(timeout\)/)
  assert.match(eventLine({ kind: 'reset', detail: { removed: 3, all: true } }).note, /^3 test forms removed/)
  assert.match(eventLine({ kind: 'failed', step: 'ack_email', detail: { reason: 'send_failed', error: 'validation_error' } }).note, /It was not accepted for sending \(validation_error\)/)
  // Only a real send is good news in green.
  for (const kind of ['simulated', 'skipped', 'cancelled', 'status', 'action', 'started', 'reset']) assert.notEqual(eventLine({ kind, step: 'ack_sms', detail: {} }).tone, 'good', kind)
})

test('the list says which test forms have an automation test, and whether it is still running', () => {
  assert.equal(listNote({}), '')
  assert.equal(listNote({ automation_status: 'new', automation_pending: 3 }), 'Automation test running · 3 waiting')
  assert.equal(listNote({ automation_status: 'scheduled', automation_pending: 0 }), 'Automation test done · Scheduled')
})

test('the test automation update is shown to the administrator alone', () => {
  const entry = UPDATES.find((u) => u.id === 'test-automation-mode')
  assert.ok(entry)
  const EVERY = resolveCapabilities({ role: 'admin' })
  for (const role of Object.keys(ROLES)) {
    for (const caps of [resolveCapabilities({ role }), resolveCapabilities({ role, grants: [...EVERY] })]) {
      assert.equal(visibleUpdates([entry], (...any) => any.some((c) => caps.has(c))).length === 1, role === 'admin', role)
    }
  }
})
