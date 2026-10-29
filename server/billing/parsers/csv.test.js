import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv, sniffDelimiter } from './csv.js'

const fixture = (name) => readFileSync(new URL(`../../fixtures/billing/${name}`, import.meta.url))

test('quoted fields: embedded newline, delimiter and doubled quotes', () => {
  const t = parseCsv('Name,Note,Amount\n"Prueba, Uno","line one\nline two ""quoted""",5\n')
  assert.deepEqual(t.headers, ['Name', 'Note', 'Amount'])
  assert.deepEqual(t.rows, [['Prueba, Uno', 'line one\nline two "quoted"', '5']])
})

test('CRLF, lone CR and LF all end records; trailing empty lines dropped', () => {
  const t = parseCsv('a,b\r\n1,2\r3,4\n5,6\r\n\r\n\n')
  assert.deepEqual(t.rows, [['1', '2'], ['3', '4'], ['5', '6']])
})

test('interior blank rows are kept so row numbers match the file', () => {
  const t = parseCsv('a,b\n1,2\n\n3,4\n')
  assert.deepEqual(t.rows, [['1', '2'], ['', ''], ['3', '4']])
})

test('UTF-8 BOM is stripped from the first header', () => {
  const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Client ID,Nombre\nEIM-C-0001,Prueba Ñandú\n')])
  const t = parseCsv(buf)
  assert.deepEqual(t.headers, ['Client ID', 'Nombre'])
  assert.equal(t.rows[0][1], 'Prueba Ñandú')
  assert.equal(t.meta.encoding, 'utf-8-bom')
})

test('UTF-16LE with BOM is decoded', () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Invoice #\tSaldo\r\nINV-1\t"1,000.00"\r\n', 'utf16le')])
  const t = parseCsv(buf)
  assert.deepEqual(t.headers, ['Invoice #', 'Saldo'])
  assert.deepEqual(t.rows, [['INV-1', '1,000.00']])
  assert.equal(t.meta.encoding, 'utf-16le')
  assert.equal(t.meta.delimiter, '\t')
})

test('invalid UTF-8 falls back to Windows-1252 (accented names survive)', () => {
  const buf = Buffer.from([...Buffer.from('Name\n'), 0x50, 0xe9, 0x72, 0x65, 0x7a, 0x0a]) // "Pérez" in cp1252
  const t = parseCsv(buf)
  assert.equal(t.rows[0][0], 'Pérez')
  assert.equal(t.meta.encoding, 'windows-1252')
})

test('delimiter sniffing among , ; tab |', () => {
  assert.equal(sniffDelimiter('a;b;c\n1;2,5;3\n4;5;6\n'), ';')
  assert.equal(sniffDelimiter('a\tb\tc\n1\t2\t3\n'), '\t')
  assert.equal(sniffDelimiter('a|b|c\n1|2|3\n'), '|')
  assert.equal(sniffDelimiter('a,b,c\n"1;2",2,3\n'), ',')
  const t = parseCsv(fixture('semicolon.csv'))
  assert.equal(t.meta.delimiter, ';')
  assert.equal(t.headers.length, 8)
  assert.equal(t.rows[0][1], 'Prueba; Veinte')
  assert.equal(t.rows[0][4], '1.250,00')
})

test('title rows above the header are skipped (60% of widest row rule)', () => {
  const t = parseCsv(fixture('with_title_rows.csv'))
  assert.deepEqual(t.headers, ['Client ID', 'Client Name', 'Invoice #', 'Invoice Total', 'Amount Paid', 'Balance Due'])
  assert.equal(t.meta.headerRowIndex, 2)
  assert.deepEqual(t.meta.titleRows, ['SYNTHETIC TEST DATA - Invoice Report', 'Generated 10/29/2026 by test fixture'])
  assert.equal(t.rows.length, 2)
  assert.equal(t.rows[0][2], 'INV-1001')
})

test('a title row with 3 of 5 cells counts as the header (60% is inclusive)', () => {
  const t = parseCsv('Report,,x,y\na,b,c,d,e\n1,2,3,4,5\n')
  // Row 0 has 3 non-empty of widest 5 → 60% → header.
  assert.equal(t.meta.headerRowIndex, 0)
  const t2 = parseCsv('Report,x,,,\na,b,c,d,e\n1,2,3,4,5\n')
  assert.equal(t2.meta.headerRowIndex, 1)
  assert.deepEqual(t2.headers, ['a', 'b', 'c', 'd', 'e'])
})

test('ragged rows are padded/truncated and recorded', () => {
  const t = parseCsv('a,b,c\n1,2\n1,2,3,4\n1,2,3,\n')
  assert.deepEqual(t.rows, [['1', '2', ''], ['1', '2', '3'], ['1', '2', '3']])
  assert.deepEqual(t.meta.raggedRows, [
    { rowNumber: 1, cells: 2, expected: 3, droppedNonEmptyCells: 0 },
    { rowNumber: 2, cells: 4, expected: 3, droppedNonEmptyCells: 1 },
    { rowNumber: 3, cells: 4, expected: 3, droppedNonEmptyCells: 0 },
  ])
})

test('blank header cells become "Column N"; duplicates are suffixed', () => {
  const t = parseCsv('Invoice #,,Amount,Amount\nX,y,1,2\n')
  assert.deepEqual(t.headers, ['Invoice #', 'Column 2', 'Amount', 'Amount (2)'])
  assert.deepEqual(t.meta.duplicateHeaders, ['Amount'])
})

test('trailing all-empty columns (",,," exports) are dropped', () => {
  const t = parseCsv('a,b,,\n1,2,,\n')
  assert.deepEqual(t.headers, ['a', 'b'])
  assert.deepEqual(t.rows, [['1', '2']])
})

test('unterminated quote is an error, not a silent merge', () => {
  assert.throws(() => parseCsv('a,b\n"open,2\n3,4\n'), (e) => e.code === 'CSV_UNTERMINATED_QUOTE')
})

test('empty input is an error', () => {
  assert.throws(() => parseCsv(''), (e) => e.code === 'EMPTY_REPORT')
  assert.throws(() => parseCsv('\n\n'), (e) => e.code === 'EMPTY_REPORT')
})
