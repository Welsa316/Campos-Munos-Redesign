// The Calls page's follow-up layer. What matters: only the server's word
// closes a call, Needs attention lists only calls the server marks open, in
// the order staff should work them, and times are the firm's, not the
// browser's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionSections, handledSections, daySections, followUpLine, followUpDetail, dayName, dateKey, animateChange, episodeSections, reviewSection, episodeSummary, episodeLine, REVIEW_GROUP } from '../src/modules/calls/callsInbox.js'

// 11:48 AM in New Orleans on Thu Nov 5 2026.
const NOW = Date.parse('2026-11-05T17:48:00Z')
const call = (over) => ({ id: 1, direction: 'inbound', classification: 'not_answered', number: '+15045550101', startedAt: '2026-11-05T16:00:00Z', needsAttention: true, attentionGroup: 'new', ...over })

test('needs attention lists only open calls, oldest trouble first, newest first inside a group', () => {
  const sections = attentionSections([
    call({ id: 1, attentionGroup: 'new', startedAt: '2026-11-05T15:00:00Z' }),
    call({ id: 2, attentionGroup: 'waiting', startedAt: '2026-11-03T15:00:00Z' }),
    call({ id: 3, attentionGroup: 'new', startedAt: '2026-11-05T16:30:00Z' }),
    call({ id: 4, attentionGroup: 'try_again' }),
    call({ id: 5, needsAttention: false, attentionGroup: null }),
    call({ id: 6, attentionGroup: 'waiting', startedAt: '2026-11-04T15:00:00Z' }),
  ])
  assert.deepEqual(sections.map((s) => s.key), ['waiting', 'try_again', 'new'])
  assert.deepEqual(sections.map((s) => s.calls.map((c) => c.id)), [[6, 2], [4], [3, 1]])
})

test('a group with no calls is not shown', () => {
  assert.deepEqual(attentionSections([call({ attentionGroup: 'new' })]).map((s) => s.key), ['new'])
  assert.deepEqual(attentionSections([]), [])
})

test('an open call reads as open; only what the server sent closes it', () => {
  assert.deepEqual(followUpLine(call(), NOW), { tone: 'open', text: 'Callback needed' })
  // The server says it is handled: done, with who and when.
  const handled = followUpLine(call({ needsAttention: false, handled: { at: '2026-11-05T17:10:00Z', by: 'Yoletty' } }), NOW)
  assert.deepEqual(handled, { tone: 'done', text: 'Handled by Yoletty · 11:10 AM' })
  // A connected callback closes it; an attempt that did not connect does not.
  assert.equal(followUpLine(call({ needsAttention: false, connectedFollowUp: { at: '2026-11-05T17:20:00Z', kind: 'called_back' } }), NOW).tone, 'done')
  const tried = followUpLine(call({ attentionGroup: 'try_again', attemptAt: '2026-11-05T17:46:00Z' }), NOW)
  assert.deepEqual(tried, { tone: 'open', text: 'Tried 11:46 AM · still needs a callback' })
})

test('a call the server no longer lists as open, with no reason given, claims nothing', () => {
  // Answered, withheld, or not confirmed: no follow-up line at all.
  assert.equal(followUpLine(call({ needsAttention: false, classification: 'answered' }), NOW), null)
  assert.equal(followUpLine(call({ needsAttention: false, classification: 'unknown' }), NOW), null)
  assert.match(followUpDetail(call({ needsAttention: false, classification: 'unknown' }), NOW), /not counted as missed/)
  assert.match(followUpDetail(call({ needsAttention: false, number: '' }), NOW), /withheld/)
})

test('waiting calls say since when, in the firm’s days', () => {
  const y = followUpLine(call({ attentionGroup: 'waiting', startedAt: '2026-11-04T22:42:00Z' }), NOW)
  assert.deepEqual(y, { tone: 'open', text: 'Waiting since yesterday' })
  const older = followUpLine(call({ attentionGroup: 'waiting', startedAt: '2026-11-02T15:00:00Z' }), NOW)
  assert.equal(older.text, 'Waiting since Mon, Nov 2')
})

