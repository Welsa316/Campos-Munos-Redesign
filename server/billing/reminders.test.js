import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRACE_DAYS, daysBetween, addDays, relevantDueDate, formatDueDate, evaluateReminders,
  renderMessage, cancellationReason, sendingWindow, assertTransition, normalizePhone,
} from './reminders.js'
import { DEFAULT_TEMPLATES, TRANSITIONS, REMINDER_STATES, obligationKey } from './reminderModel.js'

const TODAY = '2026-11-02'

const rule = (over = {}) => ({ key: 'r', label: 'r', trigger: 'before_due', days: 3, action: 'whatsapp', templateKey: 'payment_due_soon', enabled: true, ...over })
const DUE_IN_3 = rule({ key: 'due_in_3', days: 3 })
const DUE_TOMORROW = rule({ key: 'due_tomorrow', days: 1 })
const OVERDUE_3 = rule({ key: 'overdue_3', trigger: 'after_due', days: 3, templateKey: 'payment_overdue' })
const OVERDUE_7 = rule({ key: 'overdue_7', trigger: 'after_due', days: 7, templateKey: 'payment_overdue' })
const FOLLOWUP_14 = rule({ key: 'followup_14', trigger: 'after_due', days: 14, action: 'staff_followup', templateKey: null })

const invoice = (over = {}) => ({
  id: 10, externalInvoiceId: 'INV-1', clientId: 7, clientName: 'Juan Pérez',
  status: 'unpaid', balanceCents: 123456, dueDate: '2026-11-05', nextInstallmentDate: null, paymentPlanText: null,
  reportDate: '2026-11-01', notInLatestReport: false, currency: 'USD', ...over,
})
const contact = (over = {}) => ({ phone: '15045550101', language: 'es', optedInAt: '2026-10-01T15:00:00Z', optedOutAt: null, firstName: 'Juan', ...over })

function run({ invoices = [invoice()], contacts = new Map([[7, contact()]]), linked = new Set([7]), rules = [DUE_IN_3], existing = [], today = TODAY, staleAfterDays } = {}) {
  return evaluateReminders({ invoices, contacts, linkedClientIds: linked, rules, existing, today, ...(staleAfterDays != null ? { staleAfterDays } : {}) })
}
const reasons = (r) => r.suppressed.map((s) => s.reason)
const keys = (r) => r.candidates.map((c) => c.ruleKey)

// ---- dates ----------------------------------------------------------------

test('daysBetween counts calendar days across DST and month/year ends', () => {
  assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1) // US DST ends 2026-11-01
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2) // US DST starts 2026-03-08
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2)
  assert.equal(daysBetween('2026-11-05', '2026-11-02'), -3)
  assert.equal(addDays('2026-11-05', -3), '2026-11-02')
  assert.throws(() => daysBetween('2026-02-30', '2026-03-01'), /Impossible/)
  assert.throws(() => daysBetween('11/02/2026', '2026-11-03'), /YYYY-MM-DD/)
})

test('relevantDueDate: plan uses next installment, no plan uses due date, plan without installment is null', () => {
  assert.equal(relevantDueDate(invoice()), '2026-11-05')
  assert.equal(relevantDueDate(invoice({ paymentPlanText: '$200/mo', nextInstallmentDate: '2026-11-20' })), '2026-11-20')
  assert.equal(relevantDueDate(invoice({ nextInstallmentDate: '2026-11-20' })), '2026-11-20')
  assert.equal(relevantDueDate(invoice({ paymentPlanText: '$200/mo', nextInstallmentDate: null })), null)
  assert.equal(relevantDueDate(invoice({ dueDate: null })), null)
})

test('formatDueDate in Spanish and English', () => {
  assert.equal(formatDueDate('2026-11-05', 'es'), '5 de noviembre de 2026')
  assert.equal(formatDueDate('2026-01-31', 'en'), 'January 31, 2026')
})

// ---- firing days ------------------------------------------------------------

