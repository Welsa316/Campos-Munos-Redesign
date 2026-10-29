import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HEADER_ALIASES, ALIASES_VERIFIED, normalizeHeader, detectMapping, applyManualMapping, detectReportType, missingFieldWarnings,
} from './columnMapping.js'
import { FIELD_KEYS } from './model.js'

const fieldsOf = (headers) => detectMapping(headers).fields

test('aliases are flagged as unverified guesses', () => {
  assert.equal(ALIASES_VERIFIED, false)
  for (const k of Object.keys(HEADER_ALIASES)) assert.ok(FIELD_KEYS.includes(k), k)
})

test('no normalized alias belongs to two fields', () => {
  const owner = new Map()
  for (const [k, list] of Object.entries(HEADER_ALIASES)) {
    for (const a of list) {
      const n = normalizeHeader(a)
      assert.ok(!owner.has(n) || owner.get(n) === k, `"${a}" maps to ${owner.get(n)} and ${k}`)
      owner.set(n, k)
    }
  }
})

test('header normalization: case, accents, punctuation, "#"/"No"', () => {
  assert.equal(normalizeHeader('  Invoice   #  '), 'invoice number')
  assert.equal(normalizeHeader('INVOICE NO.'), 'invoice number')
  assert.equal(normalizeHeader('Invoice_Number'), 'invoice number')
  assert.equal(normalizeHeader('Fecha de Vencimiento'), normalizeHeader('fecha de vencimiento'))
  assert.equal(normalizeHeader('Número de Factura'), 'numero de factura')
  assert.equal(normalizeHeader('Nº de Factura'), 'number de factura')
})

test('English spellings map to the expected fields', () => {
  const f = fieldsOf(['Invoice No', 'Contact ID', 'Client Name', 'Due Date', 'Amount Due', 'Amount Paid', 'Invoice Amount', 'Status'])
  assert.deepEqual(f, {
    externalInvoiceId: 0, externalClientId: 1, clientName: 2, dueDate: 3, balanceAmount: 4, paidAmount: 5, totalAmount: 6, invoiceStatus: 7,
  })
  assert.deepEqual(fieldsOf(['Invoice #', 'Balance Due', 'Total', 'Paid']), { externalInvoiceId: 0, balanceAmount: 1, totalAmount: 2, paidAmount: 3 })
  assert.deepEqual(fieldsOf(['Transaction ID', 'Payment Date', 'Payment Amount']), { externalPaymentId: 0, paymentDate: 1, paymentAmount: 2 })
})

test('Spanish spellings, with and without accents', () => {
  const f = fieldsOf(['Factura', 'ID Cliente', 'Nombre del Cliente', 'Fecha de vencimiento', 'Saldo', 'Monto Pagado', 'Monto Total', 'Estado'])
  assert.deepEqual(f, {
    externalInvoiceId: 0, externalClientId: 1, clientName: 2, dueDate: 3, balanceAmount: 4, paidAmount: 5, totalAmount: 6, invoiceStatus: 7,
  })
  assert.deepEqual(fieldsOf(['Número de Factura', 'FECHA DE VENCIMIENTO', 'Fecha del Último Pago', 'Método de Pago']), {
    externalInvoiceId: 0, dueDate: 1, lastPaymentDate: 2, paymentMethod: 3,
  })
})

test('every alias mapping is reported with source "alias"', () => {
  const m = detectMapping(['Invoice #', 'Saldo', 'Mystery Column'])
  assert.deepEqual(m.source, { externalInvoiceId: 'alias', balanceAmount: 'alias' })
  assert.deepEqual(m.unmappedHeaders, ['Mystery Column'])
})

test('ambiguous bare words stay unmapped', () => {
  const m = detectMapping(['Amount', 'Date', 'Monto', 'Fecha', 'ID'])
  assert.deepEqual(m.fields, {})
  assert.deepEqual(m.unmappedHeaders, ['Amount', 'Date', 'Monto', 'Fecha', 'ID'])
})

test('exact alias beats partial; partial works for decorated headers', () => {
  // "Invoice Total (USD)" only matches partially; "Total" exactly.
  assert.deepEqual(fieldsOf(['Invoice Total (USD)', 'Total']), { totalAmount: 1 })
  assert.deepEqual(fieldsOf(['Invoice Total (USD)']), { totalAmount: 0 })
  assert.deepEqual(fieldsOf(['Balance Due ($)', 'Client ID (eImmigration)']), { balanceAmount: 0, externalClientId: 1 })
})

test('partial matches do not cross kinds or qualifiers', () => {
  // "Last Payment Amount" contains "payment amount" and "last payment" but is neither.
  assert.deepEqual(fieldsOf(['Last Payment Amount']), {})
  assert.deepEqual(fieldsOf(['Next Payment Amount']), { nextInstallmentAmount: 0 })
})

test('no header maps to two fields and no field to two headers', () => {
  const headers = ['Invoice #', 'Invoice Number', 'Balance', 'Balance Due', 'Payment Date', 'Payment']
  const m = detectMapping(headers)
  const idxs = Object.values(m.fields)
  assert.equal(new Set(idxs).size, idxs.length)
  assert.equal(m.fields.externalInvoiceId, 0) // leftmost exact wins
  assert.equal(m.fields.balanceAmount, 2)
  assert.equal(m.fields.paymentDate, 4)
  assert.equal(m.fields.paymentAmount, 5)
  assert.deepEqual(m.unmappedHeaders, ['Invoice Number', 'Balance Due'])
})

