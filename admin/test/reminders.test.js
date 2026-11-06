// Callback reminders in the portal: the due-time choices in New Orleans time
// (the same dates as server/reminders.test.js, so the time shown before
// saving is the time the server saves), how a reminder reads, and which
// ones belong to a caller or are announced.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueChoices, nextBusinessMorning, formatDue, toInputs, fromInputs, dueProblem, dueLine, dueState } from '../src/modules/reminders/dueChoices.js'
import { deliveryNote, remindersForEpisode, dueToAnnounce, announceKey } from '../src/modules/reminders/reminderText.js'

const at = (iso) => new Date(iso).getTime()

test('tomorrow morning is 9:00 AM New Orleans time on the next business day, across daylight-saving changes', () => {
  const cases = [
    ['2026-11-04T18:00:00Z', '2026-11-05T15:00:00.000Z'], // Wed → Thu (CST)
    ['2026-10-29T17:00:00Z', '2026-10-30T14:00:00.000Z'], // Thu → Fri (CDT)
    ['2026-10-30T17:00:00Z', '2026-11-02T15:00:00.000Z'], // Fri CDT → Mon CST, over the Nov 1 fall-back
    ['2026-10-31T20:00:00Z', '2026-11-02T15:00:00.000Z'], // Saturday → Monday
    ['2026-03-06T18:00:00Z', '2026-03-09T14:00:00.000Z'], // Fri CST → Mon CDT, over the Mar 8 spring-forward
    ['2026-03-07T23:30:00Z', '2026-03-09T14:00:00.000Z'],
    ['2026-11-06T05:30:00Z', '2026-11-06T15:00:00.000Z'], // 11:30 PM Thursday local
    ['2026-11-04T12:00:00Z', '2026-11-05T15:00:00.000Z'], // 6 AM Wednesday: still Thursday
  ]
  for (const [now, want] of cases) {
    const got = nextBusinessMorning(at(now))
    assert.equal(got.toISOString(), want, `from ${now}`)
    assert.equal(toInputs(got).time, '09:00')
  }
})

test('the quick choices say which morning, and each has its exact time', () => {
  const wed = dueChoices(at('2026-11-04T18:00:00Z'))
  assert.deepEqual(wed.map((c) => c.label), ['In 30 minutes', 'In 1 hour', 'Tomorrow morning'])
  assert.equal(wed[0].at.toISOString(), '2026-11-04T18:30:00.000Z')
  assert.equal(wed[1].at.toISOString(), '2026-11-04T19:00:00.000Z')
  assert.equal(dueChoices(at('2026-11-06T18:00:00Z'))[2].label, 'Monday morning', 'on a Friday')
  assert.equal(dueChoices(at('2026-11-07T18:00:00Z'))[2].label, 'Monday morning', 'on a Saturday')
  assert.equal(dueChoices(at('2026-11-08T18:00:00Z'))[2].label, 'Tomorrow morning', 'on a Sunday')
})

test('times read in New Orleans time, whatever the browser zone', () => {
  assert.equal(formatDue('2026-11-07T15:00:00Z'), 'Sat, Nov 7, 9:00 AM')
  assert.equal(formatDue('2026-11-06T15:00:00Z'), 'Fri, Nov 6, 9:00 AM')
  assert.equal(formatDue('2026-07-01T14:30:00Z'), 'Wed, Jul 1, 9:30 AM')
})

test('a picked date and time means that wall-clock time in New Orleans; a time that does not exist is refused', () => {
  assert.equal(fromInputs('2026-11-02', '09:00').toISOString(), '2026-11-02T15:00:00.000Z') // CST
  assert.equal(fromInputs('2026-10-30', '09:00').toISOString(), '2026-10-30T14:00:00.000Z') // CDT
  assert.equal(fromInputs('2026-03-09', '09:00').toISOString(), '2026-03-09T14:00:00.000Z')
  assert.equal(fromInputs('2026-03-08', '02:30'), null, 'skipped by the spring-forward')
  // Just after the change, on the day itself (needs the second offset check).
  assert.equal(fromInputs('2026-03-08', '03:30').toISOString(), '2026-03-08T08:30:00.000Z')
  assert.equal(fromInputs('2026-11-02', ''), null)
  assert.deepEqual(toInputs('2026-11-02T15:05:00Z'), { date: '2026-11-02', time: '09:05' })
  const now = at('2026-11-04T18:00:00Z')
  assert.equal(dueProblem(null, now), 'Choose a date and time.')
  assert.match(dueProblem(new Date(now - 5 * 60e3), now), /passed/)
  assert.equal(dueProblem(new Date(now - 30e3), now), '', 'a few seconds behind is fine')
  assert.match(dueProblem(new Date(now + 400 * 864e5), now), /year/)
  assert.equal(dueProblem(new Date(now + 864e5), now), '')
})

