// Column mapping: which header in an uploaded report holds which canonical
// field (see CANONICAL_FIELDS in ./model.js). Detection is a PROPOSAL that
// staff confirm or override in the import preview.

import { FIELD_KEYS, CANONICAL_FIELDS } from './model.js'

// The aliases below are guesses at how eImmigration (and staff-edited
// exports) label their columns. None has been checked against a real
// eImmigration export yet. Flip this to true only after a real export has
// been compared against these lists, and record which export in the commit.
export const ALIASES_VERIFIED = false

// Deliberately absent: bare "amount", "monto", "date", "fecha" and "id".
// They are ambiguous between invoice and payment columns, so they stay
// unmapped until staff pick a field for them.
export const HEADER_ALIASES = {
  externalClientId: [
    'Client ID', 'Client #', 'Client No', 'Client Number', 'Contact ID', 'Contact #', 'Contact Number',
    'Customer ID', 'Customer #', 'Customer Number', 'eImmigration Client ID', 'Client Id Number',
    'ID Cliente', 'ID del Cliente', 'Cliente ID', 'Numero de Cliente', 'No. de Cliente', 'Codigo de Cliente',
  ],
  clientName: [
    'Client Name', 'Client', 'Contact Name', 'Contact', 'Customer Name', 'Customer', 'Full Name', 'Name',
    'Client Full Name', 'Bill To', 'Nombre del Cliente', 'Nombre de Cliente', 'Cliente', 'Nombre', 'Nombre Completo',
  ],
  externalInvoiceId: [
    'Invoice #', 'Invoice No', 'Invoice Number', 'Invoice ID', 'Invoice', 'Inv #', 'Inv No', 'Invoice Ref',
    'Bill Number', 'Bill #', 'Factura', 'Factura #', 'Numero de Factura', 'No. de Factura', 'ID de Factura',
  ],
  invoiceDate: [
    'Invoice Date', 'Date Issued', 'Issue Date', 'Issued', 'Issued On', 'Invoice Created', 'Created Date',
    'Date Created', 'Billing Date', 'Fecha de Factura', 'Fecha de Emision', 'Fecha Factura',
  ],
  dueDate: [
    'Due Date', 'Date Due', 'Due', 'Due On', 'Payment Due Date', 'Invoice Due Date',
    'Fecha de Vencimiento', 'Vencimiento', 'Fecha Limite', 'Fecha Limite de Pago',
  ],
  totalAmount: [
    'Total', 'Invoice Total', 'Invoice Amount', 'Total Amount', 'Amount Billed', 'Billed', 'Total Billed',
    'Total Fees', 'Monto Total', 'Total Factura', 'Total de Factura', 'Importe Total',
    'Monto de Factura', 'Monto Facturado',
  ],
  paidAmount: [
    'Amount Paid', 'Paid', 'Total Paid', 'Paid Amount', 'Paid To Date', 'Payments', 'Total Payments',
    'Payments Received', 'Monto Pagado', 'Pagado', 'Total Pagado', 'Importe Pagado',
  ],
  balanceAmount: [
    'Balance Due', 'Amount Due', 'Balance', 'Outstanding', 'Outstanding Balance', 'Remaining Balance',
    'Open Balance', 'Current Balance', 'Amount Outstanding', 'Remaining', 'Saldo', 'Saldo Pendiente',
    'Saldo Adeudado', 'Saldo Restante', 'Monto Adeudado', 'Monto Pendiente',
  ],
  invoiceStatus: [
    'Status', 'Invoice Status', 'Payment Status', 'Estado', 'Estatus', 'Estado de Factura', 'Estado del Pago',
  ],
  paymentPlan: ['Payment Plan', 'Installment Plan', 'Plan', 'Plan de Pagos', 'Plan de Pago'],
  nextInstallmentDate: [
    'Next Installment Date', 'Next Installment Due', 'Next Payment Due', 'Next Payment Date', 'Next Due Date',
    'Fecha del Proximo Pago', 'Proximo Pago', 'Proxima Cuota', 'Fecha de Proxima Cuota',
  ],
  nextInstallmentAmount: [
    'Next Installment Amount', 'Next Installment', 'Next Payment Amount', 'Installment Amount',
    'Monto de la Proxima Cuota', 'Monto del Proximo Pago', 'Monto de Cuota', 'Cuota',
  ],
  lastPaymentDate: [
    'Last Payment Date', 'Last Payment', 'Last Paid', 'Date Last Paid', 'Last Payment On',
    'Fecha del Ultimo Pago', 'Ultimo Pago',
  ],
  currency: ['Currency', 'Currency Code', 'Moneda', 'Divisa'],
  reportDate: ['Report Date', 'As Of', 'As Of Date', 'Report Generated', 'Generated', 'Generated On', 'Run Date', 'Fecha del Reporte', 'Fecha de Reporte'],
  externalPaymentId: [
    'Payment ID', 'Payment #', 'Payment No', 'Payment Number', 'Transaction ID', 'Transaction #',
    'Transaction No', 'Transaction Number', 'Receipt #', 'Receipt No', 'Receipt Number',
    'ID de Pago', 'Numero de Pago', 'ID de Transaccion', 'Numero de Transaccion', 'Recibo', 'No. de Recibo',
  ],
  paymentDate: [
    'Payment Date', 'Date Paid', 'Paid On', 'Paid Date', 'Transaction Date', 'Received Date', 'Date Received',
    'Fecha de Pago', 'Fecha del Pago', 'Fecha de Transaccion',
  ],
  paymentAmount: [
    'Payment Amount', 'Amount Received', 'Transaction Amount', 'Received', 'Payment', 'Payment Received',
    'Monto del Pago', 'Importe del Pago', 'Monto Recibido',
  ],
  paymentMethod: ['Payment Method', 'Method', 'Pay Method', 'Tender', 'Paid By', 'Forma de Pago', 'Metodo de Pago', 'Metodo'],
  paymentReference: [
    'Reference', 'Payment Reference', 'Ref', 'Ref #', 'Reference #', 'Check #', 'Check Number', 'Check No',
    'Memo', 'Note', 'Referencia', 'Numero de Cheque', 'Nota',
  ],
  paymentType: ['Transaction Type', 'Type', 'Payment Type', 'Entry Type', 'Tipo', 'Tipo de Transaccion', 'Tipo de Pago'],
}

