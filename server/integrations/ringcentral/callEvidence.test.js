// The evidence-based call classifier. Each case is built from the fields
// RingCentral documents for Detailed call log records and legs; synthetic
// people and 555 numbers only. The rule under test: a call is labelled
// answered / not answered / hung up / voicemail only when a documented
// `reason` (or a linked voicemail message) says so, never from `result`,
// duration, or a leg that is missing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCall, sanitizeRecord, UNANSWERED_CLASSES } from './callEvidence.js'

const dir = (entries, available = true) => ({
  available,
  byId: new Map(entries.map((e) => [e.id, e])),
  byNumber: new Map(entries.map((e) => [e.number, e])),
})
const DIRECTORY = dir([
  { id: '9101', number: '101', name: 'Yoletty', type: 'User' },
  { id: '9102', number: '102', name: 'Ciro', type: 'User' },
  { id: '9001', number: '1', name: 'Main menu', type: 'IvrMenu' },
  { id: '9002', number: '2', name: 'Front desk queue', type: 'Department' },
])
const LINE = { phoneNumber: '+15045550100', name: 'Campos Muños Law' }
const CALLER = { phoneNumber: '+15045550142', name: 'NEW ORLEANS LA' }
const YOLETTY = { extensionId: '9101', extensionNumber: '101', name: 'Yoletty' }
const CIRO = { extensionId: '9102', extensionNumber: '102', name: 'Ciro' }
const IVR = { extensionId: '9001', extensionNumber: '1', name: 'Main menu' }
const QUEUE = { extensionId: '9002', extensionNumber: '2', name: 'Front desk queue' }

const t0 = Date.parse('2026-10-26T15:00:00Z')
const at = (s) => new Date(t0 + s * 1000).toISOString()
const leg = (s, to, reason, extra = {}) => ({ startTime: at(s), duration: 10, type: 'Voice', direction: 'Inbound', from: CALLER, to, reason, legType: 'Accept', ...extra })
const record = (legs, extra = {}) => ({
  id: 'r1', sessionId: 's1', telephonySessionId: 'ts1', startTime: at(0), duration: 60, type: 'Voice', direction: 'Inbound',
  from: CALLER, to: LINE, legs, ...extra,
})
const classify = (recs, directory = DIRECTORY) => classifyCall(Array.isArray(recs) ? recs : [recs], { direction: 'inbound', directory })

test('answered: a person extension accepted it, whatever the top-level result says', () => {
  const c = classify(record([
    leg(0, LINE, 'Accepted', { legType: 'PstnToSip', master: true }),
    leg(5, YOLETTY, 'Accepted'),
  ], { result: 'Missed' }))
  assert.equal(c.classification, 'answered')
  assert.deepEqual(c.answeredBy, { kind: 'extension', extensionId: '9101', extension: '101', name: 'Yoletty' })
  assert.deepEqual(c.notAnsweredBy, [])
  // RingCentral's own result is kept, separate from the conclusion.
  assert.deepEqual(c.rcResults, ['Missed'])
  assert.ok(c.facts.some((f) => f.code === 'accepted' && f.reasonMeaning === 'The call was connected to and accepted by this number'))
})

test('caller hang-up with no leg to anyone: hung up, and alerting stays unknown (never "before ringing")', () => {
  const c = classify(record([leg(0, LINE, 'Hang Up', { legType: 'PstnToSip', master: true })], { duration: 4 }))
  assert.equal(c.classification, 'caller_hung_up')
  assert.deepEqual(c.offeredTo, [])
  assert.ok(c.gaps.includes('alerting_unknown'))
  assert.ok(!JSON.stringify(c).includes('before_ringing'))
})

test('caller hang-up while it was offered to Yoletty', () => {
  const c = classify(record([
    leg(0, IVR, 'Accepted', { legType: 'PstnToSip', master: true }),
    leg(20, YOLETTY, 'Hang Up'),
  ]))
  assert.equal(c.classification, 'caller_hung_up')
  assert.deepEqual(c.offeredTo.map((o) => o.name), ['Yoletty'])
  // Accepted by the IVR is the phone system taking the call, not an answer.
  assert.ok(c.facts.some((f) => f.code === 'accepted_by_system'))
  assert.ok(!c.gaps.includes('alerting_unknown'))
  // A hang-up is not Yoletty failing to answer.
  assert.deepEqual(c.notAnsweredBy, [])
})

test('ringing timeout: her leg says No Answer; that is "not answered", not a proven timeout', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true }), leg(3, YOLETTY, 'No Answer')]))
  assert.equal(c.classification, 'not_answered')
  assert.deepEqual(c.notAnsweredBy.map((p) => [p.name, p.reason]), [['Yoletty', 'No Answer']])
})

