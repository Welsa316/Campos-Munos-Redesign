// Test automation mode: the lead automation (automation/leads.js) rehearsed
// on a test form, so an administrator can watch the whole sequence without a
// lead, a client or a colleague being involved.
//
// What is real and what is pretend:
//   - the WORDS are real: the firm's own templates and settings, rendered by
//     the same code that writes to a client (automation/templates.js)
//   - the TIMES are real when asked for: "production" timing comes from the
//     same function a lead's does (leads.js leadSchedule); "accelerated"
//     timing is minutes, and lives only in this file
//   - TWO things may really leave, each only when the administrator ticks
//     it: the acknowledgment email, to the address typed for the test,
//     marked as a test, with replies going back to the administrator and
//     never to the office; and the text messages, to the phone typed for the
//     test, from the firm's RingCentral number, each starting "[TEST]"
//   - everything else is only written down: the escalation notifies nobody
//     (or only the administrator who started the test, when they asked),
//     the status is the test's own
//
// Isolation, by construction rather than by a flag: this file writes to
// test_automation_* and test_submissions only. It never writes to
// submissions, automation_jobs, automation_messages, staff_activity,
// reminders or billing, and it runs whether or not any production
// automation is switched on (they are separate switches). A real test text
// is the one thing that reaches outside: it goes through the firm's
// RingCentral connection (so it shows in that extension's own message
// history), to the test's phone and nowhere else.
import { loadSettings } from '../automation/settings.js'
import { renderTemplate, languageFor } from '../automation/templates.js'
import { leadSchedule, messageVars } from '../automation/leads.js'
import { addBusinessMinutes } from '../automation/businessHours.js'
import { suppressionReason } from '../automation/suppression.js'
import { testRecipients } from '../automation/messaging.js'
import { ALERTS } from '../automation/escalation.js'
import { clientFrom, emailAllowlist, looksLikeEmail } from '../reminders/email.js'
import { isProductionEnv } from '../utils/productionEnv.js'
import { escapeHtml } from '../utils/sanitize.js'
import { phoneKey, phoneDigits, inCountries } from '../utils/phone.js'
import { sendPush } from '../push/send.js'

/** Shown on every screen, email and notification that test mode produces. */
export const TEST_BANNER = 'TEST MODE — NO PRODUCTION ACTIONS'

export const TIMINGS = Object.freeze(['accelerated', 'production'])
// Accelerated timing: one step a minute after the acknowledgment. Only ever
// read here; a lead's timing comes from the automation settings.
export const ACCELERATED_STEP_MS = 60 * 1000
// A test that is still running when this many others are is refused.
export const MAX_ACTIVE_TESTS = 10
// A step claimed this long ago and never finished was cut off mid-way.
const INTERRUPTED_AFTER = '2 minutes'

export const ACTIONS = Object.freeze(['client_replied', 'consultation_booked', 'mark_contacted', 'mark_closed', 'run_next'])

export class TestAutomationError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message)
    this.code = code
    this.status = status
    this.extra = extra
  }
}

/**
 * Whether test mode runs in this process. On in production (it is the
 * administrator's own tool and touches nothing real); elsewhere only when
 * asked for, because a developer machine may be pointed at the live
 * database and must not pick up the administrator's test steps.
 */
export function testAutomationOn(env = process.env) {
  const v = String(env.TEST_AUTOMATION_ENABLED ?? '').trim().toLowerCase()
  return v ? v === 'true' : isProductionEnv(env)
}

// In a test every automation is treated as switched on: that is the point.
const ALL_ON = Object.freeze({ on: () => true })
const isFollowup = (type) => type.startsWith('followup:')

/**
 * The steps of one test and when each is due.
 *   accelerated  acknowledgment now, then one step a minute: each follow-up,
 *                the escalation, the second escalation, "No response"
 *   production   the times a real lead arriving now would get
 */
