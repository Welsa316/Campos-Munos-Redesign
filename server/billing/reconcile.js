// Reconciliation: what does a report row mean for our record of an invoice?
// Pure functions, no I/O, so every rule here is unit-tested directly.
//
// Rules that protect clients (docs/billing-automation-plan.md, section 6):
//   - An invoice is 'paid' only when the source's own figures settle it: an
//     authoritative balance of 0, or a total and an amount paid that are equal.
//   - It is 'overdue' only when money is owed AND the due date that applies
//     (the next installment's, when there is a payment plan) is before the
//     report's as-of date. A future installment never makes it overdue.
//   - Anything contradictory or incomplete is 'needs_review', never a guess.
//   - An invoice missing from a report is never marked paid. An older report
//     never overwrites data from a newer one.

const MONEY_FIELDS = ['totalCents', 'paidCents', 'balanceCents', 'nextInstallmentCents']

/**
 * Status of one invoice from source figures.
 * @returns {{ status, balanceCents: number|null, balanceSource, reviewReason: string|null }}
 */
export function deriveStatus(inv, asOfDate) {
  if (inv.statusHint === 'void') {
    return { status: 'void', balanceCents: inv.balanceCents ?? null, balanceSource: inv.balanceCents != null ? 'authoritative' : 'unknown', reviewReason: null }
  }

  let balance = null
  let balanceSource = 'unknown'
  if (inv.balanceCents != null) {
    balance = inv.balanceCents
    balanceSource = 'authoritative'
    if (inv.totalCents != null && inv.paidCents != null && inv.totalCents - inv.paidCents !== balance) {
      return review(balance, balanceSource, 'Total minus amount paid does not equal the balance in the report')
    }
  } else if (inv.totalCents != null && inv.paidCents != null) {
    balance = inv.totalCents - inv.paidCents
    balanceSource = 'computed'
  } else {
    return review(null, 'unknown', 'The report gives no balance, and no total and amount paid to compute one')
  }

  if (balance < 0) return review(balance, balanceSource, 'Negative balance (overpayment or credit): confirm in eImmigration')
  if (inv.totalCents != null && balance > inv.totalCents) return review(balance, balanceSource, 'Balance is larger than the invoice total')

  if (balance === 0) {
    if (inv.statusHint === 'open') return review(balance, balanceSource, 'Balance is zero but eImmigration marks the invoice open')
    return { status: 'paid', balanceCents: 0, balanceSource, reviewReason: null }
  }

  // Money is owed from here on.
  if (inv.statusHint === 'paid') return review(balance, balanceSource, 'eImmigration marks the invoice paid but a balance remains')

  const hasPlan = Boolean(inv.paymentPlanText) || inv.nextInstallmentDate != null
  const relevantDue = hasPlan ? inv.nextInstallmentDate : inv.dueDate
  if (hasPlan && !inv.nextInstallmentDate) {
    return review(balance, balanceSource, 'On a payment plan but the report gives no next installment date')
  }

  if (relevantDue && asOfDate && relevantDue < asOfDate) {
    return { status: 'overdue', balanceCents: balance, balanceSource, reviewReason: null }
  }

  const somethingPaid = (inv.paidCents != null && inv.paidCents > 0)
    || (inv.paidCents == null && inv.totalCents != null && inv.totalCents > balance)
  return { status: somethingPaid ? 'partial' : 'unpaid', balanceCents: balance, balanceSource, reviewReason: null }
}

function review(balanceCents, balanceSource, reviewReason) {
  return { status: 'needs_review', balanceCents, balanceSource, reviewReason }
}

/** The DB-facing record we would store for this row. */
export function toInvoiceRecord(inv, { asOfDate, reportDate }) {
  const s = deriveStatus(inv, asOfDate)
  return {
    externalInvoiceId: inv.externalInvoiceId,
    externalClientId: inv.externalClientId ?? null,
    clientName: inv.clientName ?? null,
    invoiceDate: inv.invoiceDate ?? null,
    dueDate: inv.dueDate ?? null,
    totalCents: inv.totalCents ?? null,
    paidCents: inv.paidCents ?? null,
    balanceCents: s.balanceCents,
    balanceSource: s.balanceSource,
    currency: inv.currency || 'USD',
    sourceStatus: inv.sourceStatus ?? null,
    status: s.status,
    reviewReason: s.reviewReason,
    paymentPlanText: inv.paymentPlanText ?? null,
    nextInstallmentDate: inv.nextInstallmentDate ?? null,
    nextInstallmentCents: inv.nextInstallmentCents ?? null,
    lastPaymentDate: inv.lastPaymentDate ?? null,
    reportDate: reportDate ?? null,
  }
}

