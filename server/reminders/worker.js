// Delivers callback reminders when they fall due: one email and one desktop
// notification per reminder (per time it becomes due), with nobody needing
// the portal open. index.js runs it once at boot and then every minute.
//
// Safe with several API processes at once, and across restarts, because
// every step is decided in the database:
//   1. claim    open reminders whose time has come become 'due' (a new
//               cycle) and get one 'pending' delivery row per channel, in
//               one transaction, rows locked FOR UPDATE SKIP LOCKED: two
//               workers never claim the same reminder, and the UNIQUE key
//               on reminder_deliveries means a row is only ever created once.
//   2. deliver  each pending row is taken by moving it to 'sending'
//               (SKIP LOCKED again), so only one worker sends it. Right
//               before sending, the reminder must still be due in that
//               cycle, its caller or lead must still need someone (if not,
//               the reminder is closed as resolved and nothing is sent), and
//               the person must be active with an email address.
//   3. retry    a transient email failure records the attempt and adds the
//               next one after 1, 5, 15, then 60 minutes; after the fifth
//               attempt it stays 'failed', shown on the reminder. A
//               notification that reached none of the person's computers
//               (each failed, none expired for good) is tried the same way,
//               three attempts in all; sendPush sends again only to the
//               computers that failed.
//   4. recover  a row left 'sending' by a crash is tried again after 10
//               minutes. Email carries a per-reminder idempotency key, so
//               Resend sends it once even then (for 24 hours); sendPush
//               never sends the same event to the same computer twice.
// Nothing is emailed when a reminder is viewed or edited: only this sends.
//
// Time: `now` is for tests (a fixed instant). Without it every step reads
// the database's clock as it runs, so a slow send never makes the rows taken
// after it look older than they are.
import { sendPush, CALLBACK_REMINDER } from '../push/send.js'
import { renderReminderEmail, emailAllowlist, looksLikeEmail } from './email.js'
import { targetStillOpen, targetPath, markResolved, closeResolvedReminders } from './reminders.js'
import { inTransaction } from '../db/transaction.js'

export const EMAIL_BACKOFF_MINUTES = Object.freeze([1, 5, 15, 60])
export const MAX_EMAIL_ATTEMPTS = EMAIL_BACKOFF_MINUTES.length + 1
export const MAX_PUSH_ATTEMPTS = 3
export const STUCK_SENDING_MS = 10 * 60 * 1000
const CLAIM_BATCH = 100
const DELIVER_BATCH = 200

/** Minutes before attempt n + 1, or null when attempt n was the last. */
export const backoffAfter = (attempt) => (attempt >= 1 && attempt < MAX_EMAIL_ATTEMPTS ? EMAIL_BACKOFF_MINUTES[attempt - 1] : null)

/** REMINDER_OVERDUE_EMAIL_MINUTES as a positive number of minutes, or null (off). */
export function overdueMinutes(env = process.env) {
  const n = Number(env.REMINDER_OVERDUE_EMAIL_MINUTES)
  return env.REMINDER_OVERDUE_EMAIL_MINUTES && Number.isFinite(n) && n > 0 ? n : null
}

// $n as a time: the fixed test instant, or the database's NOW().
const AT = (n) => `COALESCE($${n}::timestamptz, NOW())`

/** Step 1: open reminders that are due → 'due', with their pending deliveries. Returns the ids. */
export async function claimDue(db, { now = null } = {}) {
  return inTransaction(db, async (c) => {
    const claimed = (await c.query(
      `WITH due AS (
         SELECT id FROM follow_up_reminders WHERE status = 'open' AND due_at <= ${AT(1)} ORDER BY due_at, id LIMIT ${CLAIM_BATCH} FOR UPDATE SKIP LOCKED)
       UPDATE follow_up_reminders r SET status = 'due', cycle = r.cycle + 1, updated_at = NOW()
         FROM due WHERE r.id = due.id RETURNING r.id, r.cycle`,
      [now]
    )).rows
    if (claimed.length) {
      await c.query(
        `INSERT INTO reminder_deliveries (reminder_id, cycle, kind, channel, attempt, status, next_attempt_at)
         SELECT x.id, x.cycle, 'due', ch.channel, 1, 'pending', ${AT(3)}
           FROM unnest($1::bigint[], $2::int[]) AS x(id, cycle) CROSS JOIN (VALUES ('email'), ('push')) AS ch(channel)
         ON CONFLICT DO NOTHING`,
        [claimed.map((r) => r.id), claimed.map((r) => r.cycle), now]
      )
    }
    return claimed.map((r) => Number(r.id))
  })
}