export function planTestSteps({ created, timing, settings }) {
  const followups = settings.followup.steps
  const steps = [{ type: 'ack_email', dueAt: created }, { type: 'ack_sms', dueAt: created }]
  const followup = (f, at) => ({ type: `followup:${f.key}`, dueAt: at, payload: { step: f.key, templateKey: f.templateKey } })
  if (timing === 'accelerated') {
    const at = (n) => new Date(created.getTime() + n * ACCELERATED_STEP_MS)
    followups.forEach((f, i) => steps.push(followup(f, at(i + 1))))
    const n = followups.length
    steps.push({ type: 'escalation_1', dueAt: at(n + 1), payload: { level: 1 } })
    steps.push({ type: 'escalation_2', dueAt: at(n + 2), payload: { level: 2 } })
    if (n) steps.push({ type: 'no_response', dueAt: at(n + 3) })
    return steps
  }
  const plan = leadSchedule(created, settings)
  for (const { step, at } of plan.followups) steps.push(followup(step, at))
  steps.push({ type: 'escalation_1', dueAt: plan.slaDue, payload: { level: 1 } })
  steps.push({ type: 'escalation_2', dueAt: addBusinessMinutes(plan.slaDue, settings.sla.newLeadSecondMinutes, settings.hours), payload: { level: 2 } })
  if (followups.length) steps.push({ type: 'no_response', dueAt: plan.noResponseAt })
  return steps
}

// --- the test-only history ------------------------------------------------------------

