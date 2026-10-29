import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseReport } from './parsers/index.js'
import { parseCsv } from './parsers/csv.js'
import { detectMapping, applyManualMapping, detectReportType } from './columnMapping.js'
import { normalizeRows, statusHintFrom, paymentTypeFrom } from './normalize.js'

const REPORT_DATE = '2026-10-29'

function load(name, opts = {}) {
  const table = parseReport(readFileSync(new URL(`../fixtures/billing/${name}`, import.meta.url)), { filename: name })
  const mapping = detectMapping(table.headers)
  const reportType = opts.reportType || detectReportType(mapping).reportType
  return { table, mapping, reportType, ...normalizeRows(table, mapping, { reportType, reportDate: REPORT_DATE, ...opts }) }
}
const codes = (rec) => rec.issues.map((i) => `${i.severity}:${i.code}`).sort()
const byId = (list, id) => list.find((r) => r.externalInvoiceId === id)
const amounts = (inv) => [inv.totalCents, inv.paidCents, inv.balanceCents]

test('invoice_summary.csv: every row, exact cents, dates and hints', () => {
  const r = load('invoice_summary.csv')
  assert.equal(r.reportType, 'invoice_summary')
  assert.equal(r.reportDate, REPORT_DATE)
  assert.deepEqual(r.issues, [])
  assert.equal(r.payments.length, 0)
  assert.equal(r.invoices.length, 14)
  const expected = {
    'INV-1001': [150000, 150000, 0, 'paid'],
    'INV-1002': [200000, 50000, 150000, 'open'],
    'INV-1003': [75000, 0, 75000, 'open'],
    'INV-1004': [120000, 20000, 100000, 'open'],
    'INV-1005': [90000, 0, 0, 'void'],
    'INV-1006': [600000, 200000, 400000, 'open'],
    'INV-1007': [30000, 30000, 0, 'paid'],
    'INV-1008': [45050, 0, 45050, 'open'],
    'INV-1009': [100000, 25025, 74975, 'open'],
    'INV-1010': [40000, 0, 40000, 'open'],
    'INV-1011': [65000, 65000, 0, 'paid'],
    'INV-1012': [100000, 10000, 90000, 'open'],
    'INV-1013': [100000, 30000, 80000, 'open'],
    'INV-1014': [12000, 0, 12000, null],
  }
  for (const [id, [t, p, b, hint]] of Object.entries(expected)) {
    const inv = byId(r.invoices, id)
    assert.deepEqual([...amounts(inv), inv.statusHint], [t, p, b, hint], id)
    assert.equal(inv.currency, 'USD')
    assert.equal(inv.kind, 'invoice')
  }
  const first = r.invoices[0]
  assert.equal(first.rowNumber, 1)
  assert.equal(first.invoiceDate, '2026-01-05')
  assert.equal(first.dueDate, '2026-02-04')
  assert.equal(first.lastPaymentDate, '2026-01-20')
  assert.equal(first.raw['Invoice Total'], '$1,500.00')
  assert.equal(first.raw['Client Name'], 'Prueba Uno')
  // Payment plan invoice
  const plan = byId(r.invoices, 'INV-1006')
  assert.equal(plan.paymentPlanText, 'Monthly $500 x 12')
  assert.equal(plan.nextInstallmentDate, '2026-11-15')
  assert.equal(plan.nextInstallmentCents, 50000)
  assert.equal(plan.dueDate, '2027-02-01')
  // One client, three invoices
  assert.deepEqual(r.invoices.filter((i) => i.externalClientId === 'EIM-C-0007').map((i) => i.externalInvoiceId), ['INV-1007', 'INV-1008', 'INV-1009'])
  // Same name, different ids: kept apart, never merged
  const anas = r.invoices.filter((i) => i.clientName === 'Ana Ejemplo')
  assert.deepEqual(anas.map((i) => i.externalClientId), ['EIM-C-0008', 'EIM-C-0009'])
  // Accented name preserved
  assert.equal(byId(r.invoices, 'INV-1012').clientName, 'Prueba Ñandú Pérez')
})