test('manual override: map, remap a header away from an alias field, unmap', () => {
  const headers = ['Ref', 'Amount', 'Balance Due', 'Cliente']
  const m = applyManualMapping(headers, { externalInvoiceId: 'Ref', totalAmount: 'Amount', balanceAmount: null })
  assert.deepEqual(m.fields, { externalInvoiceId: 0, totalAmount: 1, clientName: 3 })
  assert.deepEqual(m.source, { externalInvoiceId: 'manual', totalAmount: 'manual', clientName: 'alias' })
  assert.deepEqual(m.unmappedHeaders, ['Balance Due'])
  // "Ref" was alias-mapped to paymentReference; the override takes it away.
  assert.equal(detectMapping(headers).fields.paymentReference, 0)
  assert.equal(m.fields.paymentReference, undefined)
})

test('manual override by index and case-insensitive name', () => {
  const m = applyManualMapping(['A', 'B'], { externalInvoiceId: 1, balanceAmount: 'a' })
  assert.deepEqual(m.fields, { externalInvoiceId: 1, balanceAmount: 0 })
})

test('manual override errors: unknown field, unknown header, header used twice', () => {
  assert.throws(() => applyManualMapping(['A'], { notAField: 'A' }), /Unknown billing field/)
  assert.throws(() => applyManualMapping(['A'], { externalInvoiceId: 'Z' }), /not in this report/)
  assert.throws(() => applyManualMapping(['A', 'B'], { externalInvoiceId: 'A', totalAmount: 'A' }), /assigned to both/)
})

const mapOf = (...keys) => ({ fields: Object.fromEntries(keys.map((k, i) => [k, i])), unmappedHeaders: [], source: {} })

test('report type: payment columns only → payment_transactions', () => {
  const r = detectReportType(mapOf('externalPaymentId', 'paymentDate', 'paymentAmount', 'externalInvoiceId'))
  assert.equal(r.reportType, 'payment_transactions')
  assert.ok(r.reasons.length >= 1)
})

test('report type: invoice amounts plus payment columns → mixed', () => {
  const r = detectReportType(mapOf('externalInvoiceId', 'totalAmount', 'balanceAmount', 'paymentAmount', 'paymentDate'))
  assert.equal(r.reportType, 'mixed')
  assert.match(r.reasons.join(' '), /routed/)
})

test('report type: invoice balances → invoice_summary, explaining outstanding_only is a staff choice', () => {
  const r = detectReportType(mapOf('externalInvoiceId', 'balanceAmount', 'dueDate'))
  assert.equal(r.reportType, 'invoice_summary')
  assert.match(r.reasons.join(' '), /outstanding_only/)
  assert.match(r.reasons.join(' '), /never treated as paid/)
  // lastPaymentDate on an invoice summary does not make it mixed.
  assert.equal(detectReportType(mapOf('externalInvoiceId', 'totalAmount', 'lastPaymentDate')).reportType, 'invoice_summary')
})

test('report type: nothing usable → null with a reason', () => {
  const r = detectReportType(mapOf('clientName'))
  assert.equal(r.reportType, null)
  assert.equal(r.reasons.length, 1)
})

const codes = (list) => list.map((w) => `${w.severity}:${w.field}`).sort()

test('missing-field warnings for invoice reports', () => {
  assert.deepEqual(codes(missingFieldWarnings(mapOf('externalInvoiceId', 'externalClientId', 'totalAmount', 'balanceAmount', 'dueDate'), 'invoice_summary')), [])
  assert.deepEqual(codes(missingFieldWarnings(mapOf('clientName', 'totalAmount'), 'invoice_summary')), [
    'error:balanceAmount', 'error:externalInvoiceId', 'warning:dueDate', 'warning:externalClientId',
  ])
  const w = missingFieldWarnings(mapOf('externalInvoiceId', 'clientName', 'totalAmount'), 'outstanding_only')
  assert.match(w.find((x) => x.field === 'balanceAmount').message, /cannot establish what is owed/)
  assert.match(w.find((x) => x.field === 'externalClientId').message, /never auto-approved/)
  // Balance without total or paid: usable, but partial vs unpaid is unknown.
  assert.deepEqual(codes(missingFieldWarnings(mapOf('externalInvoiceId', 'externalClientId', 'balanceAmount', 'dueDate'), 'outstanding_only')), ['warning:totalAmount'])
  // No client id AND no name → error.
  assert.deepEqual(codes(missingFieldWarnings(mapOf('externalInvoiceId', 'balanceAmount', 'paidAmount', 'dueDate'), 'invoice_summary')), ['error:externalClientId'])
})

test('missing-field warnings for payment reports', () => {
  assert.deepEqual(codes(missingFieldWarnings(mapOf('externalClientId', 'externalPaymentId', 'paymentDate', 'paymentAmount', 'externalInvoiceId'), 'payment_transactions')), [])
  assert.deepEqual(codes(missingFieldWarnings(mapOf('clientName'), 'payment_transactions')), [
    'error:paymentAmount', 'warning:externalClientId', 'warning:externalInvoiceId', 'warning:externalPaymentId', 'warning:paymentDate',
  ])
  assert.deepEqual(codes(missingFieldWarnings(mapOf('clientName'), null)), ['error:_mapping'])
})
