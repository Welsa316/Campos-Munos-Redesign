// "Is the automation working, and what has it done?" for the administrator
// (Integrations → Automation), and the leads that need a person.
//
// Counts, times and short codes only: never a name, a number, an address,
// message text or anything secret.
import { FLAGS, FLAG_KEYS, currentFlags } from './flags.js'
import { allState } from './state.js'
import { loadSettings } from './settings.js'
import { UNAVAILABLE } from '../integrations/ringcentral/sms.js'
import { loadGoogleCalendarConfig } from './scheduling/google.js'
import { testRecipients } from './messaging.js'
import { isProductionEnv } from '../utils/productionEnv.js'
import { emailConfigProblems } from '../utils/emailConfig.js'


export async function automationHealth(db, { env = process.env } = {}) {
  const flags = await currentFlags(db, env)
  const settings = await loadSettings(db)
  const state = await allState(db)

  const jobs = (await db.query(
    `SELECT type,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'failed' AND acknowledged_at IS NULL)::int AS failed,
            COUNT(*) FILTER (WHERE status = 'done' AND completed_at > NOW() - INTERVAL '7 days')::int AS done_7d,
            COUNT(*) FILTER (WHERE status = 'skipped' AND completed_at > NOW() - INTERVAL '7 days')::int AS skipped_7d,
            MAX(completed_at) FILTER (WHERE status = 'done') AS last_done_at,
            MAX(completed_at) FILTER (WHERE status = 'failed') AS last_failed_at
       FROM automation_jobs GROUP BY type`
  )).rows
  const byType = Object.fromEntries(jobs.map((j) => [j.type, {
    pending: j.pending, failed: j.failed, done7d: j.done_7d, skipped7d: j.skipped_7d, lastDoneAt: j.last_done_at, lastFailedAt: j.last_failed_at,
  }]))
  const sum = (types, field) => types.reduce((n, t) => n + (byType[t]?.[field] || 0), 0)
  const latest = (types, field) => types.map((t) => byType[t]?.[field]).filter(Boolean).sort().pop() || null
  const area = (types) => ({ pending: sum(types, 'pending'), failed: sum(types, 'failed'), done7d: sum(types, 'done7d'), skipped7d: sum(types, 'skipped7d'), lastDoneAt: latest(types, 'lastDoneAt'), lastFailedAt: latest(types, 'lastFailedAt') })

  const messages = (await db.query(
    `SELECT purpose, channel, COUNT(*) FILTER (WHERE status = 'sent' AND created_at > NOW() - INTERVAL '7 days')::int AS sent_7d,
            COUNT(*) FILTER (WHERE status IN ('failed', 'unknown') AND created_at > NOW() - INTERVAL '7 days')::int AS problems_7d,
            MAX(created_at) FILTER (WHERE status = 'sent') AS last_sent_at
       FROM automation_messages GROUP BY purpose, channel`
  )).rows.map((m) => ({ purpose: m.purpose, channel: m.channel, sent7d: m.sent_7d, problems7d: m.problems_7d, lastSentAt: m.last_sent_at }))

  const sms = state.ringcentral_sms?.details || {}
  const calendar = loadGoogleCalendarConfig(env, settings)
  const optOuts = (await db.query('SELECT COUNT(*)::int AS n FROM automation_suppressions WHERE removed_at IS NULL')).rows[0].n
  const test = testRecipients(env)

  return {
    production: isProductionEnv(env),
    // Where client messages can go from this process.
    recipients: test ? { mode: 'test_list', count: test.emails.size + test.phones.size } : { mode: isProductionEnv(env) ? 'everyone' : 'nobody' },
    flags: FLAG_KEYS.map((key) => ({
      key, label: FLAGS[key].label, about: FLAGS[key].about || null, group: FLAGS[key].group, env: FLAGS[key].env, sends: Boolean(FLAGS[key].sends),
      on: flags.on(key), why: flags.why(key), paused: Boolean(flags.paused[key]),
    })),
    worker: { ...(state.worker || {}), details: undefined },
    steps: Object.fromEntries(['lead_intake', 'missed_calls', 'lead_evidence', 'contact_match'].map((k) => [k, state[k] ? { lastSuccessAt: state[k].lastSuccessAt, lastFailureAt: state[k].lastFailureAt, lastError: state[k].lastError, consecutiveFailures: state[k].consecutiveFailures } : null])),
    leadAck: area(['lead_ack_email', 'lead_ack_sms']),
    leadFollowup: area(['lead_followup', 'lead_no_response']),
    escalation: area(['lead_sla', 'call_sla']),
    missedCallSms: area(['missed_call_sms']),
    messages,
    email: { configured: emailConfigProblems(env).length === 0, problems: emailConfigProblems(env) },
    sms: {
      available: Boolean(sms.available), sender: sms.sender || null,
      reason: sms.available ? null : sms.reason || null,
      reasonText: sms.available || !sms.reason ? null : UNAVAILABLE[sms.reason] || sms.reason,
      candidates: Array.isArray(sms.candidates) ? sms.candidates.length : 0,
      checkedAt: sms.checkedAt || null, backoffUntil: sms.backoffUntil || null,
      inbound: state.sms_inbound ? { lastSuccessAt: state.sms_inbound.lastSuccessAt, lastFailureAt: state.sms_inbound.lastFailureAt, lastError: state.sms_inbound.lastError, consecutiveFailures: state.sms_inbound.consecutiveFailures } : null,
    },
    scheduling: {
      configured: calendar.configured, problems: calendar.problems, bookingLinkSet: Boolean(settings.scheduling.bookingUrl),
      lastSuccessAt: state.calendar?.lastSuccessAt || null, lastFailureAt: state.calendar?.lastFailureAt || null,
      lastError: state.calendar?.lastError || null, consecutiveFailures: state.calendar?.consecutiveFailures || 0,
    },
    optOuts,
  }
}

