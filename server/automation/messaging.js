// The one way an automatic message leaves the firm. Every automation that
// writes to someone outside (an acknowledgment, a follow-up, a missed-call
// text) goes through deliver(), so the same checks run every time, in this
// order, right before the send:
//
//   1. the address is one that can receive on this channel
//   2. it is not on the opt-out list (suppression.js)
//   3. outside production nothing goes anywhere except the addresses in
//      AUTOMATION_TEST_RECIPIENTS; in production that list, when set, limits
//      sending to those addresses (a staged rollout)
//   4. texts only: replies have been read in the last half hour (a reply or
//      a STOP the portal cannot see is one it cannot honour), inside the
//      texting hours, under the per-minute limit, not while RingCentral
//      asked us to wait, and from a number RingCentral allows
//   5. the message row is written (automation_messages, UNIQUE on the job's
//      key) BEFORE the provider is called. With `dedupe`, in the same
//      transaction and under a lock on the recipient, it is first checked
//      that this person has not had a message of this kind lately — so two
//      leads from one person, taken by two workers at the same moment,
//      still produce one message
//
// Step 5 is what makes a send happen once. If the process dies between the
// row and the provider's answer, the next run finds the row still 'sending':
//   email  is sent again with the same Resend idempotency key, which Resend
//          honours for 24 hours, so the person gets one email
//   text   RingCentral has no such key, so the outcome is 'unknown': the job
//          fails for a person to look at and is never sent again by itself
import { looksLikeEmail, clientFrom, clientReplyTo } from '../reminders/email.js'
import { phoneDigits, phoneKey, inCountries } from '../utils/phone.js'
import { isProductionEnv } from '../utils/productionEnv.js'
import { suppressionReason, suppress } from './suppression.js'
import { renderTemplate } from './templates.js'
import { textingHours } from './settings.js'
import { isBusinessTime, nextBusinessTime } from './businessHours.js'
import { recordSystemEvent } from './events.js'
import { enqueue } from './jobs.js'
import { deliveryErrorKind } from '../integrations/ringcentral/sms.js'
import { inboundFresh } from './smsInbound.js'
import { inTransaction } from '../db/transaction.js'

/** AUTOMATION_TEST_RECIPIENTS as { emails:Set, phones:Set }, or null when unset. */
export function testRecipients(env = process.env) {
  const raw = String(env.AUTOMATION_TEST_RECIPIENTS ?? '').trim()
  if (!raw) return null
  const emails = new Set()
  const phones = new Set()
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part.includes('@')) emails.add(part.toLowerCase())
    else if (phoneKey(part)) phones.add(phoneKey(part))
  }
  return { emails, phones }
}

// Why this address may not be written to from this process, or null.
function recipientGate(env, channel, key) {
  const list = testRecipients(env)
  if (list) return (channel === 'email' ? list.emails : list.phones).has(key) ? null : 'not_a_test_recipient'
  return isProductionEnv(env) ? null : 'not_production'
}

const done = (outcome) => ({ status: 'done', outcome })
const skipped = (outcome) => ({ status: 'skipped', outcome })

/**
 * Send one automatic message for a job. Returns a job result (jobs.js).
 *
 *   job          the automation_jobs row (its idempotency key is the message's)
 *   channel      'email' | 'sms'
 *   purpose      'lead_ack' | 'lead_followup' | 'missed_call'
 *   to           the address as stored (an email, or a phone number)
 *   templateKey, language, vars   what to say (templates.js)
 *   event        the activity-log action to record when it is sent
 *   anyHour      texts only: may go outside the texting hours
 *   dedupe       { since, reason, otherEntityOnly? }: skip (with `reason`)
 *                when this address already had a message of this purpose
 *                since then; otherEntityOnly counts only other leads' messages
 * ctx: { env, settings, mailer, sms, now, log, budget: { sms } }
 */