test('balance mismatch is flagged as an error and NOT fixed', () => {
  const r = load('invoice_summary.csv')
  const inv = byId(r.invoices, 'INV-1013')
  assert.deepEqual(codes(inv), ['error:balance_mismatch'])
  assert.deepEqual(amounts(inv), [100000, 30000, 80000]) // stated values kept
  // Every consistent row has no issue.
  const clean = r.invoices.filter((i) => !['INV-1013', 'INV-1014'].includes(i.externalInvoiceId))
  for (const i of clean) assert.deepEqual(i.issues, [], i.externalInvoiceId)
})

test('void with zero balance is not a mismatch; unknown status warns', () => {
  const r = load('invoice_summary.csv')
  assert.deepEqual(byId(r.invoices, 'INV-1005').issues, [])
  const unknown = byId(r.invoices, 'INV-1014')
  assert.equal(unknown.sourceStatus, 'Sent to collections')
  assert.deepEqual(codes(unknown), ['warning:unknown_status'])
})

test('outstanding_only.csv with staff-chosen type', () => {
  const r = load('outstanding_only.csv', { reportType: 'outstanding_only' })
  assert.deepEqual(r.invoices.map((i) => [i.externalInvoiceId, i.balanceCents, i.totalCents, i.paidCents, i.dueDate]), [
    ['INV-1002', 150000, null, null, '2026-12-15'],
    ['INV-1003', 75000, null, null, '2026-11-30'],
    ['INV-1004', 100000, null, null, '2026-08-01'],
    ['INV-1008', 45050, null, null, '2026-12-09'],
  ])
  for (const i of r.invoices) assert.deepEqual(i.issues, [])
})

test('payments.csv: types, refunds, negatives, duplicates', () => {
  const r = load('payments.csv')
  assert.equal(r.reportType, 'payment_transactions')
  assert.equal(r.invoices.length, 0)
  assert.deepEqual(
    r.payments.map((p) => [p.rowNumber, p.externalPaymentId, p.paymentDate, p.amountCents, p.paymentType, codes(p).join(',')]),
    [
      [1, 'PAY-5001', '2026-01-20', 150000, 'payment', ''],
      [2, 'PAY-5002', '2026-09-10', 50000, 'payment', ''],
      [3, 'PAY-5003', '2026-10-15', 200000, 'payment', ''],
      [4, 'PAY-5004', '2026-02-01', 30000, 'payment', 'error:has_duplicates'],
      [5, 'PAY-5004', '2026-02-01', 3000, 'payment', 'error:duplicate_in_file'],
      [6, 'PAY-5005', '2026-08-20', 5000, 'credit', ''],
      [7, 'PAY-5006', '2026-08-22', 2500, 'refund', ''],
      [8, 'PAY-5007', '2026-09-25', 4000, 'payment', 'error:negative_payment'],
      [9, 'PAY-5008', '2026-05-01', 65000, 'payment', ''],
      [10, 'PAY-5008', '2026-05-01', 65000, 'payment', 'warning:repeated_row'],
      [11, 'PAY-5009', '2026-07-15', 30000, 'payment', 'error:unknown_payment_type'],
    ],
  )
  const p2 = r.payments[1]
  assert.equal(p2.method, 'Check')
  assert.equal(p2.reference, 'Check 1042')
  assert.equal(p2.externalInvoiceId, 'INV-1002')
  assert.equal(p2.externalClientId, 'EIM-C-0002')
  assert.equal(p2.kind, 'payment')
})

