// Shared contract for the billing module. Every other billing file produces
// or consumes these shapes, so the parsers, the reconciliation engine, the
// monday.com sync and the UI agree without importing each other.
//
// Money is ALWAYS integer cents (Number, safe up to 2^53, i.e. far beyond any
// invoice). Never a float dollar amount. Dates are 'YYYY-MM-DD' strings in the
// firm's calendar (no time zone shifts); timestamps are ISO strings.

/** Columns an eImmigration report may carry, in our vocabulary. */
export const CANONICAL_FIELDS = [
  // key, label, kind, required-for (report types that need it to be useful)
  { key: 'externalClientId', label: 'eImmigration client ID', kind: 'id' },
  { key: 'clientName', label: 'Client name', kind: 'text' },
  { key: 'externalInvoiceId', label: 'Invoice ID', kind: 'id' },
  { key: 'invoiceDate', label: 'Invoice date', kind: 'date' },
  { key: 'dueDate', label: 'Due date', kind: 'date' },
  { key: 'totalAmount', label: 'Invoice total', kind: 'money' },
  { key: 'paidAmount', label: 'Amount paid', kind: 'money' },
  { key: 'balanceAmount', label: 'Balance due', kind: 'money' },
  { key: 'invoiceStatus', label: 'Invoice status', kind: 'text' },
  { key: 'paymentPlan', label: 'Payment plan', kind: 'text' },
  { key: 'nextInstallmentDate', label: 'Next installment due', kind: 'date' },
  { key: 'nextInstallmentAmount', label: 'Next installment amount', kind: 'money' },
  { key: 'lastPaymentDate', label: 'Last payment date', kind: 'date' },
  { key: 'currency', label: 'Currency', kind: 'text' },
  { key: 'reportDate', label: 'Report generated', kind: 'date' },
  // Payment-transaction reports
  { key: 'externalPaymentId', label: 'Payment ID', kind: 'id' },
  { key: 'paymentDate', label: 'Payment date', kind: 'date' },
  { key: 'paymentAmount', label: 'Payment amount', kind: 'money' },
  { key: 'paymentMethod', label: 'Payment method', kind: 'text' },
  { key: 'paymentReference', label: 'Payment reference', kind: 'text' },
  { key: 'paymentType', label: 'Transaction type', kind: 'text' },
]

export const FIELD_KEYS = CANONICAL_FIELDS.map((f) => f.key)

/**
 * What a report contains. We never assume: the importer proposes one from
 * the mapped columns and staff confirm it in the preview.
 *   invoice_summary       every invoice the firm has, with balances
 *   outstanding_only      only invoices with money still owed
 *   payment_transactions  one row per payment / credit / adjustment
 *   mixed                 invoice rows and payment rows in one file
 *
 * IMPORTANT: an invoice missing from ANY report type is never treated as
 * paid. outstanding_only reports in particular say nothing about absent rows.
 */
export const REPORT_TYPES = ['invoice_summary', 'outstanding_only', 'payment_transactions', 'mixed']

/** Our status for an invoice after reconciliation. */
export const INVOICE_STATUSES = [
  'paid',          // authoritative data shows nothing owed
  'partial',       // something paid, balance remains, not past due
  'unpaid',        // nothing paid yet, not past due
  'overdue',       // balance remains and the relevant due date has passed
  'void',          // cancelled / voided at source
  'needs_review',  // data insufficient or contradictory: never guessed
]

/** Payment row types. Credits/adjustments reduce balance only as the source says. */
export const PAYMENT_TYPES = ['payment', 'credit', 'adjustment', 'refund']

/**
 * @typedef {Object} RowIssue
 * @property {string} field     canonical field key, or '_row'
 * @property {string} code      machine code, e.g. 'missing', 'invalid_money', 'duplicate_in_file'
 * @property {'error'|'warning'} severity  error = row cannot be imported as-is
 * @property {string} message   human sentence for the preview
 */

/**
 * @typedef {Object} NormalizedInvoice
 * @property {'invoice'} kind
 * @property {number} rowNumber          1-based data row in the file (header = row 0)
 * @property {string|null} externalInvoiceId
 * @property {string|null} externalClientId
 * @property {string|null} clientName
 * @property {string|null} invoiceDate   YYYY-MM-DD
 * @property {string|null} dueDate
 * @property {number|null} totalCents
 * @property {number|null} paidCents
 * @property {number|null} balanceCents  as stated by the source; null if absent
 * @property {string|null} sourceStatus  raw status text from the report
 * @property {'void'|'paid'|'open'|null} statusHint  our reading of sourceStatus
 * @property {string|null} paymentPlanText raw plan description, if any
 * @property {string|null} nextInstallmentDate
 * @property {number|null} nextInstallmentCents
 * @property {string|null} lastPaymentDate
 * @property {string} currency           ISO 4217, default 'USD'
 * @property {RowIssue[]} issues
 * @property {Object<string,string>} raw  original cells keyed by header
 */

/**
 * @typedef {Object} NormalizedPayment
 * @property {'payment'} kind
 * @property {number} rowNumber
 * @property {string|null} externalPaymentId
 * @property {string|null} externalInvoiceId
 * @property {string|null} externalClientId
 * @property {string|null} clientName
 * @property {string|null} paymentDate
 * @property {number|null} amountCents   positive for money received; credits positive too, refunds positive with type 'refund'
 * @property {'payment'|'credit'|'adjustment'|'refund'} paymentType
 * @property {string|null} method
 * @property {string|null} reference
 * @property {string} currency
 * @property {RowIssue[]} issues
 * @property {Object<string,string>} raw
 */

/**
 * @typedef {Object} ParsedTable   output of the CSV / XLSX parsers
 * @property {string[]} headers
 * @property {string[][]} rows    cell text, same length as headers (padded)
 * @property {string|null} sheetName
 * @property {Object} [meta]      e.g. { delimiter } or { sheetNames }
 */

/**
 * @typedef {Object} ColumnMapping
 * @property {Object<string, number>} fields   canonical key → header index
 * @property {string[]} unmappedHeaders
 * @property {Object<string, 'alias'|'manual'>} source  how each field was mapped
 */

/**
 * Client summary pushed to monday.com. One per matched monday item.
 * @typedef {Object} ClientBillingSummary
 * @property {string} mondayItemId
 * @property {'paid'|'partial'|'unpaid'|'overdue'|'needs_review'|'no_invoices'} overallStatus
 * @property {number} outstandingCents
 * @property {string|null} lastPaymentDate
 * @property {string|null} nextDueDate
 * @property {string} syncedAt            ISO timestamp
 */

/**
 * monday.com client-management provider interface. Implemented by
 * providers/monday/mock.js and providers/monday/api.js.
 *
 *   mode: 'mock' | 'api'
 *   validateConnection() → { ok, account?: {id,name}, user?: {id,name,email}, error? }
 *   listBoards() → [{ id, name, itemsCount }]
 *   getBoardColumns(boardId) → [{ id, title, type, settings }]
 *   listItems(boardId, { cursor?, limit? }) →
 *       { items: [{ id, name, columns: { [columnId]: { text, value } } }], cursor }
 *   updateItemColumns(boardId, itemId, columnValues) → { ok, itemId, error? }
 *       columnValues is the object passed to change_multiple_column_values.
 */

export default { CANONICAL_FIELDS, FIELD_KEYS, REPORT_TYPES, INVOICE_STATUSES, PAYMENT_TYPES }