async function logEvent(db, { runId = null, kind, step = null, channel = null, recipient = null, subject = null, body = null, detail = {}, actorId = null }) {
  await db.query(
    `INSERT INTO test_automation_events (run_id, kind, step, channel, recipient, subject, body, detail, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [runId, kind, step, channel, recipient, subject, body, JSON.stringify(detail), actorId]
  )
}

/** A test form (or all of them) was removed: the one line that outlives it. */
export async function noteTestsRemoved(db, { count, all = false, actorId = null }) {
  // A reset empties the history too, then says that it happened.
  if (all) await db.query('DELETE FROM test_automation_events')
  await logEvent(db, { kind: 'reset', detail: { removed: count, all }, actorId })
}

// --- preferences ----------------------------------------------------------------------

const PREF_DEFAULTS = Object.freeze({ autoStart: false, timing: 'accelerated', sendEmail: true, sendSms: false, notifyMe: false, confirmedEmails: [], confirmedPhones: [] })

export async function getTestPrefs(db, accountId) {
  const r = (await db.query('SELECT auto_start, timing, send_email, send_sms, notify_me, confirmed_emails, confirmed_phones FROM test_automation_prefs WHERE account_id = $1', [accountId])).rows[0]
  if (!r) return { ...PREF_DEFAULTS }
  return { autoStart: r.auto_start, timing: r.timing, sendEmail: r.send_email, sendSms: r.send_sms, notifyMe: r.notify_me, confirmedEmails: r.confirmed_emails, confirmedPhones: r.confirmed_phones }
}

export async function saveTestPrefs(db, accountId, { autoStart, timing, sendEmail, sendSms = false, notifyMe }) {
  if (!TIMINGS.includes(timing)) throw new TestAutomationError('bad_timing', 'Choose accelerated or production timing')
  await db.query(
    `INSERT INTO test_automation_prefs (account_id, auto_start, timing, send_email, send_sms, notify_me) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_id) DO UPDATE SET auto_start = EXCLUDED.auto_start, timing = EXCLUDED.timing, send_email = EXCLUDED.send_email,
       send_sms = EXCLUDED.send_sms, notify_me = EXCLUDED.notify_me, updated_at = NOW()`,
    [accountId, Boolean(autoStart), timing, Boolean(sendEmail), Boolean(sendSms), Boolean(notifyMe)]
  )
  return getTestPrefs(db, accountId)
}

// column: 'confirmed_emails' | 'confirmed_phones' (never from a request).
async function rememberConfirmed(db, accountId, column, value) {
  await db.query(
    `INSERT INTO test_automation_prefs (account_id, ${column}) VALUES ($1, ARRAY[$2::text])
     ON CONFLICT (account_id) DO UPDATE SET ${column} = ARRAY(SELECT DISTINCT e FROM unnest(test_automation_prefs.${column} || $2::text) e), updated_at = NOW()`,
    [accountId, value]
  )
}

// --- where a real email may go --------------------------------------------------------

/** Why this process may not email this address, or null. Outside production: the developer allowlists only. */
export function emailGate(env, address) {
  if (isProductionEnv(env)) return null
  const key = String(address || '').toLowerCase()
  if (emailAllowlist(env)?.has(key) || testRecipients(env)?.emails.has(key)) return null
  return 'not_production'
}

/** How many leads in the inbox have this address: a real person may be behind it. */
export async function leadsWithAddress(db, email) {
  return (await db.query('SELECT COUNT(*)::int AS n FROM submissions WHERE LOWER(email) = LOWER($1)', [email])).rows[0].n
}

/** Why this process may not text this number, or null. Outside production: the developer's test numbers only. */
export function phoneGate(env, key) {
  if (isProductionEnv(env)) return null
  return testRecipients(env)?.phones.has(key) ? null : 'not_production'
}

/** How many leads or billing clients have this phone number (by its key). */
export async function peopleWithPhone(db, key) {
  if (!key) return 0
  return (await db.query(
    `SELECT (SELECT COUNT(*) FROM submissions WHERE cm_phone_key(phone) = $1)::int
          + (SELECT COUNT(*) FROM billing_client_contacts WHERE phone_e164 IS NOT NULL AND cm_phone_key(phone_e164) = $1)::int AS n`,
    [key]
  )).rows[0].n
}

// --- starting a test ------------------------------------------------------------------

/**
 * Start the automation test for one test form. One per form; a second call
 * returns the first. `confirmKnown`: the administrator said a real email may
 * go to an address a lead also has. `lenient` (a test arriving from the
 * website, where nobody can be asked): such an address is not refused, the
 * email is simply not sent.
 * Returns { runId, created, emailHeld }.
 */
export async function startTestRun(db, { testId, by = null, timing = 'accelerated', sendEmail = false, sendSms = false, notifyMe = false, confirmKnown = false, lenient = false, now = new Date(), env = process.env }) {
  if (!testAutomationOn(env)) throw new TestAutomationError('test_automation_off', 'Test automation is switched off on this server', 409)
  if (!TIMINGS.includes(timing)) throw new TestAutomationError('bad_timing', 'Choose accelerated or production timing')
  const sub = (await db.query('SELECT id, email, phone FROM test_submissions WHERE id = $1', [testId])).rows[0]
  if (!sub) throw new TestAutomationError('test_not_found', 'Test form not found', 404)
  const existing = (await db.query('SELECT id FROM test_automation_runs WHERE test_submission_id = $1', [testId])).rows[0]
  if (existing) return { runId: existing.id, created: false, emailHeld: null }

  const active = (await db.query("SELECT COUNT(DISTINCT run_id)::int AS n FROM test_automation_steps WHERE state IN ('pending', 'running')")).rows[0].n
  if (active >= MAX_ACTIVE_TESTS) throw new TestAutomationError('too_many_tests', `${MAX_ACTIVE_TESTS} tests are still running. Wait for one to finish, or remove one.`, 429)

  // A real email only ever goes to the address typed for this test. If a
  // lead in the inbox has the same address, a person is asked first.
  // The same for a real text and the phone number typed for the test.
  const prefs = by != null ? await getTestPrefs(db, by) : PREF_DEFAULTS
  let send = Boolean(sendEmail) && looksLikeEmail(sub.email)
  let text = Boolean(sendSms) && Boolean(phoneKey(sub.phone))
  let emailHeld = null
  let smsHeld = null
  const email = String(sub.email || '').toLowerCase()
  const phone = phoneKey(sub.phone)
  const emailLeads = send && !prefs.confirmedEmails.includes(email) ? await leadsWithAddress(db, email) : 0
  const phonePeople = text && !prefs.confirmedPhones.includes(phone) ? await peopleWithPhone(db, phone) : 0
  if (emailLeads || phonePeople) {
    if (confirmKnown && by != null) {
      if (emailLeads) await rememberConfirmed(db, by, 'confirmed_emails', email)
      if (phonePeople) await rememberConfirmed(db, by, 'confirmed_phones', phone)
    } else if (lenient) {
      if (emailLeads) { send = false; emailHeld = 'address_on_a_lead' }
      if (phonePeople) { text = false; smsHeld = 'address_on_a_lead' }
    } else {
      const what = emailLeads && phonePeople ? 'email address and this phone number' : emailLeads ? 'email address' : 'phone number'
      const real = emailLeads && phonePeople ? 'A real email and real texts' : emailLeads ? 'A real email' : 'Real texts'
      throw new TestAutomationError('address_on_a_lead', `A lead or client already has this ${what}. ${real} would go to it.`, 409, { leads: emailLeads, phones: phonePeople })
    }
  }

  const settings = await loadSettings(db)
  const steps = planTestSteps({ created: now, timing, settings })
  const inserted = await db.query(
    `INSERT INTO test_automation_runs (test_submission_id, started_by, timing, send_email, send_sms, notify_starter, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (test_submission_id) DO NOTHING RETURNING id`,
    [testId, by, timing, send, text, Boolean(notifyMe), now]
  )
  // Two starts at once: the other one won.
  if (!inserted.rowCount) return { runId: (await db.query('SELECT id FROM test_automation_runs WHERE test_submission_id = $1', [testId])).rows[0].id, created: false, emailHeld: null }
  const runId = inserted.rows[0].id
  for (const s of steps) {
    await db.query('INSERT INTO test_automation_steps (run_id, type, payload, due_at) VALUES ($1, $2, $3, $4)', [runId, s.type, JSON.stringify(s.payload || {}), s.dueAt])
  }
  await logEvent(db, { runId, kind: 'started', detail: { timing, sendEmail: send, sendSms: text, notifyMe: Boolean(notifyMe), steps: steps.length, ...(emailHeld ? { emailHeld } : {}), ...(smsHeld ? { smsHeld } : {}) }, actorId: by })
  return { runId, created: true, emailHeld, smsHeld }
}

/**
 * A test form made in the portal itself (no website involved), ready for
 * startTestRun. Stored like any other test form, marked 'portal'.
 */
export async function createPortalTest(db, { firstName, lastName = '', email, phone = '', language = null, smsConsent = false }, { sentBy }) {
  return (await db.query(
    `INSERT INTO test_submissions (first_name, last_name, email, phone, message, source, language, sms_consent, sent_by)
     VALUES ($1, $2, $3, $4, $5, 'portal', $6, $7, $8) RETURNING id`,
    [firstName, lastName, email, phone, 'Automation test started from the portal.', language === 'es' || language === 'en' ? language : null, Boolean(smsConsent), sentBy]
  )).rows[0].id
}

// --- running the steps ----------------------------------------------------------------

async function loadRun(db, where, value) {
  return (await db.query(
    `SELECT r.*, t.first_name, t.email, t.phone, t.language, t.sms_consent, u.email AS starter_email
       FROM test_automation_runs r
       JOIN test_submissions t ON t.id = r.test_submission_id
       LEFT JOIN admin_users u ON u.id = r.started_by AND u.disabled_at IS NULL
      WHERE ${where === 'test' ? 'r.test_submission_id' : 'r.id'} = $1`,
    [value]
  )).rows[0] || null
}

/**
 * Why a step should no longer happen, or null: the same last look a lead's
 * step takes (leads.js leadStop and the evidence checks after it).
 */
export function testStop(run, type) {
  if (run.lead_status !== 'new') return `status_${run.lead_status}`
  if (run.booked_at) return 'consultation_booked'
  if (run.replied_at && isFollowup(type)) return 'client_replied_by_text'
  if (run.replied_at && type === 'no_response') return 'client_reached'
  return null
}

const done = (outcome, event) => ({ state: 'done', outcome, event })
const skipped = (outcome, extra = {}) => ({ state: 'skipped', outcome, event: { kind: 'skipped', detail: { reason: outcome }, ...extra } })

function testEmail(msg, run, env) {
  const note = 'This is a test of the automatic acknowledgment, sent from the staff portal’s test channel to the address entered for the test. Below the line is the message a new website lead would receive.'
  return {
    subject: `[TEST] ${msg.subject}`,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto 24px; padding: 12px 16px; border: 2px solid #b45309; background: #fffbeb; color: #78350f; font-size: 13px; line-height: 1.5;">
      <strong>${escapeHtml(TEST_BANNER)}</strong><br/>${escapeHtml(note)}
    </div>${msg.html}`,
    text: `${TEST_BANNER}\n${note}\n\n----------\n\n${msg.text}`,
    from: clientFrom(env),
    // Never the office inbox: a reply to a test goes back to whoever started
    // it, or failing that to the test address itself.
    replyTo: run.starter_email || run.email,
  }
}

