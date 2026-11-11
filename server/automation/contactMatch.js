// Confirming that a caller is a website lead, when two identifiers agree.
//
// A phone number alone is not a person (a shared family phone, a reassigned
// number), which is why Calls shows a lead with the same number as a
// possible match until someone confirms it (server/contacts/contacts.js).
// The system confirms one by itself only when the number AND the email
// address point at the same person:
//
//   - every website lead on that number carries the same email address (so
//     the number belongs to one person as far as the firm knows), and
//   - that phone-and-email pair is on record at least twice: the person
//     wrote in more than once giving both, or they answered from that phone
//     a text the firm sent to that lead
//
// One lead on a number, with nothing else to go on, stays a possible match
// for a person to decide. Nothing is merged or copied: a confirmation is one
// contact_links row, marked as decided by the system with what it rests on,
// and it is undone from Calls like any other. A match a person already
// decided either way is never touched.
import { recordSystemEvent } from './events.js'

export const RUN_EVERY_MS = 30 * 60 * 1000

/** Returns how many matches were confirmed. */
export async function autoConfirmMatches(db, { log = null } = {}) {
  // Numbers that both called and wrote in, with exactly one email behind them.
  const candidates = (await db.query(
    `WITH per_number AS (
       SELECT cm_phone_key(s.phone) AS key, COUNT(*) AS leads, COUNT(DISTINCT LOWER(TRIM(s.email))) AS emails
         FROM submissions s
        WHERE cm_phone_key(s.phone) <> '' AND COALESCE(s.spam_state, '') <> 'spam'
        GROUP BY 1)
     SELECT p.key, p.leads,
            EXISTS (SELECT 1 FROM rc_sms_inbound m WHERE m.from_key = p.key AND m.kind <> 'opt_out' AND m.submission_id IS NOT NULL) AS replied
       FROM per_number p
      WHERE p.emails = 1
        AND EXISTS (SELECT 1 FROM rc_calls c WHERE c.counterpart_key = p.key AND NOT c.is_internal)
        AND NOT EXISTS (SELECT 1 FROM rc_ignored_numbers g WHERE g.counterpart_key = p.key)
      LIMIT 500`
  )).rows
  let confirmed = 0
  for (const c of candidates) {
    const evidence = Number(c.leads) >= 2 ? 'phone_and_email_seen_twice' : c.replied ? 'phone_and_email_text_reply' : null
    if (!evidence) continue
    const rows = (await db.query(
      `INSERT INTO contact_links (phone_key, submission_id, state, decided_by, decided_auto, evidence)
       SELECT $1, s.id, 'confirmed', NULL, TRUE, $2 FROM submissions s WHERE cm_phone_key(s.phone) = $1
       ON CONFLICT (phone_key, submission_id) DO NOTHING RETURNING submission_id`,
      [c.key, evidence]
    )).rows
    for (const r of rows) {
      confirmed++
      await recordSystemEvent(db, { action: 'automation.contact_matched', entityType: 'lead', entityId: r.submission_id, details: { evidence }, log })
    }
  }
  return confirmed
}

export default { autoConfirmMatches }