test('mixed.csv: rows routed by their own values', () => {
  const r = load('mixed.csv')
  assert.equal(r.reportType, 'mixed')
  assert.deepEqual(r.invoices.map((i) => [i.rowNumber, i.externalInvoiceId, ...amounts(i)]), [
    [1, 'INV-1002', 200000, 50000, 150000],
    [3, 'INV-1003', 75000, 0, 75000],
    [4, 'INV-1006', 600000, 200000, 400000],
  ])
  assert.deepEqual(r.payments.map((p) => [p.rowNumber, p.externalPaymentId, p.externalInvoiceId, p.paymentDate, p.amountCents, p.paymentType]), [
    [2, 'PAY-5002', 'INV-1002', '2026-09-10', 50000, 'payment'],
    [5, 'PAY-5003', 'INV-1006', '2026-10-15', 200000, 'payment'],
  ])
  // Invoice ids repeated on payment rows are not invoice duplicates.
  for (const rec of [...r.invoices, ...r.payments]) assert.deepEqual(rec.issues, [])
})

test('mixed row with both invoice amounts and payment values is an invoice with a warning', () => {
  const t = parseCsv('Invoice #,Client ID,Balance Due,Payment Amount\nINV-1,C-1,10.00,5.00\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'mixed', reportDate: REPORT_DATE })
  assert.equal(r.invoices.length, 1)
  assert.equal(r.payments.length, 0)
  assert.deepEqual(codes(r.invoices[0]), ['warning:payment_values_ignored'])
})

test('with_title_rows.csv', () => {
  const r = load('with_title_rows.csv')
  assert.deepEqual(r.invoices.map((i) => [i.externalInvoiceId, ...amounts(i)]), [
    ['INV-1001', 150000, 150000, 0],
    ['INV-1003', 75000, 0, 75000],
  ])
})

test('semicolon.csv: European amounts parsed, ambiguous ones and day-first dates flagged', () => {
  const r = load('semicolon.csv')
  const [a, b] = r.invoices
  assert.equal(a.clientName, 'Prueba; Veinte')
  assert.deepEqual(amounts(a), [125000, null, 100000])
  assert.deepEqual(a.issues.map((i) => `${i.field}:${i.code}`).sort(), ['dueDate:invalid_date', 'paidAmount:invalid_money'])
  assert.equal(a.statusHint, 'open') // "Pendiente"
  assert.deepEqual(amounts(b), [200000, 200000, 0])
  assert.equal(b.statusHint, 'paid') // "Pagada"
  assert.equal(b.dueDate, '2026-01-31')
  assert.deepEqual(b.issues, [])
})

test('invoice_summary.xlsx normalizes like the CSV', () => {
  const r = load('invoice_summary.xlsx')
  assert.deepEqual(r.invoices.map((i) => [i.externalInvoiceId, i.invoiceDate, i.dueDate, ...amounts(i), i.statusHint]), [
    ['INV-1001', '2026-01-05', '2026-02-04', 150000, 150000, 0, 'paid'],
    ['INV-1002', '2026-09-01', '2026-12-15', 200000, 50000, 150000, 'open'],
    ['INV-1009', null, '2026-09-09', 100000, 25025, 74975, 'open'],
    ['INV-1012', '2026-09-20', '2026-12-20', 100000, 10000, 90000, 'open'],
  ])
  for (const i of r.invoices) assert.deepEqual(i.issues, [], i.externalInvoiceId)
})

const table = (csv) => parseCsv(csv)

test('duplicate invoice ids: conflicting → errors on both; identical → repeated_row warning', () => {
  const t = table('Invoice #,Client ID,Total,Paid,Balance\nINV-1,C-1,10.00,0,10.00\nINV-1,C-1,12.00,0,12.00\nINV-2,C-2,5,0,5\nINV-2,C-2,5,0,5\n INV-1 ,C-1,10.00,0,10.00\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  assert.deepEqual(r.invoices.map((i) => [i.rowNumber, i.externalInvoiceId, codes(i).join(',')]), [
    [1, 'INV-1', 'error:has_duplicates'],
    [2, 'INV-1', 'error:duplicate_in_file'],
    [3, 'INV-2', ''],
    [4, 'INV-2', 'warning:repeated_row'],
    // Whitespace around an id is collapsed for comparison, but the raw cells
    // differ, so it is not byte-identical.
    [5, 'INV-1', 'error:duplicate_in_file'],
  ])
})