async function runAckEmail(db, run, { settings, mailer, env }) {
  const msg = renderTemplate(settings.templates, 'lead_ack_email', languageFor(run), messageVars(run, settings, ALL_ON))
  const base = { channel: 'email', recipient: run.email, subject: msg.subject, body: msg.text }
  const shown = (reason) => done('simulated', { kind: 'simulated', ...base, detail: { template: 'lead_ack_email', language: msg.language, reason } })
  if (!run.send_email) return shown('email_not_requested')
  if (!looksLikeEmail(run.email)) return shown('invalid_address')
  if (!mailer) return shown('email_not_configured')
  const gate = emailGate(env, run.email)
  if (gate) return shown(gate)
  // The firm's opt-out list is honoured even here.
  if (await suppressionReason(db, { channel: 'email', address: run.email })) return shown('opted_out')
  const out = testEmail(msg, run, env)
  let res
  try {
    res = await mailer.send({ to: run.email, ...out, idempotencyKey: `cm-test-auto-${run.id}-ack` })
  } catch (err) {
    res = { ok: false, error: err?.name || 'mailer_error' }
  }
  if (!res?.ok) return { state: 'failed', outcome: 'send_failed', event: { kind: 'failed', ...base, detail: { template: 'lead_ack_email', language: msg.language, reason: 'send_failed', error: String(res?.error || 'error').slice(0, 200) } } }
  return done('sent', { kind: 'sent', ...base, subject: out.subject, detail: { template: 'lead_ack_email', language: msg.language, providerId: res.id || null, replyTo: out.replyTo } })
}

