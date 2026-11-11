// What people text back to the firm's RingCentral number, read from
// RingCentral's message store every few minutes (read-only).
//
// Only what the automation needs is kept (rc_sms_inbound): who it came from
// (as a phone key), when, and which kind it is. The words stay in
// RingCentral, where staff read and answer them.
//
//   opt_out  the whole message was STOP (or one of its forms): the number
//            goes on the opt-out list and gets no more automatic texts
//   opt_in   START and the like: an opt-out the person sent themselves is
//            lifted (one a staff member recorded is not)
//   help     HELP: nothing automatic; RingCentral answers these itself
//   reply    anything else: the follow-ups to that lead stop (leadStatus.js)
//            and the lead waits for a person
import { classifyInbound, suppress, unsuppress } from './suppression.js'
import { recordSystemEvent } from './events.js'
import { noteSuccess, noteFailure, getState, dueToRun } from './state.js'

export const POLL_EVERY_MS = 3 * 60 * 1000
const OVERLAP_MS = 10 * 60 * 1000
const FIRST_LOOKBACK_MS = 24 * 60 * 60 * 1000
const STATE_KEY = 'sms_inbound'

/**
 * Read new inbound texts and act on them. Returns { read, new, optOuts, replies }
 * or { skipped } when it is not time yet.
 */
export async function pollInboundSms(db, sms, { now = new Date(), force = false, log = null } = {}) {
  const state = await getState(db, STATE_KEY)
  if (!force && !dueToRun(state, now, POLL_EVERY_MS)) return { skipped: 'not_due' }
  const lastOk = state?.details?.lastOkAt
  const from = lastOk ? new Date(new Date(lastOk).getTime() - OVERLAP_MS) : new Date(now.getTime() - FIRST_LOOKBACK_MS)
  let messages
  try {
    messages = await sms.inbound({ dateFrom: from })
  } catch (err) {
    await noteFailure(db, STATE_KEY, err?.code || err?.name || 'error', { lastRunAt: now.toISOString() })
    throw err
  }
  const out = { read: messages.length, new: 0, optOuts: 0, replies: 0 }
  for (const m of messages) {
    const kind = classifyInbound(m.text)
    // The newest lead this number belongs to that we wrote to, if any.
    const lead = (await db.query(
      `SELECT s.id FROM submissions s
        WHERE cm_phone_key(s.phone) = $1 AND s.created_at <= $2
          AND EXISTS (SELECT 1 FROM automation_messages am WHERE am.entity_type = 'lead' AND am.entity_id = s.id::text AND am.channel = 'sms')
        ORDER BY s.created_at DESC LIMIT 1`,
      [m.fromKey, m.at]
    )).rows[0]
    const ins = await db.query(
      `INSERT INTO rc_sms_inbound (rc_message_id, from_key, received_at, kind, submission_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (rc_message_id) DO NOTHING RETURNING id`,
      [m.id, m.fromKey, m.at, kind, kind === 'reply' ? lead?.id ?? null : null]
    )
    if (!ins.rowCount) continue
    out.new++
    if (kind === 'opt_out') {
      const r = await suppress(db, { channel: 'sms', address: m.fromKey, reason: 'opt_out', source: 'sms_stop' })
      if (r.created) {
        out.optOuts++
        await recordSystemEvent(db, { action: 'automation.opt_out', entityType: lead ? 'lead' : null, entityId: lead?.id ?? null, details: { channel: 'sms', source: 'sms_stop' }, log })
      }
    } else if (kind === 'opt_in') {
      const lifted = await unsuppress(db, { channel: 'sms', address: m.fromKey, onlyReason: 'opt_out' })
      if (lifted) await recordSystemEvent(db, { action: 'automation.opt_in', entityType: lead ? 'lead' : null, entityId: lead?.id ?? null, details: { channel: 'sms' }, log })
    } else if (kind === 'reply') out.replies++
  }
  await noteSuccess(db, STATE_KEY, { read: out.read, new: out.new, lastRunAt: now.toISOString(), lastOkAt: now.toISOString() })
  return out
}

/** A person has seen to a lead's text replies (they answered, or it needed nothing). */
export async function markRepliesHandled(db, submissionId, accountId = null) {
  const r = await db.query(
    "UPDATE rc_sms_inbound SET handled_at = NOW(), handled_by = $2 WHERE submission_id = $1 AND kind = 'reply' AND handled_at IS NULL",
    [submissionId, accountId]
  )
  return r.rowCount
}

export default { pollInboundSms, markRepliesHandled }
