import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveStatus, reconcileInvoice, toInvoiceRecord, absentInvoices,
  paymentDedupeKey, reconcilePayment, summarizeClient,
} from './reconcile.js'

const AS_OF = '2026-10-15'
const base = (over = {}) => ({
  kind: 'invoice', rowNumber: 1, externalInvoiceId: 'INV-1', externalClientId: 'C-1', clientName: 'Prueba Uno',
  invoiceDate: '2026-09-01', dueDate: '2026-11-01', totalCents: 150000, paidCents: null, balanceCents: null,
  sourceStatus: null, statusHint: null, paymentPlanText: null, nextInstallmentDate: null, nextInstallmentCents: null,
  lastPaymentDate: null, currency: 'USD', issues: [], raw: {}, ...over,
})

// --- status --------------------------------------------------------------------

test('paid only when the source settles it', () => {
  assert.equal(deriveStatus(base({ balanceCents: 0 }), AS_OF).status, 'paid')
  assert.equal(deriveStatus(base({ paidCents: 150000 }), AS_OF).status, 'paid')
  assert.equal(deriveStatus(base({ paidCents: 150000 }), AS_OF).balanceSource, 'computed')
})

test('no balance and no amount paid is needs_review, never paid', () => {
  const s = deriveStatus(base({ totalCents: 150000 }), AS_OF)
  assert.equal(s.status, 'needs_review')
  assert.match(s.reviewReason, /no balance/)
})

test('a missing total with no balance is needs_review', () => {
  assert.equal(deriveStatus(base({ totalCents: null, paidCents: 5000 }), AS_OF).status, 'needs_review')
})

test('partial, unpaid and overdue', () => {
  assert.equal(deriveStatus(base({ paidCents: 50000, balanceCents: 100000 }), AS_OF).status, 'partial')
  assert.equal(deriveStatus(base({ paidCents: 0, balanceCents: 150000 }), AS_OF).status, 'unpaid')
  assert.equal(deriveStatus(base({ paidCents: 0, balanceCents: 150000, dueDate: '2026-10-01' }), AS_OF).status, 'overdue')
})

test('due today is not overdue; due yesterday is', () => {
  assert.equal(deriveStatus(base({ paidCents: 0, balanceCents: 150000, dueDate: AS_OF }), AS_OF).status, 'unpaid')
  assert.equal(deriveStatus(base({ paidCents: 0, balanceCents: 150000, dueDate: '2026-10-14' }), AS_OF).status, 'overdue')
})

test('no due date or no as-of date never produces overdue', () => {
  assert.equal(deriveStatus(base({ paidCents: 0, balanceCents: 150000, dueDate: null }), AS_OF).status, 'unpaid')
  assert.equal(deriveStatus(base({ paidCents: 0, balanceCents: 150000, dueDate: '2020-01-01' }), null).status, 'unpaid')
})

test('without an amount paid, a balance below the total means something was paid', () => {
  assert.equal(deriveStatus(base({ balanceCents: 100 }), AS_OF).status, 'partial')
})

test('payment plan: a past invoice due date does not make it overdue while the next installment is in the future', () => {
  const inv = base({ paidCents: 50000, balanceCents: 100000, dueDate: '2026-09-15', paymentPlanText: 'Monthly $250', nextInstallmentDate: '2026-11-01' })
  assert.equal(deriveStatus(inv, AS_OF).status, 'partial')
})

test('payment plan: a missed installment is overdue', () => {
  const inv = base({ paidCents: 50000, balanceCents: 100000, paymentPlanText: 'Monthly', nextInstallmentDate: '2026-10-01' })
  assert.equal(deriveStatus(inv, AS_OF).status, 'overdue')
})

test('payment plan without a next installment date is needs_review, not guessed from the invoice due date', () => {
  const inv = base({ balanceCents: 100000, dueDate: '2026-09-15', paymentPlanText: 'Monthly' })
  assert.equal(deriveStatus(inv, AS_OF).status, 'needs_review')
})

test('contradictions are needs_review', () => {
  assert.equal(deriveStatus(base({ paidCents: 50000, balanceCents: 50000 }), AS_OF).status, 'needs_review', 'total - paid != balance')
  assert.equal(deriveStatus(base({ balanceCents: -100 }), AS_OF).status, 'needs_review', 'negative balance')
  assert.equal(deriveStatus(base({ balanceCents: 200000 }), AS_OF).status, 'needs_review', 'balance > total')
  assert.equal(deriveStatus(base({ balanceCents: 100, statusHint: 'paid' }), AS_OF).status, 'needs_review', 'marked paid with a balance')
  assert.equal(deriveStatus(base({ balanceCents: 0, statusHint: 'open' }), AS_OF).status, 'needs_review', 'zero balance marked open')
})

test('void wins over everything', () => {
  assert.equal(deriveStatus(base({ balanceCents: 150000, statusHint: 'void', dueDate: '2020-01-01' }), AS_OF).status, 'void')
})

