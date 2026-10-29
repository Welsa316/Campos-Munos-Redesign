// Turn a ParsedTable plus a confirmed ColumnMapping into NormalizedInvoice /
// NormalizedPayment records (see ./model.js). Nothing here fixes data: every
// parse failure, contradiction or ambiguity becomes a RowIssue for staff, and
// the stated values are kept as the source gave them.
//
// Row routing:
//   payment_transactions          every row is a payment
//   invoice_summary, outstanding_only  every row is an invoice
//   mixed  a row is a PAYMENT row when it has a value in paymentAmount,
//          paymentDate or externalPaymentId AND no value in totalAmount,
//          paidAmount or balanceAmount. Every other row is an invoice row (a
//          row with both gets a 'payment_values_ignored' warning).
// Fully blank rows are skipped (counted in skippedBlankRows).

import { REPORT_TYPES } from './model.js'
import { parseMoneyToCents, formatCents } from './money.js'
import { parseDate } from './dates.js'

const STATUS_HINTS = {
  void: ['void', 'voided', 'cancelled', 'canceled', 'anulada', 'anulado', 'cancelada', 'cancelado'],
  paid: ['paid', 'paid in full', 'fully paid', 'pagada', 'pagado', 'pagada en su totalidad', 'pagado en su totalidad'],
  open: [
    'open', 'unpaid', 'partial', 'partially paid', 'part paid', 'overdue', 'past due', 'due', 'outstanding',
    'pendiente', 'vencida', 'vencido', 'parcial', 'parcialmente pagada', 'pagada parcialmente', 'abierta', 'no pagada',
  ],
}

const PAYMENT_TYPE_WORDS = {
  payment: ['payment', 'pago', 'payment received', 'pago recibido', 'abono'],
  credit: ['credit', 'credito', 'credit memo', 'nota de credito'],
  adjustment: ['adjustment', 'ajuste', 'write off', 'writeoff', 'write-off', 'castigo'],
  refund: ['refund', 'reembolso', 'devolucion'],
}

/** Lowercase, strip accents, collapse punctuation/space. */
function plain(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim()
}

const STATUS_LOOKUP = new Map()
for (const [hint, words] of Object.entries(STATUS_HINTS)) for (const w of words) STATUS_LOOKUP.set(plain(w), hint)
const TYPE_LOOKUP = new Map()
for (const [type, words] of Object.entries(PAYMENT_TYPE_WORDS)) for (const w of words) TYPE_LOOKUP.set(plain(w), type)

/** @returns {'void'|'paid'|'open'|null} */
export function statusHintFrom(text) {
  if (text === null || text === undefined || String(text).trim() === '') return null
  return STATUS_LOOKUP.get(plain(text)) || null
}

/** @returns {'payment'|'credit'|'adjustment'|'refund'|null} null = unrecognised text */
export function paymentTypeFrom(text) {
  if (text === null || text === undefined || String(text).trim() === '') return 'payment'
  return TYPE_LOOKUP.get(plain(text)) || null
}

const collapse = (s) => s.replace(/\s+/g, ' ').trim()

function normalizeCurrency(text, fallback) {
  if (text === null) return { currency: fallback, error: null }
  const t = text.trim().toUpperCase()
  if (t === '$' || t === 'US$' || t === 'US DOLLAR' || t === 'US DOLLARS' || t === 'DOLLARS') return { currency: 'USD', error: null }
  if (/^[A-Z]{3}$/.test(t)) return { currency: t, error: null }
  return { currency: fallback, error: `"${text}" is not a currency code` }
}

/**
 * @param {import('./model.js').ParsedTable} table
 * @param {import('./model.js').ColumnMapping} mapping
 * @param {{ reportType: string, reportDate?: string|null, defaultCurrency?: string }} opts
 * @returns {{ invoices: import('./model.js').NormalizedInvoice[],
 *             payments: import('./model.js').NormalizedPayment[],
 *             issues: import('./model.js').RowIssue[],
 *             reportDate: string|null,
 *             skippedBlankRows: number }}
 */