// Fields whose change counts as a real change (reportDate alone does not).
const COMPARED = [
  'externalClientId', 'clientName', 'invoiceDate', 'dueDate', 'totalCents', 'paidCents',
  'balanceCents', 'balanceSource', 'currency', 'sourceStatus', 'status', 'reviewReason',
  'paymentPlanText', 'nextInstallmentDate', 'nextInstallmentCents', 'lastPaymentDate',
]

// Which stored fields come from which report column. A field whose column
// the report does not have keeps its stored value: an outstanding-only report
// carries balances but no totals, and must not blank the totals we have.
const SOURCE_OF = {
  externalClientId: 'externalClientId', clientName: 'clientName', invoiceDate: 'invoiceDate',
  dueDate: 'dueDate', totalCents: 'totalAmount', paidCents: 'paidAmount', balanceCents: 'balanceAmount',
  sourceStatus: 'invoiceStatus', paymentPlanText: 'paymentPlan', nextInstallmentDate: 'nextInstallmentDate',
  nextInstallmentCents: 'nextInstallmentAmount', lastPaymentDate: 'lastPaymentDate', currency: 'currency',
}

/**
 * Fill the fields this report does not carry from the stored record.
 * Paid and balance move together: a stored amount paid is carried forward
 * only if this report leaves the balance where it was (otherwise the old
 * figure would contradict the new balance, and we would be guessing).
 * A stored status text is never used to judge the new figures.
 */
export function mergeWithExisting(existing, inv, mappedFields) {
  if (!existing || !mappedFields) return inv
  const present = new Set(mappedFields)
  const merged = { ...inv }
  for (const [field, source] of Object.entries(SOURCE_OF)) {
    if (present.has(source)) continue
    if (field === 'paidCents') continue
    if (field === 'sourceStatus') continue
    merged[field] = existing[field] ?? null
  }
  if (!present.has('paidAmount')) {
    const balanceUnchanged = !present.has('balanceAmount') || existing.balanceCents === merged.balanceCents
    merged.paidCents = balanceUnchanged ? (existing.paidCents ?? null) : null
  }
  if (!present.has('invoiceStatus')) {
    merged.sourceStatus = existing.sourceStatus ?? null
    merged.statusHint = null
  }
  return merged
}

/**
 * Decide what one invoice row does.
 *
 * @param {object|null} existing  current record (same shape as toInvoiceRecord) or null
 * @param {object} inv            NormalizedInvoice
 * @param {object} opts           { asOfDate, reportDate }
 * @returns {{ action: 'insert'|'update'|'unchanged'|'skip'|'stale', record, changes, reason }}
 */
export function reconcileInvoice(existing, inv, { asOfDate, reportDate, mappedFields = null }) {
  const errors = (inv.issues || []).filter((i) => i.severity === 'error')
  if (errors.length) {
    return { action: 'skip', record: null, changes: [], reason: errors.map((e) => e.message).join('; ') }
  }
  const record = toInvoiceRecord(mergeWithExisting(existing, inv, mappedFields), { asOfDate, reportDate })
  if (!existing) return { action: 'insert', record, changes: diff(null, record), reason: null }

  // A report generated before the one we last applied must not roll the
  // invoice back. Same-day reports are allowed: that is how a corrected
  // export replaces a wrong one.
  if (existing.reportDate && reportDate && reportDate < existing.reportDate) {
    return { action: 'stale', record: null, changes: [], reason: `Report dated ${reportDate} is older than the last applied report (${existing.reportDate})` }
  }

  const changes = diff(existing, record)
  if (!changes.length) return { action: 'unchanged', record, changes, reason: null }
  return { action: 'update', record, changes, reason: null }
}

