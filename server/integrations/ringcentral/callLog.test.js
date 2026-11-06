// Reading RingCentral call log records, without a database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyOutcome, isGenericCallerId, normalizeRecord, groupEpisodes, followUpDecision, unansweredInbound } from './callLog.js'

test('outcomes: answered, missed, voicemail; outgoing connected or not', () => {
  assert.equal(classifyOutcome('inbound', 'Accepted'), 'answered')
  assert.equal(classifyOutcome('inbound', 'Call connected'), 'answered')
  for (const r of ['Missed', 'No Answer', 'Rejected', 'Hang Up', 'Abandoned', 'Busy']) assert.equal(classifyOutcome('inbound', r), 'missed', r)
  assert.equal(classifyOutcome('inbound', 'Voicemail'), 'voicemail')
  assert.equal(classifyOutcome('inbound', 'Blocked'), 'other')
  assert.equal(classifyOutcome('outbound', 'Call connected'), 'connected')
  assert.equal(classifyOutcome('outbound', 'No Answer'), 'no_answer')
  assert.equal(classifyOutcome('outbound', 'Wrong Number'), 'other')
})

test('generic caller ID is not mistaken for a name', () => {
  for (const s of ['WIRELESS CALLER', 'NEW ORLEANS LA', 'METAIRIE LA', 'Unknown', '+15045550101', '', null, 'PRIVATE NUMBER', 'Anonymous']) {
    assert.ok(isGenericCallerId(s), String(s))
  }
  for (const s of ['MARIA LOPEZ', 'Juan Perez', 'GARCIA JOSE']) assert.ok(!isGenericCallerId(s), s)
})

const inbound = {
  id: 'rec-1', sessionId: 's1', telephonySessionId: 'ts1', startTime: '2026-10-30T15:04:05.000Z', duration: 252,
  type: 'Voice', direction: 'Inbound', action: 'Phone Call', result: 'Accepted', lastModifiedTime: '2026-10-30T15:09:00.000Z',
  from: { phoneNumber: '+15045550101', name: 'MARIA LOPEZ', location: 'New Orleans, LA' },
  to: { phoneNumber: '+15049106508', name: 'Campos Muños Law' },
  legs: [
    { result: 'Accepted', legType: 'Accept', to: { name: 'Front desk queue', extensionNumber: '200' } },
    { result: 'Accepted', legType: 'Transfer', to: { name: 'Yoletty', extensionNumber: '101' } },
  ],
  recording: { id: 'r', uri: 'https://example.invalid/recording' },
}

test('an inbound answered call: caller, line, who answered after the transfer; nothing extra kept', () => {
  const r = normalizeRecord(inbound, 'account')
  assert.equal(r.direction, 'inbound')
  assert.equal(r.outcome, 'answered')
  assert.equal(r.counterpart_number, '+15045550101')
  assert.equal(r.caller_id_name, 'MARIA LOPEZ')
  assert.equal(r.firm_number, '+15049106508')
  assert.equal(r.answered_by_name, 'Yoletty')
  assert.equal(r.answered_by_extension, '101')
  assert.equal(r.duration_seconds, 252)
  assert.equal(r.is_internal, false)
  assert.ok(!JSON.stringify(r).includes('recording'), 'no recording reference stored')
})

test('outbound, internal, fax and malformed records', () => {
  const out = normalizeRecord({ ...inbound, id: 'o', direction: 'Outbound', result: 'Call connected', from: { name: 'Yoletty', extensionNumber: '101', phoneNumber: '+15049106508' }, to: { phoneNumber: '+15045550101' } }, 'account')
  assert.equal(out.outcome, 'connected')
  assert.equal(out.counterpart_number, '+15045550101')
  assert.equal(out.firm_extension, '101')
  assert.equal(out.answered_by_name, null)
  const internal = normalizeRecord({ ...inbound, id: 'i', from: { extensionNumber: '102', name: 'Paula' }, legs: [] }, 'account')
  assert.equal(internal.is_internal, true)
  assert.equal(normalizeRecord({ ...inbound, type: 'Fax' }, 'account'), null)
  assert.equal(normalizeRecord({ ...inbound, startTime: 'nope' }, 'account'), null)
  assert.equal(normalizeRecord({ ...inbound, direction: 'Sideways' }, 'account'), null)
  assert.equal(normalizeRecord({ ...inbound, id: undefined }, 'account'), null)
  const anon = normalizeRecord({ ...inbound, id: 'a', result: 'Missed', from: { name: 'Anonymous' }, legs: [] }, 'account')
  assert.equal(anon.counterpart_number, null)
  assert.equal(anon.is_internal, false, 'a withheld number is still an outside call')
})

test('exclusion reasons agree across the API, the database and the portal', async () => {
  const { EXCLUSION_REASONS } = await import('./callExclusions.js')
  const { INTEGRATIONS_SCHEMA_SQL } = await import('../../db/integrationsSchema.js')
  const portal = (await import('../../../admin/src/modules/calls/exclusionReasons.js')).EXCLUSION_REASONS.map((r) => r.key)
  assert.deepEqual(portal, [...EXCLUSION_REASONS])
  const checks = [...INTEGRATIONS_SCHEMA_SQL.matchAll(/reason IN \(([^)]*)\)/g)].map((m) => m[1].match(/'([^']+)'/g).map((q) => q.slice(1, -1)))
  assert.equal(checks.length, 2, 'rc_call_exclusions and rc_ignored_numbers')
  for (const c of checks) assert.deepEqual(c, [...EXCLUSION_REASONS])
})

