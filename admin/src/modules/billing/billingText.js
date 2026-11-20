// The billing views' sentences that are built from data: what changed on an
// invoice, what an import will write, what a reminder action did, a
// client's consent. Each takes a lang ('en' by default) and reads its words
// from i18n/billing.js or i18n/billingReminders.js; English reads exactly
// as these sentences did before Spanish was added. Tested in
// admin/test/i18nBilling.test.js.
import { makeTranslate } from '../../i18n/translator.js'
import { BILLING } from '../../i18n/billing.js'
import { BILLING_REMINDERS } from '../../i18n/billingReminders.js'
import { money, shortDate } from './format.js'

const tb = makeTranslate(BILLING)
const tr = makeTranslate(BILLING_REMINDERS)

export const localeOf = (lang) => (lang === 'es' ? 'es-US' : 'en-US')

/** A count as shown next to its noun: "1,234" (passed as count, it still picks one/other). */
export const num = (n, lang = 'en') => (Number(n) || 0).toLocaleString(localeOf(lang))

/** Whether a dictionary has a word for key (otherwise the caller shows the value as it came). */
export const hasWord = (dict, key) => Object.hasOwn(dict.en, key)

/**
 * A sentence with a control in the middle ("… on the {link} tab …"), split
 * into the text before and after it, so the control can sit where each
 * language puts it.
 */
export function around(text, name) {
  const at = text.indexOf(`{${name}}`)
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + name.length + 2)]
}

// --- invoices and imports -----------------------------------------------------------

const HISTORY_FIELDS = ['totalCents', 'paidCents', 'balanceCents', 'status', 'dueDate', 'nextInstallmentDate', 'lastPaymentDate', 'reviewReason']
const ROW_FIELDS = ['totalCents', 'paidCents', 'balanceCents', 'status', 'dueDate', 'nextInstallmentDate', 'lastPaymentDate']

// A stored status in a change line: English shows it as stored.
const statusValue = (v, lang) => (hasWord(BILLING, `value.${v}`) ? tb(lang, `value.${v}`) : v)

/** One revision of an invoice: "balance: $500.00 → $250.00; status: unpaid → overdue". */
export function invoiceHistory(changes = [], lang = 'en') {
  const locale = localeOf(lang)
  if (!changes.length) return tb(lang, 'history.reconfirmed')
  if (changes.every((c) => c.from == null)) return tb(lang, 'history.first')
  const shown = changes.filter((c) => HISTORY_FIELDS.includes(c.field))
  if (!shown.length) return tb(lang, 'history.fields_updated', { count: num(changes.length, lang) })
  return shown.map((c) => {
    const fmt = (v) => (v == null ? '—'
      : /Cents$/.test(c.field) ? money(v, locale)
        : /Date$/.test(c.field) ? shortDate(v, locale)
          : c.field === 'status' ? statusValue(v, lang) : v)
    return tb(lang, 'history.change', { field: tb(lang, `change.${c.field}`), from: fmt(c.from), to: fmt(c.to) })
  }).join('; ')
}

/** What a preview row would change: "balance $500.00 → $250.00; due 2026-11-01 → 2026-12-01". */
export function rowChanges(changes = [], lang = 'en') {
  const locale = localeOf(lang)
  return changes.filter((c) => ROW_FIELDS.includes(c.field)).map((c) => {
    const fmt = (v) => (/Cents$/.test(c.field) ? money(v, locale)
      : c.field === 'status' && v != null ? statusValue(v, lang) : (v ?? '—'))
    // "due" here, where the invoice history says "due date".
    const field = tb(lang, c.field === 'dueDate' ? 'rowchange.dueDate' : `change.${c.field}`)
    return tb(lang, 'rowchange.line', { field, from: fmt(c.from), to: fmt(c.to) })
  }).join('; ')
}

/** What a report's phone column does to the clients' WhatsApp numbers, '' when it has none. */
export function phoneSummary(phones, lang = 'en') {
  if (!phones) return ''
  return [
    [phones.new, 'phones.new'],
    [phones.changed, 'phones.changed'],
    [phones.same, 'phones.same'],
    [phones.kept, 'phones.kept'],
    [phones.invalid, 'phones.invalid'],
    [phones.conflict, 'phones.conflict'],
  ].filter(([n]) => n).map(([n, key]) => tb(lang, key, { count: n })).join(' · ')
}