/** Lowercase, strip accents and punctuation, unify "#" / "no" / "num" to "number". */
export function normalizeHeader(h) {
  return String(h ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/#/g, ' number ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => (t === 'no' || t === 'num' || t === 'nbr' || t === 'nro' ? 'number' : t))
    .join(' ')
}

const ALIAS_INDEX = (() => {
  const list = []
  for (const key of FIELD_KEYS) {
    for (const alias of HEADER_ALIASES[key] || []) {
      const norm = normalizeHeader(alias)
      list.push({ key, norm, tokens: norm.split(' ') })
    }
  }
  return list
})()

function containsTokens(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

const KIND = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f.key, f.kind]))
const DATE_WORDS = new Set(['date', 'fecha', 'on', 'dia'])
const QUALIFIERS = new Set(['last', 'next', 'previous', 'prior', 'original', 'ultimo', 'ultima', 'proximo', 'proxima', 'anterior'])
const MONEY_WORDS = new Set(['amount', 'monto', 'importe', 'total', 'balance', 'saldo', 'cantidad'])

/** A partial match must not cross kinds: "Last Payment Amount" is not a date. */
function kindConflict(key, headerTokens, aliasTokens) {
  const extra = headerTokens.filter((t) => !aliasTokens.includes(t))
  if (extra.some((t) => QUALIFIERS.has(t))) return true
  const kind = KIND[key]
  if (kind === 'date') return extra.some((t) => MONEY_WORDS.has(t))
  if (kind === 'money') return extra.some((t) => DATE_WORDS.has(t))
  if (kind === 'id') return extra.some((t) => DATE_WORDS.has(t) || MONEY_WORDS.has(t) || t === 'name' || t === 'nombre')
  return extra.some((t) => DATE_WORDS.has(t) || MONEY_WORDS.has(t))
}

