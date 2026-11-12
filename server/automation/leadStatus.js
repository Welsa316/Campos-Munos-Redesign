// A lead's status from evidence, never from a guess.
//
// What counts, and what it proves:
//   a connected outgoing call to the lead's number, at
//   least a minute long (settings.status; a call that
//   reached voicemail is "connected" too)               a person reached them  → Contacted
//   an incoming call from that number that was answered a person spoke to them → Contacted
//   a reply sent from the portal (routes/submissions.js) → Contacted
//   a consultation found on the calendar for the lead   → Scheduled
//   the follow-up sequence finished with none of these  → No response
//   a text reply from the lead                          stops the follow-ups and
//       asks for a person; it moves New → Contacted only when the firm
//       switched that on (settings.status.contactedOnClientReply), because
//       nobody at the firm has spoken to them yet
//
// What never counts: the automatic acknowledgment. A lead the system wrote
// to is still New until a person reaches them, or the funnel stops meaning
// anything. Retained is always set by a person: nothing the portal can see
// proves a client was signed.
//
// Stopping the follow-ups is separate from changing the status and does not
// depend on the status switch: once any of the above is seen, the pending
// follow-ups are cancelled, whatever else is switched on.
import { cancelJobs } from './jobs.js'
import { recordSystemEvent } from './events.js'

export const FOLLOWUP_JOB_TYPES = Object.freeze(['lead_followup', 'lead_no_response'])
export const MESSAGE_JOB_TYPES = Object.freeze(['lead_ack_email', 'lead_ack_sms', 'lead_followup', 'lead_no_response'])
export const ALL_LEAD_JOB_TYPES = Object.freeze([...MESSAGE_JOB_TYPES, 'lead_sla'])

const OPEN_DAYS = 90
const SWEEP_LIMIT = 500

/**
 * What the portal can prove about a lead since it came in. Call evidence is
 * ignored for a number staff marked as a colleague's phone, and for a lead
 * staff said is not this number's caller (contact_links 'rejected').
 * Returns { callAt, callKind, smsReplyAt, bookingAt, sharedNumber }.
 */
export async function leadEvidence(db, lead, { connectedCallSeconds = 60 } = {}) {
  const r = (await db.query(
    `WITH k AS (SELECT cm_phone_key($2::text) AS key)
     SELECT
       (SELECT row_to_json(x) FROM (
          SELECT c.started_at AS at, c.direction FROM rc_calls c, k
           WHERE k.key <> '' AND c.counterpart_key = k.key AND c.is_primary AND NOT c.is_internal AND c.started_at > $3
             AND ((c.direction = 'outbound' AND c.outcome = 'connected' AND c.duration_seconds >= $5::int) OR (c.direction = 'inbound' AND c.classification = 'answered'))
             AND NOT EXISTS (SELECT 1 FROM rc_ignored_numbers g WHERE g.counterpart_key = k.key)
             AND NOT EXISTS (SELECT 1 FROM contact_links l WHERE l.phone_key = k.key AND l.submission_id = $1 AND l.state = 'rejected')
           ORDER BY c.started_at LIMIT 1) x) AS call,
       (SELECT MIN(m.received_at) FROM rc_sms_inbound m, k
         WHERE k.key <> '' AND m.from_key = k.key AND m.kind <> 'opt_out' AND m.received_at > $3) AS sms_reply_at,
       (SELECT MIN(b.starts_at) FROM consultation_bookings b WHERE b.submission_id = $1 AND b.status = 'booked') AS booking_at,
       -- Other people's open leads on the same number: a call to it does not
       -- say which of them was reached.
       (SELECT COUNT(DISTINCT LOWER(o.email)) FROM submissions o, k
         WHERE k.key <> '' AND cm_phone_key(o.phone) = k.key AND NOT o.is_archived AND o.status IN ('new', 'no_response')
           AND LOWER(o.email) <> LOWER($4::text)) AS others`,
    [lead.id, lead.phone, lead.created_at, lead.email, connectedCallSeconds]
  )).rows[0]
  return {
    callAt: r.call?.at ? new Date(r.call.at) : null,
    callKind: r.call ? (r.call.direction === 'outbound' ? 'connected_callback' : 'client_called_and_was_answered') : null,
    smsReplyAt: r.sms_reply_at,
    bookingAt: r.booking_at,
    sharedNumber: Number(r.others) > 0,
  }
}