test('a reminder reads as its time, then due, then overdue', () => {
  const now = at('2026-11-06T16:00:00Z') // Fri 10:00 AM
  assert.equal(dueLine({ status: 'open', dueAt: '2026-11-09T15:00:00Z' }, now), 'Mon, Nov 9, 9:00 AM')
  assert.equal(dueState({ status: 'open', dueAt: '2026-11-09T15:00:00Z' }, now), 'upcoming')
  assert.equal(dueLine({ status: 'due', dueAt: '2026-11-06T15:58:00Z' }, now), 'Due now')
  assert.equal(dueState({ status: 'due', dueAt: '2026-11-06T15:58:00Z' }, now), 'due')
  assert.equal(dueLine({ status: 'due', dueAt: '2026-11-06T15:00:00Z' }, now), 'Overdue since 9:00 AM')
  assert.equal(dueState({ status: 'due', dueAt: '2026-11-06T15:00:00Z' }, now), 'overdue')
  assert.equal(dueLine({ status: 'due', dueAt: '2026-11-05T15:00:00Z' }, now), 'Overdue since Thu, Nov 5, 9:00 AM')
  // Past its time but not yet picked up by the server: already due.
  assert.equal(dueState({ status: 'open', dueAt: '2026-11-06T15:59:00Z' }, now), 'due')
})

test('what happened to the email and the notification', () => {
  const t = () => '9:01 AM'
  assert.equal(deliveryNote({}, t), '')
  assert.equal(deliveryNote({ delivery: { email: { status: 'sent', at: 'x' }, push: { status: 'sent' } } }, t), 'Emailed 9:01 AM and sent as a notification.')
  assert.equal(deliveryNote({ delivery: { email: { status: 'pending', nextAttemptAt: 'x' }, push: { status: 'no_devices' } } }, t), 'The email did not go through yet; trying again at 9:01 AM.')
  assert.equal(deliveryNote({ delivery: { email: { status: 'failed' }, push: { status: 'sent' } } }, t), 'The email could not be sent. A notification was sent.')
  assert.match(deliveryNote({ delivery: { email: { status: 'skipped_disabled' } } }, t), /disabled/)
  assert.match(deliveryNote({ delivery: { email: { status: 'skipped_no_email' } } }, t), /no valid email/)
})

test('a reminder belongs to a caller by any call of their episode', () => {
  const rs = [{ id: 1, target: { kind: 'call', id: 10 } }, { id: 2, target: { kind: 'call', id: 30 } }, { id: 3, target: { kind: 'submission', id: 10 } }]
  assert.deepEqual(remindersForEpisode(rs, { id: 10, callIds: [10, 11] }).map((r) => r.id), [1])
  // Set on a later call of the same episode (from that call's card): still theirs.
  assert.deepEqual(remindersForEpisode([...rs, { id: 4, target: { kind: 'call', id: 11 } }], { id: 10, callIds: [10, 11] }).map((r) => r.id), [1, 4])
  // The first call was handled on its own: call 11 starts a new episode,
  // and the reminder (closed with the first call on the server) is not its.
  assert.deepEqual(remindersForEpisode(rs, { id: 11, callIds: [11] }).map((r) => r.id), [])
  assert.deepEqual(remindersForEpisode(rs, { id: 30, callIds: [30] }).map((r) => r.id), [2])
  assert.deepEqual(remindersForEpisode(rs, null), [])
})

test('each due reminder is announced once, and again after a snooze brings it back', () => {
  const now = at('2026-11-06T16:00:00Z')
  const r = { id: 5, status: 'due', dueAt: '2026-11-06T15:59:00Z' }
  const later = { id: 6, status: 'open', dueAt: '2026-11-06T17:00:00Z' }
  const seen = new Set()
  assert.deepEqual(dueToAnnounce([r, later], seen, now).map((x) => x.id), [5])
  seen.add(announceKey(r))
  assert.deepEqual(dueToAnnounce([r, later], seen, now), [])
  const snoozed = { ...r, status: 'due', dueAt: '2026-11-06T16:30:00Z' }
  assert.deepEqual(dueToAnnounce([snoozed], seen, at('2026-11-06T16:31:00Z')).map((x) => x.id), [5])
})
