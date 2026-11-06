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

test('forwarded to a phone outside the firm: only its last 4 digits are kept', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'PstnToSip', master: true }),
    leg(3, YOLETTY, 'No Answer'),
    leg(25, { phoneNumber: '+15045559876' }, 'Not Answered', { legType: 'FindMe', extension: { id: '9101' } }),
  ]))
  assert.equal(c.classification, 'not_answered')
  assert.equal(c.steps.find((s) => s.legType === 'FindMe').to.numberEnd, '9876')
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

// --- cases found in review: each must stay unknown, or not charge anyone ---

test('an unplaced extension accepted it: nobody is charged with a miss', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), leg(2, YOLETTY, 'No Answer'), leg(9, { extensionId: '77', extensionNumber: '7' }, 'Accepted')]))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
})

test('No Answer beside a Stopped attempt ("answered by another phone") is not "not answered"', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), leg(2, YOLETTY, 'No Answer'), leg(2, CIRO, 'Stopped')]))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
})

test('a queue accepted it and her leg says No Answer: someone may have answered through the queue', () => {
  const c = classify(record([leg(0, QUEUE, 'Accepted', { master: true }), leg(3, YOLETTY, 'No Answer')]))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
})

test('a hang-up with a Stopped attempt contradicts itself: unknown', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), leg(2, YOLETTY, 'Stopped'), leg(9, CIRO, 'Hang Up')]))
  assert.equal(c.classification, 'unknown')
})

test('a leg naming only an extension number is not pinned on whoever has that number now', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), leg(3, { extensionNumber: '101', name: 'Old queue' }, 'No Answer')]))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
  const d = classify(record([leg(0, LINE, null, { master: true }), leg(3, { extensionId: '555', extensionNumber: '102', name: 'Old queue' }, 'Accepted')]))
  assert.equal(d.classification, 'unknown', 'a deleted extension whose number was reused')
})

test('accepted at a forwarded phone is not confirmed as an answer (its own voicemail could accept)', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), leg(25, { phoneNumber: '+15045559876' }, 'Accepted', { legType: 'FindMe', extension: { id: '9101' } })]))
  assert.equal(c.classification, 'unknown')
  assert.ok(c.facts.some((f) => f.code === 'accepted_by_forwarded_phone'))
  assert.equal(c.answeredBy, null)
})

test('a leg back to the caller’s own number never carries the whole number', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), leg(5, { phoneNumber: CALLER.phoneNumber }, 'No Answer')]))
  const s = c.steps.find((x) => x.level === 'leg' && x.to.kind !== 'line')
  assert.equal(s.to.kind, 'caller')
  assert.ok(!JSON.stringify(c).includes('5045550142'))
})

// The shape RingCentral sends on this account: an employee's leg names only
// the extension number in \`to\`, and carries the extension's id in the leg's
// own \`extension\` ("on whose behalf"). Synthetic numbers.
const realLeg = (s, ext, id, result, reason) => leg(s, { phoneNumber: LINE.phoneNumber, extensionNumber: ext, location: 'New Orleans, LA' }, reason,
  { legType: 'PstnToSip', result, extension: { id: Number(id) } })

test('real shape: the leg’s own extension id identifies the person', () => {
  const c = classify(record([
    leg(0, LINE, 'Accepted', { legType: 'Accept', master: true, result: 'Accepted' }),
    leg(0, QUEUE, 'Accepted', { legType: 'Accept', result: 'Accepted' }),
    realLeg(4, '101', '9101', 'Stopped', undefined),
    realLeg(4, '101', '9101', 'Call connected', 'Accepted'),
    realLeg(4, '102', '9102', 'Stopped', undefined),
    realLeg(4, '102', '9102', 'IP Phone Offline', 'No Digital Line'),
  ], { result: 'Accepted', reason: 'Accepted' }))
  assert.equal(c.classification, 'answered')
  assert.deepEqual(c.answeredBy, { kind: 'extension', extensionId: '9101', extension: '101', name: 'Yoletty' })
  assert.deepEqual(c.offeredTo.map((o) => [o.name, o.reason]), [['Yoletty', 'Accepted'], ['Ciro', undefined]].map(([n, r]) => [n, r ?? null]))
  assert.deepEqual(c.notAnsweredBy, [])
})

test('real shape: an id whose directory number disagrees with the leg is not trusted', () => {
  const c = classify(record([leg(0, LINE, null, { master: true }), realLeg(4, '101', '9102', 'Call connected', 'Accepted')]))
  assert.equal(c.classification, 'unknown')
})

test('real shape: a queue-only call RingCentral logs as Missed with no reason stays unknown and charges nobody', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'Accept', master: true, result: 'Missed' }),
    leg(0, QUEUE, null, { legType: 'Accept', result: 'Missed' }),
  ], { result: 'Missed', duration: 3 }))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
})

// What a not-confirmed call did reach, stated as a fact about the record,
// never as a classification.
import { systemOnlyPlaces } from './callEvidence.js'