// A text message: shown, and really sent only when the administrator
// ticked it for this test. Then to the test's own phone, from the firm's
// RingCentral number, starting "[TEST]". Never tried twice (the step is
// claimed before this runs and is not run again, whatever RingCentral says).
async function runText(db, run, step, templateKey, { settings, sms, env, now }) {
  if (!phoneKey(run.phone)) return skipped('no_phone', { channel: 'sms' })
  if (settings.ack.smsRequiresFormConsent && !run.sms_consent) return skipped('no_sms_consent', { channel: 'sms', recipient: run.phone })
  const msg = renderTemplate(settings.templates, templateKey, languageFor(run), messageVars(run, settings, ALL_ON))
  const base = { channel: 'sms', recipient: run.phone, body: msg.text }
  const shown = (reason, extra = {}) => done('simulated', { kind: 'simulated', ...base, detail: { template: templateKey, language: msg.language, reason, ...extra } })
  if (!run.send_sms) return shown('texts_not_requested')
  const digits = phoneDigits(run.phone)
  if (!digits) return shown('invalid_address')
  if (!inCountries(digits, settings.texting.countries)) return shown('country_not_allowed')
  const gate = phoneGate(env, phoneKey(digits))
  if (gate) return shown(gate)
  // The firm's opt-out list is honoured even here.
  if (await suppressionReason(db, { channel: 'sms', address: `+${digits}` })) return shown('opted_out')
  if (!sms) return shown('sms_not_configured')
  if (await sms.backoffUntil(now)) return shown('ringcentral_asked_to_wait')
  const cap = await sms.capability({ now })
  if (!cap.available) return shown('sms_unavailable', { why: cap.reason || null })
  const text = `[TEST] ${msg.text}`
  let res
  try {
    res = await sms.send({ from: cap.sender, to: `+${digits}`, text }, { now })
  } catch {
    res = { ok: false, outcome: 'unknown', code: 'exception' }
  }
  const detail = { template: templateKey, language: msg.language, from: cap.sender }
  if (res?.ok) return done('sent', { kind: 'sent', ...base, body: text, detail: { ...detail, providerId: res.id || null, status: res.status || null } })
  // 'unknown': it may have gone. Either way it is not sent again.
  const outcome = res?.outcome === 'unknown' ? 'unknown_delivery' : 'send_failed'
  return { state: 'failed', outcome, event: { kind: 'failed', ...base, body: text, detail: { ...detail, reason: outcome, error: String(res?.code || 'error').slice(0, 80) } } }
}