test('contradictions are flagged, never corrected', () => {
  const t = table('Invoice #,Client ID,Total,Paid,Balance,Status\nA,C,100.00,150.00,0.00,Paid\nB,C,100.00,0,120.00,Open\nC,C,100.00,40.00,60.00,Paid\nD,C,100.00,100.00,0.00,Open\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  const [a, b, c, d] = r.invoices
  assert.deepEqual(codes(a), ['error:balance_mismatch', 'warning:paid_exceeds_total'])
  assert.deepEqual(amounts(a), [10000, 15000, 0])
  assert.deepEqual(codes(b), ['error:balance_exceeds_total', 'error:balance_mismatch'])
  assert.deepEqual(codes(c), ['warning:status_balance_conflict'])
  assert.deepEqual(codes(d), ['warning:status_balance_conflict'])
})

test('per-field parse errors and missing ids', () => {
  const t = table('Invoice #,Client ID,Total,Balance,Due Date\n,C,10.00,10.00,1/1/2026\nX,C,ten,10.00,2/30/2026\nY,C,10.005,10.00,\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  assert.deepEqual(r.invoices[0].issues.map((i) => `${i.field}:${i.code}:${i.severity}`), ['externalInvoiceId:missing:error'])
  assert.deepEqual(r.invoices[1].issues.map((i) => `${i.field}:${i.code}:${i.severity}`), ['totalAmount:invalid_money:error', 'dueDate:invalid_date:error'])
  assert.equal(r.invoices[1].totalCents, null)
  assert.equal(r.invoices[1].dueDate, null)
  assert.deepEqual(r.invoices[2].issues.map((i) => `${i.field}:${i.code}`), ['totalAmount:invalid_money'])
})

test('payment rows: missing amount is an error; negative refund is fine', () => {
  const t = table('Payment ID,Payment Amount,Payment Date,Type\nP1,,1/1/2026,Payment\nP2,-25.00,1/2/2026,Reembolso\nP3,-5.00,1/2/2026,Credit\nP4,0,,Ajuste\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'payment_transactions', reportDate: REPORT_DATE })
  const [p1, p2, p3, p4] = r.payments
  assert.deepEqual(codes(p1), ['error:missing'])
  assert.equal(p1.amountCents, null)
  assert.deepEqual([p2.amountCents, p2.paymentType, codes(p2).join()], [2500, 'refund', ''])
  assert.deepEqual([p3.amountCents, p3.paymentType, codes(p3).join()], [500, 'credit', 'error:negative_payment'])
  assert.deepEqual([p4.amountCents, p4.paymentType, codes(p4).sort().join()], [0, 'adjustment', 'warning:missing,warning:zero_amount'])
})

test('ids and names: whitespace trimmed and collapsed; raw kept as-is', () => {
  const t = table('Invoice #,Client ID,Client Name,Balance\n  INV-9 ,  EIM-C-0099 ,"  Prueba    Nueve  ",1.00\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  const i = r.invoices[0]
  assert.equal(i.externalInvoiceId, 'INV-9')
  assert.equal(i.externalClientId, 'EIM-C-0099')
  assert.equal(i.clientName, 'Prueba Nueve')
  assert.equal(i.raw['Client Name'], '  Prueba    Nueve  ')
})

test('report date: option, agreeing column, conflicting column, absent', () => {
  const mk = (rows) => table(`Invoice #,Client ID,Balance,Report Date\n${rows}`)
  const run = (t, opts = {}) => normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', ...opts })
  const agree = run(mk('A,C,1,10/28/2026\nB,C,1,2026-10-28\n'))
  assert.equal(agree.reportDate, '2026-10-28')
  assert.deepEqual(agree.issues, [])
  const conflict = run(mk('A,C,1,10/28/2026\nB,C,1,10/27/2026\n'))
  assert.equal(conflict.reportDate, null)
  assert.deepEqual(conflict.issues.map((i) => i.code), ['report_date_conflict'])
  const override = run(mk('A,C,1,10/28/2026\n'), { reportDate: '10/29/2026' })
  assert.equal(override.reportDate, '2026-10-29')
  const none = normalizeRows(table('Invoice #,Balance\nA,1\n'), detectMapping(['Invoice #', 'Balance']), { reportType: 'invoice_summary' })
  assert.equal(none.reportDate, null)
  assert.deepEqual(none.issues.map((i) => [i.code, i.severity]), [['no_report_date', 'warning']])
  assert.throws(() => run(mk('A,C,1,\n'), { reportDate: '2/30/2026' }), /reportDate/)
})

test('currency column and default currency', () => {
  const t = table('Invoice #,Client ID,Balance,Currency\nA,C,1.00,usd\nB,C,1.00,EUR\nC,C,1.00,dollars?\nD,C,1.00,\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  assert.deepEqual(r.invoices.map((i) => [i.currency, codes(i).join()]), [
    ['USD', ''], ['EUR', 'warning:non_default_currency'], ['USD', 'error:invalid_currency'], ['USD', ''],
  ])
})

test('blank rows are skipped and counted; row numbers still match the file', () => {
  const t = table('Invoice #,Client ID,Balance\nA,C,1\n,,\nB,C,2\n')
  const r = normalizeRows(t, detectMapping(t.headers), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  assert.deepEqual(r.invoices.map((i) => [i.rowNumber, i.externalInvoiceId]), [[1, 'A'], [3, 'B']])
  assert.equal(r.skippedBlankRows, 1)
})

test('implausible dates (e.g. a year read as an Excel serial) warn', () => {
  const t = table('Invoice #,Client ID,Balance,Due Date\nA,C,1,2026\n')
  const r = normalizeRows(t, applyManualMapping(t.headers, {}), { reportType: 'invoice_summary', reportDate: REPORT_DATE })
  assert.deepEqual(codes(r.invoices[0]), ['warning:implausible_date'])
})

test('status and payment-type vocabulary', () => {
  for (const s of ['Void', 'VOIDED', 'Cancelled', 'canceled', 'Anulada', 'Cancelada']) assert.equal(statusHintFrom(s), 'void', s)
  for (const s of ['Paid', 'pagada', 'Paid in Full']) assert.equal(statusHintFrom(s), 'paid', s)
  for (const s of ['Open', 'Unpaid', 'Partial', 'Partially Paid', 'Overdue', 'Pendiente', 'Vencida']) assert.equal(statusHintFrom(s), 'open', s)
  for (const s of ['Draft', 'Sent to collections', 'Paid?']) assert.equal(statusHintFrom(s), s === 'Paid?' ? 'paid' : null, s)
  assert.equal(statusHintFrom(''), null)
  assert.equal(paymentTypeFrom(''), 'payment')
  assert.equal(paymentTypeFrom('Pago'), 'payment')
  assert.equal(paymentTypeFrom('Crédito'), 'credit')
  assert.equal(paymentTypeFrom('Write-off'), 'adjustment')
  assert.equal(paymentTypeFrom('Ajuste'), 'adjustment')
  assert.equal(paymentTypeFrom('Refund'), 'refund')
  assert.equal(paymentTypeFrom('Reembolso'), 'refund')
  assert.equal(paymentTypeFrom('Credit card payment'), null) // not guessed
})

test('unknown report type is refused', () => {
  assert.throws(() => normalizeRows(table('a\n1\n'), detectMapping(['a']), { reportType: 'guess' }), /Unknown report type/)
})
