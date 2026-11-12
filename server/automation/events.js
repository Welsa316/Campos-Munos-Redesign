// What the system did on its own, written to the same activity log as what
// people do (staff_activity, source 'system'), so one place answers "what
// happened to this lead?". The Activity page shows these as "System".
//
// details: codes, counts and ids only. Never message text, a note, a name,
// a full phone number or an email address.

/** Every kind of event the automation records, with the words the log shows. */
export const SYSTEM_EVENTS = Object.freeze({
  'automation.lead_ack_sent': 'Sent a new lead the acknowledgment',
  'automation.lead_followup_sent': 'Sent a lead an automatic follow-up',
  'automation.missed_call_sms_sent': 'Texted a caller the firm missed',
  'automation.message_skipped': 'Did not send an automatic message',
  'automation.message_failed': 'An automatic message could not be sent',
  'automation.sequence_started': 'Queued a lead’s acknowledgment and follow-ups',
  'automation.sequence_cancelled': 'Stopped a lead’s automatic follow-ups',
  'automation.lead_status': 'Changed a lead’s status from evidence',
  'automation.lead_spam': 'Marked a lead as vendor or spam',
  'automation.lead_escalated': 'Escalated a lead nobody has contacted',
  'automation.caller_escalated': 'Escalated a caller still waiting for a call back',
  'automation.booking_detected': 'Found a consultation booking for a lead',
  'automation.booking_cancelled': 'A lead’s consultation booking was cancelled',
  'automation.contact_matched': 'Confirmed a caller is a website lead',
  'automation.opt_out': 'Recorded an opt-out from automatic messages',
  'automation.opt_in': 'Removed an opt-out after the person asked to be texted again',
  'automation.job_failed': 'An automation step failed',
})

function clean(details) {
  const out = {}
  for (const [k, v] of Object.entries(details || {})) {
    if (v == null || v === '') continue
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, 120)
  }
  return out
}

/**
 * One line in the activity log, by the system. Never throws: a log line must
 * not undo the work it describes.
 *   outcome  'ok' | 'failed'
 *   details  { reason, trigger, channel, ... } (short codes)
 */
export async function recordSystemEvent(db, { action, entityType = null, entityId = null, outcome = 'ok', details = {}, log = null }) {
  const label = SYSTEM_EVENTS[action]
  if (!label) throw new Error(`Unknown system event: ${action}`)
  try {
    await db.query(
      `INSERT INTO staff_activity (actor_id, actor_email, actor_role, action, label, entity_type, entity_id, outcome, source, details)
       VALUES (NULL, 'system', NULL, $1, $2, $3, $4, $5, 'system', $6)`,
      [action, label, entityType, entityId == null ? null : String(entityId), outcome === 'failed' ? 'failed' : 'ok', JSON.stringify(clean(details))]
    )
  } catch (err) {
    log?.warn?.({ action, err: { name: err?.name, code: err?.code } }, 'System activity line could not be written')
  }
}

export default { SYSTEM_EVENTS, recordSystemEvent }