async function runEscalation(db, run, step, { env, pushOptions, log }) {
  const level = Number(step.payload?.level) === 2 ? 2 : 1
  const claimed = await db.query('UPDATE test_automation_runs SET escalation_level = $2 WHERE id = $1 AND escalation_level < $2 RETURNING id', [run.id, level])
  if (!claimed.rowCount) return done('already_escalated', null)
  const alert = ALERTS.lead[level]
  let notified = 'nobody'
  // Only the administrator who started the test, and only when they asked.
  if (run.notify_starter && run.started_by != null && run.starter_email) {
    try {
      await sendPush(db, {
        accountId: Number(run.started_by),
        eventKey: `test-auto:${run.id}:escalation:${level}`,
        title: `TEST: ${alert.title}`,
        body: `Test mode, no production actions. This is the level ${level} escalation notice from your automation test.`,
        url: `/test-channel?test=${run.test_submission_id}`,
        tag: `cm-test-auto-${run.id}`,
      }, { env, ...pushOptions })
      notified = 'starter_only'
    } catch (err) {
      log?.warn?.({ err: { name: err?.name, code: err?.code } }, 'Test escalation notice failed')
      notified = 'starter_failed'
    }
  }
  return done(`level_${level}`, { kind: 'simulated', subject: alert.title, body: alert.body, detail: { level, notified } })
}

async function setTestStatus(db, run, to, reason, { auto = true, actorId = null } = {}) {
  const r = await db.query(
    'UPDATE test_automation_runs SET lead_status = $2, status_reason = $3 WHERE id = $1 AND lead_status <> $2 RETURNING id', [run.id, to, reason]
  )
  if (!r.rowCount) return false
  await logEvent(db, { runId: run.id, kind: 'status', detail: { from: run.lead_status, to, reason, auto }, actorId })
  run.lead_status = to
  return true
}

async function runNoResponse(db, run) {
  const steps = (await db.query("SELECT state, outcome FROM test_automation_steps WHERE run_id = $1 AND type LIKE 'followup:%'", [run.id])).rows
  const went = steps.filter((s) => s.state === 'done').length
  // No response only when the sequence really ran, as for a lead.
  if (!went || went < steps.length) return skipped('sequence_not_completed')
  await setTestStatus(db, run, 'no_response', 'follow_up_sequence_completed')
  return done('no_response', null)
}

async function executeStep(db, step, ctx) {
  const run = await loadRun(db, 'run', step.run_id)
  if (!run) return { state: 'cancelled', outcome: 'test_gone', event: null }
  const stop = testStop(run, step.type)
  if (stop) return { state: 'cancelled', outcome: stop, event: { kind: 'cancelled', detail: { reason: stop, steps: [step.type] } } }
  if (step.type === 'ack_email') return runAckEmail(db, run, ctx)
  if (step.type === 'ack_sms') return runText(db, run, step, 'lead_ack_sms', ctx)
  if (isFollowup(step.type)) return runText(db, run, step, step.payload?.templateKey, ctx)
  if (step.type === 'escalation_1' || step.type === 'escalation_2') return runEscalation(db, run, step, ctx)
  if (step.type === 'no_response') return runNoResponse(db, run)
  return skipped('unknown_step')
}

async function closeIfFinished(db, runId, now) {
  await db.query(
    `UPDATE test_automation_runs SET ended_at = $2 WHERE id = $1 AND ended_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM test_automation_steps WHERE run_id = $1 AND state IN ('pending', 'running'))`,
    [runId, now]
  )
}

/**
 * Run every test step that is due. Each step is claimed by one process (a
 * step is never run twice), looks at its test again right before acting,
 * and writes what it did to the test history. A step cut off mid-way is
 * marked failed and never run again, so a test email or text cannot go out twice.
 * Returns [{ runId, type, state, outcome }].
 */
