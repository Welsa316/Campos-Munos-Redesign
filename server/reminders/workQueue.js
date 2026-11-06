// Home's "My follow-ups": the few things waiting for this account, most
// urgent first. Only what the account may open: callback reminders on
// callers need calls.view, on leads crm.view, and new website leads crm.view.
//
//   1. my reminders that are overdue (due 5 minutes or more ago), oldest first
//   2. my reminders due now
//   3. my reminders due later today (New Orleans time), soonest first
//   4. website leads nobody has opened or worked yet (unread, status new,
//      not archived), oldest first, and not already in 1–3
//   5. my reminders on later days (callers and leads I have taken on), soonest first
//
// No other person's work and no counts about anyone: this is a to-do list,
// not a report.
import { isGenericCallerId } from '../integrations/ringcentral/callLog.js'
import { canSeeKind } from './reminders.js'
import { firmWall, firmInstant } from './dueTime.js'

export const WORK_QUEUE_LIMIT = 5
const OVERDUE_MS = 5 * 60 * 1000

const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase())

/** Midnight that ends the firm's day containing `now`. */
function endOfFirmDay(now) {
  const w = firmWall(now)
  const next = new Date(Date.UTC(w.year, w.month - 1, w.day + 1))
  return firmInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0)
}

export async function workQueue(db, { accountId, caps, now = new Date(), limit = WORK_QUEUE_LIMIT }) {
  const calls = canSeeKind(caps, 'call')
  const leads = canSeeKind(caps, 'submission')
  if (!calls && !leads) return { items: [], hasMore: false, sections: { calls, leads } }
  const kinds = [calls && 'call', leads && 'submission'].filter(Boolean)

  // The caller's name as the firm knows them (client, then website lead),
  // else the caller ID when it is a name, else just the number.
  const reminders = (await db.query(
    `SELECT r.id, r.target_kind, r.call_id, r.submission_id, r.due_at, r.status, r.note,
            c.counterpart_number AS number, c.caller_id_name,
            COALESCE(cl.name, NULLIF(TRIM(cs.first_name || ' ' || cs.last_name), '')) AS call_name,
            NULLIF(TRIM(s.first_name || ' ' || s.last_name), '') AS lead_name
       FROM follow_up_reminders r
       LEFT JOIN rc_calls c ON c.id = r.call_id
       LEFT JOIN LATERAL (
         SELECT bc.display_name AS name FROM billing_client_contacts cc JOIN billing_clients bc ON bc.id = cc.client_id
          WHERE c.counterpart_key <> '' AND cm_phone_key(cc.phone_e164) = c.counterpart_key ORDER BY cc.updated_at DESC LIMIT 1) cl ON TRUE
       LEFT JOIN LATERAL (
         SELECT x.first_name, x.last_name FROM submissions x
          WHERE c.counterpart_key <> '' AND cm_phone_key(x.phone) = c.counterpart_key ORDER BY x.created_at DESC LIMIT 1) cs ON TRUE
       LEFT JOIN submissions s ON s.id = r.submission_id
      WHERE r.assigned_to = $1 AND r.status IN ('open', 'due') AND r.target_kind = ANY($2::text[])
      ORDER BY r.due_at, r.id`,
    [accountId, kinds]
  )).rows

  const endOfDay = endOfFirmDay(now).getTime()
  const t = now.getTime()
  const groupOf = (r) => {
    const due = new Date(r.due_at).getTime()
    if (r.status === 'due' || due <= t) return t - due >= OVERDUE_MS ? 'overdue' : 'due'
    return due < endOfDay ? 'today' : 'later'
  }
  const items = reminders.map((r) => {
    const call = r.target_kind === 'call'
    const callerId = r.caller_id_name && !isGenericCallerId(r.caller_id_name) ? titleCase(r.caller_id_name) : null
    return {
      kind: call ? 'callback' : 'lead_followup',
      group: groupOf(r),
      reminderId: Number(r.id),
      name: call ? r.call_name || callerId : r.lead_name,
      number: call ? r.number : null,
      at: r.due_at,
      hasNote: Boolean(r.note),
      path: call ? `/calls?call=${r.call_id}` : `/inbox?lead=${r.submission_id}`,
      leadId: call ? null : Number(r.submission_id),
    }
  })

  // New website leads, unless I already have a reminder on them.
  if (leads) {
    const taken = items.filter((i) => i.leadId).map((i) => i.leadId)
    const fresh = (await db.query(
      `SELECT id, first_name, last_name, source, created_at FROM submissions
        WHERE NOT is_archived AND NOT is_read AND status = 'new' AND NOT (id = ANY($1::int[]))
        ORDER BY created_at, id LIMIT $2`,
      [taken, limit + 1]
    )).rows
    for (const s of fresh) {
      items.push({
        kind: 'new_lead', group: 'lead', name: `${s.first_name} ${s.last_name}`.trim() || null, number: null,
        at: s.created_at, source: s.source === 'chat' ? 'chat' : 'contact', path: `/inbox?lead=${s.id}`, leadId: Number(s.id),
      })
    }
  }

  const ORDER = { overdue: 0, due: 1, today: 2, lead: 3, later: 4 }
  items.sort((a, b) => ORDER[a.group] - ORDER[b.group] || new Date(a.at) - new Date(b.at))
  const shown = items.slice(0, limit).map(({ leadId, ...rest }) => rest)
  return { items: shown, hasMore: items.length > shown.length, sections: { calls, leads } }
}
