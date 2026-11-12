// Vendor solicitations and spam among the website leads.
//
// Deliberately narrow. A real immigration lead hidden by a rule is far worse
// than a vendor email left in the inbox, so the only thing that removes a
// lead from the inbox on its own is a sender an administrator listed by hand:
//
//   an exact sender address, or a whole sender domain (never a public mail
//   provider: settings.js refuses gmail.com and the like)
//                         → given the status the front desk already uses for
//                           junk (stored 'closed', shown as "Spam") and archived
//   a listed phrase in the message
//                         → marked "possible spam" for a person to look at;
//                           it stays in the inbox, and gets no automatic
//                           messages until someone clears it
//
// No scoring and no model. Everything here can be undone from the lead
// (Not spam), and each mark is in the activity log.
import { recordSystemEvent } from './events.js'

/** { state: 'spam'|'possible', reason } for a lead under these rules, or null. */
export function spamVerdict(lead, rules) {
  const email = String(lead?.email ?? '').trim().toLowerCase()
  const domain = email.split('@')[1] || ''
  if (email && rules?.senders?.includes(email)) return { state: 'spam', reason: 'sender_rule' }
  if (domain && rules?.domains?.includes(domain)) return { state: 'spam', reason: 'domain_rule' }
  const text = String(lead?.message ?? '').toLowerCase()
  if (text && rules?.phrases?.some((p) => text.includes(p))) return { state: 'possible', reason: 'phrase_rule' }
  return null
}

/**
 * Apply the rules to one lead. A lead a person already cleared is never
 * marked again. Returns the verdict applied, or null.
 */
export async function applySpamRules(db, lead, rules, { log = null } = {}) {
  if (lead.spam_state === 'cleared') return null
  const v = spamVerdict(lead, rules)
  if (!v) return null
  const r = await db.query(
    `UPDATE submissions SET spam_state = $2::varchar, spam_reason = $3,
            is_archived = CASE WHEN $2::varchar = 'spam' THEN TRUE ELSE is_archived END,
            -- Spam is the existing 'closed' status; only a lead still New is moved.
            status = CASE WHEN $2::varchar = 'spam' AND status = 'new' THEN 'closed' ELSE status END,
            status_reason = CASE WHEN $2::varchar = 'spam' AND status = 'new' THEN 'vendor_rule' ELSE status_reason END,
            status_auto = CASE WHEN $2::varchar = 'spam' AND status = 'new' THEN TRUE ELSE status_auto END,
            status_changed_at = CASE WHEN $2::varchar = 'spam' AND status = 'new' THEN NOW() ELSE status_changed_at END
      WHERE id = $1 AND spam_state IS DISTINCT FROM 'cleared' AND spam_state IS DISTINCT FROM $2::varchar RETURNING id`,
    [lead.id, v.state, v.reason]
  )
  if (!r.rowCount) return null
  await recordSystemEvent(db, { action: 'automation.lead_spam', entityType: 'lead', entityId: lead.id, details: { state: v.state, reason: v.reason }, log })
  return v
}

/** The rules over every lead still New in the inbox (after an administrator changed them). */
export async function applySpamRulesToOpen(db, rules, { log = null } = {}) {
  const leads = (await db.query(
    "SELECT id, email, message, spam_state FROM submissions WHERE NOT is_archived AND status = 'new' ORDER BY id DESC LIMIT 2000"
  )).rows
  const out = { spam: 0, possible: 0 }
  for (const lead of leads) {
    const v = await applySpamRules(db, lead, rules, { log })
    if (v) out[v.state]++
  }
  return out
}

/**
 * A person says a lead is spam (the Spam status, archived) or is not (back
 * in the inbox; and back to New when Spam was its status).
 */
export async function setSpamState(db, id, state) {
  if (!['cleared', 'spam'].includes(state)) throw Object.assign(new Error('Unknown choice'), { status: 400, code: 'invalid' })
  const r = await db.query(
    `UPDATE submissions SET spam_state = $2::varchar, spam_reason = 'set_by_staff', is_archived = ($2::varchar = 'spam'),
            status = CASE WHEN $2::varchar = 'spam' THEN 'closed' WHEN status = 'closed' THEN 'new' ELSE status END,
            status_reason = 'set_by_staff', status_auto = FALSE, status_changed_at = NOW()
      WHERE id = $1 RETURNING id, spam_state, is_archived, status`,
    [id, state]
  )
  return r.rows[0] || null
}

export default { spamVerdict, applySpamRules, applySpamRulesToOpen, setSpamState }
