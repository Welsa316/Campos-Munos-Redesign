// Payment-reminder engine (Milestone D). Pure: no I/O, no clock reads, no
// randomness. The service layer passes everything in, including `today`.
// Shapes, states and reason codes live in reminderModel.js.
//
// What this decides:
//   - which (invoice, rule) pairs become reminder candidates today, and why
//     the others that were due today did not (evaluateReminders)
//   - the exact WhatsApp template parameters and preview text (renderMessage)
//   - whether a pending reminder must be cancelled (cancellationReason)
//   - whether the firm's sending window is open now (sendingWindow)
//
// Dates are 'YYYY-MM-DD' strings in the firm's calendar, compared as calendar
// days via Date.UTC so no time zone can shift them.

import { TRANSITIONS, PENDING_STATES, SUPPRESSION_REASONS, CANCEL_REASONS, obligationKey } from './reminderModel.js'
import { formatCents } from './money.js'

/**
 * Catch-up grace. A rule's day is due − N (before_due) or due + N (after_due).
 * If the evaluation did not run on that exact day (server down, weekend job
 * skipped), the rule still fires on any of the next GRACE_DAYS days. Limits:
 *   - a before_due rule never fires after the due date itself;
 *   - an earlier stage never fires once a later stage of the same trigger and
 *     action exists for the obligation (in `existing`, or firing in this run).
 * Idempotency comes from `existing`, not from the grace: the service must
 * record every generated reminder so the next day's run sees it.
 */
export const GRACE_DAYS = 2

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86400000

function toUtcMs(s) {
  const m = DATE_RE.exec(String(s ?? ''))
  if (!m) throw new TypeError(`Expected a 'YYYY-MM-DD' date, got ${JSON.stringify(s)}`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(y, mo - 1, d)
  const back = new Date(ms)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new TypeError(`Impossible date ${JSON.stringify(s)}`)
  }
  return ms
}

