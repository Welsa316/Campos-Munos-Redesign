// Reminder workflow over the database: evaluate → draft → approve → dispatch
// → receipts, plus the automatic cancellation pass.
//
// Safety rules, all enforced here on the server:
//   - Evaluation only ever creates DRAFTS. Nothing is sent without a staff
//     approval (approveReminders), and approval re-checks eligibility.
//   - The dispatcher sends only approved reminders, only inside the sending
//     window, only with WHATSAPP_SENDING_ENABLED=true for the real provider,
//     and re-checks eligibility right before each send.
//   - A message row is written before the provider is called. A send whose
//     outcome is uncertain becomes 'unknown' and is never resent
//     automatically; staff decide after checking the WhatsApp app.
//   - Claiming uses FOR UPDATE SKIP LOCKED, so two instances never send the
//     same reminder.
import {
  evaluateReminders, renderMessage, cancellationReason, sendingWindow, normalizePhone, relevantDueDate,
} from './reminders.js'
import { DEFAULT_RULES, DEFAULT_TEMPLATES, PENDING_STATES } from './reminderModel.js'
import { whatsappSendingEnabled } from './providers/whatsapp/index.js'
import { fromInvoiceRow, todayInFirmTz } from './importService.js'
import { audit } from './audit.js'
import { applyEarlyReceipts } from './whatsappInbound.js'

export const MAX_ATTEMPTS = 3
export const PENDING_SEND_TIMEOUT_MINUTES = 10
const DISPATCH_BATCH = 20