/** The line above Approve import: what approving will write. */
export function approveSummary(counts = {}, phonesWritten = 0, lang = 'en') {
  const ins = counts.invoice_insert
  const upd = counts.invoice_update
  const invoices = tb(lang, 'approve.invoices', {
    count: ins + upd,
    new: tb(lang, 'approve.new', { count: ins }),
    changed: tb(lang, 'approve.changed', { count: upd }),
  })
  const payments = tb(lang, 'count.payment', { count: num(counts.payment_insert + counts.payment_update, lang) })
  const numbers = phonesWritten ? tb(lang, 'approve.phones', { numbers: tb(lang, 'count.whatsapp_number', { count: num(phonesWritten, lang) }) }) : ''
  return `${invoices} ${payments}${numbers}. ${tb(lang, 'approve.note')}`
}

/** After approving: "Applied: 12 invoices, 3 payments, 2 clients linked to monday.com by eImmigration ID." */
export function appliedSummary(applied = {}, lang = 'en') {
  const line = tb(lang, 'applied.line', {
    invoices: tb(lang, 'count.invoice', { count: num(applied.invoices, lang) }),
    payments: tb(lang, 'count.payment', { count: num(applied.payments, lang) }),
  })
  const links = applied.links ? tb(lang, 'applied.links', { count: num(applied.links, lang) }) : ''
  return `${line}${links}.`
}

// --- reminders -----------------------------------------------------------------------

/**
 * A rule by what it does now, not its starting label: staff can change the
 * days, and "due in 3 days" set to 7 would mislead.
 */
export function ruleLabel(rule, lang = 'en') {
  const count = rule.days
  if (rule.action === 'staff_followup') return tr(lang, 'rule.followup', { count })
  if (rule.trigger === 'before_due') {
    return count === 0 ? tr(lang, 'rule.due_today') : count === 1 ? tr(lang, 'rule.due_tomorrow') : tr(lang, 'rule.days_before', { count })
  }
  return tr(lang, 'rule.days_overdue', { count })
}

/** When live reminders go out: "9:00–18:00 Chicago time". */
export function sendingHours(settings, lang = 'en') {
  if (!settings) return tr(lang, 'hours.business')
  const zone = settings.timeZone.split('/')[1]?.replace('_', ' ') || settings.timeZone
  return tr(lang, 'hours.window', { start: settings.startHour, end: settings.endHour, zone })
}

/** After "Check for due reminders". The reasons (label) come from the server as sent. */
export function evaluateNotice(r, lang = 'en') {
  const why = (r.suppressed || []).map((s) => `${s.count} × ${String(s.label || s.reason || '').toLowerCase()}`).join('; ')
  return `${tr(lang, 'notice.created', { count: num(r.created, lang) })}${why ? tr(lang, 'notice.not_created', { why }) : ''}`
}

/** After "Send approved now". */
export function dispatchNotice(r, lang = 'en') {
  if (r.skipped === 'sending_disabled') return tr(lang, 'notice.sending_disabled')
  if (r.skipped === 'outside_hours') return tr(lang, 'notice.outside_hours', { date: shortDate(r.nextOpenAt, localeOf(lang)) })
  return tr(lang, 'notice.dispatched', { sent: r.sent, failed: r.failed, unknown: r.unknown, cancelled: r.cancelled })
}

/** After approving one or more reminders. */
export function approveNotice(r, lang = 'en') {
  const tasks = r.tasksDone ? tr(lang, 'notice.tasks_done', { count: num(r.tasksDone, lang) }) : ''
  const dropped = r.notApproved ? tr(lang, 'notice.not_approved', { count: r.notApproved }) : ''
  return `${tr(lang, 'notice.approved', { count: r.approved.length })}${tasks}${dropped}.`
}

// --- WhatsApp contacts -------------------------------------------------------------------

export const isOptedOut = (c) => Boolean(c.opted_out_at) && (!c.opted_in_at || c.opted_out_at > c.opted_in_at)
export const isOptedIn = (c) => Boolean(c.opted_in_at) && !isOptedOut(c)

/** A client's consent line and its colour. The opt-in source is what staff typed. */
export function consentLine(c, firmPolicy, lang = 'en') {
  const locale = localeOf(lang)
  if (!c.phone_e164) return { label: tr(lang, 'consent.no_number'), tone: 'text-gray-500' }
  if (isOptedOut(c)) {
    const stop = c.opt_out_source === 'whatsapp_reply' ? tr(lang, 'consent.replied_stop') : ''
    return { label: `${tr(lang, 'consent.opted_out', { date: shortDate(c.opted_out_at, locale) })}${stop}`, tone: 'text-brand-red' }
  }
  if (c.opted_in_at) return { label: tr(lang, 'consent.opted_in', { date: shortDate(c.opted_in_at, locale), source: String(c.opt_in_source) }), tone: 'text-green-700' }
  if (firmPolicy) return { label: tr(lang, 'consent.firm'), tone: 'text-green-700' }
  return { label: tr(lang, 'consent.none'), tone: 'text-amber-700' }
}
