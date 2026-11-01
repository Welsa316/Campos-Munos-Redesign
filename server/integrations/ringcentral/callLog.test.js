// Reading RingCentral call log records, without a database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyOutcome, isGenericCallerId, normalizeRecord } from './callLog.js'

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