export class ReminderError extends Error {
  constructor(message, status = 400, code = 'reminder_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

// --- settings, rules, templates ----------------------------------------------------

export const DEFAULT_REMINDER_SETTINGS = {
  timeZone: 'America/Chicago', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, staleAfterDays: 10,
}

export async function getReminderSettings(db) {
  const row = (await db.query("SELECT value FROM billing_settings WHERE key = 'reminders'")).rows[0]
  return { ...DEFAULT_REMINDER_SETTINGS, ...(row?.value || {}) }
}

export async function saveReminderSettings(db, value, { actorId }) {
  const v = { ...DEFAULT_REMINDER_SETTINGS, ...value }
  const ok = Number.isInteger(v.startHour) && Number.isInteger(v.endHour) && v.startHour >= 0 && v.endHour <= 24 && v.startHour < v.endHour
    && Array.isArray(v.days) && v.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    && Number.isInteger(v.staleAfterDays) && v.staleAfterDays >= 1 && v.staleAfterDays <= 60
  if (!ok) throw new ReminderError('Check the sending hours, days and freshness limit')
  await db.query(
    `INSERT INTO billing_settings (key, value, updated_by) VALUES ('reminders', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [JSON.stringify(v), actorId]
  )
  await audit(db, { actorId, action: 'reminders.settings_saved', entityType: 'settings', entityId: 'reminders' })
  return v
}

/** Seed the example rules and templates (switched off) on first use. */
export async function ensureDefaults(db) {
  for (const r of DEFAULT_RULES) {
    await db.query(
      `INSERT INTO billing_reminder_rules (key, label, trigger, days, action, template_key, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (key) DO NOTHING`,
      [r.key, r.label, r.trigger, r.days, r.action, r.templateKey, r.enabled]
    )
  }
  for (const t of DEFAULT_TEMPLATES) {
    await db.query(
      `INSERT INTO billing_message_templates (key, meta_name, params, languages) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING`,
      [t.key, t.metaName, JSON.stringify(t.params), JSON.stringify(t.languages)]
    )
  }
}

export async function loadRules(db) {
  return (await db.query('SELECT * FROM billing_reminder_rules ORDER BY trigger DESC, days DESC')).rows.map((r) => ({
    key: r.key, label: r.label, trigger: r.trigger, days: r.days, action: r.action, templateKey: r.template_key, enabled: r.enabled,
  }))
}

export async function loadTemplates(db) {
  return (await db.query('SELECT * FROM billing_message_templates ORDER BY key')).rows.map((t) => ({
    key: t.key, metaName: t.meta_name, category: 'utility', params: t.params, languages: t.languages, metaApproved: t.meta_approved,
  }))
}

export async function saveRule(db, key, patch, { actorId }) {
  const cur = (await db.query('SELECT * FROM billing_reminder_rules WHERE key = $1', [key])).rows[0]
  if (!cur) throw new ReminderError('Rule not found', 404, 'not_found')
  const days = patch.days ?? cur.days
  const enabled = patch.enabled ?? cur.enabled
  if (!Number.isInteger(days) || days < 0 || days > 60) throw new ReminderError('Days must be between 0 and 60')
  if (cur.action === 'whatsapp' && enabled) {
    const t = (await db.query('SELECT meta_approved FROM billing_message_templates WHERE key = $1', [cur.template_key])).rows[0]
    if (!t) throw new ReminderError('This rule has no message template', 409, 'no_template')
  }
  await db.query(
    'UPDATE billing_reminder_rules SET days = $2, enabled = $3, label = $4, updated_by = $5, updated_at = NOW() WHERE key = $1',
    [key, days, enabled, patch.label ?? cur.label, actorId]
  )
  await audit(db, { actorId, action: 'reminders.rule_saved', entityType: 'rule', entityId: key, details: { days, enabled } })
}

export async function saveTemplate(db, key, patch, { actorId }) {
  const cur = (await db.query('SELECT * FROM billing_message_templates WHERE key = $1', [key])).rows[0]
  if (!cur) throw new ReminderError('Template not found', 404, 'not_found')
  const languages = patch.languages ?? cur.languages
  for (const [lang, v] of Object.entries(languages)) {
    if (!['es', 'en'].includes(lang) || typeof v?.body !== 'string' || typeof v?.code !== 'string') throw new ReminderError('Each language needs a code and a body')
    const used = new Set([...v.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))
    for (let i = 1; i <= cur.params.length; i++) if (!used.has(i)) throw new ReminderError(`The ${lang} text must use {{${i}}}`)
    if ([...used].some((n) => n > cur.params.length)) throw new ReminderError(`The ${lang} text uses a placeholder that does not exist`)
  }
  await db.query(
    `UPDATE billing_message_templates SET meta_name = $2, languages = $3, meta_approved = $4, updated_by = $5, updated_at = NOW() WHERE key = $1`,
    [key, patch.metaName ?? cur.meta_name, JSON.stringify(languages), patch.metaApproved ?? cur.meta_approved, actorId]
  )
  await audit(db, { actorId, action: 'reminders.template_saved', entityType: 'template', entityId: key, details: { metaApproved: patch.metaApproved ?? cur.meta_approved } })
}

// --- contacts ------------------------------------------------------------------------

export async function upsertContact(db, clientId, { phone, firstName, language }, { actorId }) {
  const e164 = phone == null || phone === '' ? null : normalizePhone(phone)
  if (phone && !e164) throw new ReminderError('That does not look like a valid phone number')
  if (language && !['es', 'en'].includes(language)) throw new ReminderError('Language must be es or en')
  const prev = (await db.query('SELECT phone_e164 FROM billing_client_contacts WHERE client_id = $1', [clientId])).rows[0]
  const phoneChanged = prev && prev.phone_e164 !== e164
  await db.query(
    `INSERT INTO billing_client_contacts (client_id, phone_e164, first_name, language)
     VALUES ($1, $2, $3, COALESCE($4, 'es'))
     ON CONFLICT (client_id) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164, first_name = EXCLUDED.first_name,
       language = EXCLUDED.language, updated_at = NOW(),
       -- Consent belongs to a number. A new number needs a new opt-in.
       opted_in_at = CASE WHEN billing_client_contacts.phone_e164 IS DISTINCT FROM EXCLUDED.phone_e164 THEN NULL ELSE billing_client_contacts.opted_in_at END,
       opt_in_source = CASE WHEN billing_client_contacts.phone_e164 IS DISTINCT FROM EXCLUDED.phone_e164 THEN NULL ELSE billing_client_contacts.opt_in_source END`,
    [clientId, e164, firstName || null, language || null]
  )
  if (phoneChanged) await cancelPendingForClient(db, clientId, 'staff', actorId)
  await audit(db, { actorId, action: 'contact.saved', entityType: 'client', entityId: clientId, details: { phoneChanged: Boolean(phoneChanged) } })
}

export async function recordOptIn(db, clientId, { source }, { actorId }) {
  if (!source || String(source).trim().length < 3) throw new ReminderError('Say how the client agreed (for example: signed intake form, verbal at consultation)')
  const { rowCount } = await db.query(
    `UPDATE billing_client_contacts SET opted_in_at = NOW(), opt_in_source = $2, opt_in_recorded_by = $3,
       opted_out_at = NULL, opt_out_source = NULL, updated_at = NOW()
      WHERE client_id = $1 AND phone_e164 IS NOT NULL`,
    [clientId, String(source).trim().slice(0, 200), actorId]
  )
  if (!rowCount) throw new ReminderError('Save a WhatsApp number first', 409, 'no_phone')
  await audit(db, { actorId, action: 'contact.opted_in', entityType: 'client', entityId: clientId })
}

export async function recordOptOut(db, clientId, { source = 'staff' } = {}, { actorId }) {
  await db.query(
    `UPDATE billing_client_contacts SET opted_out_at = NOW(), opt_out_source = $2, updated_at = NOW() WHERE client_id = $1`,
    [clientId, source]
  )
  const n = await cancelPendingForClient(db, clientId, 'opted_out', actorId)
  await audit(db, { actorId, action: 'contact.opted_out', entityType: 'client', entityId: clientId, details: { cancelled: n } })
}

async function cancelPendingForClient(db, clientId, reason, actorId) {
  const { rowCount } = await db.query(
    `UPDATE billing_reminders SET state = 'cancelled', cancel_reason = $2, cancelled_by = $3, cancelled_at = NOW(), updated_at = NOW()
      WHERE client_id = $1 AND state = ANY($4)`,
    [clientId, reason, actorId ?? null, PENDING_STATES]
  )
  return rowCount
}

// --- evaluation --------------------------------------------------------------------

async function loadWorld(db, { today, settings }) {
  const invoices = (await db.query(
    `SELECT i.*, c.eimmigration_client_id FROM billing_invoices i JOIN billing_clients c ON c.id = i.client_id
      WHERE i.status IN ('unpaid', 'partial', 'overdue', 'paid', 'void', 'needs_review')`
  )).rows.map((r) => ({
    ...fromInvoiceRow(r),
    id: Number(r.id),
    clientId: Number(r.client_id),
    notInLatestReport: r.not_in_latest_report,
  }))
  const contacts = new Map((await db.query(
    'SELECT k.*, c.display_name FROM billing_client_contacts k JOIN billing_clients c ON c.id = k.client_id'
  )).rows.map((c) => [Number(c.client_id), {
    phone: c.phone_e164, language: c.language, optedInAt: c.opted_in_at, optedOutAt: c.opted_out_at,
    // Staff can set a preferred first name; otherwise the first word of the
    // name in eImmigration ("María" from "María García Pérez").
    firstName: c.first_name || String(c.display_name || '').trim().split(/\s+/)[0] || null,
  }]))
  const linkedClientIds = new Set((await db.query("SELECT DISTINCT client_id FROM billing_client_links WHERE system = 'monday'")).rows.map((r) => Number(r.client_id)))
  return { invoices, contacts, linkedClientIds, today, staleAfterDays: settings.staleAfterDays }
}

/**
 * Cancel pending reminders whose obligation no longer qualifies (paid, due
 * date moved, voided, needs review, opted out, unlinked, stale). Run after
 * every import, link change and contact change, and before every send.
 */
export async function cancelIneligible(db, { now = new Date(), actorId = null } = {}) {
  const settings = await getReminderSettings(db)
  const today = todayInFirmTz(now)
  const world = await loadWorld(db, { today, settings })
  const byInvoice = new Map(world.invoices.map((i) => [i.id, i]))
  const pending = (await db.query('SELECT * FROM billing_reminders WHERE state = ANY($1)', [PENDING_STATES])).rows
  const triggers = new Map((await db.query('SELECT key, trigger FROM billing_reminder_rules')).rows.map((r) => [r.key, r.trigger]))
  let cancelled = 0
  for (const r of pending) {
    const inv = byInvoice.get(Number(r.invoice_id))
    // "Due on Oct 30" must not go out on Oct 31.
    const expired = triggers.get(r.rule_key) === 'before_due' && r.due_date && r.due_date < today
    const reason = expired ? 'expired' : inv
      ? cancellationReason(
        { obligationKey: r.obligation_key, ruleKey: r.rule_key, state: r.state, dueDate: r.due_date },
        inv, world.contacts.get(Number(r.client_id)) || null, world.linkedClientIds.has(Number(r.client_id)),
        { today, staleAfterDays: settings.staleAfterDays },
      )
      : 'void'
    if (!reason) continue
    const res = await db.query(
      `UPDATE billing_reminders SET state = 'cancelled', cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND state = ANY($3)`,
      [r.id, reason, PENDING_STATES]
    )
    cancelled += res.rowCount
  }
  if (cancelled) await audit(db, { actorId, action: 'reminders.auto_cancelled', entityType: 'reminders', details: { cancelled } })
  return { cancelled }
}

/** Create drafts for everything eligible today. Never sends anything. */
export async function evaluate(db, { now = new Date(), actorId = null } = {}) {
  await ensureDefaults(db)
  const settings = await getReminderSettings(db)
  const today = todayInFirmTz(now)
  await cancelIneligible(db, { now, actorId })
  const world = await loadWorld(db, { today, settings })
  const rules = await loadRules(db)
  const templates = new Map((await loadTemplates(db)).map((t) => [t.key, t]))
  const existing = (await db.query('SELECT obligation_key, rule_key, state FROM billing_reminders')).rows
    .map((r) => ({ obligationKey: r.obligation_key, ruleKey: r.rule_key, state: r.state }))

  const { candidates, suppressed } = evaluateReminders({ ...world, rules, existing })
  let created = 0
  for (const c of candidates) {
    let preview = null
    let params = c.params
    let language = c.language
    let toPhone = null
    if (c.action === 'whatsapp') {
      const t = templates.get(c.templateKey)
      if (!t) continue
      let r
      try {
        r = renderMessage(t, c.language, c.params)
      } catch {
        continue // a missing value (e.g. no name at all): no draft rather than a broken message
      }
      preview = r.preview
      language = r.fallback ? 'es' : c.language
      params = { ...c.params, bodyParams: r.bodyParams, metaName: r.metaName, languageCode: r.languageCode }
      toPhone = world.contacts.get(c.clientId)?.phone ?? null
    }
    const res = await db.query(
      `INSERT INTO billing_reminders (obligation_key, rule_key, invoice_id, client_id, action, state, template_key, language,
          to_phone, params, preview, due_date, balance_cents)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (obligation_key, rule_key) DO NOTHING`,
      [c.obligationKey, c.ruleKey, c.invoiceId, c.clientId, c.action, c.templateKey, language, toPhone,
        JSON.stringify(params), preview, c.dueDate, c.balanceCents]
    )
    created += res.rowCount
  }
  await audit(db, { actorId, action: 'reminders.evaluated', entityType: 'reminders', details: { created, suppressed: suppressed.length } })
  return { created, suppressed }
}

// --- staff actions ----------------------------------------------------------------

export async function approveReminders(db, ids, { actorId, now = new Date() }) {
  if (!Array.isArray(ids) || !ids.length) throw new ReminderError('Choose at least one reminder')
  // Re-check first: an import since the draft was made may have settled it.
  await cancelIneligible(db, { now, actorId })
  const { rows } = await db.query(
    `UPDATE billing_reminders SET state = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = ANY($1::bigint[]) AND state = 'draft' AND action = 'whatsapp' RETURNING id`,
    [ids, actorId]
  )
  // Staff follow-ups are tasks: "approving" one means it was handled.
  const tasks = await db.query(
    `UPDATE billing_reminders SET state = 'cancelled', cancel_reason = 'staff', cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
      WHERE id = ANY($1::bigint[]) AND state = 'draft' AND action = 'staff_followup'`,
    [ids, actorId]
  )
  await audit(db, { actorId, action: 'reminders.approved', entityType: 'reminders', details: { approved: rows.length, tasksDone: tasks.rowCount } })
  return { approved: rows.map((r) => Number(r.id)), tasksDone: tasks.rowCount, notApproved: ids.length - rows.length - tasks.rowCount }
}

export async function cancelReminder(db, id, { actorId }) {
  const { rowCount } = await db.query(
    `UPDATE billing_reminders SET state = 'cancelled', cancel_reason = 'staff', cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND state = ANY($3)`,
    [id, actorId, [...PENDING_STATES, 'unknown']]
  )
  if (!rowCount) throw new ReminderError('Only a reminder that has not been sent can be cancelled', 409, 'bad_state')
  await audit(db, { actorId, action: 'reminders.cancelled', entityType: 'reminder', entityId: id })
}

/** Retry only a definite failure (never 'unknown'), and only a few times. */
export async function retryReminder(db, id, { actorId }) {
  const r = (await db.query('SELECT state, attempts, last_error_retryable FROM billing_reminders WHERE id = $1', [id])).rows[0]
  if (!r) throw new ReminderError('Reminder not found', 404, 'not_found')
  if (r.state !== 'failed') throw new ReminderError('Only a failed reminder can be retried. A reminder whose delivery is unknown must be checked in WhatsApp first.', 409, 'bad_state')
  if (r.attempts >= MAX_ATTEMPTS) throw new ReminderError(`Already tried ${r.attempts} times`, 409, 'too_many_attempts')
  await db.query("UPDATE billing_reminders SET state = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1 AND state = 'failed'", [id, actorId])
  await audit(db, { actorId, action: 'reminders.retried', entityType: 'reminder', entityId: id })
}

/** Staff confirm an 'unknown' send arrived (seen in the WhatsApp app). */
export async function resolveUnknown(db, id, { delivered, actorId }) {
  const state = delivered ? 'sent' : 'failed'
  const { rowCount } = await db.query(
    `UPDATE billing_reminders SET state = $2, last_error_retryable = CASE WHEN $2::varchar = 'failed' THEN TRUE ELSE last_error_retryable END,
       last_error = CASE WHEN $2::varchar = 'failed' THEN 'Confirmed not delivered by staff' ELSE last_error END, updated_at = NOW()
      WHERE id = $1 AND state = 'unknown'`,
    [id, state]
  )
  if (!rowCount) throw new ReminderError('This reminder is not awaiting confirmation', 409, 'bad_state')
  await audit(db, { actorId, action: 'reminders.unknown_resolved', entityType: 'reminder', entityId: id, details: { delivered: Boolean(delivered) } })
}

// --- dispatch ------------------------------------------------------------------------

/**
 * Send approved reminders. Safe to call often and from several instances.
 * Returns what happened; never throws for one bad reminder.
 */
export async function dispatch(db, provider, { now = new Date(), env = process.env, log } = {}) {
  if (provider.mode === 'meta' && !whatsappSendingEnabled(env)) return { skipped: 'sending_disabled' }
  const settings = await getReminderSettings(db)
  const window = sendingWindow(now.toISOString(), settings)
  await markStalePendingUnknown(db)
  if (!window.open) return { skipped: 'outside_hours', nextOpenAt: window.nextOpenAt }

  await cancelIneligible(db, { now })
  const claimed = (await db.query(
    `UPDATE billing_reminders SET state = 'queued', queued_at = NOW(), updated_at = NOW()
      WHERE id IN (SELECT id FROM billing_reminders WHERE state = 'approved' AND action = 'whatsapp'
                   ORDER BY approved_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [DISPATCH_BATCH]
  )).rows

  const result = { sent: 0, failed: 0, unknown: 0, cancelled: 0 }
  for (const r of claimed) {
    // Last look at the client's consent and number right before sending.
    const contact = (await db.query('SELECT phone_e164, opted_in_at, opted_out_at FROM billing_client_contacts WHERE client_id = $1', [r.client_id])).rows[0]
    const optedOut = !contact?.opted_in_at || (contact.opted_out_at && contact.opted_out_at > contact.opted_in_at)
    if (optedOut || !contact.phone_e164 || contact.phone_e164 !== r.to_phone) {
      await db.query("UPDATE billing_reminders SET state = 'cancelled', cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW() WHERE id = $1", [r.id, optedOut ? 'opted_out' : 'staff'])
      result.cancelled++
      continue
    }
    const attempt = r.attempts + 1
    const idempotencyKey = `reminder-${r.id}-attempt-${attempt}`
    const p = r.params || {}
    const msg = (await db.query(
      `INSERT INTO billing_messages (reminder_id, provider_mode, simulated, to_phone, template_name, language_code, body_params, idempotency_key, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [r.id, provider.mode, provider.mode === 'mock', r.to_phone, p.metaName, p.languageCode, JSON.stringify(p.bodyParams || []), idempotencyKey]
    )).rows[0]
    if (!msg) {
      // This attempt was already started by someone: its outcome is unknown.
      await db.query("UPDATE billing_reminders SET state = 'unknown', updated_at = NOW() WHERE id = $1", [r.id])
      result.unknown++
      continue
    }
    await db.query('UPDATE billing_reminders SET attempts = $2, simulated = $3 WHERE id = $1', [r.id, attempt, provider.mode === 'mock'])

    let res
    try {
      res = await provider.sendTemplate({
        to: r.to_phone, templateName: p.metaName, languageCode: p.languageCode, bodyParams: p.bodyParams || [], idempotencyKey,
      })
    } catch (err) {
      res = { ok: false, outcome: 'unknown', error: { code: err.code || 'exception', message: 'Send threw', retryable: false } }
    }

    if (res.ok) {
      await db.query("UPDATE billing_messages SET status = 'sent', provider_message_id = $2, updated_at = NOW() WHERE id = $1", [msg.id, res.providerMessageId])
      await db.query("UPDATE billing_reminders SET state = 'sent', sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1 AND state = 'queued'", [r.id])
      result.sent++
      await applyEarlyReceipts(db, res.providerMessageId)
    } else if (res.outcome === 'failed') {
      await db.query("UPDATE billing_messages SET status = 'failed', error_code = $2, error_message = $3, updated_at = NOW() WHERE id = $1", [msg.id, String(res.error?.code ?? ''), String(res.error?.message ?? '').slice(0, 300)])
      await db.query(
        "UPDATE billing_reminders SET state = 'failed', last_error = $2, last_error_retryable = $3, updated_at = NOW() WHERE id = $1",
        [r.id, `${res.error?.code ?? 'failed'}: ${String(res.error?.message ?? '').slice(0, 200)}`, Boolean(res.error?.retryable)]
      )
      result.failed++
    } else {
      await db.query("UPDATE billing_messages SET status = 'unknown', error_code = $2, updated_at = NOW() WHERE id = $1", [msg.id, String(res.error?.code ?? 'unknown')])
      await db.query("UPDATE billing_reminders SET state = 'unknown', last_error = 'Delivery could not be confirmed. Check WhatsApp before resending.', updated_at = NOW() WHERE id = $1", [r.id])
      result.unknown++
    }
  }
  if (claimed.length) {
    log?.info?.({ ...result, mode: provider.mode }, 'Reminder dispatch')
    await audit(db, { action: 'reminders.dispatched', entityType: 'reminders', details: { ...result, mode: provider.mode } })
  }
  return result
}

/** A message stuck in 'pending' means the process died mid-send. */
async function markStalePendingUnknown(db) {
  const stale = (await db.query(
    `UPDATE billing_messages SET status = 'unknown', error_code = 'interrupted', updated_at = NOW()
      WHERE status = 'pending' AND created_at < NOW() - ($1 || ' minutes')::interval RETURNING reminder_id`,
    [String(PENDING_SEND_TIMEOUT_MINUTES)]
  )).rows
  for (const s of stale) {
    await db.query("UPDATE billing_reminders SET state = 'unknown', updated_at = NOW() WHERE id = $1 AND state = 'queued'", [s.reminder_id])
  }
  // Claimed but died before writing the message row: nothing was sent, so it
  // is safe to put back in the approved queue.
  await db.query(
    `UPDATE billing_reminders r SET state = 'approved', updated_at = NOW()
      WHERE r.state = 'queued' AND r.queued_at < NOW() - ($1 || ' minutes')::interval
        AND NOT EXISTS (SELECT 1 FROM billing_messages m
                         WHERE m.idempotency_key = 'reminder-' || r.id || '-attempt-' || (r.attempts + 1)
                            OR m.idempotency_key = 'reminder-' || r.id || '-attempt-' || r.attempts AND r.attempts > 0 AND m.created_at > r.queued_at)`,
    [String(PENDING_SEND_TIMEOUT_MINUTES)]
  )
}

export { relevantDueDate }
export default {
  ensureDefaults, evaluate, cancelIneligible, approveReminders, cancelReminder, retryReminder, resolveUnknown, dispatch,
  upsertContact, recordOptIn, recordOptOut, saveRule, saveTemplate, getReminderSettings, saveReminderSettings,
}