export function normalizeRows(table, mapping, { reportType, reportDate = null, defaultCurrency = 'USD' } = {}) {
  if (!REPORT_TYPES.includes(reportType)) throw new Error(`Unknown report type "${reportType}"`)
  if (!/^[A-Z]{3}$/.test(defaultCurrency)) throw new Error(`defaultCurrency must be an ISO 4217 code, got "${defaultCurrency}"`)
  const headers = table.headers
  const fields = (mapping && mapping.fields) || {}
  const fileIssues = []

  const cell = (row, key) => {
    const idx = fields[key]
    if (idx === undefined || idx === null) return null
    const v = row[idx]
    if (v === undefined || v === null) return null
    const t = String(v).replace(/ /g, ' ').trim()
    return t === '' ? null : t
  }
  const text = (row, key) => {
    const v = cell(row, key)
    return v === null ? null : collapse(v)
  }

  // ---- report date -------------------------------------------------------
  let resolvedReportDate = null
  if (reportDate !== null && reportDate !== undefined && reportDate !== '') {
    const r = parseDate(reportDate)
    if (r.error || !r.date) throw new Error(`reportDate option: ${r.error || 'blank'}`)
    resolvedReportDate = r.date
  } else if (fields.reportDate !== undefined) {
    const seen = new Set()
    let bad = 0
    for (const row of table.rows) {
      const v = cell(row, 'reportDate')
      if (v === null) continue
      const r = parseDate(v)
      if (r.error) bad++
      else seen.add(r.date)
    }
    if (seen.size === 1 && bad === 0) resolvedReportDate = [...seen][0]
    else if (seen.size > 1) fileIssues.push({ field: 'reportDate', code: 'report_date_conflict', severity: 'warning', message: `Rows disagree on the report date (${[...seen].sort().join(', ')}); enter the report date manually.` })
    else if (bad > 0) fileIssues.push({ field: 'reportDate', code: 'invalid_date', severity: 'warning', message: 'The report date column could not be read; enter the report date manually.' })
  }
  if (!resolvedReportDate && !fileIssues.some((i) => i.field === 'reportDate')) {
    fileIssues.push({ field: 'reportDate', code: 'no_report_date', severity: 'warning', message: 'The file has no report date column. Enter the date the report was generated before previewing.' })
  }

  const invoices = []
  const payments = []
  let skippedBlankRows = 0

  table.rows.forEach((row, i) => {
    const rowNumber = i + 1
    if (row.every((c) => String(c ?? '').trim() === '')) { skippedBlankRows++; return }
    const raw = {}
    headers.forEach((h, k) => { raw[h] = row[k] === undefined ? '' : String(row[k]) })

    let isPayment
    if (reportType === 'payment_transactions') isPayment = true
    else if (reportType === 'mixed') {
      const hasPay = ['paymentAmount', 'paymentDate', 'externalPaymentId'].some((k) => cell(row, k) !== null)
      const hasInv = ['totalAmount', 'paidAmount', 'balanceAmount'].some((k) => cell(row, k) !== null)
      isPayment = hasPay && !hasInv
    } else isPayment = false

    const issues = []
    const issue = (field, code, severity, message) => issues.push({ field, code, severity, message })
    const money = (key) => {
      const v = cell(row, key)
      const r = parseMoneyToCents(v)
      if (r.error) issue(key, 'invalid_money', 'error', `${key}: ${r.error}`)
      return r.cents
    }
    const date = (key) => {
      const v = cell(row, key)
      const r = parseDate(v)
      if (r.error) issue(key, 'invalid_date', 'error', `${key}: ${r.error}`)
      else if (r.date && (r.date < '2000-01-01' || r.date > '2100-12-31')) {
        issue(key, 'implausible_date', 'warning', `${key}: "${v}" was read as ${r.date}; check the column holds dates.`)
      }
      return r.date
    }
    const cur = normalizeCurrency(cell(row, 'currency'), defaultCurrency)
    if (cur.error) issue('currency', 'invalid_currency', 'error', cur.error)
    else if (cur.currency !== defaultCurrency) issue('currency', 'non_default_currency', 'warning', `Row is in ${cur.currency}, not ${defaultCurrency}.`)

    if (isPayment) {
      const amountRaw = money('paymentAmount')
      if (cell(row, 'paymentAmount') === null) issue('paymentAmount', 'missing', 'error', 'Payment row has no amount.')
      const typeText = text(row, 'paymentType')
      let paymentType = paymentTypeFrom(typeText)
      if (paymentType === null) {
        issue('paymentType', 'unknown_payment_type', 'error', `Transaction type "${typeText}" is not recognised; it must be a payment, credit, adjustment or refund.`)
        paymentType = 'payment'
      }
      let amountCents = amountRaw
      if (amountRaw !== null && amountRaw < 0) {
        amountCents = -amountRaw
        if (paymentType !== 'refund') {
          issue('paymentAmount', 'negative_payment', 'error', `A ${paymentType} of a negative amount is ambiguous (refund? reversal? correction?); it is not imported until staff decide.`)
        }
      } else if (amountRaw === 0) {
        issue('paymentAmount', 'zero_amount', 'warning', 'Payment amount is zero.')
      }
      const paymentDate = date('paymentDate')
      if (paymentDate === null && cell(row, 'paymentDate') === null) issue('paymentDate', 'missing', 'warning', 'Payment row has no date.')
      payments.push({
        kind: 'payment',
        rowNumber,
        externalPaymentId: text(row, 'externalPaymentId'),
        externalInvoiceId: text(row, 'externalInvoiceId'),
        externalClientId: text(row, 'externalClientId'),
        clientName: text(row, 'clientName'),
        paymentDate,
        amountCents,
        paymentType,
        method: text(row, 'paymentMethod'),
        reference: text(row, 'paymentReference'),
        currency: cur.currency,
        issues,
        raw,
      })
      return
    }

    // ---- invoice row ------------------------------------------------------
    const externalInvoiceId = text(row, 'externalInvoiceId')
    if (externalInvoiceId === null) issue('externalInvoiceId', 'missing', 'error', 'Invoice row has no invoice ID.')
    const totalCents = money('totalAmount')
    const paidCents = money('paidAmount')
    const balanceCents = money('balanceAmount')
    const nextInstallmentCents = money('nextInstallmentAmount')
    const invoiceDate = date('invoiceDate')
    const dueDate = date('dueDate')
    const nextInstallmentDate = date('nextInstallmentDate')
    const lastPaymentDate = date('lastPaymentDate')
    const sourceStatus = text(row, 'invoiceStatus')
    const statusHint = statusHintFrom(sourceStatus)
    if (sourceStatus !== null && statusHint === null) {
      issue('invoiceStatus', 'unknown_status', 'warning', `Status "${sourceStatus}" is not recognised; balances decide the status.`)
    }
    if (reportType === 'mixed' && ['paymentAmount', 'paymentDate', 'externalPaymentId'].some((k) => cell(row, k) !== null)) {
      issue('_row', 'payment_values_ignored', 'warning', 'Row has invoice amounts and payment values; it was read as an invoice and its payment columns were not imported.')
    }

    // Contradictions: reported, never resolved here.
    // A voided invoice legitimately shows total > 0 with balance 0, so the
    // arithmetic check does not apply to it; a void with money still owed does.
    const voidSettled = statusHint === 'void' && balanceCents === 0
    if (statusHint === 'void' && balanceCents !== null && balanceCents !== 0) {
      issue('invoiceStatus', 'void_with_balance', 'warning', 'Status says void but a balance is stated.')
    }
    if (!voidSettled && totalCents !== null && paidCents !== null && balanceCents !== null && totalCents - paidCents !== balanceCents) {
      issue('balanceAmount', 'balance_mismatch', 'error', `Total ${formatCents(totalCents)} minus paid ${formatCents(paidCents)} is ${formatCents(totalCents - paidCents)}, but the report states a balance of ${formatCents(balanceCents)}. Which figure is right cannot be decided automatically.`)
    }
    if (totalCents !== null && balanceCents !== null && balanceCents > totalCents) {
      issue('balanceAmount', 'balance_exceeds_total', 'error', 'The stated balance is larger than the invoice total.')
    }
    if (totalCents !== null && paidCents !== null && paidCents > totalCents) {
      issue('paidAmount', 'paid_exceeds_total', 'warning', 'More has been paid than the invoice total (overpayment or a data error).')
    }
    if (balanceCents !== null && balanceCents < 0) issue('balanceAmount', 'negative_balance', 'warning', 'The balance is negative (a credit owed to the client?).')
    if (totalCents !== null && totalCents < 0) issue('totalAmount', 'negative_total', 'warning', 'The invoice total is negative.')
    if (paidCents !== null && paidCents < 0) issue('paidAmount', 'negative_paid', 'warning', 'The amount paid is negative.')
    if (statusHint === 'paid' && balanceCents !== null && balanceCents > 0) {
      issue('invoiceStatus', 'status_balance_conflict', 'warning', 'Status says paid but a balance remains.')
    }
    if (statusHint === 'open' && balanceCents === 0) {
      issue('invoiceStatus', 'status_balance_conflict', 'warning', 'Status says open but the balance is zero.')
    }

    invoices.push({
      kind: 'invoice',
      rowNumber,
      externalInvoiceId,
      externalClientId: text(row, 'externalClientId'),
      clientName: text(row, 'clientName'),
      invoiceDate,
      dueDate,
      totalCents,
      paidCents,
      balanceCents,
      sourceStatus,
      statusHint,
      paymentPlanText: text(row, 'paymentPlan'),
      nextInstallmentDate,
      nextInstallmentCents,
      lastPaymentDate,
      currency: cur.currency,
      issues,
      raw,
    })
  })

  flagDuplicates(invoices, 'externalInvoiceId', 'Invoice')
  flagDuplicates(payments, 'externalPaymentId', 'Payment')

  return { invoices, payments, issues: fileIssues, reportDate: resolvedReportDate, skippedBlankRows }
}