/** Has a person at the firm reached this lead, or have they booked? (What stops follow-ups and escalation.) */
export const humanContact = (ev) => Boolean(ev.callAt || ev.bookingAt)

/**
 * Change a lead's status, with why. Only from one of `from` (so a lead that
 * moved on meanwhile is left alone). Returns the new status or null.
 *   auto    true when the system decided; false for a person
 *   reason  a short code shown beside the status
 */
export async function setLeadStatus(db, id, to, { from, reason, auto = true, trigger = null, log = null }) {
  const r = await db.query(
    `UPDATE submissions SET status = $2, status_reason = $3, status_auto = $4, status_changed_at = NOW()
      WHERE id = $1 AND status = ANY($5::text[]) AND status <> $2 RETURNING id, status`,
    [id, to, reason, auto, from]
  )
  if (!r.rowCount) return null
  if (auto) await recordSystemEvent(db, { action: 'automation.lead_status', entityType: 'lead', entityId: id, details: { to, reason, trigger }, log })
  return to
}

/** Stop a lead's pending automatic work and say why (once, in the activity log). */
export async function stopLeadAutomation(db, id, reason, { types = ALL_LEAD_JOB_TYPES, log = null } = {}) {
  const cancelled = await cancelJobs(db, { entityType: 'lead', entityId: id, types: [...types], reason })
  if (cancelled.some((t) => MESSAGE_JOB_TYPES.includes(t))) {
    await recordSystemEvent(db, { action: 'automation.sequence_cancelled', entityType: 'lead', entityId: id, details: { reason, jobs: cancelled.length }, log })
  }
  return cancelled
}

/**
 * Look at every open lead and act on what is now provable: cancel what is no
 * longer needed, and (with the status switch on) move the status. Cheap to
 * run every minute: only leads still New or No response from the last
 * OPEN_DAYS days, one query each.
 */
export async function applyLeadEvidence(db, { flags, settings, log = null } = {}) {
  const leads = (await db.query(
    // New and No response leads, and a Contacted one only when a booking
    // was found for it (so the Contacted leads that pile up over the months
    // never crowd the open ones out of the batch).
    `SELECT id, phone, email, status, created_at FROM submissions s
      WHERE NOT is_archived AND created_at > NOW() - make_interval(days => $1::int) AND automation_started_at IS NOT NULL
        AND (status IN ('new', 'no_response')
          OR (status = 'contacted' AND EXISTS (SELECT 1 FROM consultation_bookings b WHERE b.submission_id = s.id AND b.status = 'booked')))
      ORDER BY created_at DESC LIMIT $2`,
    [OPEN_DAYS, SWEEP_LIMIT]
  )).rows
  const out = { scheduled: 0, contacted: 0, stopped: 0 }
  for (const lead of leads) {
    const ev = await leadEvidence(db, lead, settings.status)
    if (ev.bookingAt) {
      const stopped = await stopLeadAutomation(db, lead.id, 'consultation_booked', { log })
      if (stopped.length) out.stopped++
      if (flags.on('lead_status') && await setLeadStatus(db, lead.id, 'scheduled', { from: ['new', 'contacted', 'no_response'], reason: 'consultation_booked', trigger: 'calendar', log })) out.scheduled++
      continue
    }
    if (lead.status === 'contacted') continue
    if (ev.callAt) {
      const stopped = await stopLeadAutomation(db, lead.id, ev.callKind, { log })
      if (stopped.length) out.stopped++
      // A shared number does not say who was reached: the follow-ups stop
      // for everyone on it, but nobody's status is changed.
      if (!ev.sharedNumber && flags.on('lead_status') && await setLeadStatus(db, lead.id, 'contacted', { from: ['new', 'no_response'], reason: ev.callKind, trigger: 'call_log', log })) out.contacted++
      continue
    }
    if (ev.smsReplyAt) {
      // They answered: nothing more is sent, and a person takes over (the
      // lead shows under Needs attention until someone handles the reply).
      // Escalation stays: the reply still needs a person.
      const stopped = await stopLeadAutomation(db, lead.id, 'client_replied_by_text', { types: FOLLOWUP_JOB_TYPES, log })
      if (stopped.length) out.stopped++
      if (settings.status.contactedOnClientReply && flags.on('lead_status') && await setLeadStatus(db, lead.id, 'contacted', { from: ['new'], reason: 'client_replied_by_text', trigger: 'sms', log })) out.contacted++
    }
  }
  return out
}

export default { leadEvidence, humanContact, setLeadStatus, stopLeadAutomation, applyLeadEvidence }