test('days follow New Orleans, not UTC', () => {
  // 11:30 PM on Nov 4 in New Orleans is already Nov 5 in UTC.
  const late = '2026-11-05T05:30:00Z'
  assert.equal(dateKey(late), '2026-11-04')
  assert.equal(dayName(late, NOW), 'Yesterday')
  const days = daySections([call({ id: 1, startedAt: '2026-11-05T16:00:00Z' }), call({ id: 2, startedAt: late })], NOW)
  assert.deepEqual(days.map((d) => [d.label, d.calls.map((c) => c.id)]), [['Today', [1]], ['Yesterday', [2]]])
})

test('a handled call keeps its classification wording promise', () => {
  const text = followUpDetail(call({ needsAttention: false, handled: { at: '2026-11-05T17:10:00Z', by: null, note: 'Spoke in person' } }), NOW)
  assert.match(text, /a former user/)
  assert.match(text, /Spoke in person/)
  assert.match(text, /classified.*unchanged/)
})

test('only small list changes animate row by row', () => {
  assert.equal(animateChange([1, 2, 3], [1, 2, 3]), false)
  assert.equal(animateChange([1, 2, 3], [1, 3]), true)
  assert.equal(animateChange([1, 2, 3], [4, 1, 2, 3]), true)
  assert.equal(animateChange([1, 2, 3], [10, 11, 12, 13, 14, 15, 16]), false)
})

test('handled is grouped by the day each call was dealt with, most recent first', () => {
  const sections = handledSections([
    // Came in two days ago, handled today: listed under today.
    call({ id: 1, needsAttention: false, startedAt: '2026-11-03T15:00:00Z', handled: { at: '2026-11-05T16:00:00Z', by: 'Yoletty' } }),
    call({ id: 2, needsAttention: false, startedAt: '2026-11-04T15:00:00Z', connectedFollowUp: { at: '2026-11-04T18:00:00Z', kind: 'called_back' } }),
    call({ id: 3, needsAttention: false, startedAt: '2026-11-05T14:00:00Z', handled: { at: '2026-11-05T17:30:00Z', by: 'Ciro' } }),
    // Still open, or marked as needing no callback: not handled.
    call({ id: 4 }),
    call({ id: 5, needsAttention: false, exclusion: { scope: 'call', reason: 'spam' } }),
  ], NOW)
  assert.deepEqual(sections.map((s) => [s.label, s.calls.map((c) => c.id)]), [['Today', [3, 1]], ['Yesterday', [2]]])
})

test('a call cleared with the rest of the list says so, not that someone dealt with it', () => {
  const c = call({ needsAttention: false, handled: { at: '2026-11-05T17:10:00Z', by: 'Walid', note: 'Missed before voicemail routing was set up', bulk: true } })
  assert.deepEqual(followUpLine(c, NOW), { tone: 'done', text: 'Cleared from the list by Walid · 11:10 AM' })
  assert.match(followUpDetail(c, NOW), /Cleared from Needs attention with the rest of the list/)
  assert.match(followUpDetail(c, NOW), /Missed before voicemail routing was set up/)
  assert.doesNotMatch(followUpDetail(c, NOW), /^Marked handled/)
})

// --- callback episodes --------------------------------------------------------------

const ep = (over) => ({
  id: 1, kind: 'attention', attempts: 1, callIds: [1], latestCallId: 1, firstAt: '2026-11-05T16:00:00Z', lastAt: '2026-11-05T16:00:00Z',
  callbackAttempts: 0, lastCallbackAttemptAt: null, attentionGroup: 'new', offeredTo: [], ...over,
})

test('several unanswered calls read as one caller: how many, first and last', () => {
  const three = ep({ attempts: 3, callIds: [1, 2, 3], firstAt: '2026-11-02T15:15:00Z', lastAt: '2026-11-05T16:05:00Z', attentionGroup: 'waiting' })
  assert.equal(episodeSummary(three, NOW), '3 unanswered calls · first Mon, Nov 2 9:15 AM · last 10:05 AM')
  assert.equal(episodeSummary({ ...three, lastAt: '2026-11-04T16:05:00Z' }, NOW), '3 unanswered calls · first Mon, Nov 2 9:15 AM · last yesterday 10:05 AM')
  assert.equal(episodeSummary({ ...three, kind: 'review', attentionGroup: null }, NOW), '3 calls with no recorded outcome · first Mon, Nov 2 9:15 AM · last 10:05 AM')
  // One call: no summary, so its row reads exactly as before.
  assert.equal(episodeSummary(ep(), NOW), null)
  assert.equal(episodeSummary(null, NOW), null)
})