// --- row actions -----------------------------------------------------------------

const opts = { asOfDate: AS_OF, reportDate: AS_OF }

test('new invoice inserts; identical re-import is unchanged (idempotent)', () => {
  const inv = base({ balanceCents: 100000, paidCents: 50000 })
  const first = reconcileInvoice(null, inv, opts)
  assert.equal(first.action, 'insert')
  const again = reconcileInvoice(first.record, inv, opts)
  assert.equal(again.action, 'unchanged')
  assert.deepEqual(again.changes, [])
})

test('a later report showing a payment updates the invoice and lists the changes', () => {
  const before = toInvoiceRecord(base({ balanceCents: 150000, paidCents: 0 }), opts)
  const later = base({ balanceCents: 0, paidCents: 150000, lastPaymentDate: '2026-10-20' })
  const r = reconcileInvoice(before, later, { asOfDate: '2026-10-21', reportDate: '2026-10-21' })
  assert.equal(r.action, 'update')
  assert.equal(r.record.status, 'paid')
  const fields = r.changes.map((c) => c.field)
  for (const f of ['paidCents', 'balanceCents', 'status', 'lastPaymentDate']) assert.ok(fields.includes(f), f)
})

test('an older report never rolls a newer one back', () => {
  const current = toInvoiceRecord(base({ balanceCents: 0, paidCents: 150000 }), { asOfDate: '2026-10-20', reportDate: '2026-10-20' })
  const r = reconcileInvoice(current, base({ balanceCents: 150000, paidCents: 0 }), { asOfDate: '2026-10-01', reportDate: '2026-10-01' })
  assert.equal(r.action, 'stale')
  assert.equal(r.record, null)
})

test('a same-day corrected report is applied as a correction', () => {
  const current = toInvoiceRecord(base({ balanceCents: 100000, paidCents: 50000 }), opts)
  const r = reconcileInvoice(current, base({ balanceCents: 90000, paidCents: 60000 }), opts)
  assert.equal(r.action, 'update')
})

test('rows with error issues are skipped, not imported', () => {
  const r = reconcileInvoice(null, base({ issues: [{ field: 'totalAmount', code: 'invalid_money', severity: 'error', message: 'bad amount' }] }), opts)
  assert.equal(r.action, 'skip')
  assert.match(r.reason, /bad amount/)
})

test('an outstanding-only report never touches invoices it does not list', () => {
  assert.deepEqual(absentInvoices(['INV-1', 'INV-2'], ['INV-1'], 'outstanding_only'), [])
  assert.deepEqual(absentInvoices(['INV-1', 'INV-2'], [], 'payment_transactions'), [])
  assert.deepEqual(absentInvoices(['INV-1', 'INV-2'], ['INV-1'], 'invoice_summary'), ['INV-2'])
})

// --- payments ----------------------------------------------------------------------

test('payment dedupe: same id → same key regardless of case; no id → content key', () => {
  assert.equal(paymentDedupeKey({ externalPaymentId: 'PAY-1' }), paymentDedupeKey({ externalPaymentId: ' pay-1 ' }))
  const a = { externalInvoiceId: 'INV-1', paymentDate: '2026-10-01', amountCents: 5000, paymentType: 'payment', reference: 'x' }
  assert.equal(paymentDedupeKey(a), paymentDedupeKey({ ...a }))
  assert.notEqual(paymentDedupeKey(a), paymentDedupeKey({ ...a, amountCents: 5001 }))
})

test('a corrected payment amount is an update; an identical one is unchanged', () => {
  const p = { externalInvoiceId: 'INV-1', paymentDate: '2026-10-01', amountCents: 5000, paymentType: 'payment', currency: 'USD', issues: [] }
  assert.equal(reconcilePayment(null, p).action, 'insert')
  assert.equal(reconcilePayment(p, { ...p }).action, 'unchanged')
  const corrected = reconcilePayment(p, { ...p, amountCents: 5500 })
  assert.equal(corrected.action, 'update')
  assert.deepEqual(corrected.changes, [{ field: 'amountCents', from: 5000, to: 5500 }])
})

// --- client summary ---------------------------------------------------------------

const rec = (over) => ({ status: 'unpaid', balanceCents: 0, dueDate: null, nextInstallmentDate: null, paymentPlanText: null, lastPaymentDate: null, ...over })

test('client summary across several invoices', () => {
  const s = summarizeClient([
    rec({ status: 'paid', balanceCents: 0, lastPaymentDate: '2026-09-01' }),
    rec({ status: 'partial', balanceCents: 25000, dueDate: '2026-11-01' }),
    rec({ status: 'unpaid', balanceCents: 10000, dueDate: '2026-10-20' }),
    rec({ status: 'void', balanceCents: 99999 }),
  ], [{ paymentType: 'payment', paymentDate: '2026-10-05' }, { paymentType: 'refund', paymentDate: '2026-10-09' }], { today: AS_OF })
  assert.equal(s.overallStatus, 'partial')
  assert.equal(s.outstandingCents, 35000, 'void excluded, exact cents')
  assert.equal(s.lastPaymentDate, '2026-10-05', 'refunds are not payments')
  assert.equal(s.nextDueDate, '2026-10-20')
})

