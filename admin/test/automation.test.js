// The automation in words: what a lead's page, Home, the activity log and
// the Automation page say for the server's short codes. In New Orleans time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  leadAutomationLines, statusWhy, attentionText, flagChip, flagWhy, systemEventBits, reasonText, jobLabel,
  MESSAGE_REASONS, STOP_REASONS, STATUS_REASONS, JOB_LABELS, ATTENTION_LABELS,
} from '../src/modules/automation/automationText.js'
import { workItemText } from '../src/modules/reminders/workQueueText.js'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server')
const now = new Date('2026-11-09T18:00:00Z').getTime() // Mon noon in New Orleans

test('a lead’s automation reads as what happened and what is next', () => {
  const lines = leadAutomationLines({
    messages: [
      { channel: 'email', purpose: 'lead_ack', status: 'sent', language: 'es', at: '2026-11-09T16:31:00Z' },
      { channel: 'sms', purpose: 'lead_ack', status: 'sent', language: 'bi', at: '2026-11-09T16:31:00Z' },
    ],
    pending: [{ type: 'lead_followup', at: '2026-11-10T16:30:00Z' }, { type: 'lead_followup', at: '2026-11-12T16:30:00Z' }, { type: 'lead_sla', at: '2026-11-09T18:30:00Z' }],
    bookings: [], slaDueAt: '2026-11-09T18:30:00Z', escalationLevel: 0, paused: false, stopped: null,
  }, now).map((l) => l.text)
  assert.deepEqual(lines, [
    'Acknowledgment by email sent 10:31 AM, in Spanish',
    'Acknowledgment by text sent 10:31 AM, in Spanish and English',
    '2 follow-up texts are queued; the next on Tue, Nov 10, 10:30 AM, unless someone reaches them first',
    'Someone should contact them by 12:30 PM today',
  ])
})

test('a lead’s automation says why it stopped, and what went wrong', () => {
  const text = (a) => leadAutomationLines({ messages: [], pending: [], bookings: [], ...a }, now).map((l) => `${l.tone}: ${l.text}`)
  assert.deepEqual(text({ stopped: { reason: 'connected_callback' } }), ['quiet: Follow-ups stopped because a call back to them connected'])
  assert.deepEqual(text({ stopped: { reason: 'staff_replied' }, paused: true }), ['quiet: Follow-ups stopped because someone replied from the portal', 'quiet: Automatic messages are stopped for this lead'])
  assert.deepEqual(text({ messages: [{ channel: 'sms', purpose: 'lead_followup', status: 'unknown', at: '2026-11-09T16:31:00Z' }] }),
    ['warn: Follow-up by text was not delivered: it may or may not have been delivered, so it was not sent again'])
  assert.deepEqual(text({ bookings: [{ status: 'booked', startsAt: '2026-11-11T21:00:00Z' }] }), ['good: Consultation on the calendar: Wed, Nov 11, 3:00 PM'])
  assert.deepEqual(text({ bookings: [{ status: 'cancelled', startsAt: '2026-11-11T21:00:00Z' }] }), ['warn: A consultation for Wed, Nov 11, 3:00 PM was cancelled on the calendar'])
  assert.deepEqual(text({ escalationLevel: 2 }), ['warn: Escalated twice: nobody had contacted them in time'])
  assert.deepEqual(leadAutomationLines(null), [])
  assert.deepEqual(text({}), [], 'nothing to say when nothing happened')
})

test('why a status is what it is', () => {
  assert.equal(statusWhy({ status: { reason: 'connected_callback', auto: true } }), 'Set automatically: a call back to their number connected')
  assert.equal(statusWhy({ status: { reason: 'follow_up_sequence_completed', auto: true } }), 'Set automatically: every follow-up text was sent and nothing came back')
  assert.equal(statusWhy({ status: { reason: 'set_by_staff', auto: false } }), 'set by a person')
  assert.equal(statusWhy({ status: { reason: null } }), '')
  assert.equal(statusWhy(null), '')
})

test('Home: a lead that needs a person says why, and how long', () => {
  const row = (reason, at = '2026-11-09T16:30:00Z') => workItemText({ kind: 'lead_attention', group: 'attention', reason, name: 'Ana Prueba', at }, now)
  assert.deepEqual(row('client_replied'), { title: 'Ana Prueba replied by text', icon: 'comment-dots', tone: 'due', when: 'Waiting since 10:30 AM' })
  assert.deepEqual(row('overdue', '2026-11-06T18:30:00Z'), { title: 'Nobody has contacted Ana Prueba yet', icon: 'clock', tone: 'overdue', when: 'Due since Fri, Nov 6, 12:30 PM' })
  assert.equal(row('message_failed').title, 'An automatic message to Ana Prueba was not sent')
  assert.equal(row('possible_spam').title, 'Check: possible vendor message from Ana Prueba')
  assert.equal(row('no_response').tone, 'quiet')
  assert.equal(row('booking_cancelled').title, 'Ana Prueba’s consultation was cancelled')
  assert.equal(attentionText({ reason: 'overdue', name: null, at: '2026-11-09T16:30:00Z' }, now).title, 'Nobody has contacted a website lead yet')
  assert.equal(attentionText({ reason: 'something_new', name: 'Ana', at: '2026-11-09T16:30:00Z' }, now).title, 'Ana needs someone', 'an unknown reason still reads as a sentence')
})