test('a call that reached only the phone system lists those places', () => {
  const c = classify(record([
    leg(0, LINE, null, { legType: 'Accept', master: true, result: 'Missed' }),
    leg(0, { extensionId: '9005', extensionNumber: '5', name: 'Office voicemail' }, null, { legType: 'Accept', result: 'Missed' }),
  ], { result: 'Missed' }), dir([...DIRECTORY.byId.values(), { id: '9005', number: '5', name: 'Office voicemail', type: 'Voicemail' }]))
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(systemOnlyPlaces(c), ['the main line', 'the voicemail box'])
})

test('a queue counts as the phone system; a person or an unplaced extension does not', () => {
  const q = classify(record([leg(0, LINE, null, { master: true }), leg(0, QUEUE, null, { result: 'Missed' })], { result: 'Missed' }))
  assert.deepEqual(systemOnlyPlaces(q), ['the main line', 'the Front desk queue call queue'])
  const p = classify(record([leg(0, LINE, null, { master: true }), leg(2, YOLETTY, null, { result: 'Missed' })], { result: 'Missed' }))
  assert.equal(systemOnlyPlaces(p), null)
  const u = classify(record([leg(0, LINE, null, { master: true }), leg(2, { extensionId: '77', extensionNumber: '7' }, null)], { result: 'Missed' }))
  assert.equal(systemOnlyPlaces(u), null, 'an extension the directory cannot place may be a person')
})

test('only for not-confirmed calls with steps', () => {
  const a = classify(record([leg(0, LINE, null, { master: true }), leg(2, YOLETTY, 'Accepted')]))
  assert.equal(systemOnlyPlaces(a), null)
  assert.equal(systemOnlyPlaces(null), null)
})

// --- live call events (Account Telephony Sessions) --------------------------------

const ev = (seq, sec, party, code, extra = {}) => ({
  id: party.id, extensionId: party.extensionId ?? null, direction: party.direction ?? 'Inbound', sequence: seq, at: at(sec),
  status: { code, reason: extra.reason ?? null }, missedCall: extra.missedCall ?? null, to: party.to ?? null,
})
const P = {
  company: { id: 'p-co', extensionId: null, direction: 'Outbound' },
  vm: { id: 'p-vm', extensionId: '9005', direction: 'Inbound' },
  queue: { id: 'p-q', extensionId: '9002', direction: 'Inbound' },
  yoletty: { id: 'p-y', extensionId: '9101', direction: 'Inbound' },
  ciro: { id: 'p-c', extensionId: '9102', direction: 'Inbound' },
}
const DIR5 = dir([...DIRECTORY.byId.values(), { id: '9005', number: '5', name: 'Office voicemail', type: 'Voicemail' }])
const withLive = (recs, events, directory = DIR5) => classifyCall(Array.isArray(recs) ? recs : [recs], { direction: 'inbound', directory, events })
const greetingOnly = record([
  leg(0, LINE, null, { legType: 'Accept', master: true, result: 'Missed' }),
  leg(0, { extensionId: '9005', extensionNumber: '5', name: 'Office voicemail' }, null, { legType: 'Accept', result: 'Missed' }),
], { result: 'Missed', duration: 6 })

test('live: the closed-office greeting, then the caller left: ended before anyone was rung', () => {
  const c = withLive(greetingOnly, [
    ev(1, 0, P.company, 'Setup'), ev(2, 0, P.company, 'Answered'),
    ev(3, 1, P.vm, 'Setup'), ev(4, 1, P.vm, 'VoiceMail'),
    ev(5, 6, P.vm, 'Disconnected'), ev(6, 6, P.company, 'Disconnected'),
  ])
  assert.equal(c.classification, 'ended_before_ringing')
  assert.deepEqual(c.notAnsweredBy, [])
  assert.ok(c.facts.some((f) => f.code === 'ended_before_ringing'))
  assert.equal(c.live.complete, true)
})

test('live: not seen to the end proves nothing about ringing', () => {
  const c = withLive(greetingOnly, [ev(1, 0, P.company, 'Setup'), ev(2, 1, P.vm, 'VoiceMail')])
  assert.equal(c.classification, 'unknown')
})

test('live: events out of order are read by sequence', () => {
  const events = [ev(6, 6, P.company, 'Disconnected'), ev(5, 6, P.vm, 'Disconnected'), ev(1, 0, P.company, 'Setup'), ev(4, 1, P.vm, 'VoiceMail')]
  const c = withLive(greetingOnly, events)
  assert.equal(c.classification, 'ended_before_ringing')
  // The timeline shown in Calls is in RingCentral's order, not arrival order.
  assert.deepEqual(c.live.parties.find((p) => p.partyId === 'p-co').states.map((x) => x.code), ['Setup', 'Disconnected'])
  assert.deepEqual(c.live.parties.find((p) => p.partyId === 'p-vm').states.map((x) => x.code), ['VoiceMail', 'Disconnected'])
})