test('one invoice needing review makes the whole client needs_review', () => {
  const s = summarizeClient([rec({ status: 'paid' }), rec({ status: 'needs_review', balanceCents: null })])
  assert.equal(s.overallStatus, 'needs_review')
})

test('overdue beats partial; all settled is paid; only void is no_invoices', () => {
  assert.equal(summarizeClient([rec({ status: 'partial', balanceCents: 5 }), rec({ status: 'overdue', balanceCents: 5 })]).overallStatus, 'overdue')
  assert.equal(summarizeClient([rec({ status: 'paid' }), rec({ status: 'paid' })]).overallStatus, 'paid')
  assert.equal(summarizeClient([rec({ status: 'void', balanceCents: 10 })]).overallStatus, 'no_invoices')
})

// --- partial reports ------------------------------------------------------------

test('an outstanding-only report (balance column only) keeps stored totals and status', () => {
  const stored = toInvoiceRecord(base({ totalCents: 200000, paidCents: 50000, balanceCents: 150000, dueDate: '2026-12-15', sourceStatus: 'Partially Paid', statusHint: 'open' }), opts)
  const row = base({ totalCents: null, paidCents: null, balanceCents: 150000, invoiceDate: null, sourceStatus: null, statusHint: null, dueDate: '2026-12-15' })
  const r = reconcileInvoice(stored, row, { ...opts, mappedFields: ['externalClientId', 'clientName', 'externalInvoiceId', 'dueDate', 'balanceAmount'] })
  assert.equal(r.action, 'unchanged', JSON.stringify(r.changes))
  assert.equal(r.record.totalCents, 200000)
  assert.equal(r.record.status, 'partial')
})

test('a lower balance in a balance-only report drops the stale amount paid instead of contradicting it', () => {
  const stored = toInvoiceRecord(base({ totalCents: 200000, paidCents: 50000, balanceCents: 150000 }), opts)
  const row = base({ totalCents: null, paidCents: null, balanceCents: 100000 })
  const r = reconcileInvoice(stored, row, { ...opts, mappedFields: ['externalInvoiceId', 'balanceAmount'] })
  assert.equal(r.record.status, 'partial', 'not needs_review from 200000 - 50000 != 100000')
  assert.equal(r.record.paidCents, null)
  assert.equal(r.record.totalCents, 200000)
})

test('a balance-only report showing zero settles it as paid', () => {
  const stored = toInvoiceRecord(base({ totalCents: 200000, paidCents: 50000, balanceCents: 150000, statusHint: 'open', sourceStatus: 'Partial' }), opts)
  const r = reconcileInvoice(stored, base({ totalCents: null, balanceCents: 0 }), { ...opts, mappedFields: ['externalInvoiceId', 'balanceAmount'] })
  assert.equal(r.record.status, 'paid', 'the stale "Partial" status text must not veto a zero balance')
})

test('a balance-only report after an installment was paid does not call the client overdue', () => {
  // Stored: on a plan, next installment Sep 1, $2,000 owed.
  const stored = toInvoiceRecord(base({ totalCents: 600000, paidCents: 400000, balanceCents: 200000, paymentPlanText: 'Monthly', nextInstallmentDate: '2026-09-01', nextInstallmentCents: 50000 }), { asOfDate: '2026-08-20', reportDate: '2026-08-20' })
  // Oct 15 outstanding-only report: $1,500 owed (September was paid), no installment columns.
  const r = reconcileInvoice(stored, base({ totalCents: null, balanceCents: 150000 }), { asOfDate: '2026-10-15', reportDate: '2026-10-15', mappedFields: ['externalInvoiceId', 'balanceAmount'] })
  assert.notEqual(r.record.status, 'overdue')
  assert.equal(r.record.status, 'needs_review', 'on a plan with no known next installment: ask, do not guess')
  assert.equal(r.record.nextInstallmentDate, null)
})

test('an unchanged balance keeps the stored installment date', () => {
  const stored = toInvoiceRecord(base({ totalCents: 600000, paidCents: 400000, balanceCents: 200000, paymentPlanText: 'Monthly', nextInstallmentDate: '2026-11-01' }), opts)
  const r = reconcileInvoice(stored, base({ totalCents: null, balanceCents: 200000 }), { ...opts, mappedFields: ['externalInvoiceId', 'balanceAmount'] })
  assert.equal(r.record.nextInstallmentDate, '2026-11-01')
  assert.equal(r.action, 'unchanged')
})
