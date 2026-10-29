// Entry point for report uploads. The format is decided by the file's bytes,
// never by its extension: a renamed file cannot route itself to the wrong
// parser.

import { parseCsv, billingParseError } from './csv.js'
import { parseXlsx } from './xlsx.js'

export const MAX_ROWS = 20000

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {{ filename?: string, sheet?: string|number }} [opts]
 * @returns {import('../model.js').ParsedTable}  meta.format is 'csv' | 'xlsx'
 */
export function parseReport(buffer, { filename = null, sheet } = {}) {
  if (!buffer || typeof buffer.length !== 'number') throw billingParseError('NO_FILE', 'No file content was provided')
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (buf.length === 0) throw billingParseError('EMPTY_REPORT', 'The uploaded file is empty')

  const kind = sniffFormat(buf)
  let table
  if (kind === 'xlsx') table = parseXlsx(buf, { sheet })
  else if (kind === 'csv') table = parseCsv(buf)
  else throw billingParseError('UNSUPPORTED_FORMAT', kind.message)

  if (table.rows.length > MAX_ROWS) {
    throw billingParseError('TOO_MANY_ROWS', `The report has ${table.rows.length} rows; the limit is ${MAX_ROWS}. Split the export into smaller date ranges.`)
  }
  table.meta = { ...table.meta, filename }
  return table
}

/** @returns {'xlsx'|'csv'|{message: string}} */
export function sniffFormat(buf) {
  const b = (i) => buf[i]
  if (b(0) === 0x50 && b(1) === 0x4b && (b(2) === 0x03 || b(2) === 0x05 || b(2) === 0x07)) return 'xlsx'
  if (b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0) {
    return { message: 'Unsupported format: this is a legacy Excel .xls file (or a password-protected workbook). Re-export from eImmigration as CSV or .xlsx, without a password.' }
  }
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { message: 'Unsupported format: PDF reports cannot be imported. Export the report from eImmigration as CSV or .xlsx.' }
  }
  const utf16 = (b(0) === 0xff && b(1) === 0xfe) || (b(0) === 0xfe && b(1) === 0xff)
  if (!utf16 && buf.subarray(0, 4096).includes(0)) {
    return { message: 'Unsupported format: the file is binary, not CSV or .xlsx.' }
  }
  return 'csv'
}

export default parseReport