test('a caller’s line: waiting since their first call; tries counted, never closing it', () => {
  assert.deepEqual(episodeLine(ep(), NOW), { tone: 'open', text: 'Callback needed' })
  assert.deepEqual(episodeLine(ep({ attentionGroup: 'waiting', firstAt: '2026-11-02T15:15:00Z' }), NOW), { tone: 'open', text: 'Waiting since Mon, Nov 2' })
  assert.deepEqual(episodeLine(ep({ attentionGroup: 'waiting', firstAt: '2026-11-04T15:15:00Z' }), NOW), { tone: 'open', text: 'Waiting since yesterday' })
  // One try reads as a single call's did; more say how many.
  assert.deepEqual(episodeLine(ep({ attentionGroup: 'try_again', callbackAttempts: 1, lastCallbackAttemptAt: '2026-11-05T17:46:00Z' }), NOW),
    followUpLine({ direction: 'inbound', needsAttention: true, attentionGroup: 'try_again', attemptAt: '2026-11-05T17:46:00Z' }, NOW))
  assert.deepEqual(episodeLine(ep({ attentionGroup: 'waiting', callbackAttempts: 2, lastCallbackAttemptAt: '2026-11-04T22:00:00Z' }), NOW),
    { tone: 'open', text: 'Tried 2× · last yesterday 4:00 PM · still needs a callback' })
  assert.deepEqual(episodeLine(ep({ kind: 'review', attentionGroup: null }), NOW), { tone: 'quiet', text: 'Check if they still need help' })
})

test('Needs attention by caller: oldest trouble first, most recently active inside a group; review apart', () => {
  const sections = episodeSections([
    ep({ id: 1, attentionGroup: 'new', lastAt: '2026-11-05T15:00:00Z' }),
    ep({ id: 2, attentionGroup: 'waiting', lastAt: '2026-11-03T15:00:00Z' }),
    ep({ id: 3, attentionGroup: 'new', lastAt: '2026-11-05T16:30:00Z' }),
    // First call on Monday, called again today: still waiting, listed by its last call.
    ep({ id: 4, attentionGroup: 'waiting', firstAt: '2026-11-02T15:00:00Z', lastAt: '2026-11-05T16:00:00Z' }),
    ep({ id: 5, attentionGroup: 'try_again' }),
    ep({ id: 6, kind: 'review', attentionGroup: null }),
  ])
  assert.deepEqual(sections.map((s) => [s.key, s.episodes.map((e) => e.id)]), [['waiting', [4, 2]], ['try_again', [5]], ['new', [3, 1]]])
  assert.equal(reviewSection([ep({ id: 1 })]), null, 'only review episodes go in the review group')
  const quiet = reviewSection([ep({ id: 7, kind: 'review', lastAt: '2026-11-04T15:00:00Z' }), ep({ id: 8, kind: 'review', lastAt: '2026-11-05T15:00:00Z' })])
  assert.deepEqual(quiet.episodes.map((e) => e.id), [8, 7])
  assert.equal(quiet.label, 'Check if they still need help')
  assert.equal(REVIEW_GROUP.note, 'RingCentral did not record how these calls ended. Nobody is counted as missing them.')
  assert.equal(reviewSection([]), null)
})

test('a call in the review group asks someone to check, and claims nobody missed it', () => {
  const c = call({ needsAttention: false, attentionGroup: null, needsReview: true, classification: 'unknown' })
  assert.deepEqual(followUpLine(c, NOW), { tone: 'quiet', text: 'Check if they still need help' })
  assert.match(followUpDetail(c, NOW), /nobody is counted as missing it/)
  // Once dealt with, it reads as handled like any other call.
  assert.equal(followUpLine({ ...c, needsReview: false, handled: { at: '2026-11-05T17:10:00Z', by: 'Yoletty' } }, NOW).tone, 'done')
})