export async function runDueTestSteps(db, { now = new Date(), mailer = null, sms = null, env = process.env, pushOptions = {}, log = null, limit = 25 } = {}) {
  if (!testAutomationOn(env)) return []
  const stuck = (await db.query(
    `UPDATE test_automation_steps SET state = 'failed', outcome = 'interrupted', finished_at = $1
      WHERE state = 'running' AND started_at < $1::timestamptz - INTERVAL '${INTERRUPTED_AFTER}' RETURNING run_id, type`,
    [now]
  )).rows
  for (const s of stuck) {
    await logEvent(db, { runId: s.run_id, kind: 'failed', step: s.type, detail: { reason: 'interrupted' } })
    await closeIfFinished(db, s.run_id, now)
  }

  const out = []
  let settings = null
  for (let i = 0; i < limit; i++) {
    const step = (await db.query(
      `UPDATE test_automation_steps SET state = 'running', started_at = $1
        WHERE id = (SELECT id FROM test_automation_steps WHERE state = 'pending' AND due_at <= $1 ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, run_id, type, payload`,
      [now]
    )).rows[0]
    if (!step) break
    settings ||= await loadSettings(db)
    let result
    try {
      result = await executeStep(db, step, { settings, mailer, sms, env, now, pushOptions, log })
    } catch (err) {
      log?.warn?.({ err: { name: err?.name, code: err?.code }, step: step.type }, 'Test automation step failed')
      result = { state: 'failed', outcome: 'error', event: { kind: 'failed', detail: { reason: 'error', error: String(err?.code || err?.name || 'error').slice(0, 80) } } }
    }
    await db.query("UPDATE test_automation_steps SET state = $2, outcome = $3, finished_at = $4 WHERE id = $1 AND state = 'running'", [step.id, result.state, result.outcome, now])
    if (result.event) await logEvent(db, { runId: step.run_id, step: step.type, ...result.event })
    await closeIfFinished(db, step.run_id, now)
    out.push({ runId: step.run_id, type: step.type, state: result.state, outcome: result.outcome })
  }
  return out
}

// --- what the administrator pretends happened -----------------------------------------

async function cancelSteps(db, run, reason, now, { only = null, actorId = null } = {}) {
  const rows = (await db.query(
    `UPDATE test_automation_steps SET state = 'cancelled', outcome = $2, finished_at = $3
      WHERE run_id = $1 AND state = 'pending' ${only === 'followups' ? "AND (type LIKE 'followup:%' OR type = 'no_response')" : ''} RETURNING type`,
    [run.id, reason, now]
  )).rows
  if (rows.length) await logEvent(db, { runId: run.id, kind: 'cancelled', detail: { reason, steps: rows.map((r) => r.type) }, actorId })
  return rows.length
}

/**
 * One of the buttons on a test:
 *   client_replied       the person answered a text: follow-ups stop, the
 *                        escalation stays (a reply still needs a person),
 *                        and the status moves only if the firm's setting says so
 *   consultation_booked  a booking was found: everything stops, Scheduled
 *   mark_contacted / mark_closed   a person changed the status: everything stops
 *   run_next             do the next waiting step now instead of when it is due
 */
export async function testAction(db, { testId, action, by = null, now = new Date(), env = process.env }) {
  if (!testAutomationOn(env)) throw new TestAutomationError('test_automation_off', 'Test automation is switched off on this server', 409)
  if (!ACTIONS.includes(action)) throw new TestAutomationError('bad_action', 'Unknown test action')
  const run = await loadRun(db, 'test', testId)
  if (!run) throw new TestAutomationError('no_test_run', 'This test form has no automation test', 404)

  if (action === 'run_next') {
    const next = (await db.query(
      `UPDATE test_automation_steps SET due_at = LEAST(due_at, $2)
        WHERE id = (SELECT id FROM test_automation_steps WHERE run_id = $1 AND state = 'pending' ORDER BY due_at, id LIMIT 1) RETURNING type`,
      [run.id, now]
    )).rows[0]
    if (!next) throw new TestAutomationError('nothing_pending', 'Nothing is waiting to run in this test', 409)
    await logEvent(db, { runId: run.id, kind: 'action', step: next.type, detail: { action }, actorId: by })
    return { ok: true, step: next.type }
  }

  await logEvent(db, { runId: run.id, kind: 'action', detail: { action }, actorId: by })
  if (action === 'client_replied') {
    await db.query('UPDATE test_automation_runs SET replied_at = COALESCE(replied_at, $2) WHERE id = $1', [run.id, now])
    await cancelSteps(db, run, 'client_replied_by_text', now, { only: 'followups', actorId: by })
    const settings = await loadSettings(db)
    if (settings.status.contactedOnClientReply && run.lead_status === 'new' && await setTestStatus(db, run, 'contacted', 'client_replied_by_text')) {
      await cancelSteps(db, run, 'status_contacted', now, { actorId: by })
    }
  } else if (action === 'consultation_booked') {
    await db.query('UPDATE test_automation_runs SET booked_at = COALESCE(booked_at, $2) WHERE id = $1', [run.id, now])
    await cancelSteps(db, run, 'consultation_booked', now, { actorId: by })
    if (['new', 'contacted', 'no_response'].includes(run.lead_status)) await setTestStatus(db, run, 'scheduled', 'consultation_booked')
  } else {
    const to = action === 'mark_closed' ? 'closed' : 'contacted'
    if (await setTestStatus(db, run, to, 'marked_by_staff', { auto: false, actorId: by })) await cancelSteps(db, run, `status_${to}`, now, { actorId: by })
  }
  await closeIfFinished(db, run.id, now)
  return { ok: true }
}

