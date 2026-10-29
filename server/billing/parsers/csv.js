// CSV parser for billing report uploads (RFC 4180 plus the quirks real
// exports have). Returns a ParsedTable (see ../model.js).
//
// Also exports buildTable(), the shared step that turns raw records into a
// ParsedTable (title-row skip, header naming, padding). The XLSX parser uses
// it too, so both formats behave identically after cell extraction.

const DELIMITERS = [',', ';', '\t', '|']
const HEADER_SCAN_ROWS = 10
const WIDTH_SCAN_ROWS = 50
const HEADER_MIN_SHARE = 0.6

export function billingParseError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/** Decode bytes to text: UTF-8 (BOM stripped), UTF-16LE/BE with BOM, else Windows-1252 fallback. */
export function decodeText(input) {
  if (typeof input === 'string') {
    return { text: input.charCodeAt(0) === 0xfeff ? input.slice(1) : input, encoding: 'string' }
  }
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf-8-bom' }
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le' }
  }
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' }
  } catch {
    // Not valid UTF-8: Excel "CSV" on Windows writes cp1252 (accents in names).
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'windows-1252' }
  }
}

/**
 * Split CSV text into records. Quotes are only special at the start of a
 * field; "" inside a quoted field is a literal quote; quoted fields may hold
 * delimiters and newlines. CRLF, LF and lone CR all end a record.
 * @param {string} text
 * @param {string} delimiter
 * @param {number} [maxRecords]  stop early (used by the delimiter sniffer)
 * @returns {string[][]}
 */
export function splitRecords(text, delimiter, maxRecords = Infinity) {
  const records = []
  let record = []
  let field = ''
  let i = 0
  const n = text.length
  let atFieldStart = true
  while (i < n) {
    const ch = text[i]
    if (atFieldStart && ch === '"') {
      // Quoted field
      const startLine = records.length + 1
      i++
      let closed = false
      while (i < n) {
        const c = text[i]
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue }
          i++
          closed = true
          break
        }
        field += c
        i++
      }
      if (!closed) {
        if (maxRecords !== Infinity) break // sniffing a prefix: tolerate
        throw billingParseError('CSV_UNTERMINATED_QUOTE', `CSV record ${startLine} has a quoted field that is never closed`)
      }
      atFieldStart = false
      continue
    }
    if (ch === delimiter) {
      record.push(field)
      field = ''
      atFieldStart = true
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      record.push(field)
      records.push(record)
      if (records.length >= maxRecords) return records
      record = []
      field = ''
      atFieldStart = true
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch
    atFieldStart = false
    i++
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records
}

/** Pick the delimiter whose split gives the most rows of the same (>1) width. */
export function sniffDelimiter(text) {
  let best = { delimiter: ',', score: 0, width: 0 }
  for (const d of DELIMITERS) {
    const recs = splitRecords(text, d, 30).filter((r) => r.some((c) => c.trim() !== ''))
    const counts = new Map()
    for (const r of recs) if (r.length > 1) counts.set(r.length, (counts.get(r.length) || 0) + 1)
    let modeWidth = 0
    let modeCount = 0
    for (const [w, c] of counts) {
      if (c > modeCount || (c === modeCount && w > modeWidth)) { modeWidth = w; modeCount = c }
    }
    if (modeCount > best.score || (modeCount === best.score && modeWidth > best.width)) {
      best = { delimiter: d, score: modeCount, width: modeWidth }
    }
  }
  return best.delimiter
}

const isBlankRow = (r) => r.every((c) => String(c).trim() === '')
const nonEmpty = (r) => r.reduce((k, c) => k + (String(c).trim() === '' ? 0 : 1), 0)

/**
 * Raw records → ParsedTable. Drops trailing blank rows (interior blank rows
 * are kept so row numbers still line up with the file), skips title rows
 * above the header, names blank/duplicate header cells, and pads/truncates
 * every row to the header width. Short and long rows are listed in
 * meta.raggedRows (XLSX passes reportShortRows=false: a sheet simply omits
 * trailing empty cells, which is not a defect).
 * @param {string[][]} records
 * @param {{ sheetName?: string|null, meta?: Object, reportShortRows?: boolean }} [opts]
 */
export function buildTable(records, { sheetName = null, meta = {}, reportShortRows = true } = {}) {
  const recs = records.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
  while (recs.length && isBlankRow(recs[recs.length - 1])) recs.pop()
  // Leading blank rows are never a header.
  let lead = 0
  while (lead < recs.length && isBlankRow(recs[lead])) lead++
  if (lead === recs.length) {
    throw billingParseError('EMPTY_REPORT', 'The report has no rows')
  }

  let widest = 0
  for (let i = lead; i < Math.min(recs.length, lead + WIDTH_SCAN_ROWS); i++) {
    widest = Math.max(widest, nonEmpty(recs[i]))
  }
  let headerIndex = -1
  for (let i = lead; i < Math.min(recs.length, lead + HEADER_SCAN_ROWS); i++) {
    if (nonEmpty(recs[i]) >= HEADER_MIN_SHARE * widest) { headerIndex = i; break }
  }
  if (headerIndex === -1) headerIndex = lead
  const titleRows = recs.slice(lead, headerIndex).filter((r) => !isBlankRow(r)).map((r) => r.filter((c) => c.trim() !== '').join(' '))

  let headerCells = recs[headerIndex].map((c) => c.replace(/\s+/g, ' ').trim())
  const body = recs.slice(headerIndex + 1)

  // Drop trailing header columns that are blank in the header and every row
  // (Excel exports often end each line with ",,,").
  let width = headerCells.length
  while (width > 0 && headerCells[width - 1] === '' && !body.some((r) => (r[width - 1] || '').trim() !== '')) width--
  headerCells = headerCells.slice(0, width)

  const headers = []
  const seen = new Map()
  const duplicateHeaders = []
  headerCells.forEach((h, idx) => {
    let name = h === '' ? `Column ${idx + 1}` : h
    const key = name.toLowerCase()
    if (seen.has(key)) {
      const k = seen.get(key) + 1
      seen.set(key, k)
      duplicateHeaders.push(name)
      name = `${name} (${k})`
    } else {
      seen.set(key, 1)
    }
    headers.push(name)
  })

  const raggedRows = []
  const rows = body.map((r, i) => {
    if (r.length === width) return r
    if (isBlankRow(r)) return new Array(width).fill('')
    const dropped = r.slice(width).filter((c) => c.trim() !== '').length
    if (r.length > width || reportShortRows) raggedRows.push({ rowNumber: i + 1, cells: r.length, expected: width, droppedNonEmptyCells: dropped })
    return r.length < width ? r.concat(new Array(width - r.length).fill('')) : r.slice(0, width)
  })

  return {
    headers,
    rows,
    sheetName,
    meta: {
      ...meta,
      headerRowIndex: headerIndex,
      titleRows,
      raggedRows,
      duplicateHeaders,
      widestRowCells: widest,
    },
  }
}

/**
 * @param {Buffer|Uint8Array|string} input
 * @param {{ delimiter?: string }} [opts]
 * @returns {import('../model.js').ParsedTable}
 */
export function parseCsv(input, opts = {}) {
  const { text, encoding } = decodeText(input)
  if (text.trim() === '') throw billingParseError('EMPTY_REPORT', 'The CSV file is empty')
  const delimiter = opts.delimiter || sniffDelimiter(text)
  const records = splitRecords(text, delimiter)
  return buildTable(records, { sheetName: null, meta: { format: 'csv', delimiter, encoding } })
}

export default parseCsv