function emptyMapping() {
  return { fields: {}, unmappedHeaders: [], source: {} }
}

function finish(headers, fields, source) {
  const used = new Set(Object.values(fields))
  return { fields, unmappedHeaders: headers.filter((_, i) => !used.has(i)), source }
}

/**
 * Propose a mapping from header spellings. Exact alias matches beat partial
 * ones (header contains a multi-word alias); a header maps to at most one
 * field and a field to at most one header.
 * @param {string[]} headers
 * @returns {import('./model.js').ColumnMapping}
 */
export function detectMapping(headers) {
  if (!Array.isArray(headers)) return emptyMapping()
  const candidates = []
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h)
    if (!norm) return
    const tokens = norm.split(' ')
    for (const a of ALIAS_INDEX) {
      if (a.norm === norm) {
        candidates.push({ idx, key: a.key, score: 10000 }) // ties: leftmost header wins
      } else if (a.tokens.length >= 2 && containsTokens(tokens, a.tokens) && !kindConflict(a.key, tokens, a.tokens)) {
        // Partial: header "Invoice Total (USD)" contains alias "invoice total".
        candidates.push({ idx, key: a.key, score: 100 * a.tokens.length + a.norm.length })
      }
    }
  })
  candidates.sort((x, y) => y.score - x.score || x.idx - y.idx || FIELD_KEYS.indexOf(x.key) - FIELD_KEYS.indexOf(y.key))
  const fields = {}
  const source = {}
  const usedHeaders = new Set()
  for (const c of candidates) {
    if (fields[c.key] !== undefined || usedHeaders.has(c.idx)) continue
    fields[c.key] = c.idx
    source[c.key] = 'alias'
    usedHeaders.add(c.idx)
  }
  return finish(headers, fields, source)
}

/**
 * Start from the detected mapping and apply staff overrides.
 * overrides: { canonicalKey: headerName | headerIndex | null }  (null unmaps)
 * A header claimed by an override is removed from any alias field holding it.
 * Throws on an unknown field, an unknown header, or two overrides naming
 * the same header.
 */
export function applyManualMapping(headers, overrides = {}) {
  const base = detectMapping(headers)
  const fields = { ...base.fields }
  const source = { ...base.source }
  const claimed = new Map()
  for (const [key, target] of Object.entries(overrides || {})) {
    if (!FIELD_KEYS.includes(key)) throw new Error(`Unknown billing field "${key}"`)
    if (target === null || target === undefined || target === '') {
      delete fields[key]
      delete source[key]
      continue
    }
    let idx
    if (typeof target === 'number') {
      idx = Number.isInteger(target) && target >= 0 && target < headers.length ? target : -1
    } else {
      idx = headers.indexOf(target)
      if (idx === -1) idx = headers.findIndex((h) => String(h).trim().toLowerCase() === String(target).trim().toLowerCase())
    }
    if (idx === -1) throw new Error(`Column "${target}" is not in this report`)
    if (claimed.has(idx)) throw new Error(`Column "${headers[idx]}" is assigned to both ${claimed.get(idx)} and ${key}`)
    claimed.set(idx, key)
    for (const [k, v] of Object.entries(fields)) {
      if (v === idx && k !== key) { delete fields[k]; delete source[k] }
    }
    fields[key] = idx
    source[key] = 'manual'
  }
  return finish(headers, fields, source)
}

const has = (mapping, key) => mapping && mapping.fields && mapping.fields[key] !== undefined

/**
 * Propose a report type from which fields are mapped. Always a proposal:
 * staff confirm it in the preview.
 * @returns {{ reportType: string|null, reasons: string[] }}
 */