test('several extensions in turn, the second one answers: answered, nobody charged with a miss', () => {
  const c = classify(record([
    leg(0, QUEUE, 'Accepted', { legType: 'PstnToSip', master: true }),
    leg(5, YOLETTY, 'No Answer'),
    leg(25, CIRO, 'Accepted'),
  ]))
  assert.equal(c.classification, 'answered')
  assert.equal(c.answeredBy.name, 'Ciro')
  assert.deepEqual(c.offeredTo.map((o) => [o.name, o.reason]), [['Yoletty', 'No Answer'], ['Ciro', 'Accepted']])
  assert.deepEqual(c.notAnsweredBy, [])
})

test('simultaneous ring: one answers, the other attempt is Stopped', () => {
  const c = classify(record([
    leg(0, QUEUE, 'Accepted', { legType: 'PstnToSip', master: true }),
    leg(2, YOLETTY, 'Stopped'),
    leg(2, CIRO, 'Accepted'),
  ]))
  assert.equal(c.classification, 'answered')
  assert.equal(c.answeredBy.name, 'Ciro')
  assert.deepEqual(c.notAnsweredBy, [])
})

test('Stopped alone is ambiguous (spec: answered elsewhere; RingCentral support: may be a rejection) → unknown', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true }), leg(2, YOLETTY, 'Stopped')], { result: 'Rejected' }))
  assert.equal(c.classification, 'unknown')
  assert.ok(c.facts.some((f) => f.code === 'stopped_ambiguous'))
  assert.deepEqual(c.notAnsweredBy, [])
})

test('both extensions ring at once and neither answers: not answered, both named', () => {
  const c = classify(record([
    leg(0, QUEUE, null, { legType: 'PstnToSip', master: true }),
    leg(2, YOLETTY, 'No Answer'),
    leg(2, CIRO, 'Not Answered'),
  ]))
  assert.equal(c.classification, 'not_answered')
  assert.deepEqual(c.notAnsweredBy.map((p) => p.name).sort(), ['Ciro', 'Yoletty'])
})

test('unavailable extension (an undocumented result, no reason): unknown, and not charged to her', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true }), leg(1, YOLETTY, null, { result: 'IP Phone Offline' })], { result: 'Missed' }))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.offeredTo.map((o) => o.name), ['Yoletty'])
  assert.deepEqual(c.notAnsweredBy, [])
})

test('busy extension: Line Busy is a documented not-answered attempt', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true }), leg(1, CIRO, 'Line Busy')]))
  assert.equal(c.classification, 'not_answered')
  assert.deepEqual(c.notAnsweredBy.map((p) => [p.name, p.reason]), [['Ciro', 'Line Busy']])
})

test('voicemail: a linked voicemail message; who did not answer first is still listed', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true }),
    leg(3, YOLETTY, 'No Answer'),
    leg(30, YOLETTY, 'Accepted', { legType: 'Unknown', message: { id: 'm1', type: 'VoiceMail', uri: 'https://platform.example/m1' } }),
  ]))
  // Accepted on her extension, but the attempt carries the voicemail
  // message: voicemail took it, she did not answer.
  assert.equal(c.classification, 'voicemail')
  assert.equal(c.answeredBy, null)
  assert.deepEqual(c.notAnsweredBy.map((p) => p.name), ['Yoletty'])
  // Her phone was offered it once (No Answer); her voicemail taking it is not another offer.
  assert.deepEqual(c.offeredTo.map((o) => [o.name, o.reason]), [['Yoletty', 'No Answer']])
})

test('voicemail box only: the person whose box took it is not listed as offered the call', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true }),
    leg(20, CIRO, null, { legType: 'Unknown', message: { id: 'm2', type: 'VoiceMail' } }),
  ]))
  assert.equal(c.classification, 'voicemail')
  assert.deepEqual(c.offeredTo, [])
  assert.deepEqual(c.notAnsweredBy, [])
})

test('voicemail with no person accepting: classified voicemail', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true }),
    leg(3, YOLETTY, 'No Answer'),
    leg(30, YOLETTY, null, { legType: 'Unknown', message: { id: 'm1', type: 'VoiceMail' } }),
  ], { result: 'Voicemail' }))
  assert.equal(c.classification, 'voicemail')
  assert.deepEqual(c.notAnsweredBy.map((p) => p.name), ['Yoletty'])
})

test('"Voicemail" as a result with no linked message is not proof of voicemail', () => {
  const c = classify(record([], { result: 'Voicemail' }))
  assert.equal(c.classification, 'unknown')
  assert.ok(c.gaps.includes('no_legs') && c.gaps.includes('no_reason'))
})

test('incomplete record: result Missed, no legs, no reason → unknown, never missed', () => {
  const c = classify(record([], { result: 'Missed', duration: 0 }))
  assert.equal(c.classification, 'unknown')
  assert.ok(!UNANSWERED_CLASSES.includes(c.classification))
})

test('short duration proves nothing', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true, duration: 1 })], { result: 'Abandoned', duration: 1 }))
  assert.equal(c.classification, 'unknown')
})