test('a switch: on, paused, off on the server, or waiting on another', () => {
  const flags = [{ key: 'sms_sending', label: 'RingCentral text messages (sending)' }]
  assert.deepEqual(flagChip({ on: true }), { label: 'On', tone: 'good' })
  assert.deepEqual(flagChip({ on: false, paused: true, why: 'paused' }), { label: 'Paused', tone: 'warn' })
  assert.deepEqual(flagChip({ on: false, why: 'switched_off' }), { label: 'Off', tone: 'quiet' })
  assert.deepEqual(flagChip({ on: false, why: 'needs:sms_sending' }), { label: 'Waiting', tone: 'quiet' })
  assert.equal(flagWhy({ on: true }), '')
  assert.equal(flagWhy({ on: false, why: 'switched_off', env: 'LEAD_ACK_ENABLED' }), 'Off on the server. Set LEAD_ACK_ENABLED=true on the API service to switch it on.')
  assert.equal(flagWhy({ on: false, paused: true, why: 'paused' }), 'Paused here. Resume to let it run again.')
  assert.equal(flagWhy({ on: false, why: 'needs:sms_sending' }, flags), 'Its own switch is on, but it needs “RingCentral text messages (sending)” to be on too.')
})

test('the activity log says why the portal did something', () => {
  const bits = (action, details) => systemEventBits({ action, details }).join(' · ')
  assert.equal(bits('automation.lead_ack_sent', { channel: 'email', template: 'lead_ack_email' }), 'by email')
  assert.equal(bits('automation.lead_status', { to: 'no_response', reason: 'follow_up_sequence_completed' }), 'to no response: every follow-up text was sent and nothing came back')
  assert.equal(bits('automation.sequence_cancelled', { reason: 'client_replied_by_text', jobs: 3 }), 'because they replied by text')
  assert.equal(bits('automation.message_skipped', { channel: 'sms', reason: 'no_sms_consent' }), 'by text · they did not agree on the form to be texted')
  assert.equal(bits('automation.job_failed', { type: 'missed_call_sms', reason: 'unknown_delivery' }), 'Missed-call text: it may or may not have been delivered, so it was not sent again')
  assert.equal(bits('automation.lead_escalated', { level: 1, notified: 2, emailed: true }), 'level 1, 2 people notified, one email')
  assert.equal(bits('automation.lead_spam', { state: 'possible', reason: 'phrase_rule' }), 'a listed phrase; left in the inbox for someone to check')
})

test('a code nobody wrote words for still reads as words, never as nothing', () => {
  assert.equal(reasonText('some_new_code'), 'some new code')
  assert.equal(reasonText('sms_unavailable:no_sms_number'), 'sms unavailable no sms number')
  assert.equal(reasonText(null), 'no reason recorded')
  assert.equal(jobLabel('brand_new_job'), 'brand new job')
})

test('every code the server can give has words here', () => {
  const read = (...p) => fs.readFileSync(join(SERVER, ...p), 'utf8')
  const sources = ['leads.js', 'missedCalls.js', 'messaging.js', 'leadStatus.js'].map((f) => read('automation', f)).join('\n')
  // skipped('…'), cancelled('…'), skip('…'), outcome: '…' and the reasons passed to stopLeadAutomation / setLeadStatus.
  const codes = new Set()
  for (const m of sources.matchAll(/\b(?:skipped|cancelled|skip)\('([a-z_]+)'\)/g)) codes.add(m[1])
  for (const m of sources.matchAll(/outcome: '([a-z_]+)'/g)) codes.add(m[1])
  for (const m of sources.matchAll(/reason: '([a-z_]+)'/g)) codes.add(m[1])
  for (const m of sources.matchAll(/stopLeadAutomation\(db, lead\.id, '([a-z_]+)'/g)) codes.add(m[1])
  assert.ok(codes.size > 20, `found ${codes.size} codes; the scan is not reading the server`)
  // Fine without their own words: results that are not reasons.
  const NOT_REASONS = new Set(['sent', 'already_sent', 'delivered', 'no_receipt_yet', 'nothing_to_check', 'no_response', 'already_escalated', 'status_changed', 'lead_gone', 'bad_handler_result',
    // A provider's answer and a query's argument, not reasons shown to anyone.
    'failed', 'unknown', 'attention'])
  const known = { ...MESSAGE_REASONS, ...STOP_REASONS, ...STATUS_REASONS }
  const missing = [...codes].filter((c) => !NOT_REASONS.has(c) && !known[c]).sort()
  assert.deepEqual(missing, [], 'add these to admin/src/modules/automation/automationText.js')
  // Every kind of job the worker runs has a name.
  const jobTypes = new Set([...(read('automation', 'leads.js') + read('automation', 'missedCalls.js') + read('automation', 'messaging.js')).matchAll(/type: '([a-z_]+)'/g)].map((m) => m[1]))
  assert.deepEqual([...jobTypes].filter((t) => !JOB_LABELS[t]).sort(), [])
  // And every reason a lead can need a person for.
  const attention = [...read('automation', 'health.js').matchAll(/ATTENTION_ORDER = Object\.freeze\(\[([^\]]+)\]/g)][0][1].match(/[a-z_]+/g)
  assert.deepEqual(attention.filter((r) => !ATTENTION_LABELS[r]), [])
  for (const r of attention) assert.notEqual(attentionText({ reason: r, name: 'Ana', at: '2026-11-09T16:30:00Z' }, now).title, 'Ana needs someone', r)
})
