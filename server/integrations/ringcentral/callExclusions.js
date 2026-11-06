// Missed calls that need no callback (docs/ringcentral-call-log.md): a machine
// reading out a verification code, someone from the firm testing the line,
// spam. Staff mark them so they leave the missed and not-called-back counts.
// The call stays in the log with who marked it, why and when, and the mark
// can be removed. Either one call, or every call from its number (for a
// number that keeps calling, such as a staff member's mobile).

export const EXCLUSION_REASONS = Object.freeze(['verification', 'staff_test', 'spam', 'other'])
const NOTE_MAX = 200

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

/**
 * Mark a missed call or voicemail as needing no callback.
 * scope 'call': this call only. scope 'number': every call from its number,
 * past and future. Marking again replaces the reason and note.
 */
export async function excludeCall(db, { callId, reason, note, scope = 'call', accountId }) {
  if (!EXCLUSION_REASONS.includes(reason)) throw new CallExclusionError('invalid_reason', 'Choose why this call needs no callback')
  if (scope !== 'call' && scope !== 'number') throw new CallExclusionError('invalid_scope', 'Invalid scope')
  const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : ''
  if (reason === 'other' && !text) throw new CallExclusionError('note_required', 'Say why this call needs no callback')

  const call = await loadCall(db, callId)
  // Anything not proven answered can be marked; before a call is classified,
  // RingCentral's missed and voicemail results.
  const unanswered = call.classification ? call.classification !== 'answered' : ['missed', 'voicemail'].includes(call.outcome)
  if (call.direction !== 'inbound' || !unanswered || call.is_internal) {
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
    await db.query(
      `INSERT INTO rc_call_exclusions (call_id, reason, note, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (call_id) DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = NOW()`,
      [call.id, reason, text || null, accountId]
    )
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
    'DELETE FROM rc_call_exclusions WHERE call_id IN (SELECT d.id FROM rc_calls d JOIN rc_calls c ON c.call_key = d.call_key WHERE c.id = $1)',
    [call.id]
  )
  const byNumber = call.counterpart_key
    ? await db.query('DELETE FROM rc_ignored_numbers WHERE counterpart_key = $1', [call.counterpart_key])
    : { rowCount: 0 }
  return { callId: Number(call.id), removedCall: own.rowCount > 0, removedNumber: byNumber.rowCount > 0 }
}

export default { excludeCall, includeCall, EXCLUSION_REASONS }