/** Calendar days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS)
}

/** 'YYYY-MM-DD' plus n calendar days. */
export function addDays(date, n) {
  return new Date(toUtcMs(date) + n * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The date a reminder is about. On a payment plan (plan text or a next
 * installment date present) it is the next installment, and null when the
 * plan gives none; otherwise the invoice due date. Mirrors reconcile.js
 * deriveStatus so status and reminders agree on what "due" means.
 */
export function relevantDueDate(invoice) {
  const onPlan = Boolean(invoice.paymentPlanText) || invoice.nextInstallmentDate != null
  if (onPlan) return invoice.nextInstallmentDate || null
  return invoice.dueDate || null
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** es: '5 de noviembre de 2026'; en: 'November 5, 2026'. */
export function formatDueDate(date, language) {
  toUtcMs(date)
  const [y, m, d] = date.split('-').map(Number)
  if (language === 'en') return `${MONTHS_EN[m - 1]} ${d}, ${y}`
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`
}

const SUPPORTED_LANGUAGES = ['es', 'en']
const languageOf = (contact) => (SUPPORTED_LANGUAGES.includes(contact?.language) ? contact.language : 'es')

const timeOf = (iso) => {
  if (iso == null) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Opted out = an opt-out timestamp later than the latest opt-in (or with no
 * opt-in at all). Opting in again after an opt-out restores consent.
 * An unparseable opt-out timestamp counts as opted out (fail closed).
 */
function isOptedOut(contact) {
  if (!contact || contact.optedOutAt == null) return false
  const out = timeOf(contact.optedOutAt)
  const inn = timeOf(contact.optedInAt)
  if (out == null || inn == null) return true
  return out >= inn
}

function hasOptIn(contact) {
  return Boolean(contact) && timeOf(contact.optedInAt) != null
}

/**
 * Status as of `today`. The stored status was derived at import time; an
 * unpaid/partial invoice whose relevant due date has since passed is overdue
 * by the same rule reconcile.js uses (relevantDue < asOfDate).
 */
function effectiveStatus(invoice, due, today) {
  if ((invoice.status === 'unpaid' || invoice.status === 'partial') && due && due < today) return 'overdue'
  return invoice.status
}

/** The day a rule fires for a given due date. */
const fireDayOf = (rule, due) => addDays(due, rule.trigger === 'before_due' ? -rule.days : rule.days)

/** Is today inside the rule's day + grace (and, for before_due, not past due)? */
function inWindow(rule, due, today) {
  const lag = daysBetween(fireDayOf(rule, due), today)
  if (lag < 0 || lag > GRACE_DAYS) return false
  if (rule.trigger === 'before_due' && today > due) return false
  return true
}

/** True when `later` is a later stage than `earlier` (same trigger and action). */
function isLaterStage(later, earlier) {
  if (later.key === earlier.key || later.trigger !== earlier.trigger || later.action !== earlier.action) return false
  return later.trigger === 'before_due' ? later.days < earlier.days : later.days > earlier.days
}

/**
 * Decide today's reminder candidates.
 *
 * Suppression precedence for one (invoice, rule) whose day (incl. grace) is
 * today — the first match is reported:
 *   rule_disabled, void, paid, needs_review, no_balance, not_in_latest_report,
 *   stale, not_linked, no_contact, opted_out, no_opt_in, already_handled.
 * staff_followup rules skip the four messaging checks (linked, contact,
 * opt-out, opt-in): they create a task for staff, not a message.
 * no_due_date is reported once per open invoice (ruleKey null), because
 * without a due date no rule has a day.
 * A status that does not fit the trigger (after_due needs 'overdue',
 * before_due needs 'unpaid'/'partial') produces nothing and no entry: it is
 * not a reminder that "would have been due today".
 *
 * @returns {{ candidates: object[], suppressed: object[] }}
 */
export function evaluateReminders({ invoices, contacts, linkedClientIds, rules, existing = [], today, staleAfterDays = 10 }) {
  toUtcMs(today)
  const handled = new Set(existing.map((r) => `${r.obligationKey}|${r.ruleKey}`))
  const rulesByKey = new Map(rules.map((r) => [r.key, r]))
  const existingRulesByObligation = new Map()
  for (const r of existing) {
    const rule = rulesByKey.get(r.ruleKey)
    if (!rule) continue
    if (!existingRulesByObligation.has(r.obligationKey)) existingRulesByObligation.set(r.obligationKey, [])
    existingRulesByObligation.get(r.obligationKey).push(rule)
  }
  const staleBefore = addDays(today, -staleAfterDays)

  const candidates = []
  const suppressed = []

  for (const inv of invoices) {
    const base = { invoiceId: inv.id, externalInvoiceId: inv.externalInvoiceId, clientId: inv.clientId }
    const due = relevantDueDate(inv)
    const open = inv.status !== 'void' && inv.status !== 'paid' && inv.status !== 'needs_review' && inv.balanceCents > 0

    if (!due) {
      if (open) suppressed.push({ ...base, obligationKey: null, ruleKey: null, reason: 'no_due_date' })
      continue
    }

    const key = obligationKey(inv.externalInvoiceId, due)
    const status = effectiveStatus(inv, due, today)
    const contact = contacts.get(inv.clientId) || null
    const firing = []

    for (const rule of rules) {
      if (!inWindow(rule, due, today)) continue
      const messaging = rule.action !== 'staff_followup'
      let reason = null
      if (!rule.enabled) reason = 'rule_disabled'
      else if (inv.status === 'void') reason = 'void'
      else if (inv.status === 'paid') reason = 'paid'
      else if (inv.status === 'needs_review') reason = 'needs_review'
      else if (inv.balanceCents == null || inv.balanceCents <= 0) reason = 'no_balance'
      else if (rule.trigger === 'after_due' && status !== 'overdue') continue
      else if (rule.trigger === 'before_due' && status !== 'unpaid' && status !== 'partial') continue
      else if (inv.notInLatestReport) reason = 'not_in_latest_report'
      else if (!inv.reportDate || inv.reportDate < staleBefore) reason = 'stale'
      else if (messaging && !linkedClientIds.has(inv.clientId)) reason = 'not_linked'
      else if (messaging && (!contact || !normalizePhone(contact.phone))) reason = 'no_contact'
      else if (messaging && isOptedOut(contact)) reason = 'opted_out'
      else if (messaging && !hasOptIn(contact)) reason = 'no_opt_in'
      else if (handled.has(`${key}|${rule.key}`)) reason = 'already_handled'
      else {
        const later = (existingRulesByObligation.get(key) || []).find((r) => isLaterStage(r, rule))
        if (later) {
          suppressed.push({ ...base, obligationKey: key, ruleKey: rule.key, reason: 'already_handled', detail: `superseded by ${later.key}` })
          continue
        }
      }
      if (reason) {
        suppressed.push({ ...base, obligationKey: key, ruleKey: rule.key, reason })
        continue
      }
      firing.push(rule)
    }

    for (const rule of firing) {
      const later = firing.find((r) => isLaterStage(r, rule))
      if (later) {
        suppressed.push({ ...base, obligationKey: key, ruleKey: rule.key, reason: 'already_handled', detail: `superseded by ${later.key}` })
        continue
      }
      const language = languageOf(contact)
      const isMessage = rule.action !== 'staff_followup'
      candidates.push({
        ...base,
        obligationKey: key,
        ruleKey: rule.key,
        action: isMessage ? 'whatsapp' : 'staff_followup',
        templateKey: isMessage ? rule.templateKey : null,
        language,
        dueDate: due,
        balanceCents: inv.balanceCents,
        params: isMessage
          ? {
              clientFirstName: contact.firstName ? String(contact.firstName).trim() || null : null,
              amountDue: formatCents(inv.balanceCents),
              dueDate: formatDueDate(due, language),
            }
          : null,
      })
    }
  }

  for (const s of suppressed) {
    if (!(s.reason in SUPPRESSION_REASONS)) throw new Error(`Unknown suppression reason ${s.reason}`)
  }
  return { candidates, suppressed }
}

/**
 * Render a template for one language. Unknown or missing language falls back
 * to 'es' (the firm's primary audience) and says so with fallback: true.
 * Only values named in template.params are used, in that order. A missing or
 * blank value throws: a half-filled message must never reach a client.
 * Whitespace runs (incl. newlines) collapse to one space, as WhatsApp rejects
 * newlines and long space runs inside template parameters.
 */
export function renderMessage(template, language, params) {
  const lang = template.languages?.[language] ? language : 'es'
  const variant = template.languages?.[lang]
  if (!variant) throw new Error(`Template ${template.key} has no '${language}' or 'es' version`)
  const bodyParams = template.params.map((name) => {
    const v = params?.[name]
    const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim()
    if (!s) throw new Error(`Template ${template.key}: missing value for '${name}'`)
    return s
  })
  const preview = variant.body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const v = bodyParams[Number(n) - 1]
    if (v === undefined) throw new Error(`Template ${template.key} (${lang}) uses {{${n}}} but declares ${bodyParams.length} params`)
    return v
  })
  return { metaName: template.metaName, languageCode: variant.code, language: lang, fallback: lang !== language, bodyParams, preview }
}

/**
 * Should this pending reminder be cancelled now? Returns a CANCEL_REASONS
 * code or null. Non-pending reminders (sent, failed, …) always return null.
 *
 * Precedence (first match wins), most informative for staff first:
 *   void          invoice voided (or no longer present at all)
 *   needs_review  invoice now needs review (checked before settled: a zero
 *                 balance under review is not a confirmed payment)
 *   settled       status paid, or balance exactly 0
 *   no_balance    balance unknown or negative
 *   due_date_changed  the obligation moved (new installment / new date)
 *   opted_out     opted out, or no usable contact / opt-in any more
 *   unlinked      monday link removed or no longer resolved
 *   stale         report older than staleAfterDays, or invoice absent from
 *                 the latest full report
 * settled precedes due_date_changed: paying an installment usually moves the
 * next installment date, and "paid" is the truth staff need to see.
 */
export function cancellationReason(reminder, invoice, contact, linked, { today, staleAfterDays = 10 } = {}) {
  if (!PENDING_STATES.includes(reminder.state)) return null
  let reason = null
  if (!invoice || invoice.status === 'void') reason = 'void'
  else if (invoice.status === 'needs_review') reason = 'needs_review'
  else if (invoice.status === 'paid' || invoice.balanceCents === 0) reason = 'settled'
  else if (invoice.balanceCents == null || invoice.balanceCents < 0) reason = 'no_balance'
  else if (reminder.obligationKey !== obligationKey(invoice.externalInvoiceId, relevantDueDate(invoice))) reason = 'due_date_changed'
  else if (!contact || !normalizePhone(contact.phone) || !hasOptIn(contact) || isOptedOut(contact)) reason = 'opted_out'
  else if (!linked) reason = 'unlinked'
  else if (invoice.notInLatestReport || !invoice.reportDate || invoice.reportDate < addDays(today, -staleAfterDays)) reason = 'stale'
  if (reason && !(reason in CANCEL_REASONS)) throw new Error(`Unknown cancel reason ${reason}`)
  return reason
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const formatters = new Map()
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }))
  }
  return formatters.get(timeZone)
}

function localParts(ms, timeZone) {
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WEEKDAYS[p.weekday] }
}

/** UTC ms of a wall-clock time in a zone (two passes settle DST offsets). */
function zonedToUtc(y, m, d, hour, timeZone) {
  const wall = Date.UTC(y, m - 1, d, hour)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, timeZone)
    const offset = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second) - guess
    guess = wall - offset
  }
  return guess
}

/**
 * Is the firm's sending window open at nowIso? Window: local [startHour,
 * endHour) on the given weekdays (0 = Sunday … 6 = Saturday) in timeZone.
 * nextOpenAt is nowIso (normalised) when open, else the next opening instant.
 * Holidays are out of scope: the service or staff must hold reminders then.
 */
export function sendingWindow(nowIso, { timeZone = 'America/Chicago', days = [1, 2, 3, 4, 5], startHour = 9, endHour = 18 } = {}) {
  const now = Date.parse(nowIso)
  if (Number.isNaN(now)) throw new TypeError(`Invalid instant ${JSON.stringify(nowIso)}`)
  if (!days.length || !(startHour < endHour)) throw new RangeError('Sending window has no open hours')
  const p = localParts(now, timeZone)
  const open = days.includes(p.weekday) && p.hour >= startHour && p.hour < endHour
  if (open) return { open: true, nextOpenAt: new Date(now).toISOString() }
  const todayLocal = Date.UTC(p.y, p.m - 1, p.d)
  for (let i = 0; i <= 7; i++) {
    if (i === 0 && p.hour >= startHour) continue
    const dt = new Date(todayLocal + i * DAY_MS)
    if (!days.includes(dt.getUTCDay())) continue
    const at = zonedToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), startHour, timeZone)
    return { open: false, nextOpenAt: new Date(at).toISOString() }
  }
  throw new RangeError('No opening found within a week')
}

/** Throws on any transition not listed in TRANSITIONS. */
export function assertTransition(from, to) {
  if (!TRANSITIONS[from]?.includes(to)) throw new Error(`Illegal reminder transition ${from} → ${to}`)
  return true
}

/**
 * Normalise a phone number to E.164 digits (no '+'), or null.
 * Accepts spaces, dashes, dots, parentheses and a leading '+'. A bare
 * 10-digit number gets defaultCountry ('1', the US). Rejects letters
 * (extensions), fewer than 8 or more than 15 digits, a leading 0, all-same
 * digits, and NANP numbers whose area code or exchange starts with 0 or 1.
 */
export function normalizePhone(raw, defaultCountry = '1') {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!/^\+?[\d\s\-().]+$/.test(s)) return null
  const plus = s.startsWith('+')
  let digits = s.replace(/\D/g, '')
  if (!plus && digits.length === 10) digits = defaultCountry + digits
  if (digits.length < 8 || digits.length > 15) return null
  if (digits.startsWith('0')) return null
  if (/^(\d)\1+$/.test(digits) || /^(\d)\1+$/.test(digits.slice(1))) return null
  if (digits.length === 11 && digits.startsWith('1')) {
    if (/[01]/.test(digits[1]) || /[01]/.test(digits[4])) return null
  }
  return digits
}

export default {
  GRACE_DAYS, daysBetween, addDays, relevantDueDate, formatDueDate, evaluateReminders,
  renderMessage, cancellationReason, sendingWindow, assertTransition, normalizePhone,
}