/**
 * Second and later rows with an id already seen get 'duplicate_in_file'
 * (error), or 'repeated_row' (warning) when every cell is identical to the
 * first. The first row gets a 'has_duplicates' ERROR when any later row
 * conflicts with it, because which row is right is unknown.
 */
function flagDuplicates(records, idKey, label) {
  const first = new Map()
  for (const rec of records) {
    const id = rec[idKey]
    if (id === null) continue
    const sig = JSON.stringify(Object.values(rec.raw))
    const prev = first.get(id)
    if (!prev) { first.set(id, { rec, sig, conflicted: false }); continue }
    if (prev.sig === sig) {
      rec.issues.push({ field: idKey, code: 'repeated_row', severity: 'warning', message: `${label} ${id} repeats row ${prev.rec.rowNumber} exactly; it is counted once.` })
    } else {
      rec.issues.push({ field: idKey, code: 'duplicate_in_file', severity: 'error', message: `${label} ${id} already appears on row ${prev.rec.rowNumber} with different values.` })
      if (!prev.conflicted) {
        prev.conflicted = true
        prev.rec.issues.push({ field: idKey, code: 'has_duplicates', severity: 'error', message: `${label} ${id} appears again later in the file with different values; which row is right is unknown.` })
      }
    }
  }
}

export default { normalizeRows, statusHintFrom, paymentTypeFrom }