/** The optional overdue email: once per cycle, REMINDER_OVERDUE_EMAIL_MINUTES after it fell due. */
export async function queueOverdue(db, { now = null, minutes }) {
  if (!minutes) return 0
  const r = await db.query(
    `INSERT INTO reminder_deliveries (reminder_id, cycle, kind, channel, attempt, status, next_attempt_at)
     SELECT id, cycle, 'overdue', 'email', 1, 'pending', ${AT(1)} FROM follow_up_reminders
      WHERE status = 'due' AND due_at <= ${AT(1)} - make_interval(mins => $2::int)
     ON CONFLICT DO NOTHING`,
    [now, Math.round(minutes)]
  )
  return r.rowCount
}

/** Step 4: rows a crashed worker left 'sending' go back to 'pending'. */
export async function recoverStuck(db, { now = null } = {}) {
  const r = await db.query(
    `UPDATE reminder_deliveries SET status = 'pending', next_attempt_at = ${AT(1)}, error = 'retried after an interrupted send'
      WHERE status = 'sending' AND attempted_at < ${AT(1)} - make_interval(secs => $2::int)`,
    [now, STUCK_SENDING_MS / 1000]
  )
  return r.rowCount
}

// attempted_at is when this row is taken, not when the run started.
async function takeNext(db, now) {
  return (await db.query(
    `UPDATE reminder_deliveries SET status = 'sending', attempted_at = ${AT(1)}
      WHERE status = 'pending' AND id = (SELECT id FROM reminder_deliveries WHERE status = 'pending' AND next_attempt_at <= ${AT(1)}
                   ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [now]
  )).rows[0] || null
}

const finish = (db, id, status, { error = null, providerId = null } = {}) => db.query(
  'UPDATE reminder_deliveries SET status = $2, error = $3, provider_id = $4, finished_at = NOW() WHERE id = $1',
  [id, status, error ? String(error).slice(0, 300) : null, providerId]
)

/**
 * A transient failure: this attempt is recorded as failed and, unless it was
 * the last one for its channel, the next is queued after the backoff
 * (counted from now, after the failed send, not from the start of the run).
 */
async function failAndRetry(db, row, now, error, { transient = true } = {}) {
  const max = row.channel === 'push' ? MAX_PUSH_ATTEMPTS : MAX_EMAIL_ATTEMPTS
  const wait = transient && row.attempt < max ? backoffAfter(row.attempt) : null
  await finish(db, row.id, 'failed', { error: `${error}${wait ? '' : transient ? ' (gave up)' : ''}` })
  if (wait) {
    await db.query(
      `INSERT INTO reminder_deliveries (reminder_id, cycle, kind, channel, attempt, status, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', ${AT(6)} + make_interval(mins => $7::int)) ON CONFLICT DO NOTHING`,
      [row.reminder_id, row.cycle, row.kind, row.channel, row.attempt + 1, now, wait]
    )
  }
  return 'failed'
}

/**
 * Step 2 for one row. Returns the outcome (its final status), for the log
 * and the tests.
 */
async function deliverOne(db, row, { now, mailer, env, pushOptions }) {
  const r = (await db.query(
    `SELECT r.*, a.email AS a_email, a.disabled_at AS a_disabled FROM follow_up_reminders r
       JOIN admin_users a ON a.id = r.assigned_to WHERE r.id = $1`,
    [row.reminder_id]
  )).rows[0]
  // Done, cancelled or rescheduled since this row was made.
  if (!r || r.status !== 'due' || r.cycle !== row.cycle) {
    await finish(db, row.id, 'cancelled', { error: 'no longer due' })
    return 'cancelled'
  }
  // Dealt with meanwhile (a connected callback, marked handled, archived):
  // close it and send nothing.
  if (!(await targetStillOpen(db, r))) {
    await markResolved(db, r.id)
    await finish(db, row.id, 'cancelled', { error: 'resolved' })
    return 'resolved'
  }
  if (r.a_disabled) {
    await finish(db, row.id, 'skipped_disabled', { error: 'account disabled' })
    return 'skipped_disabled'
  }
  const path = targetPath(r)

  if (row.channel === 'push') {
    const eventKey = r.cycle > 1 ? `callback-reminder:${r.id}:${r.cycle}` : `callback-reminder:${r.id}`
    try {
      const out = await sendPush(db, { accountId: Number(r.assigned_to), eventKey, ...CALLBACK_REMINDER, url: path, tag: `callback-reminder:${r.id}` }, pushOptions)
      const outcomes = out.devices.map((d) => d.outcome)
      if (out.status === 'not_configured') { await finish(db, row.id, 'not_configured'); return 'not_configured' }
      if (out.status === 'no_devices') { await finish(db, row.id, 'no_devices'); return 'no_devices' }
      if (out.status === 'account_disabled') { await finish(db, row.id, 'skipped_disabled', { error: 'account disabled' }); return 'skipped_disabled' }
      if (out.status === 'no_account') { await finish(db, row.id, 'cancelled', { error: 'no account' }); return 'cancelled' }
      if (outcomes.some((o) => o === 'sent' || o === 'already_sent')) {
        const failed = outcomes.filter((o) => o === 'failed' || o === 'expired').length
        await finish(db, row.id, 'sent', { error: failed ? `${failed} of ${outcomes.length} computers failed` : null })
        return 'sent'
      }
      // Reached none of them. Worth another try while any failure could pass
      // (a push service that was busy); a computer that expired is gone.
      return failAndRetry(db, row, now, `every computer failed (${outcomes.join(', ')})`, { transient: outcomes.includes('failed') })
    } catch (err) {
      return failAndRetry(db, row, now, err?.message || 'push error')
    }
  }

  // Email.
  const to = String(r.a_email || '').trim()
  if (!looksLikeEmail(to)) {
    await finish(db, row.id, 'skipped_no_email', { error: to ? 'invalid email address' : 'no email address' })
    return 'skipped_no_email'
  }
  const allow = emailAllowlist(env)
  if (allow && !allow.has(to.toLowerCase())) {
    await finish(db, row.id, 'skipped_allowlist', { error: 'not on REMINDER_EMAIL_ALLOWLIST' })
    return 'skipped_allowlist'
  }
  if (!mailer) {
    await finish(db, row.id, 'not_configured', { error: 'email is not configured' })
    return 'not_configured'
  }
  const msg = renderReminderEmail({ path, overdue: row.kind === 'overdue', env })
  let res
  try {
    res = await mailer.send({ to, subject: msg.subject, html: msg.html, text: msg.text, idempotencyKey: `cm-reminder-${r.id}-${r.cycle}-${row.kind}` })
  } catch (err) {
    res = { ok: false, error: err?.message || 'mailer error', transient: true }
  }
  if (res?.ok) {
    await finish(db, row.id, 'sent', { providerId: res.id || null })
    return 'sent'
  }
  return failAndRetry(db, row, now, res?.error || 'send failed', { transient: Boolean(res?.transient) })
}

/** Step 2 for everything pending now. */
export async function deliverPending(db, { now = null, mailer = null, env = process.env, pushOptions = {}, log = null } = {}) {
  const results = []
  for (let i = 0; i < DELIVER_BATCH; i++) {
    const row = await takeNext(db, now)
    if (!row) break
    let outcome
    try {
      outcome = await deliverOne(db, row, { now, mailer, env, pushOptions })
    } catch (err) {
      // Never left 'sending' by an error of ours: recorded, and not retried blindly.
      await finish(db, row.id, 'failed', { error: err?.message || 'delivery error' }).catch(() => {})
      log?.warn({ reminder: Number(row.reminder_id), channel: row.channel, err: { name: err?.name, code: err?.code } }, 'Callback reminder delivery error')
      outcome = 'failed'
    }
    results.push({ reminderId: Number(row.reminder_id), channel: row.channel, kind: row.kind, attempt: row.attempt, outcome })
  }
  return results
}

/**
 * One run: close reminders whose follow-up was dealt with (sweep; index.js
 * asks for it every ten minutes, since each open episode costs a query and
 * a reminder is checked again right before anything is sent anyway), claim
 * what is due, queue overdue emails, recover interrupted sends, deliver.
 */
export async function runReminderWorker(db, { now = null, sweep = true, mailer = null, env = process.env, pushOptions = {}, log = null } = {}) {
  const resolved = sweep ? await closeResolvedReminders(db) : []
  const claimed = await claimDue(db, { now })
  const overdue = await queueOverdue(db, { now, minutes: overdueMinutes(env) })
  const recovered = await recoverStuck(db, { now })
  const delivered = await deliverPending(db, { now, mailer, env, pushOptions, log })
  return { resolved, claimed, overdue, recovered, delivered }
}
