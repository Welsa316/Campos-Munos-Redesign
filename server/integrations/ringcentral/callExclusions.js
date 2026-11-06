// Missed calls that need no callback (docs/ringcentral-call-log.md): a machine
// reading out a verification code, someone from the firm testing the line,
// spam. Staff mark them so they leave the missed and not-called-back counts.
// The call stays in the log with who marked it, why and when, and the mark
// can be removed. Either one call, or every call from its number (for a
// number that keeps calling, such as a staff member's mobile).

import crypto from 'crypto'
import { openCallKeys, unansweredInbound } from './callLog.js'

export const EXCLUSION_REASONS = Object.freeze(['verification', 'staff_test', 'spam', 'other'])
const NOTE_MAX = 200

// What an undo removed, for bringing back the callback reminders the mark
// closed (reminders.js reopenResolvedReminders): the earliest removed mark's
// time and the callers' numbers. Not part of any response.
const reopenOf = (createdAts, phoneKeys) => {
  const times = createdAts.filter(Boolean).map((t) => new Date(t).getTime())
  const keys = [...new Set(phoneKeys.filter(Boolean))]
  return times.length && keys.length ? { since: new Date(Math.min(...times)), phoneKeys: keys } : null
}

export class CallExclusionError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'CallExclusionError'
    this.code = code
    this.status = status
  }
}

async function loadCall(db, callId) {
  const call = (await db.query(
    'SELECT id, direction, outcome, classification, counterpart_key, counterpart_number, is_internal FROM rc_calls WHERE id = $1',
    [callId]
  )).rows[0]
  if (!call) throw new CallExclusionError('not_found', 'Call not found', 404)
  return call
}

// Up to this many calls in one episode action: far more than any one
// person's unanswered calls, few enough to check one by one.
const MAX_EPISODE_CALLS = 200

/**
 * The calls of one callback episode, as the page listed them: ids, checked
 * to be calls nobody answered from one number (or a single call). Throws
 * when any is missing or does not qualify.
 */
async function loadEpisode(db, callIds) {
  const ids = Array.isArray(callIds) ? [...new Set(callIds.map(Number))] : []
  if (!ids.length || ids.length > MAX_EPISODE_CALLS || !ids.every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new CallExclusionError('invalid_calls', 'Choose the calls to mark')
  }
  const calls = (await db.query(
    'SELECT id, call_key, direction, outcome, classification, counterpart_key, is_internal FROM rc_calls WHERE id = ANY($1::bigint[])',
    [ids]
  )).rows
  if (calls.length !== ids.length) throw new CallExclusionError('not_found', 'Call not found', 404)
  if (!calls.every(unansweredInbound)) throw new CallExclusionError('not_unanswered', 'Only calls nobody answered can be marked', 409)
  // One person's calls only: a withheld number is never grouped.
  if (calls.length > 1 && (!calls[0].counterpart_key || calls.some((c) => c.counterpart_key !== calls[0].counterpart_key))) {
    throw new CallExclusionError('mixed_numbers', 'These calls are not from one number', 409)
  }
  return calls
}

/**
 * Mark a missed call or voicemail as needing no callback.
 * scope 'call': this call only, or with `callIds` every call of its callback
 * episode (each one marked on its own, so each can be counted again).
 * scope 'number': every call from its number, past and future. Marking
 * again replaces the reason and note.
 */
export async function excludeCall(db, { callId, callIds = null, reason, note, scope = 'call', accountId }) {
  if (!EXCLUSION_REASONS.includes(reason)) throw new CallExclusionError('invalid_reason', 'Choose why this call needs no callback')
  if (scope !== 'call' && scope !== 'number') throw new CallExclusionError('invalid_scope', 'Invalid scope')
  const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : ''
  if (reason === 'other' && !text) throw new CallExclusionError('note_required', 'Say why this call needs no callback')

  const call = await loadCall(db, callId)
  if (!unansweredInbound(call)) {
    throw new CallExclusionError('not_unanswered', 'Only missed calls and voicemails can be marked', 409)
  }
  if (scope === 'number') {
    if (!call.counterpart_key) throw new CallExclusionError('no_number', 'The number was withheld, so only this call can be marked', 409)
    await db.query(
      `INSERT INTO rc_ignored_numbers (counterpart_key, number, reason, note, created_by) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (counterpart_key) DO UPDATE SET number = EXCLUDED.number, reason = EXCLUDED.reason, note = EXCLUDED.note,
              created_by = EXCLUDED.created_by, created_at = NOW()`,
      [call.counterpart_key, call.counterpart_number, reason, text || null, accountId]
    )
  } else {
    let ids = [Number(call.id)]
    if (Array.isArray(callIds) && callIds.length) {
      const episode = await loadEpisode(db, [...callIds, call.id])
      ids = episode.map((c) => Number(c.id))
    }
    await db.query(
      `INSERT INTO rc_call_exclusions (call_id, reason, note, created_by) SELECT id, $2, $3, $4 FROM unnest($1::bigint[]) AS id
       ON CONFLICT (call_id) DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = NOW()`,
      [ids, reason, text || null, accountId]
    )
    if (ids.length > 1) return { callId: Number(call.id), callIds: ids, scope, reason }
  }
  return { callId: Number(call.id), scope, reason }
}

/**
 * Count this call as missed again. Removes its own mark and, when its number
 * is ignored, that number rule too (every call from the number counts again).
 */
