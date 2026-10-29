import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseXlsx, excelNumberText, isDateFormatCode, MAX_ENTRIES } from './xlsx.js'
import { buildZip, buildXlsx, fixtureWorkbook, crc32 } from '../../fixtures/billing/make-xlsx.js'

const FIXTURE = readFileSync(new URL('../../fixtures/billing/invoice_summary.xlsx', import.meta.url))

test('committed fixture matches the generator output', () => {
  assert.ok(FIXTURE.equals(fixtureWorkbook()), 'run node fixtures/billing/make-xlsx.js')
})

test('our CRC-32 matches zlib (generator sanity)', async () => {
  const zlib = await import('node:zlib')
  for (const s of ['', 'a', 'The quick brown fox', 'Ñandú']) assert.equal(crc32(Buffer.from(s)), zlib.crc32(Buffer.from(s)))
})

test('shared strings, inline strings, numbers, booleans, dates', () => {
  const t = parseXlsx(FIXTURE)
  assert.equal(t.sheetName, 'Invoices')
  assert.deepEqual(t.meta.sheetNames, ['Invoices', 'Notes'])
  assert.deepEqual(t.headers, ['Client ID', 'Client Name', 'Invoice #', 'Invoice Date', 'Due Date', 'Invoice Total', 'Amount Paid', 'Balance Due', 'Status', 'Flagged'])
  assert.deepEqual(t.rows[0], ['EIM-C-0001', 'Prueba Uno', 'INV-1001', '2026-01-05', '2026-02-04', '1500', '1500', '0', 'Paid', 'FALSE'])
  assert.deepEqual(t.rows[1], ['EIM-C-0002', 'Prueba Dos', 'INV-1002', '2026-09-01', '2026-12-15', '2000', '500', '1500', 'Partial', 'TRUE'])
  assert.equal(t.rows[3][1], 'Prueba Ñandú Pérez')
})

test('sparse cells leave gaps empty; computed doubles shown as Excel shows them', () => {
  const t = parseXlsx(FIXTURE)
  assert.deepEqual(t.rows[2], ['EIM-C-0007', 'Prueba Siete', 'INV-1009', '', '2026-09-09', '1000', '250.25', '749.75', 'Partial', ''])
  assert.deepEqual(t.meta.raggedRows, [])
})

test('sparse references within a row (A1, C1 → B1 empty)', () => {
  const buf = buildXlsx({ sheets: [{ name: 'S', rows: [['a', 'b', 'c'], ['x', null, 'z'], [null, null, 'only c']] }] })
  const t = parseXlsx(buf)
  assert.deepEqual(t.rows, [['x', '', 'z'], ['', '', 'only c']])
})

test('second sheet by name and by index; unknown sheet errors with names', () => {
  const byName = parseXlsx(FIXTURE, { sheet: 'Notes' })
  assert.equal(byName.sheetName, 'Notes')
  assert.deepEqual(byName.headers, ['SYNTHETIC TEST DATA', 'Count'])
  assert.deepEqual(byName.rows, [['Second sheet for sheet-selection tests', '42']])
  assert.equal(parseXlsx(FIXTURE, { sheet: 1 }).sheetName, 'Notes')
  assert.throws(() => parseXlsx(FIXTURE, { sheet: 'Nope' }), (e) => e.code === 'SHEET_NOT_FOUND' && /Invoices, Notes/.test(e.message))
})

test('date serial 60 in a date-formatted cell is left numeric, not invented', () => {
  const buf = buildXlsx({ sheets: [{ name: 'S', rows: [['d'], [{ date: 60 }], [{ date: 61 }], [{ date: 46027.5 }]] }] })
  assert.deepEqual(parseXlsx(buf).rows, [['60'], ['1900-03-01'], ['2026-01-05']])
})

test('1904 date system workbooks', () => {
  const buf = buildXlsx({ date1904: true, sheets: [{ name: 'S', rows: [['d'], [{ date: 46027 - 1462 }]] }] })
  assert.deepEqual(parseXlsx(buf).rows, [['2026-01-05']])
})

test('number text rendering', () => {
  assert.equal(excelNumberText('749.75000000000011'), '749.75')
  assert.equal(excelNumberText('0.30000000000000004'), '0.3')
  assert.equal(excelNumberText('1234.5'), '1234.5')
  assert.equal(excelNumberText('-12'), '-12')
  assert.equal(excelNumberText('12.345'), '12.345') // left for the money parser to reject
})

test('date format detection', () => {
  for (const f of ['mm/dd/yyyy', 'd-mmm-yy', '[$-409]mmmm d, yyyy', 'yyyy-mm-dd hh:mm']) assert.equal(isDateFormatCode(f), true, f)
  for (const f of ['General', '0.00', '#,##0.00', '"$"#,##0.00_);[Red]("$"#,##0.00)', '0%']) assert.equal(isDateFormatCode(f), false, f)
})

test('non-zip input is rejected clearly', () => {
  assert.throws(() => parseXlsx(Buffer.from('%PDF-1.7 not a workbook')), (e) => e.code === 'INVALID_XLSX')
  assert.throws(() => parseXlsx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), (e) => e.code === 'INVALID_XLSX')
})

test('a zip that is not a workbook is rejected', () => {
  const buf = buildZip([{ name: 'hello.txt', data: 'hi' }])
  assert.throws(() => parseXlsx(buf), (e) => e.code === 'INVALID_XLSX' && /workbook\.xml/.test(e.message))
})

test('encrypted zip entries are rejected', () => {
  const buf = buildZip([{ name: 'xl/workbook.xml', data: '<workbook/>', flags: 0x0001 }])
  assert.throws(() => parseXlsx(buf), (e) => e.code === 'ENCRYPTED')
})

test('zip bomb: declared uncompressed size over 50 MB is refused before inflating', () => {
  const buf = buildZip([
    { name: 'xl/workbook.xml', data: '<workbook/>' },
    { name: 'xl/worksheets/sheet1.xml', data: 'x', declaredSize: 60 * 1024 * 1024 },
  ])
  assert.ok(buf.length < 1024, 'the crafted file itself is tiny')
  assert.throws(() => parseXlsx(buf), (e) => e.code === 'ZIP_LIMIT')
})

test('zip bomb: entry that inflates past its declared size is refused', () => {
  const sheet = '<worksheet><sheetData>' + '<row><c t="inlineStr"><is><t>aaaa</t></is></c></row>'.repeat(5000) + '</sheetData></worksheet>'
  const buf = buildZip([
    { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheet, declaredSize: 100 },
  ])
  assert.throws(() => parseXlsx(buf), (e) => e.code === 'ZIP_LIMIT' && /declared size/.test(e.message))
})

test('more than 2000 entries is refused', () => {
  const entries = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({ name: `f${i}`, data: '', method: 'store' }))
  assert.throws(() => parseXlsx(buildZip(entries)), (e) => e.code === 'ZIP_LIMIT' && /2001/.test(e.message))
})

test('corrupted entry data fails the CRC check', () => {
  const buf = Buffer.from(buildXlsx({ sheets: [{ name: 'S', rows: [['a'], ['b']] }] }))
  // Flip one byte inside the deflated xl/workbook.xml payload.
  const local = buf.indexOf(Buffer.from('xl/workbook.xml')) - 30
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
  buf[start + 5] ^= 0xff
  assert.throws(() => parseXlsx(buf), (e) => e.code === 'INVALID_XLSX')
})