export async function deliver(db, { job, channel, purpose, entityType, entityId, to, templateKey, language, vars = {}, event, anyHour = false, dedupe = null }, ctx) {
  const { env = process.env, settings, mailer = null, sms = null, log = null } = ctx
  const now = ctx.now || new Date()
  const logEvent = (action, outcome, details) => recordSystemEvent(db, { action, entityType, entityId, outcome, details: { channel, purpose, ...details }, log })
  const skip = async (reason) => { await logEvent('automation.message_skipped', 'ok', { reason }); return skipped(reason) }

  // 1. the address
  let address
  let key
  if (channel === 'email') {
    address = String(to ?? '').trim()
    key = address.toLowerCase()
    if (!looksLikeEmail(address)) return skip('invalid_address')
  } else {
    const digits = phoneDigits(to)
    if (!digits || !inCountries(digits, settings.texting.countries)) return skip(digits ? 'country_not_allowed' : 'invalid_address')
    address = `+${digits}`
    key = phoneKey(digits)
  }

  // 2. opt-outs, 3. where this process may send
  const suppressedBy = await suppressionReason(db, { channel, address })
  if (suppressedBy) return skip(`suppressed_${suppressedBy}`)
  const gate = recipientGate(env, channel, key)
  if (gate) return skip(gate)

  // 4. texts: hours, pace, RingCentral's own limits, an allowed sender
  let sender = null
  if (channel === 'sms') {
    if (!sms) return { status: 'retry', error: 'sms_not_configured' }
    // Not while replies are not being read. Waits; the caller's own "too
    // late" rule ends it if this goes on.
    if (!(await inboundFresh(db, now))) return { status: 'defer', runAt: new Date(now.getTime() + 15 * 60 * 1000), outcome: 'replies_not_read' }
    const hours = textingHours(settings)
    if (!anyHour && !isBusinessTime(now, hours)) return { status: 'defer', runAt: nextBusinessTime(now, hours) }
    const wait = await sms.backoffUntil(now)
    if (wait) return { status: 'defer', runAt: wait }
    if (ctx.budget && ctx.budget.sms <= 0) return { status: 'defer', runAt: new Date(now.getTime() + 60 * 1000) }
    const cap = await sms.capability({ now })
    if (!cap.available) return { status: 'retry', error: `sms_unavailable:${cap.reason}`, outcome: 'sms_unavailable' }
    sender = cap.sender
  } else if (!mailer) {
    return { status: 'retry', error: 'email_not_configured', outcome: 'email_not_configured' }
  }

  // 5. the message row, before the provider
  const msgKey = job.idempotency_key
  const insertRow = (c) => c.query(
    `INSERT INTO automation_messages (job_id, channel, purpose, entity_type, entity_id, to_key, template_key, language, idempotency_key, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sending', $10) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, status, attempts`,
    [job.id, channel, purpose, entityType, entityId == null ? null : String(entityId), key, templateKey, language, msgKey, now]
  )
  let row
  if (dedupe) {
    // One at a time per recipient and purpose, so the check and the row are
    // one step even with two workers.
    const claimed = await inTransaction(db, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('cm_auto_msg:' || $1 || ':' || $2 || ':' || $3))", [purpose, channel, key])
      const already = await c.query(
        `SELECT 1 FROM automation_messages
          WHERE to_key = $1 AND purpose = $2 AND channel = $3 AND status IN ('sending', 'sent', 'unknown') AND created_at >= $4
            AND idempotency_key <> $5 AND ($6::boolean IS NOT TRUE OR entity_id IS DISTINCT FROM $7) LIMIT 1`,
        [key, purpose, channel, dedupe.since, msgKey, Boolean(dedupe.otherEntityOnly), entityId == null ? null : String(entityId)]
      )
      if (already.rowCount) return { duplicate: true }
      return { row: (await insertRow(c)).rows[0] }
    })
    if (claimed.duplicate) return skip(dedupe.reason)
    row = claimed.row
  } else {
    row = (await insertRow(db)).rows[0]
  }
  if (!row) {
    const existing = (await db.query('SELECT id, status, provider_id FROM automation_messages WHERE idempotency_key = $1', [msgKey])).rows[0]
    if (existing.status === 'sent') return done('already_sent')
    if (existing.status === 'unknown') return { status: 'failed', outcome: 'unknown_delivery', error: 'An earlier attempt may have been delivered' }
    if (existing.status === 'sending' && channel === 'sms') {
      // An interrupted text: it may have gone. Never sent again automatically.
      await db.query("UPDATE automation_messages SET status = 'unknown', error = 'interrupted', updated_at = NOW() WHERE id = $1 AND status = 'sending'", [existing.id])
      await logEvent('automation.message_failed', 'failed', { reason: 'unknown_delivery' })
      return { status: 'failed', outcome: 'unknown_delivery', error: 'The send was interrupted; check RingCentral before sending again' }
    }
    // A definite failure being tried again, or an interrupted email (safe:
    // same idempotency key at Resend).
    row = (await db.query(
      "UPDATE automation_messages SET status = 'sending', attempts = attempts + 1, error = NULL, updated_at = NOW() WHERE id = $1 AND status IN ('failed', 'sending') RETURNING id, status, attempts",
      [existing.id]
    )).rows[0]
    if (!row) return { status: 'retry', error: 'message_row_busy' }
  }

  const msg = renderTemplate(settings.templates, templateKey, language, vars)
  const settle = (status, { providerId = null, error = null } = {}) => db.query(
    "UPDATE automation_messages SET status = $2, provider_id = COALESCE($3, provider_id), error = $4, updated_at = NOW() WHERE id = $1 AND status = 'sending'",
    [row.id, status, providerId, error ? String(error).slice(0, 200) : null]
  )

  if (channel === 'email') {
    let res
    try {
      res = await mailer.send({ to: address, subject: msg.subject, html: msg.html, text: msg.text, idempotencyKey: `cm-auto-${msgKey}`, from: clientFrom(env), replyTo: clientReplyTo(env) })
    } catch (err) {
      res = { ok: false, error: err?.message || 'mailer error', transient: true }
    }
    if (res?.ok) {
      await settle('sent', { providerId: res.id || null })
      await logEvent(event, 'ok', { template: templateKey, language: msg.language })
      return done('sent')
    }
    await settle('failed', { error: res?.error || 'send failed' })
    if (res?.transient) return { status: 'retry', error: res.error || 'send failed', outcome: 'email_failed' }
    await logEvent('automation.message_failed', 'failed', { reason: 'rejected' })
    return { status: 'failed', outcome: 'email_rejected', error: res?.error || 'send failed' }
  }

  // A text.
  if (ctx.budget) ctx.budget.sms -= 1
  let res
  try {
    res = await sms.send({ from: sender, to: address, text: msg.text }, { now })
  } catch (err) {
    res = { ok: false, outcome: 'unknown', code: 'exception' }
  }
  if (res.ok) {
    await settle('sent', { providerId: res.id })
    await logEvent(event, 'ok', { template: templateKey, language: msg.language })
    // RingCentral accepting it is not delivery: look at the record later.
    await enqueue(db, { type: 'sms_delivery_check', key: `sms-delivery:${row.id}`, entityType, entityId, runAt: new Date(now.getTime() + 10 * 60 * 1000), payload: { messageRowId: Number(row.id), check: 1 }, maxAttempts: 2 })
    return done('sent')
  }
  if (res.outcome === 'unknown') {
    await settle('unknown', { error: res.code })
    await logEvent('automation.message_failed', 'failed', { reason: 'unknown_delivery' })
    return { status: 'failed', outcome: 'unknown_delivery', error: `Delivery could not be confirmed (${res.code})` }
  }
  await settle('failed', { error: res.code, providerId: res.id || null })
  if (res.retryable) return { status: 'defer', runAt: new Date(now.getTime() + (res.retryAfterMs || 60 * 1000)) }
  const kind = deliveryErrorKind(res.code)
  if (kind) await suppress(db, { channel: 'sms', address, reason: kind, source: 'ringcentral' })
  await logEvent('automation.message_failed', 'failed', { reason: res.code })
  return { status: 'failed', outcome: 'sms_rejected', error: res.code }
}