function diff(before, after) {
  const out = []
  for (const f of COMPARED) {
    const a = before ? normalize(before[f]) : null
    const b = normalize(after[f])
    if (a !== b) out.push({ field: f, from: before ? (before[f] ?? null) : null, to: after[f] ?? null })
  }
  return out
}

function normalize(v) {
  if (v == null || v === '') return null
  return String(v)
}

/**
 * Invoices the DB has but this report does not.
 *   outstanding_only / payment_transactions: says nothing about them → no action.
 *   invoice_summary / mixed: flagged 'absent' for staff attention; status is
 *   NOT changed (absence is not evidence of payment).
 */
export function absentInvoices(existingIds, reportIds, reportType) {
  if (reportType !== 'invoice_summary' && reportType !== 'mixed') return []
  const seen = new Set(reportIds)
  return [...existingIds].filter((id) => !seen.has(id))
}

/** Stable dedupe key for a payment row. */
export function paymentDedupeKey(p) {
  if (p.externalPaymentId) return `id:${String(p.externalPaymentId).trim().toLowerCase()}`
  return [
    'row',
    (p.externalInvoiceId || '').trim().toLowerCase(),
    p.paymentDate || '',
    p.amountCents ?? '',
    p.paymentType || 'payment',
    (p.reference || '').trim().toLowerCase(),
  ].join('|')
}

/**
 * Decide what one payment row does. Payments never change an invoice's status
 * on their own: only a report's balances do.
 */
export function reconcilePayment(existing, p) {
  const errors = (p.issues || []).filter((i) => i.severity === 'error')
  if (errors.length) return { action: 'skip', changes: [], reason: errors.map((e) => e.message).join('; ') }
  if (!existing) return { action: 'insert', changes: [], reason: null }
  const fields = ['externalInvoiceId', 'paymentDate', 'amountCents', 'paymentType', 'method', 'reference', 'currency']
  const changes = fields
    .filter((f) => normalize(existing[f]) !== normalize(p[f]))
    .map((f) => ({ field: f, from: existing[f] ?? null, to: p[f] ?? null }))
  return changes.length ? { action: 'update', changes, reason: 'Correction to a payment already imported' } : { action: 'unchanged', changes, reason: null }
}

/**
 * Roll a client's invoices up into the summary pushed to monday.com.
 * Void invoices are ignored. Any invoice needing review makes the client
 * 'needs_review': we do not publish a status we are unsure of.
 */
export function summarizeClient(invoices, payments = [], { today } = {}) {
  const live = invoices.filter((i) => i.status !== 'void')
  if (!live.length) {
    return { overallStatus: 'no_invoices', outstandingCents: 0, lastPaymentDate: lastDate(invoices, payments), nextDueDate: null }
  }
  const outstanding = live.reduce((sum, i) => sum + (i.balanceCents > 0 ? i.balanceCents : 0), 0)
  let overallStatus
  if (live.some((i) => i.status === 'needs_review')) overallStatus = 'needs_review'
  else if (live.some((i) => i.status === 'overdue')) overallStatus = 'overdue'
  else if (outstanding === 0) overallStatus = 'paid'
  else if (live.some((i) => i.status === 'partial' || (i.status === 'paid'))) overallStatus = 'partial'
  else overallStatus = 'unpaid'

  const upcoming = live
    .filter((i) => i.balanceCents > 0 && i.status !== 'needs_review')
    .map((i) => (i.paymentPlanText || i.nextInstallmentDate ? i.nextInstallmentDate : i.dueDate))
    .filter(Boolean)
    .filter((d) => !today || d >= today)
    .sort()
  return { overallStatus, outstandingCents: outstanding, lastPaymentDate: lastDate(invoices, payments), nextDueDate: upcoming[0] || null }
}

function lastDate(invoices, payments) {
  const dates = [
    ...invoices.map((i) => i.lastPaymentDate),
    ...payments.filter((p) => p.paymentType === 'payment').map((p) => p.paymentDate),
  ].filter(Boolean).sort()
  return dates.at(-1) || null
}

export { MONEY_FIELDS }
export default { mergeWithExisting, deriveStatus, toInvoiceRecord, reconcileInvoice, absentInvoices, paymentDedupeKey, reconcilePayment, summarizeClient }
