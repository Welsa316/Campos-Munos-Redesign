// Shared contract for payment reminders over WhatsApp (Milestone D,
// docs/billing-automation-plan.md section 8). The engine (reminders.js),
// the messaging providers (providers/whatsapp/*), the service layer and the
// portal all agree on these shapes.
//
// The separate states the firm asked for:
//   1. eligible   — the engine decides an obligation qualifies (not stored;
//                   an evaluation result)
//   2. draft      — stored with the rendered message, awaiting staff
//   3. approved   — a staff member approved it; waits for the sending window
//   4. queued     — claimed by the dispatcher for one send attempt
//   5. sent       — the provider accepted it and returned a message id
//   6. delivered / read — receipts from the webhook (or the mock)
// Side exits: failed (definitely not sent), unknown (the request may have
// reached the provider; never retried automatically), cancelled (by staff or
// because the obligation changed or was settled).

export const REMINDER_STATES = ['draft', 'approved', 'queued', 'sent', 'delivered', 'read', 'failed', 'unknown', 'cancelled']

/** States in which a reminder still counts as pending work (cancellable). */
export const PENDING_STATES = ['draft', 'approved', 'queued']

/** Allowed transitions. Anything else is a bug and must throw. */
export const TRANSITIONS = {
  draft: ['approved', 'cancelled'],
  approved: ['queued', 'cancelled'],
  queued: ['sent', 'failed', 'unknown', 'approved'], // 'approved' = released untouched (window closed, lock lost)
  sent: ['delivered', 'read', 'failed'],
  delivered: ['read'],
  read: [],
  failed: ['approved'], // staff retry, only when the failure was definite
  unknown: ['sent', 'delivered', 'read', 'failed', 'cancelled'], // a late receipt can resolve it
  cancelled: [],
}

/**
 * A reminder rule. Configurable in the portal; these are only examples.
 * @typedef {Object} ReminderRule
 * @property {string} key            stable id, e.g. 'due_in_3'
 * @property {string} label          for staff
 * @property {'before_due'|'after_due'} trigger
 * @property {number} days           0..60; before_due 1 = due tomorrow
 * @property {'whatsapp'|'staff_followup'} action  staff_followup creates no message, only a task
 * @property {string|null} templateKey
 * @property {boolean} enabled
 */
export const DEFAULT_RULES = [
  { key: 'due_in_3', label: 'Payment due in 3 days', trigger: 'before_due', days: 3, action: 'whatsapp', templateKey: 'payment_due_soon', enabled: false },
  { key: 'due_tomorrow', label: 'Payment due tomorrow', trigger: 'before_due', days: 1, action: 'whatsapp', templateKey: 'payment_due_soon', enabled: false },
  { key: 'overdue_3', label: 'Overdue by 3 days', trigger: 'after_due', days: 3, action: 'whatsapp', templateKey: 'payment_overdue', enabled: false },
  { key: 'overdue_7', label: 'Overdue by 7 days', trigger: 'after_due', days: 7, action: 'whatsapp', templateKey: 'payment_overdue', enabled: false },
  { key: 'followup_14', label: 'Staff follow-up: overdue 14 days', trigger: 'after_due', days: 14, action: 'staff_followup', templateKey: null, enabled: false },
]

/**
 * A message template. Must match a template APPROVED IN META'S WHATSAPP
 * MANAGER (name, language code, category 'utility', parameter order) before
 * anything is sent for real. The bodies below are editable examples only.
 * Never include case details, immigration status or anything confidential.
 * @typedef {Object} MessageTemplate
 * @property {string} key
 * @property {string} metaName         the name approved in WhatsApp Manager
 * @property {'utility'} category
 * @property {string[]} params         ordered: values for {{1}}, {{2}}, …
 * @property {Object<string, {code: string, body: string}>} languages  'es' | 'en'
 */