/**
 * The 'sms_delivery_check' job: what became of a text RingCentral accepted.
 * A failure is recorded on the message (and an opt-out or an unreachable
 * number goes on the list); no receipt after three looks leaves it 'sent'.
 */
export async function checkSmsDelivery(db, job, ctx) {
  const { sms = null, log = null } = ctx
  const now = ctx.now || new Date()
  const row = (await db.query('SELECT * FROM automation_messages WHERE id = $1', [job.payload?.messageRowId])).rows[0]
  if (!row || row.status !== 'sent' || !row.provider_id || !sms) return skipped('nothing_to_check')
  const rec = await sms.delivery(row.provider_id)
  // The record could not be read (no permission, RingCentral busy): that
  // says nothing about the text, so it is never shown as a failed message.
  if (!rec) return job.attempts < job.max_attempts ? { status: 'retry', error: 'record_unavailable' } : skipped('record_unavailable')
  if (rec.status === 'Delivered') {
    await db.query("UPDATE automation_messages SET error = NULL, updated_at = NOW() WHERE id = $1", [row.id])
    return done('delivered')
  }
  if (rec.status === 'DeliveryFailed' || rec.status === 'SendingFailed') {
    const code = rec.deliveryErrorCode || rec.status
    await db.query("UPDATE automation_messages SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1", [row.id, code])
    const kind = deliveryErrorKind(code)
    if (kind) {
      await suppress(db, { channel: 'sms', address: row.to_key, reason: kind, source: 'ringcentral' })
      if (kind === 'opt_out') await recordSystemEvent(db, { action: 'automation.opt_out', entityType: row.entity_type, entityId: row.entity_id, details: { channel: 'sms', source: 'ringcentral' }, log })
    }
    await recordSystemEvent(db, { action: 'automation.message_failed', entityType: row.entity_type, entityId: row.entity_id, outcome: 'failed', details: { channel: 'sms', purpose: row.purpose, reason: code }, log })
    // The job that sent it is the exception a person sees.
    await db.query("UPDATE automation_jobs SET status = 'failed', outcome = 'not_delivered', last_error = $2, acknowledged_at = NULL, updated_at = NOW() WHERE id = $1 AND status = 'done'", [row.job_id, code])
    return done('not_delivered')
  }
  const check = Number(job.payload?.check) || 1
  if (check < 3) {
    await enqueue(db, { type: 'sms_delivery_check', key: `sms-delivery:${row.id}:${check + 1}`, entityType: row.entity_type, entityId: row.entity_id, runAt: new Date(now.getTime() + 60 * 60 * 1000), payload: { messageRowId: Number(row.id), check: check + 1 }, maxAttempts: 2 })
  }
  return done('no_receipt_yet')
}

/**
 * Has this address had an automatic message of this purpose since `since`?
 * exceptKey: not counting this job's own message (a retry of itself).
 */
export async function recentlyMessaged(db, { toKey, purpose, since, exceptKey = null, channel = null }) {
  if (!toKey) return false
  const r = await db.query(
    `SELECT 1 FROM automation_messages
      WHERE to_key = $1 AND purpose = $2 AND status IN ('sending', 'sent', 'unknown') AND created_at >= $3
        AND ($4::text IS NULL OR idempotency_key <> $4::text) AND ($5::text IS NULL OR channel = $5::text) LIMIT 1`,
    [toKey, purpose, since, exceptKey, channel]
  )
  return r.rowCount > 0
}

export default { deliver, checkSmsDelivery, recentlyMessaged, testRecipients }