test('live: caller hung up while Yoletty’s phone rang: hung up, stage while ringing, not charged to her', () => {
  const c = withLive(record([leg(0, LINE, null, { master: true }), leg(0, QUEUE, null, { result: 'Missed' })], { reason: 'Hang Up', result: 'Missed' }), [
    ev(1, 0, P.queue, 'Setup'), ev(2, 4, P.yoletty, 'Proceeding'),
    ev(3, 22, P.yoletty, 'Disconnected', { missedCall: true }), ev(4, 22, P.queue, 'Disconnected'),
  ])
  assert.equal(c.classification, 'caller_hung_up')
  assert.equal(c.stage, 'while_ringing')
  assert.deepEqual(c.offeredTo.map((o) => o.name), ['Yoletty'])
  assert.deepEqual(c.notAnsweredBy, [])
  assert.equal(c.live.parties.find((p) => p.extensionId === '9101').rang.seconds, 18)
})

test('live: caller hung up and no phone was ever rung: stage before ringing', () => {
  const c = withLive(record([leg(0, LINE, null, { master: true }), leg(0, QUEUE, null, { result: 'Missed' })], { reason: 'Hang Up', result: 'Missed', duration: 3 }), [
    ev(1, 0, P.queue, 'Setup'), ev(2, 3, P.queue, 'Disconnected'),
  ])
  assert.equal(c.classification, 'caller_hung_up')
  assert.equal(c.stage, 'before_ringing')
  assert.ok(!c.gaps.includes('alerting_unknown'))
})

test('live: RingCentral’s missedCall flag alone never charges anyone', () => {
  const c = withLive(record([leg(0, LINE, null, { master: true }), leg(0, QUEUE, null, { result: 'Missed' })], { result: 'Missed' }), [
    ev(1, 0, P.queue, 'Setup'), ev(2, 4, P.yoletty, 'Proceeding'),
    ev(3, 9, P.yoletty, 'Disconnected', { missedCall: true }), ev(4, 9, P.queue, 'Disconnected'),
  ])
  assert.equal(c.classification, 'unknown')
  assert.deepEqual(c.notAnsweredBy, [])
  assert.deepEqual(c.offeredTo.map((o) => o.name), ['Yoletty'], 'her phone was offered it: that much is shown')
})

test('live: answered on her phone (media established) is an answer, even when the call log says Missed', () => {
  const c = withLive(record([leg(0, LINE, null, { master: true })], { result: 'Missed' }), [
    ev(1, 0, P.queue, 'Setup'), ev(2, 3, P.yoletty, 'Proceeding'), ev(3, 7, P.yoletty, 'Answered'),
    ev(4, 90, P.yoletty, 'Disconnected'), ev(5, 90, P.queue, 'Disconnected'),
  ])
  assert.equal(c.classification, 'answered')
  assert.equal(c.answeredBy.name, 'Yoletty')
})

test('live: "Answered" on the calling side only means the firm was reached, not a person', () => {
  const c = withLive(greetingOnly, [ev(1, 0, { ...P.yoletty, direction: 'Outbound' }, 'Answered'), ev(2, 5, { ...P.yoletty, direction: 'Outbound' }, 'Disconnected')])
  assert.notEqual(c.classification, 'answered')
})

test('live: a queue accepted it and her leg says No Answer; seen to the end with nobody answering → not answered', () => {
  const c = withLive(record([leg(0, QUEUE, 'Accepted', { master: true }), leg(3, YOLETTY, 'No Answer')]), [
    ev(1, 0, P.queue, 'Setup'), ev(2, 3, P.yoletty, 'Proceeding'), ev(3, 23, P.yoletty, 'Disconnected', { missedCall: true }),
    ev(4, 40, P.queue, 'Disconnected'),
  ])
  assert.equal(c.classification, 'not_answered')
  assert.deepEqual(c.notAnsweredBy.map((p) => [p.name, p.reason]), [['Yoletty', 'No Answer']], 'charged from her leg’s documented reason, not the flag')
})

test('live: a Stopped attempt with nobody answering live no longer blocks a documented hang-up', () => {
  const c = withLive(record([leg(0, LINE, null, { master: true }), leg(2, YOLETTY, 'Stopped')], { reason: 'Hang Up' }), [
    ev(1, 0, P.queue, 'Setup'), ev(2, 2, P.yoletty, 'Proceeding'), ev(3, 8, P.yoletty, 'Disconnected'), ev(4, 8, P.queue, 'Disconnected'),
  ])
  assert.equal(c.classification, 'caller_hung_up')
  assert.equal(c.stage, 'while_ringing')
})

// One vocabulary: the database's allowed values are exactly the classifier's.
import { CLASSIFICATIONS } from './callEvidence.js'
import { INTEGRATIONS_SCHEMA_SQL } from '../../db/integrationsSchema.js'

test('the rc_calls classification CHECK lists exactly the classifier’s classifications', () => {
  const m = /rc_calls_classification_check\s+CHECK \(classification IN \(([^)]*)\)\)/.exec(INTEGRATIONS_SCHEMA_SQL)
  assert.ok(m, 'CHECK found')
  const allowed = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).sort()
  assert.deepEqual(allowed, [...CLASSIFICATIONS].sort())
})