export async function includeCall(db, { callId }) {
  const call = await loadCall(db, callId)
  // A mark on any RingCentral record of the same call counts for the call,
  // so counting it again clears them all.
  const own = await db.query(
    'DELETE FROM rc_call_exclusions WHERE call_id IN (SELECT d.id FROM rc_calls d JOIN rc_calls c ON c.call_key = d.call_key WHERE c.id = $1) RETURNING created_at',
    [call.id]
  )
  const byNumber = call.counterpart_key
    ? await db.query('DELETE FROM rc_ignored_numbers WHERE counterpart_key = $1 RETURNING created_at', [call.counterpart_key])
    : { rowCount: 0, rows: [] }
  return {
    callId: Number(call.id), removedCall: own.rowCount > 0, removedNumber: byNumber.rowCount > 0,
    reopen: reopenOf([...own.rows, ...byNumber.rows].map((r) => r.created_at), [call.counterpart_key]),
  }
}

export default { excludeCall, includeCall, markHandled, unmarkHandled, markEpisodeHandled, reopenEpisode, EXCLUSION_REASONS }

// --- handled: dealt with another way ----------------------------------------------

/**
 * Mark a call that needed someone as dealt with another way (called back from
 * a mobile, answered by email, sorted out in person). It leaves Needs
 * attention; its classification and who it is attributed to do not change.
 * Marking again replaces the note.
 */
export async function markHandled(db, { callId, note, accountId }) {
  const call = await loadCall(db, callId)
  if (!unansweredInbound(call)) {
    throw new CallExclusionError('not_unanswered', 'Only calls nobody answered can be marked handled', 409)
  }
  const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : ''
  const key = (await db.query('SELECT call_key FROM rc_calls WHERE id = $1', [call.id])).rows[0].call_key
  await db.query(
    `INSERT INTO rc_call_resolutions (call_key, note, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (call_key) DO UPDATE SET note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = NOW()`,
    [key, text || null, accountId]
  )
  return { callId: Number(call.id), handled: true }
}

/** Open the call again: it goes back to Needs attention if it still qualifies. */
export async function unmarkHandled(db, { callId }) {
  const call = await loadCall(db, callId)
  const r = await db.query(
    'DELETE FROM rc_call_resolutions WHERE call_key = (SELECT call_key FROM rc_calls WHERE id = $1) RETURNING created_at',
    [call.id]
  )
  return { callId: Number(call.id), removed: r.rowCount > 0, reopen: reopenOf(r.rows.map((x) => x.created_at), [call.counterpart_key]) }
}

/**
 * Mark every call of one callback episode handled (Needs attention → Handled
 * on a person's row): one mark per call, as if each were marked on its own,
 * so the per-call counts and "Handled today" stay per call. A call someone
 * else marked meanwhile keeps their mark. Returns the ids this marked, which
 * is what Undo reopens.
 */
export async function markEpisodeHandled(db, { callIds, note, accountId }) {
  const calls = await loadEpisode(db, callIds)
  const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : ''
  const r = await db.query(
    `INSERT INTO rc_call_resolutions (call_key, note, created_by)
     SELECT DISTINCT k, $2::text, $3::int FROM unnest($1::text[]) AS k
     ON CONFLICT (call_key) DO NOTHING RETURNING call_key`,
    [calls.map((c) => c.call_key), text || null, accountId]
  )
  const marked = new Set(r.rows.map((x) => x.call_key))
  return { handled: true, callIds: calls.filter((c) => marked.has(c.call_key)).map((c) => Number(c.id)) }
}

/** Undo marking an episode handled: those calls go back to Needs attention. A bulk clear is left alone. */
export async function reopenEpisode(db, { callIds }) {
  const calls = await loadEpisode(db, callIds)
  const r = await db.query(
    'DELETE FROM rc_call_resolutions WHERE batch_id IS NULL AND call_key = ANY($1::text[]) RETURNING created_at',
    [calls.map((c) => c.call_key)]
  )
  return { removed: r.rowCount, reopen: reopenOf(r.rows.map((x) => x.created_at), calls.map((c) => c.counterpart_key)) }
}

/**
 * Mark every call Needs attention lists (received before `before`) as
 * handled in one batch, with one note: for clearing the list after a fix
 * to the phone system's routing made the old calls moot. `review`: the
 * review group's calls too (by default they stay). Classification and
 * attribution are untouched, the batch is not counted as "Handled today",
 * and it can be undone as one.
 */
export async function clearOpenCalls(db, { before = new Date(), note, accountId, now = new Date(), review = false }) {
  const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : ''
  if (!text) throw new CallExclusionError('note_required', 'Say why these calls are being cleared', 400)
  const keys = await openCallKeys(db, { before, now, review })
  if (!keys.length) return { cleared: 0, batch: null }
  const batch = crypto.randomUUID()
  const r = await db.query(
    `INSERT INTO rc_call_resolutions (call_key, note, created_by, batch_id)
     SELECT k, $2, $3, $4 FROM unnest($1::text[]) AS k
     ON CONFLICT (call_key) DO NOTHING`,
    [keys, text, accountId, batch]
  )
  return { cleared: r.rowCount, batch }
}

/** Undo one clear: its calls go back to Needs attention. */
export async function undoClear(db, { batch }) {
  const r = await db.query('DELETE FROM rc_call_resolutions WHERE batch_id = $1 RETURNING call_key, created_at', [batch])
  const keys = r.rowCount
    ? (await db.query("SELECT DISTINCT counterpart_key FROM rc_calls WHERE call_key = ANY($1::text[]) AND counterpart_key <> ''", [r.rows.map((x) => x.call_key)])).rows.map((x) => x.counterpart_key)
    : []
  return { removed: r.rowCount, reopen: reopenOf(r.rows.map((x) => x.created_at), keys) }
}