test('an extension the directory cannot place accepted it: unknown, it may have been a person', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true }), leg(3, { extensionId: '9999', extensionNumber: '7', name: 'CML' }, 'Accepted')]))
  assert.equal(c.classification, 'unknown')
  assert.ok(c.gaps.includes('extension_type_unknown'))
})

test('directory unavailable: an accepted extension cannot be confirmed as a person', () => {
  const c = classify(record([leg(0, LINE, null, { legType: 'PstnToSip', master: true }), leg(3, YOLETTY, 'Accepted')]), dir([], false))
  assert.equal(c.classification, 'unknown')
  assert.ok(c.gaps.includes('directory_unavailable'))
  // ...and a No Answer on it is not pinned on anyone either.
  const d = classify(record([leg(0, LINE, null, { master: true }), leg(3, YOLETTY, 'No Answer')]), dir([], false))
  assert.equal(d.classification, 'unknown')
  assert.deepEqual(d.notAnsweredBy, [])
})

test('a queue alone not answering is not an employee miss', () => {
  const c = classify(record([leg(0, QUEUE, 'No Answer', { legType: 'PstnToSip', master: true })]))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
})

test('forwarded to a phone outside the firm that accepted: answered there, only the last 4 digits kept', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true }),
    leg(3, YOLETTY, 'No Answer'),
    leg(25, { phoneNumber: '+15045559876' }, 'Accepted', { legType: 'FindMe', extension: { id: '9101' } }),
  ]))
  assert.equal(c.classification, 'answered')
  assert.deepEqual(c.answeredBy, { kind: 'external', numberEnd: '9876', onBehalfOfId: '9101', onBehalfOf: 'Yoletty' })
  assert.ok(!JSON.stringify(c).includes('5559876'))
})

test('the dialled line accepting is the system taking the call, not an answer', () => {
  const c = classify(record([leg(0, LINE, 'Accepted', { legType: 'PstnToSip', master: true })]))
  assert.equal(c.classification, 'unknown')
})

test('blocked number with nobody offered: handled by the phone system', () => {
  const c = classify(record([], { reason: 'Number Blocked', result: 'Blocked' }))
  assert.equal(c.classification, 'system')
  assert.ok(!UNANSWERED_CLASSES.includes('system'))
})

test('two records of the same call: legs are read together and repeats kept once', () => {
  const legs = [leg(0, QUEUE, null, { legType: 'PstnToSip', master: true }), leg(2, YOLETTY, 'No Answer')]
  const c = classify([record(legs, { id: 'r1' }), record([...legs, leg(2, CIRO, 'Accepted')], { id: 'r2' })])
  assert.equal(c.recordCount, 2)
  assert.equal(c.classification, 'answered')
  assert.equal(c.steps.filter((s) => s.level === 'leg' && s.to.name === 'Yoletty').length, 1)
})

test('outgoing calls are not classified', () => {
  assert.equal(classifyCall([record([], { direction: 'Outbound' })], { direction: 'outbound', directory: DIRECTORY }).classification, null)
})

test('stored record keeps every field but links, recordings and billing', () => {
  const raw = sanitizeRecord(record([leg(0, YOLETTY, 'Accepted', { reasonDescription: 'Picked up', message: { id: 'm', type: 'VoiceMail', uri: 'https://x/m' } })], {
    recording: { id: 'rec', contentUri: 'https://x/rec' }, billing: { costIncluded: 1 }, uri: 'https://x/r1',
    extension: { id: 9101, uri: 'https://x/ext' }, delegate: { id: 'd1', name: 'Front desk' },
  }))
  assert.equal(raw.recording, undefined)
  assert.equal(raw.billing, undefined)
  assert.equal(raw.uri, undefined)
  assert.deepEqual(raw.extension, { id: 9101 })
  assert.deepEqual(raw.delegate, { id: 'd1', name: 'Front desk' })
  assert.deepEqual(raw.legs[0].message, { type: 'VoiceMail' })
  assert.equal(raw.legs[0].reasonDescription, 'Picked up')
})

test('a desk phone that was offline is not an offer: only the app that rang counts', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true }),
    leg(4, CIRO, 'No Digital Line', { legType: 'PstnToSip', result: 'IP Phone Offline' }),
    leg(4, YOLETTY, 'No Answer', { legType: 'PstnToSip' }),
  ]))
  assert.equal(c.classification, 'not_answered')
  assert.deepEqual(c.offeredTo.map((o) => o.name), ['Yoletty'])
  assert.deepEqual(c.notAnsweredBy.map((p) => p.name), ['Yoletty'])
})

test('a queue-only record (the call never reached anyone) is never charged to a person', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true, result: 'Missed', duration: 181 }),
    leg(0, QUEUE, null, { legType: 'PstnToSip', result: 'Missed', duration: 181 }),
  ], { result: 'Missed', duration: 181 }))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.offeredTo, [])
  assert.deepEqual(c.notAnsweredBy, [])
})