test('before_due fires exactly on due − N and produces the exact candidate', () => {
  const r = run()
  assert.deepEqual(r.suppressed, [])
  assert.deepEqual(r.candidates, [{
    invoiceId: 10, externalInvoiceId: 'INV-1', clientId: 7, obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3',
    action: 'whatsapp', templateKey: 'payment_due_soon', language: 'es', dueDate: '2026-11-05', balanceCents: 123456,
    params: { clientFirstName: 'Juan', amountDue: '$1,234.56', dueDate: '5 de noviembre de 2026' },
  }])
})

test('due tomorrow fires on due − 1, in English for an English contact', () => {
  const r = run({ rules: [DUE_TOMORROW], invoices: [invoice({ dueDate: '2026-11-03' })], contacts: new Map([[7, contact({ language: 'en' })]]) })
  assert.deepEqual(keys(r), ['due_tomorrow'])
  assert.deepEqual(r.candidates[0].params, { clientFirstName: 'Juan', amountDue: '$1,234.56', dueDate: 'November 3, 2026' })
  assert.equal(r.candidates[0].language, 'en')
})

test('a rule does not fire the day before its day, and nothing is reported', () => {
  const r = run({ invoices: [invoice({ dueDate: '2026-11-06' })] }) // day is 11-03
  assert.deepEqual(r, { candidates: [], suppressed: [] })
})

test('after_due fires on due + N for an overdue invoice', () => {
  const r = run({ rules: [OVERDUE_3], invoices: [invoice({ status: 'overdue', dueDate: '2026-10-30' })] })
  assert.deepEqual(keys(r), ['overdue_3'])
  assert.equal(r.candidates[0].templateKey, 'payment_overdue')
  assert.equal(r.candidates[0].params.dueDate, '30 de octubre de 2026')
})

test('after_due treats an unpaid invoice whose due date has since passed as overdue', () => {
  const r = run({ rules: [OVERDUE_3], invoices: [invoice({ status: 'unpaid', dueDate: '2026-10-30' })] })
  assert.deepEqual(keys(r), ['overdue_3'])
})

test('after_due needs overdue and before_due needs unpaid/partial; a mismatch generates nothing', () => {
  assert.deepEqual(run({ rules: [OVERDUE_3], invoices: [invoice({ status: 'overdue', dueDate: '2026-10-30' })] }).candidates.length, 1)
  // stored "overdue" but due date in the future (inconsistent data) → no before_due reminder
  assert.deepEqual(run({ invoices: [invoice({ status: 'overdue' })] }), { candidates: [], suppressed: [] })
  assert.deepEqual(keys(run({ invoices: [invoice({ status: 'partial' })] })), ['due_in_3'])
})

// ---- catch-up grace ---------------------------------------------------------

test(`catch-up: a rule still fires up to ${GRACE_DAYS} days after its day, not ${GRACE_DAYS + 1}`, () => {
  assert.equal(GRACE_DAYS, 2)
  const r1 = run({ rules: [OVERDUE_3], invoices: [invoice({ status: 'overdue', dueDate: '2026-10-28' })] }) // day 10-31, lag 2
  assert.deepEqual(keys(r1), ['overdue_3'])
  const r2 = run({ rules: [OVERDUE_3], invoices: [invoice({ status: 'overdue', dueDate: '2026-10-27' })] }) // lag 3
  assert.deepEqual(r2, { candidates: [], suppressed: [] })
})

test('catch-up never sends a before_due reminder once the due date has passed', () => {
  // due_tomorrow day = 10-31, lag 2 (within grace) but due date 11-01 is past
  const r = run({ rules: [DUE_TOMORROW], invoices: [invoice({ dueDate: '2026-11-01' })] })
  assert.deepEqual(r, { candidates: [], suppressed: [] })
  // on the due date itself the catch-up still fires
  assert.deepEqual(keys(run({ rules: [DUE_TOMORROW], invoices: [invoice({ dueDate: '2026-11-02' })] })), ['due_tomorrow'])
})