export function detectReportType(mapping) {
  const reasons = []
  const invoiceMoney = ['totalAmount', 'paidAmount', 'balanceAmount'].filter((k) => has(mapping, k))
  const paymentCols = ['paymentAmount', 'paymentDate', 'externalPaymentId'].filter((k) => has(mapping, k))

  if (paymentCols.length && !invoiceMoney.length) {
    reasons.push(`Payment columns (${paymentCols.join(', ')}) are mapped and no invoice total/paid/balance column is, so each row is read as one payment transaction.`)
    if (!has(mapping, 'paymentAmount')) reasons.push('No payment amount column is mapped; rows cannot be imported until one is.')
    return { reportType: 'payment_transactions', reasons }
  }
  if (paymentCols.length && invoiceMoney.length) {
    reasons.push(`Both invoice amount columns (${invoiceMoney.join(', ')}) and payment columns (${paymentCols.join(', ')}) are mapped, so the file is treated as mixed: each row is routed on its own values (a row with payment values and no invoice amounts is a payment; every other row is an invoice).`)
    return { reportType: 'mixed', reasons }
  }
  if (invoiceMoney.length) {
    reasons.push(`Invoice amount columns (${invoiceMoney.join(', ')}) are mapped, so rows are read as invoices.`)
    reasons.push('Columns cannot show whether the report lists every invoice or only those with money owed. invoice_summary is proposed; choose outstanding_only if the export was filtered to open balances. Either way, an invoice missing from the file is never treated as paid.')
    return { reportType: 'invoice_summary', reasons }
  }
  reasons.push('No invoice amount (total, paid, balance) or payment column is mapped, so the report type cannot be proposed. Map the amount columns first.')
  return { reportType: null, reasons }
}

const INVOICE_TYPES = new Set(['invoice_summary', 'outstanding_only', 'mixed'])
const PAYMENT_TYPES_SET = new Set(['payment_transactions', 'mixed'])

/**
 * What the mapping is missing for this report type.
 * severity 'error' blocks the import; 'warning' degrades it.
 * @returns {{ field: string, severity: 'error'|'warning', message: string }[]}
 */
export function missingFieldWarnings(mapping, reportType) {
  const out = []
  const add = (field, severity, message) => out.push({ field, severity, message })
  if (!reportType) {
    add('_mapping', 'error', 'No report type is selected.')
    return out
  }
  if (INVOICE_TYPES.has(reportType)) {
    if (!has(mapping, 'externalInvoiceId')) add('externalInvoiceId', 'error', 'No invoice ID column: invoices cannot be told apart or matched on re-import.')
    if (!has(mapping, 'balanceAmount') && !has(mapping, 'paidAmount')) {
      add('balanceAmount', 'error', 'No balance or amount-paid column: the import cannot establish what is owed.')
    } else if (!has(mapping, 'totalAmount') && !has(mapping, 'paidAmount')) {
      add('totalAmount', 'warning', 'No invoice total or amount-paid column: partially paid and unpaid invoices cannot be told apart.')
    }
    if (!has(mapping, 'dueDate')) add('dueDate', 'warning', 'No due date column: overdue invoices cannot be detected.')
  }
  if (PAYMENT_TYPES_SET.has(reportType)) {
    if (!has(mapping, 'paymentAmount')) add('paymentAmount', 'error', 'No payment amount column: payment rows cannot be imported.')
    if (!has(mapping, 'paymentDate')) add('paymentDate', 'warning', 'No payment date column: last-payment dates cannot be updated from this file.')
    if (!has(mapping, 'externalPaymentId')) add('externalPaymentId', 'warning', 'No payment/transaction ID column: re-importing the same file cannot be recognised as duplicates.')
    if (!has(mapping, 'externalInvoiceId') && reportType === 'payment_transactions') add('externalInvoiceId', 'warning', 'No invoice ID column: payments can only be attributed to a client, not to a specific invoice.')
  }
  if (!has(mapping, 'externalClientId')) {
    if (!has(mapping, 'clientName')) add('externalClientId', 'error', 'No client ID or client name column: rows cannot be matched to clients.')
    else add('externalClientId', 'warning', 'No client ID column: matching falls back to client names, which are never auto-approved.')
  }
  return out
}

export default { HEADER_ALIASES, ALIASES_VERIFIED, normalizeHeader, detectMapping, applyManualMapping, detectReportType, missingFieldWarnings }