/** Failed jobs nobody has dealt with yet, newest first. */
export async function listExceptions(db, { limit = 100 } = {}) {
  const rows = (await db.query(
    `SELECT j.id, j.type, j.entity_type, j.entity_id, j.outcome, j.last_error, j.attempts, j.completed_at, j.created_at,
            NULLIF(TRIM(s.first_name || ' ' || s.last_name), '') AS lead_name
       FROM automation_jobs j
       LEFT JOIN submissions s ON j.entity_type = 'lead' AND s.id::text = j.entity_id
      WHERE j.status = 'failed' AND j.acknowledged_at IS NULL AND j.type <> 'sms_delivery_check'
      ORDER BY j.completed_at DESC NULLS LAST LIMIT $1`,
    [Math.min(300, Math.max(1, Number(limit) || 100))]
  )).rows
  return rows.map((r) => ({
    id: Number(r.id), type: r.type, entityType: r.entity_type, entityId: r.entity_id, name: r.lead_name || null,
    reason: r.outcome || 'failed', error: r.last_error || null, attempts: r.attempts, at: r.completed_at || r.created_at,
    path: r.entity_type === 'lead' ? `/inbox?lead=${r.entity_id}` : r.entity_type === 'call' ? `/calls?call=${r.entity_id}` : null,
  }))
}

// Why a lead needs a person, most pressing first.
export const ATTENTION_ORDER = Object.freeze(['client_replied', 'message_failed', 'booking_cancelled', 'overdue', 'possible_spam', 'no_response'])

/**
 * Leads that need a person, derived from what is true now (nothing to keep
 * in step, nothing that can go stale):
 *   client_replied     they answered a text and nobody has dealt with it
 *   message_failed     an automatic message to them could not be sent
 *   booking_cancelled  their consultation was cancelled and none replaces it
 *   overdue            still New past the time a person should have contacted them
 *   possible_spam      a phrase rule matched; someone should look
 *   no_response        the follow-ups finished with no answer
 * `ownerId`: put that person's own leads first. Returns [{ id, name, reason, at, mine }].
 */
export async function leadAttention(db, { ownerId = null, limit = 50, now = new Date() } = {}) {
  const rows = (await db.query(
    `SELECT s.id, s.first_name, s.last_name, s.owner_id, s.created_at, s.sla_due_at, s.status_changed_at, a.reason, a.at
       FROM submissions s
       CROSS JOIN LATERAL (
         SELECT * FROM (
           SELECT 'client_replied' AS reason, 1 AS rank, (SELECT MIN(m.received_at) FROM rc_sms_inbound m WHERE m.submission_id = s.id AND m.kind <> 'opt_out' AND m.handled_at IS NULL) AS at
           UNION ALL
           SELECT 'message_failed', 2, (SELECT MAX(j.completed_at) FROM automation_jobs j WHERE j.entity_type = 'lead' AND j.entity_id = s.id::text AND j.status = 'failed' AND j.acknowledged_at IS NULL AND j.type <> 'sms_delivery_check' AND s.status = 'new')
           UNION ALL
           SELECT 'booking_cancelled', 3, (SELECT MAX(b.updated_at) FROM consultation_bookings b WHERE b.submission_id = s.id AND b.status = 'cancelled' AND s.status = 'scheduled'
                                              AND NOT EXISTS (SELECT 1 FROM consultation_bookings o WHERE o.submission_id = s.id AND o.status = 'booked'))
           UNION ALL
           SELECT 'overdue', 4, CASE WHEN s.status = 'new' AND COALESCE(s.spam_state, '') <> 'possible' AND s.sla_due_at <= $1 THEN s.sla_due_at END
           UNION ALL
           SELECT 'possible_spam', 5, CASE WHEN s.spam_state = 'possible' THEN s.created_at END
           UNION ALL
           SELECT 'no_response', 6, CASE WHEN s.status = 'no_response' AND s.status_auto THEN s.status_changed_at END
         ) x WHERE x.at IS NOT NULL ORDER BY x.rank LIMIT 1
       ) a
      WHERE NOT s.is_archived AND COALESCE(s.spam_state, '') <> 'spam' AND s.created_at > NOW() - INTERVAL '120 days'
      ORDER BY (s.owner_id IS NOT DISTINCT FROM $2::int) DESC, array_position($3::text[], a.reason), a.at
      LIMIT $4`,
    [now, ownerId, [...ATTENTION_ORDER], Math.min(200, Math.max(1, Number(limit) || 50))]
  )).rows
  return rows.map((r) => ({
    id: Number(r.id), name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || null, reason: r.reason, at: r.at,
    mine: ownerId != null && Number(r.owner_id) === Number(ownerId),
  }))
}