test('catch-up never fires an earlier stage once a later stage exists for the obligation', () => {
  const inv = invoice({ dueDate: '2026-11-03' }) // due_in_3 day 10-31 (lag 2), due_tomorrow day 11-02 (lag 0)
  const both = run({ rules: [DUE_IN_3, DUE_TOMORROW], invoices: [inv] })
  assert.deepEqual(keys(both), ['due_tomorrow'])
  assert.deepEqual(both.suppressed, [{ invoiceId: 10, externalInvoiceId: 'INV-1', clientId: 7, obligationKey: 'INV-1@2026-11-03', ruleKey: 'due_in_3', reason: 'already_handled', detail: 'superseded by due_tomorrow' }])
  const later = run({ rules: [DUE_IN_3, DUE_TOMORROW], invoices: [invoice({ dueDate: '2026-11-04' })], // due_in_3 lag 1
    existing: [{ obligationKey: 'INV-1@2026-11-04', ruleKey: 'due_tomorrow', state: 'draft' }] })
  assert.deepEqual(later.candidates, [])
  assert.deepEqual(reasons(later), ['already_handled'])
  assert.equal(later.suppressed[0].detail, 'superseded by due_tomorrow')
})

// ---- payment plans ----------------------------------------------------------

test('payment plan reminds about the next installment, not the invoice due date', () => {
  const inv = invoice({ dueDate: '2026-09-01', paymentPlanText: '$200 monthly', nextInstallmentDate: '2026-11-05', status: 'partial' })
  const r = run({ invoices: [inv], rules: [DUE_IN_3, OVERDUE_3, OVERDUE_7] })
  assert.deepEqual(keys(r), ['due_in_3'])
  assert.equal(r.candidates[0].obligationKey, 'INV-1@2026-11-05')
  assert.equal(r.candidates[0].dueDate, '2026-11-05')
})

test('a past invoice due date with a future installment does not produce an overdue reminder', () => {
  // invoice due 10-30 → overdue_3 day would be today; the installment is 11-20
  const inv = invoice({ dueDate: '2026-10-30', paymentPlanText: '$200 monthly', nextInstallmentDate: '2026-11-20', status: 'partial' })
  assert.deepEqual(run({ invoices: [inv], rules: [OVERDUE_3] }), { candidates: [], suppressed: [] })
})

test('plan with no next installment: one no_due_date entry per open invoice', () => {
  const r = run({ invoices: [invoice({ paymentPlanText: '$200 monthly', nextInstallmentDate: null })], rules: [DUE_IN_3, OVERDUE_3] })
  assert.deepEqual(r.suppressed, [{ invoiceId: 10, externalInvoiceId: 'INV-1', clientId: 7, obligationKey: null, ruleKey: null, reason: 'no_due_date' }])
  assert.deepEqual(r.candidates, [])
  // a paid invoice with no due date is not worth reporting
  assert.deepEqual(run({ invoices: [invoice({ dueDate: null, status: 'paid', balanceCents: 0 })] }).suppressed, [])
})

// ---- suppression reasons ----------------------------------------------------

const only = (opts) => {
  const r = run(opts)
  assert.deepEqual(r.candidates, [])
  assert.equal(r.suppressed.length, 1)
  return r.suppressed[0].reason
}

