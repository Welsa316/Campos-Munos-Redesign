import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseReport, sniffFormat, MAX_ROWS } from './index.js'

const fixture = (name) => readFileSync(new URL(`../../fixtures/billing/${name}`, import.meta.url))

test('format is chosen by content, not by filename', () => {
  const xlsxNamedCsv = parseReport(fixture('invoice_summary.xlsx'), { filename: 'report.csv' })
  assert.equal(xlsxNamedCsv.meta.format, 'xlsx')
  assert.equal(xlsxNamedCsv.meta.filename, 'report.csv')
  const csvNamedXlsx = parseReport(fixture('invoice_summary.csv'), { filename: 'report.xlsx' })
  assert.equal(csvNamedXlsx.meta.format, 'csv')
  assert.equal(csvNamedXlsx.rows.length, 14)
})

test('legacy .xls (OLE) is refused as unsupported', () => {
  const xls = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)])
  assert.throws(() => parseReport(xls, { filename: 'a.xls' }), (e) => e.code === 'UNSUPPORTED_FORMAT' && /legacy Excel \.xls/.test(e.message))
  // Even when it claims to be a CSV.
  assert.throws(() => parseReport(xls, { filename: 'a.csv' }), (e) => e.code === 'UNSUPPORTED_FORMAT')
})

test('PDF is refused as unsupported', () => {
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n')
  assert.throws(() => parseReport(pdf, { filename: 'report.csv' }), (e) => e.code === 'UNSUPPORTED_FORMAT' && /PDF/.test(e.message))
})

test('other binary content is refused', () => {
  assert.throws(() => parseReport(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), (e) => e.code === 'UNSUPPORTED_FORMAT')
})

test('UTF-16 text is not mistaken for binary', () => {
  assert.equal(sniffFormat(Buffer.from([0xff, 0xfe, 0x61, 0x00])), 'csv')
})

test('empty upload is an error', () => {
  assert.throws(() => parseReport(Buffer.alloc(0)), (e) => e.code === 'EMPTY_REPORT')
})

test(`more than ${MAX_ROWS} rows is an error; exactly ${MAX_ROWS} is fine`, () => {
  const make = (n) => Buffer.from('Invoice #,Balance\n' + Array.from({ length: n }, (_, i) => `INV-${i},1.00`).join('\n'))
  assert.equal(parseReport(make(MAX_ROWS)).rows.length, MAX_ROWS)
  assert.throws(() => parseReport(make(MAX_ROWS + 1)), (e) => e.code === 'TOO_MANY_ROWS')
})