// --- callback episodes and the follow-up decision ----------------------------------

const openRow = (over) => ({
  id: 1, direction: 'inbound', is_internal: false, is_primary: true, classification: 'not_answered', counterpart_key: '5045550101',
  counterpart_number: '+15045550101', started_at: '2026-11-03T15:00:00Z', needs_attention: true, episode_after: null, episode_tries: 0,
  classification_evidence: { offeredTo: [{ kind: 'extension', extensionId: '9102', name: 'Ciro' }] }, ...over,
})
const NOON = new Date('2026-11-04T18:00:00Z')

test('episodes: open calls from one number group, oldest first, named by the first call', () => {
  const eps = groupEpisodes([
    openRow({ id: 3, started_at: '2026-11-04T15:00:00Z' }),
    openRow({ id: 1, started_at: '2026-11-02T15:15:00Z', episode_tries: 2, attempt_at: '2026-11-04T16:00:00Z' }),
    openRow({ id: 2, started_at: '2026-11-03T16:05:00Z' }),
  ], { now: NOON })
  assert.equal(eps.length, 1)
  assert.deepEqual(eps[0].callIds, [1, 2, 3])
  assert.equal(eps[0].id, 1)
  assert.equal(eps[0].latestCallId, 3)
  assert.equal(eps[0].attempts, 3)
  assert.equal(eps[0].callbackAttempts, 2, 'counted from the first call')
  assert.equal(eps[0].attentionGroup, 'waiting')
  assert.deepEqual(eps[0].offeredTo.map((p) => p.name), ['Ciro'])
})

test('episodes: something that closed the earlier calls splits them; withheld numbers never group', () => {
  const eps = groupEpisodes([
    openRow({ id: 1 }),
    openRow({ id: 2, started_at: '2026-11-04T15:00:00Z', episode_after: '2026-11-03T20:00:00Z' }),
    openRow({ id: 3, counterpart_key: '', counterpart_number: null }),
    openRow({ id: 4, counterpart_key: '', counterpart_number: null }),
  ], { now: NOON })
  assert.deepEqual(eps.map((e) => e.callIds), [[1], [2], [3], [4]])
  assert.equal(eps[1].attentionGroup, 'new')
  // Today's first call, with a callback tried since: try again.
  assert.equal(groupEpisodes([openRow({ started_at: '2026-11-04T15:00:00Z', episode_tries: 1, attempt_at: '2026-11-04T16:30:00Z' })], { now: NOON })[0].attentionGroup, 'try_again')
  assert.equal(groupEpisodes([openRow({})], { kind: 'review', now: NOON })[0].attentionGroup, null)
})

test('follow-up decision: kept apart from the classification', () => {
  const d = (over) => followUpDecision(openRow(over))
  assert.equal(d({}), 'confirmed_unanswered')
  for (const c of ['caller_hung_up', 'ended_before_ringing', 'voicemail']) assert.equal(d({ classification: c }), 'confirmed_unanswered', c)
  assert.equal(d({ classification: 'answered' }), 'confirmed_answered')
  assert.equal(d({ classification: 'unknown' }), 'review')
  assert.equal(d({ classification: 'unknown', connected_followup_at: '2026-11-04T16:00:00Z' }), 'resolved')
  assert.equal(d({ handled_at: '2026-11-04T16:00:00Z' }), 'resolved')
  assert.equal(d({ excluded_kind: 'call' }), 'resolved')
  assert.equal(d({ connected_followup_at: '2026-11-04T16:00:00Z' }), 'resolved')
  // Nothing to do: withheld, phone system, not classified, outgoing, internal, a duplicate record.
  assert.equal(d({ counterpart_key: '' }), 'not_actionable')
  assert.equal(d({ classification: 'unknown', counterpart_key: '' }), 'not_actionable')
  assert.equal(d({ classification: 'system' }), 'not_actionable')
  assert.equal(d({ classification: null }), 'not_actionable')
  assert.equal(d({ direction: 'outbound', classification: null }), 'not_actionable')
  assert.equal(d({ is_internal: true }), 'not_actionable')
  assert.equal(d({ is_primary: false }), 'not_actionable')
})

test('what staff may mark (handled, no callback needed, cleared) is what the lists can show', () => {
  const ok = (over) => unansweredInbound({ direction: 'inbound', is_internal: false, classification: 'not_answered', outcome: 'missed', ...over })
  // Every class Needs attention or the review group lists.
  for (const c of ['not_answered', 'caller_hung_up', 'ended_before_ringing', 'voicemail', 'unknown']) assert.equal(ok({ classification: c }), true, c)
  // A blocked number or network error, and answered calls, are never listed.
  assert.equal(ok({ classification: 'system' }), false)
  assert.equal(ok({ classification: 'answered' }), false)
  assert.equal(ok({ direction: 'outbound' }), false)
  assert.equal(ok({ is_internal: true }), false)
  // Not classified yet: RingCentral's own result decides.
  assert.equal(ok({ classification: null, outcome: 'voicemail' }), true)
  assert.equal(ok({ classification: null, outcome: 'answered' }), false)
  // Consistent with the follow-up rule: whatever it treats as open can be marked.
  for (const c of ['not_answered', 'caller_hung_up', 'ended_before_ringing', 'voicemail', 'unknown', 'system', 'answered']) {
    const open = ['confirmed_unanswered', 'review'].includes(followUpDecision(openRow({ classification: c })))
    assert.equal(ok({ classification: c }), open, c)
  }
})