test('suppression: each reason code', () => {
  assert.equal(only({ invoices: [invoice({ status: 'needs_review' })] }), 'needs_review')
  assert.equal(only({ invoices: [invoice({ status: 'void' })] }), 'void')
  assert.equal(only({ invoices: [invoice({ status: 'paid', balanceCents: 0 })] }), 'paid')
  assert.equal(only({ invoices: [invoice({ balanceCents: 0 })] }), 'no_balance')
  assert.equal(only({ invoices: [invoice({ balanceCents: null })] }), 'no_balance')
  assert.equal(only({ invoices: [invoice({ notInLatestReport: true })] }), 'not_in_latest_report')
  assert.equal(only({ invoices: [invoice({ reportDate: null })] }), 'stale')
  assert.equal(only({ linked: new Set() }), 'not_linked')
  assert.equal(only({ contacts: new Map() }), 'no_contact')
  assert.equal(only({ contacts: new Map([[7, contact({ phone: '555' })]]) }), 'no_contact')
  assert.equal(only({ contacts: new Map([[7, contact({ optedInAt: null })]]) }), 'no_opt_in')
  assert.equal(only({ contacts: new Map([[7, contact({ optedOutAt: '2026-10-15T00:00:00Z' })]]) }), 'opted_out')
  assert.equal(only({ existing: [{ obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3', state: 'sent' }] }), 'already_handled')
  assert.equal(only({ rules: [{ ...DUE_IN_3, enabled: false }] }), 'rule_disabled')
})

test('paid suppresses even when everything else would qualify', () => {
  const r = run({ invoices: [invoice({ status: 'paid', balanceCents: 0 })], rules: [DUE_IN_3] })
  assert.deepEqual(r.candidates, [])
  assert.deepEqual(r.suppressed, [{ invoiceId: 10, externalInvoiceId: 'INV-1', clientId: 7, obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3', reason: 'paid' }])
})

test('stale boundary: report exactly staleAfterDays old is fresh, one more day is stale', () => {
  assert.deepEqual(keys(run({ invoices: [invoice({ reportDate: '2026-10-23' })] })), ['due_in_3'])
  assert.equal(only({ invoices: [invoice({ reportDate: '2026-10-22' })] }), 'stale')
  assert.equal(only({ invoices: [invoice({ reportDate: '2026-10-30' })], staleAfterDays: 2 }), 'stale')
})

test('already_handled covers a staff-cancelled reminder so it never regenerates', () => {
  assert.equal(only({ existing: [{ obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3', state: 'cancelled' }] }), 'already_handled')
  // a reminder for an older obligation (different due date) does not block the new one
  assert.deepEqual(keys(run({ existing: [{ obligationKey: 'INV-1@2026-10-05', ruleKey: 'due_in_3', state: 'cancelled' }] })), ['due_in_3'])
})

test('opted out after opting in suppresses; opting in again later restores', () => {
  assert.equal(only({ contacts: new Map([[7, contact({ optedInAt: '2026-10-01T00:00:00Z', optedOutAt: '2026-10-10T00:00:00Z' })]]) }), 'opted_out')
  assert.deepEqual(keys(run({ contacts: new Map([[7, contact({ optedInAt: '2026-10-20T00:00:00Z', optedOutAt: '2026-10-10T00:00:00Z' })]]) })), ['due_in_3'])
})

test('suppression is not flooded: only rules whose day (incl. grace) is today are reported', () => {
  const r = run({ invoices: [invoice({ status: 'void' })], rules: [DUE_IN_3, DUE_TOMORROW, OVERDUE_3, OVERDUE_7, FOLLOWUP_14] })
  assert.deepEqual(r.suppressed.map((s) => [s.ruleKey, s.reason]), [['due_in_3', 'void']])
})

test('staff_followup creates a task candidate with no message, even without WhatsApp consent', () => {
  const r = run({ rules: [FOLLOWUP_14], invoices: [invoice({ status: 'overdue', dueDate: '2026-10-19' })], contacts: new Map(), linked: new Set() })
  assert.deepEqual(r.suppressed, [])
  assert.deepEqual(r.candidates, [{
    invoiceId: 10, externalInvoiceId: 'INV-1', clientId: 7, obligationKey: 'INV-1@2026-10-19', ruleKey: 'followup_14',
    action: 'staff_followup', templateKey: null, language: 'es', dueDate: '2026-10-19', balanceCents: 123456, params: null,
  }])
  assert.equal(only({ rules: [FOLLOWUP_14], invoices: [invoice({ status: 'paid', balanceCents: 0, dueDate: '2026-10-19' })] }), 'paid')
})

test('a contact language other than es/en uses es', () => {
  assert.equal(run({ contacts: new Map([[7, contact({ language: 'pt' })]]) }).candidates[0].language, 'es')
})

// ---- rendering --------------------------------------------------------------

const DUE_SOON = DEFAULT_TEMPLATES.find((t) => t.key === 'payment_due_soon')
const OVERDUE = DEFAULT_TEMPLATES.find((t) => t.key === 'payment_overdue')
const P = { clientFirstName: 'Juan', amountDue: '$1,234.56', dueDate: '5 de noviembre de 2026' }

test('renderMessage in Spanish: exact preview and ordered params', () => {
  assert.deepEqual(renderMessage(DUE_SOON, 'es', P), {
    metaName: 'payment_due_soon', languageCode: 'es', language: 'es', fallback: false,
    bodyParams: ['Juan', '$1,234.56', '5 de noviembre de 2026'],
    preview: 'Hola Juan, le recordamos de parte de Campos Muños Law que tiene un pago de $1,234.56 con vencimiento el 5 de noviembre de 2026. Si ya realizó este pago, por favor ignore este mensaje. Para cualquier pregunta, responda aquí o llame a nuestra oficina.',
  })
})

test('renderMessage in English: exact preview and en_US code', () => {
  const r = renderMessage(OVERDUE, 'en', { ...P, dueDate: 'October 30, 2026' })
  assert.equal(r.languageCode, 'en_US')
  assert.equal(r.fallback, false)
  assert.equal(r.preview, 'Hello Juan, from Campos Muños Law: our records show an outstanding balance of $1,234.56 that was due on October 30, 2026. If you have already paid, we apologize and you can disregard this message. If you need help or a payment plan, reply here or call our office.')
})

test('renderMessage falls back to Spanish for an unknown language and says so', () => {
  const r = renderMessage(DUE_SOON, 'fr', P)
  assert.equal(r.language, 'es')
  assert.equal(r.languageCode, 'es')
  assert.equal(r.fallback, true)
})

test('renderMessage throws on a missing or blank param and ignores extra ones', () => {
  assert.throws(() => renderMessage(DUE_SOON, 'es', { ...P, clientFirstName: null }), /clientFirstName/)
  assert.throws(() => renderMessage(DUE_SOON, 'es', { ...P, amountDue: '  ' }), /amountDue/)
  const r = renderMessage(DUE_SOON, 'es', { ...P, caseType: 'asylum', clientFirstName: 'Juan\n Carlos' })
  assert.deepEqual(r.bodyParams, ['Juan Carlos', '$1,234.56', '5 de noviembre de 2026'])
  assert.equal(r.preview.includes('asylum'), false)
})

test('renderMessage throws when the body uses a placeholder with no declared param', () => {
  const bad = { ...DUE_SOON, languages: { es: { code: 'es', body: 'Hola {{1}} {{4}}' } } }
  assert.throws(() => renderMessage(bad, 'es', P), /\{\{4\}\}/)
})

// ---- cancellation -----------------------------------------------------------

const pending = (over = {}) => ({ obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3', state: 'approved', dueDate: '2026-11-05', ...over })
const cancel = (rem, inv, c = contact(), linked = true, today = TODAY) => cancellationReason(rem, inv, c, linked, { today, staleAfterDays: 10 })

test('cancellation: nothing to cancel when all is still true', () => {
  assert.equal(cancel(pending(), invoice()), null)
})

test('cancellation: each reason', () => {
  assert.equal(cancel(pending(), invoice({ status: 'paid', balanceCents: 0 })), 'settled')
  assert.equal(cancel(pending(), invoice({ balanceCents: 0 })), 'settled')
  assert.equal(cancel(pending(), invoice({ status: 'void' })), 'void')
  assert.equal(cancel(pending(), null), 'void')
  assert.equal(cancel(pending(), invoice({ status: 'needs_review' })), 'needs_review')
  assert.equal(cancel(pending(), invoice({ balanceCents: null })), 'no_balance')
  assert.equal(cancel(pending(), invoice({ dueDate: '2026-11-12' })), 'due_date_changed')
  assert.equal(cancel(pending(), invoice(), contact({ optedOutAt: '2026-10-20T00:00:00Z' })), 'opted_out')
  assert.equal(cancel(pending(), invoice(), null), 'opted_out')
  assert.equal(cancel(pending(), invoice(), contact(), false), 'unlinked')
  assert.equal(cancel(pending(), invoice({ reportDate: '2026-10-01' })), 'stale')
  assert.equal(cancel(pending(), invoice({ notInLatestReport: true })), 'stale')
})

test('cancellation precedence: settled beats due_date_changed, opted_out, unlinked and stale', () => {
  const inv = invoice({ status: 'paid', balanceCents: 0, dueDate: '2026-12-01', reportDate: '2026-10-01' })
  assert.equal(cancel(pending(), inv, contact({ optedOutAt: '2026-10-20T00:00:00Z' }), false), 'settled')
  assert.equal(cancel(pending(), invoice({ status: 'void', balanceCents: 0 })), 'void')
  assert.equal(cancel(pending(), invoice({ status: 'needs_review', balanceCents: 0 })), 'needs_review')
  assert.equal(cancel(pending(), invoice({ dueDate: '2026-12-01' }), null, false), 'due_date_changed')
  assert.equal(cancel(pending(), invoice(), null, false), 'opted_out')
  assert.equal(cancel(pending(), invoice({ reportDate: '2026-10-01' }), contact(), false), 'unlinked')
})

test('cancellation only applies to pending reminders', () => {
  for (const state of ['draft', 'approved', 'queued']) assert.equal(cancel(pending({ state }), invoice({ status: 'paid', balanceCents: 0 })), 'settled')
  for (const state of ['sent', 'delivered', 'read', 'failed', 'unknown', 'cancelled']) assert.equal(cancel(pending({ state }), invoice({ status: 'paid', balanceCents: 0 })), null)
})

test('a new installment date is a new obligation: old reminder cancels, new one generates', () => {
  const moved = invoice({ paymentPlanText: '$200 monthly', nextInstallmentDate: '2026-12-05', status: 'partial' })
  assert.notEqual(obligationKey('INV-1', relevantDueDate(moved)), 'INV-1@2026-11-05')
  assert.equal(cancel(pending(), moved), 'due_date_changed')
  const r = run({ invoices: [moved], today: '2026-12-02', existing: [{ obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3', state: 'cancelled' }],
    contacts: new Map([[7, contact()]]) })
  // report from 11-01 is stale by 12-02, so a fresh report is needed first
  assert.deepEqual(reasons(r), ['stale'])
  const fresh = run({ invoices: [{ ...moved, reportDate: '2026-12-01' }], today: '2026-12-02', existing: [{ obligationKey: 'INV-1@2026-11-05', ruleKey: 'due_in_3', state: 'cancelled' }] })
  assert.deepEqual(fresh.candidates.map((c) => c.obligationKey), ['INV-1@2026-12-05'])
})

// ---- sending window ---------------------------------------------------------

// 2026-11-03 is a Tuesday, Central Standard Time (UTC−6).
test('sending window boundaries at 8:59, 9:00, 17:59 and 18:00 Chicago time', () => {
  assert.deepEqual(sendingWindow('2026-11-03T14:59:00Z'), { open: false, nextOpenAt: '2026-11-03T15:00:00.000Z' })
  assert.deepEqual(sendingWindow('2026-11-03T15:00:00Z'), { open: true, nextOpenAt: '2026-11-03T15:00:00.000Z' })
  assert.deepEqual(sendingWindow('2026-11-03T23:59:00Z'), { open: true, nextOpenAt: '2026-11-03T23:59:00.000Z' })
  assert.deepEqual(sendingWindow('2026-11-04T00:00:00Z'), { open: false, nextOpenAt: '2026-11-04T15:00:00.000Z' })
})

test('sending window is closed at the weekend and reopens Monday 9:00', () => {
  // Friday 2026-11-06 18:30 CST → Monday 11-09 09:00 CST
  assert.deepEqual(sendingWindow('2026-11-07T00:30:00Z'), { open: false, nextOpenAt: '2026-11-09T15:00:00.000Z' })
  // Saturday noon
  assert.deepEqual(sendingWindow('2026-11-07T18:00:00Z'), { open: false, nextOpenAt: '2026-11-09T15:00:00.000Z' })
})

test('sending window across DST: March (CST→CDT) and November (CDT→CST)', () => {
  // Fri 2026-03-06 19:00 CST; DST starts Sun 03-08; Monday 09:00 is CDT (UTC−5)
  assert.deepEqual(sendingWindow('2026-03-07T01:00:00Z'), { open: false, nextOpenAt: '2026-03-09T14:00:00.000Z' })
  assert.equal(sendingWindow('2026-03-09T14:00:00Z').open, true)
  assert.equal(sendingWindow('2026-03-09T13:59:00Z').open, false)
  // Fri 2026-10-30 19:00 CDT; DST ends Sun 11-01; Monday 09:00 is CST (UTC−6)
  assert.deepEqual(sendingWindow('2026-10-31T00:00:00Z'), { open: false, nextOpenAt: '2026-11-02T15:00:00.000Z' })
  assert.equal(sendingWindow('2026-11-02T14:30:00Z').open, false)
})

test('sending window honours a custom zone and days', () => {
  assert.deepEqual(sendingWindow('2026-11-07T14:00:00Z', { timeZone: 'America/New_York', days: [6], startHour: 9, endHour: 12 }), { open: true, nextOpenAt: '2026-11-07T14:00:00.000Z' })
  assert.throws(() => sendingWindow('not a date'), /Invalid/)
})

// ---- transitions ------------------------------------------------------------

test('assertTransition allows exactly the listed transitions', () => {
  for (const from of REMINDER_STATES) {
    for (const to of REMINDER_STATES) {
      if (TRANSITIONS[from].includes(to)) assert.equal(assertTransition(from, to), true)
      else assert.throws(() => assertTransition(from, to), /Illegal/, `${from} → ${to}`)
    }
  }
  assert.throws(() => assertTransition('sent', 'approved'), /Illegal/)
  assert.throws(() => assertTransition('cancelled', 'draft'), /Illegal/)
  assert.throws(() => assertTransition('bogus', 'draft'), /Illegal/)
})

// ---- phone ------------------------------------------------------------------

test('normalizePhone', () => {
  assert.equal(normalizePhone('(504) 555-0101'), '15045550101')
  assert.equal(normalizePhone('504.555.0101'), '15045550101')
  assert.equal(normalizePhone('+1 504-555-0101'), '15045550101')
  assert.equal(normalizePhone('1 504 555 0101'), '15045550101')
  assert.equal(normalizePhone('+52 1 55 1234 5678'), '5215512345678')
  assert.equal(normalizePhone('+502 5555 1234'), '50255551234')
  assert.equal(normalizePhone('5045550101', '52'), '525045550101')
  assert.equal(normalizePhone('555-0101'), null) // 7 digits
  assert.equal(normalizePhone('+1234567890123456'), null) // 16 digits
  assert.equal(normalizePhone('(555) 555-5555'), null) // all same after country code
  assert.equal(normalizePhone('0000000000'), null)
  assert.equal(normalizePhone('504-555-0101 ext 2'), null)
  assert.equal(normalizePhone('(104) 555-0101'), null) // NANP area code cannot start with 1
  assert.equal(normalizePhone(''), null)
  assert.equal(normalizePhone(null), null)
})