/** What the automation knows and has done about one lead, for its page. */
export async function leadAutomationSummary(db, submissionId) {
  const s = (await db.query(
    `SELECT s.id, s.language, s.sms_consent_at, s.owner_id, s.assigned_at, s.sla_due_at, s.escalation_level, s.escalated_at, s.automation_paused,
            s.spam_state, s.spam_reason, s.status, s.status_reason, s.status_auto, s.status_changed_at,
            COALESCE(NULLIF(TRIM(o.display_name), ''), split_part(o.email, '@', 1)) AS owner_name
       FROM submissions s LEFT JOIN admin_users o ON o.id = s.owner_id WHERE s.id = $1`,
    [submissionId]
  )).rows[0]
  if (!s) return null
  const messages = (await db.query(
    `SELECT channel, purpose, status, template_key, language, created_at, error FROM automation_messages
      WHERE entity_type = 'lead' AND entity_id = $1 ORDER BY created_at`,
    [String(submissionId)]
  )).rows
  const pending = (await db.query(
    `SELECT type, run_at, payload FROM automation_jobs WHERE entity_type = 'lead' AND entity_id = $1 AND status = 'pending' ORDER BY run_at`,
    [String(submissionId)]
  )).rows
  const failed = (await db.query(
    `SELECT id, type, outcome, completed_at FROM automation_jobs WHERE entity_type = 'lead' AND entity_id = $1 AND status = 'failed' AND acknowledged_at IS NULL AND type <> 'sms_delivery_check' ORDER BY completed_at DESC`,
    [String(submissionId)]
  )).rows
  const stopped = (await db.query(
    `SELECT outcome, MAX(completed_at) AS at FROM automation_jobs WHERE entity_type = 'lead' AND entity_id = $1 AND status = 'cancelled' AND type IN ('lead_followup', 'lead_no_response') GROUP BY outcome ORDER BY at DESC LIMIT 1`,
    [String(submissionId)]
  )).rows[0]
  const replies = (await db.query(
    "SELECT COUNT(*)::int AS n, MIN(received_at) AS first FROM rc_sms_inbound WHERE submission_id = $1 AND kind <> 'opt_out' AND handled_at IS NULL", [submissionId]
  )).rows[0]
  const bookings = (await db.query(
    'SELECT starts_at, ends_at, status, created_at FROM consultation_bookings WHERE submission_id = $1 ORDER BY starts_at DESC NULLS LAST LIMIT 5', [submissionId]
  )).rows
  return {
    language: s.language, smsConsent: Boolean(s.sms_consent_at),
    owner: s.owner_id == null ? null : { id: Number(s.owner_id), name: s.owner_name }, assignedAt: s.assigned_at,
    slaDueAt: s.sla_due_at, escalationLevel: s.escalation_level, escalatedAt: s.escalated_at,
    paused: s.automation_paused,
    spam: s.spam_state ? { state: s.spam_state, reason: s.spam_reason } : null,
    status: { reason: s.status_reason, auto: s.status_auto, changedAt: s.status_changed_at },
    messages: messages.map((m) => ({ channel: m.channel, purpose: m.purpose, status: m.status, template: m.template_key, language: m.language, at: m.created_at, error: m.status === 'sent' ? null : m.error })),
    pending: pending.map((j) => ({ type: j.type, at: j.run_at, step: j.payload?.step || null, level: j.payload?.level || null })),
    failed: failed.map((j) => ({ id: Number(j.id), type: j.type, reason: j.outcome, at: j.completed_at })),
    stopped: stopped ? { reason: stopped.outcome, at: stopped.at } : null,
    textReplies: { waiting: replies.n, since: replies.first },
    bookings: bookings.map((b) => ({ startsAt: b.starts_at, endsAt: b.ends_at, status: b.status, foundAt: b.created_at })),
  }
}

export default { automationHealth, listExceptions, leadAttention, leadAutomationSummary }