export const DEFAULT_TEMPLATES = [
  {
    key: 'payment_due_soon',
    metaName: 'payment_due_soon',
    category: 'utility',
    params: ['clientFirstName', 'amountDue', 'dueDate'],
    languages: {
      es: { code: 'es', body: 'Hola {{1}}, le recordamos de parte de Campos Muños Law que tiene un pago de {{2}} con vencimiento el {{3}}. Si ya realizó este pago, por favor ignore este mensaje. Para cualquier pregunta, responda aquí o llame a nuestra oficina.' },
      en: { code: 'en_US', body: 'Hello {{1}}, this is a reminder from Campos Muños Law that a payment of {{2}} is due on {{3}}. If you have already made this payment, please disregard this message. If you have any questions, reply here or call our office.' },
    },
  },
  {
    key: 'payment_overdue',
    metaName: 'payment_overdue',
    category: 'utility',
    params: ['clientFirstName', 'amountDue', 'dueDate'],
    languages: {
      es: { code: 'es', body: 'Hola {{1}}, de parte de Campos Muños Law: nuestros registros muestran un saldo pendiente de {{2}} que vencía el {{3}}. Si ya pagó, le pedimos disculpas y puede ignorar este mensaje. Si necesita ayuda o un plan de pagos, responda aquí o llame a nuestra oficina.' },
      en: { code: 'en_US', body: 'Hello {{1}}, from Campos Muños Law: our records show an outstanding balance of {{2}} that was due on {{3}}. If you have already paid, we apologize and you can disregard this message. If you need help or a payment plan, reply here or call our office.' },
    },
  },
]

/** Why an obligation does not get a reminder (shown to staff). */
export const SUPPRESSION_REASONS = {
  not_linked: 'Client is not linked to a monday.com record',
  no_contact: 'No WhatsApp number on file',
  no_opt_in: 'Client has not opted in to WhatsApp messages',
  opted_out: 'Client opted out of WhatsApp messages',
  needs_review: 'Invoice needs review',
  void: 'Invoice is void',
  paid: 'Invoice is paid',
  no_balance: 'Nothing owed',
  no_due_date: 'No due date to remind about',
  stale: 'Billing data is older than the freshness limit',
  not_in_latest_report: 'Invoice missing from the latest full report',
  already_handled: 'A reminder for this payment and stage already exists',
  rule_disabled: 'Rule is switched off',
}

/** Why a pending reminder was cancelled automatically. */
export const CANCEL_REASONS = {
  settled: 'Payment confirmed by a newer report',
  due_date_changed: 'The due date changed',
  void: 'Invoice voided',
  needs_review: 'Invoice now needs review',
  no_balance: 'Nothing owed any more',
  opted_out: 'Client opted out',
  unlinked: 'Client link removed',
  stale: 'Billing data went stale before sending',
  staff: 'Cancelled by staff',
  expired: 'Not approved before the due date it was about',
}

/**
 * The obligation a reminder is about: one invoice at one due date. If the
 * due date moves (a new installment, a renegotiated date), it is a different
 * obligation and pending reminders for the old one are cancelled.
 */
export const obligationKey = (externalInvoiceId, dueDate) => `${externalInvoiceId}@${dueDate}`

/**
 * Messaging provider interface (providers/whatsapp/mock.js, meta.js).
 *
 *   mode: 'mock' | 'meta'
 *   describe() → { mode, configured, graphVersion, phoneNumberId? }   (no secrets)
 *   sendTemplate({ to, templateName, languageCode, bodyParams, idempotencyKey }) →
 *       { ok: true,  providerMessageId, simulated }
 *     | { ok: false, outcome: 'failed'|'unknown', error: { code, message, retryable }, simulated }
 *     'failed'  = the provider definitely did not accept it (safe to retry later)
 *     'unknown' = it may have been accepted (timeout after sending, 5xx with a
 *                 body we cannot read): NEVER resend automatically.
 *   to: E.164 digits without '+', e.g. '15045550101'.
 *   bodyParams: string[] for the template body's {{1}}, {{2}}, …
 *
 * The mock never touches the network; it reports receipts through the same
 * path the real webhook uses, marked simulated.
 */

export default {
  REMINDER_STATES, PENDING_STATES, TRANSITIONS, DEFAULT_RULES, DEFAULT_TEMPLATES,
  SUPPRESSION_REASONS, CANCEL_REASONS, obligationKey,
}