// --- reading --------------------------------------------------------------------------

const eventJson = (e) => ({
  id: Number(e.id), kind: e.kind, step: e.step, channel: e.channel, recipient: e.recipient, subject: e.subject, body: e.body,
  detail: e.detail, at: e.created_at, by: e.actor_name || null,
  ...(e.test_id !== undefined ? { testId: e.test_id, testName: e.test_name || null } : {}),
})

const ACTOR = "COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1))"

/** One test form's automation test: its pretend status, its steps and its history. Or null. */
export async function describeTestRun(db, testId) {
  const run = (await db.query('SELECT * FROM test_automation_runs WHERE test_submission_id = $1', [testId])).rows[0]
  if (!run) return null
  const steps = (await db.query('SELECT id, type, payload, due_at, state, outcome, finished_at FROM test_automation_steps WHERE run_id = $1 ORDER BY due_at, id', [run.id])).rows
  const events = (await db.query(
    `SELECT e.*, ${ACTOR} AS actor_name FROM test_automation_events e LEFT JOIN admin_users u ON u.id = e.actor_id WHERE e.run_id = $1 ORDER BY e.id`, [run.id]
  )).rows
  return {
    id: run.id, timing: run.timing, sendEmail: run.send_email, sendSms: run.send_sms, notifyMe: run.notify_starter,
    leadStatus: run.lead_status, statusReason: run.status_reason, escalationLevel: run.escalation_level,
    repliedAt: run.replied_at, bookedAt: run.booked_at, startedAt: run.started_at, endedAt: run.ended_at,
    steps: steps.map((s) => ({ id: s.id, type: s.type, level: s.payload?.level || null, dueAt: s.due_at, state: s.state, outcome: s.outcome, finishedAt: s.finished_at })),
    events: events.map(eventJson),
  }
}

/** The test history across every test, newest first. */
export async function testHistory(db, { limit = 100 } = {}) {
  return (await db.query(
    `SELECT e.*, ${ACTOR} AS actor_name, r.test_submission_id AS test_id, NULLIF(TRIM(t.first_name || ' ' || t.last_name), '') AS test_name
       FROM test_automation_events e
       LEFT JOIN admin_users u ON u.id = e.actor_id
       LEFT JOIN test_automation_runs r ON r.id = e.run_id
       LEFT JOIN test_submissions t ON t.id = r.test_submission_id
      ORDER BY e.id DESC LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 100, 1), 300)]
  )).rows.map(eventJson)
}

/** Tests with something still waiting to run, soonest first. */
export async function pendingTests(db) {
  return (await db.query(
    `SELECT r.test_submission_id AS test_id, NULLIF(TRIM(t.first_name || ' ' || t.last_name), '') AS test_name, r.timing, r.lead_status,
            COUNT(*)::int AS pending, MIN(s.due_at) AS next_due_at,
            (ARRAY_AGG(s.type ORDER BY s.due_at, s.id))[1] AS next_step
       FROM test_automation_steps s
       JOIN test_automation_runs r ON r.id = s.run_id
       JOIN test_submissions t ON t.id = r.test_submission_id
      WHERE s.state = 'pending'
      GROUP BY r.id, t.first_name, t.last_name ORDER BY MIN(s.due_at)`
  )).rows.map((r) => ({ testId: r.test_id, testName: r.test_name, timing: r.timing, leadStatus: r.lead_status, pending: r.pending, nextDueAt: r.next_due_at, nextStep: r.next_step }))
}

export default {
  TEST_BANNER, TIMINGS, ACTIONS, testAutomationOn, planTestSteps, startTestRun, createPortalTest, runDueTestSteps, testAction,
  describeTestRun, testHistory, pendingTests, getTestPrefs, saveTestPrefs, noteTestsRemoved, emailGate, phoneGate, leadsWithAddress, peopleWithPhone,
}
