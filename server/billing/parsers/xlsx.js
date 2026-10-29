// XLSX parser using only Node built-ins: the ZIP container is read from its
// central directory and entries are inflated with zlib.inflateRawSync. Only
// what a data export needs is supported: shared strings, inline strings,
// numbers, booleans, sparse cells, and date-formatted numeric cells.
//
// Number cells: an .xlsx stores the IEEE double Excel holds, so a computed
// 749.75 can arrive as "749.75000000000011". We render such values to the 15
// significant digits Excel itself displays ("749.75"), which is what staff
// see in Excel. Values that still carry more than 2 decimals after that are
// left for the money parser to reject; nothing is rounded to cents here.

import zlib from 'node:zlib'
import { buildTable, billingParseError } from './csv.js'
import { excelSerialToDate } from '../dates.js'

export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
export const MAX_ENTRIES = 2000

const SIG_EOCD = 0x06054b50
const SIG_CEN = 0x02014b50
const SIG_LOC = 0x04034b50

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

// ---------------------------------------------------------------- ZIP ----

/**
 * Read the central directory. Throws on non-zip, ZIP64, encryption, unknown
 * compression, or limits exceeded (declared sizes; actual sizes are
 * re-checked while inflating because declared sizes can lie).
 * @returns {Map<string, {name, method, compressedSize, size, localOffset, crc}>}
 */
export function readZipDirectory(buf) {
  if (buf.length < 22) throw billingParseError('INVALID_XLSX', 'File is not a valid .xlsx (too short to be a ZIP archive)')
  let eocd = -1
  const stop = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break }
  }
  if (eocd === -1) throw billingParseError('INVALID_XLSX', 'File is not a valid .xlsx (no ZIP central directory found)')
  const total = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (total === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw billingParseError('INVALID_XLSX', 'ZIP64 workbooks are not supported')
  }
  if (total > MAX_ENTRIES) {
    throw billingParseError('ZIP_LIMIT', `Workbook has ${total} ZIP entries; the limit is ${MAX_ENTRIES}`)
  }
  if (cdOffset + cdSize > eocd) throw billingParseError('INVALID_XLSX', 'ZIP central directory is out of bounds')

  const entries = new Map()
  let p = cdOffset
  let declaredTotal = 0
  for (let k = 0; k < total; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CEN) {
      throw billingParseError('INVALID_XLSX', 'ZIP central directory is corrupt')
    }
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    if (flags & 0x1) throw billingParseError('ENCRYPTED', 'The workbook is encrypted or password-protected; export it without a password')
    if (method !== 0 && method !== 8) {
      throw billingParseError('INVALID_XLSX', `ZIP entry ${name} uses unsupported compression method ${method}`)
    }
    if (compressedSize === 0xffffffff || size === 0xffffffff) {
      throw billingParseError('INVALID_XLSX', 'ZIP64 workbooks are not supported')
    }
    declaredTotal += size
    if (declaredTotal > MAX_UNCOMPRESSED_BYTES) {
      throw billingParseError('ZIP_LIMIT', `Workbook expands to more than ${MAX_UNCOMPRESSED_BYTES / 1024 / 1024} MB; refusing to unpack it`)
    }
    entries.set(name, { name, method, compressedSize, size, localOffset, crc })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function makeReader(buf) {
  const entries = readZipDirectory(buf)
  let inflatedTotal = 0
  return {
    entries,
    has: (name) => entries.has(name),
    read(name) {
      const e = entries.get(name)
      if (!e) return null
      const p = e.localOffset
      if (p + 30 > buf.length || buf.readUInt32LE(p) !== SIG_LOC) {
        throw billingParseError('INVALID_XLSX', `ZIP entry ${name} has a bad local header`)
      }
      const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28)
      const end = start + e.compressedSize
      if (end > buf.length) throw billingParseError('INVALID_XLSX', `ZIP entry ${name} is truncated`)
      const raw = buf.subarray(start, end)
      const budget = MAX_UNCOMPRESSED_BYTES - inflatedTotal
      let out
      if (e.method === 0) {
        out = raw
      } else {
        try {
          // +1 so an entry larger than declared is detected rather than truncated.
          out = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, Math.min(e.size, budget) + 1) })
        } catch (err) {
          if (err && err.code === 'ERR_BUFFER_TOO_LARGE') {
            throw billingParseError('ZIP_LIMIT', `ZIP entry ${name} expands beyond its declared size`)
          }
          throw billingParseError('INVALID_XLSX', `ZIP entry ${name} could not be decompressed`)
        }
      }
      if (out.length !== e.size) {
        throw billingParseError('INVALID_XLSX', `ZIP entry ${name} size does not match its declared size`)
      }
      inflatedTotal += out.length
      if (inflatedTotal > MAX_UNCOMPRESSED_BYTES) {
        throw billingParseError('ZIP_LIMIT', 'Workbook expands beyond the size limit')
      }
      if (zlib.crc32(out) >>> 0 !== e.crc >>> 0) {
        throw billingParseError('INVALID_XLSX', `ZIP entry ${name} failed its CRC check`)
      }
      return out.toString('utf8')
    },
  }
}

// ---------------------------------------------------------------- XML ----

function decodeEntities(s) {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    if (e === 'amp') return '&'
    if (e === 'quot') return '"'
    if (e === 'apos') return "'"
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return String.fromCodePoint(code)
  })
}

/** Excel escapes control characters in strings as _xHHHH_. */
function decodeExcelEscapes(s) {
  return s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function parseAttrs(src) {
  const attrs = {}
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(src))) {
    const key = m[1].includes(':') && !m[1].startsWith('xmlns') ? m[1].split(':').pop() : m[1]
    attrs[key] = decodeEntities(m[2] !== undefined ? m[2] : m[3])
    if (m[1].includes(':')) attrs[m[1]] = attrs[key]
  }
  return attrs
}

/**
 * Minimal streaming tokenizer: calls onOpen(name, attrs, selfClosing),
 * onClose(name), onText(text). Namespace prefixes are stripped from names.
 */
function walkXml(xml, { onOpen, onClose, onText }) {
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) { onText && onText(m[1]); continue }
    if (m[6] !== undefined) { onText && onText(decodeEntities(m[6])); continue }
    if (!m[3]) continue
    const name = m[3].includes(':') ? m[3].split(':').pop() : m[3]
    if (m[2] === '/') { onClose && onClose(name); continue }
    const selfClosing = m[5] === '/'
    onOpen && onOpen(name, parseAttrs(m[4] || ''), selfClosing)
    if (selfClosing) onClose && onClose(name)
  }
}

// ----------------------------------------------------------- workbook ----

function parseSharedStrings(xml) {
  const out = []
  if (!xml) return out
  let inSi = false
  let inT = false
  let phonetic = 0
  let cur = ''
  walkXml(xml, {
    onOpen(name) {
      if (name === 'si') { inSi = true; cur = '' }
      else if (name === 'rPh') phonetic++
      else if (name === 't' && inSi && phonetic === 0) inT = true
    },
    onClose(name) {
      if (name === 'si') { out.push(decodeExcelEscapes(cur)); inSi = false }
      else if (name === 'rPh') phonetic--
      else if (name === 't') inT = false
    },
    onText(t) { if (inT) cur += t },
  })
  return out
}

/** Is a custom number format a date/time format? */
export function isDateFormatCode(code) {
  const stripped = String(code)
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?:\$|Red|Black|Blue|Green|White|Yellow|Cyan|Magenta|Color)[^\]]*\]/gi, '')
    .replace(/[_*]./g, '')
  return /[dmyhs]/i.test(stripped) && !/^[^dmyhs]*General/i.test(stripped)
}

function parseStyles(xml) {
  const dateStyles = new Set()
  if (!xml) return dateStyles
  const customDate = new Set()
  let inCellXfs = false
  let xfIndex = 0
  walkXml(xml, {
    onOpen(name, a) {
      if (name === 'numFmt' && a.numFmtId !== undefined && isDateFormatCode(a.formatCode || '')) {
        customDate.add(Number(a.numFmtId))
      } else if (name === 'cellXfs') {
        inCellXfs = true
        xfIndex = 0
      } else if (name === 'xf' && inCellXfs) {
        const id = Number(a.numFmtId || 0)
        if (BUILTIN_DATE_FORMATS.has(id) || customDate.has(id)) dateStyles.add(xfIndex)
        xfIndex++
      }
    },
    onClose(name) { if (name === 'cellXfs') inCellXfs = false },
  })
  return dateStyles
}

function parseWorkbook(xml, relsXml) {
  const sheets = []
  let date1904 = false
  walkXml(xml || '', {
    onOpen(name, a) {
      if (name === 'sheet') sheets.push({ name: a.name, rid: a.id || a['r:id'] })
      if (name === 'workbookPr' && (a.date1904 === '1' || a.date1904 === 'true')) date1904 = true
    },
  })
  const targets = {}
  walkXml(relsXml || '', {
    onOpen(name, a) { if (name === 'Relationship') targets[a.Id] = a.Target },
  })
  sheets.forEach((s, i) => {
    let t = targets[s.rid]
    if (!t) t = `worksheets/sheet${i + 1}.xml`
    s.path = t.startsWith('/') ? t.slice(1) : `xl/${t}`.replace(/\/\.\//g, '/')
  })
  return { sheets, date1904 }
}

/** "AB12" → { col: 27, row: 11 } (0-based) */
function cellRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '')
  if (!m) return null
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col: col - 1, row: Number(m[2]) - 1 }
}

/** Render an XML number value the way Excel displays it (15 significant digits). */
export function excelNumberText(v) {
  const s = String(v).trim()
  const digits = s.replace(/^-/, '').replace(/^0+/, '').replace('.', '').replace(/^0+/, '')
  if (/^-?\d+(\.\d+)?$/.test(s) && digits.length <= 15) return s
  const n = Number(s)
  if (!Number.isFinite(n)) return s
  let out = n.toPrecision(15)
  if (/e/i.test(out)) return s
  if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '')
  return out
}

function parseSheet(xml, sharedStrings, dateStyles, date1904) {
  const rows = []
  let rowIdx = -1
  let colIdx = -1
  let cell = null
  let capture = null // 'v' | 't'
  walkXml(xml, {
    onOpen(name, a) {
      if (name === 'row') {
        rowIdx = a.r ? Number(a.r) - 1 : rowIdx + 1
        colIdx = -1
      } else if (name === 'c') {
        const ref = cellRef(a.r)
        if (ref) { colIdx = ref.col; if (ref.row !== rowIdx) rowIdx = ref.row } else colIdx++
        cell = { t: a.t || 'n', s: a.s !== undefined ? Number(a.s) : 0, v: '', is: '' }
      } else if (cell && name === 'v') capture = 'v'
      else if (cell && name === 't') capture = 't'
      else if (cell && name === 'rPh') capture = null
    },
    onClose(name) {
      if (name === 'v' || name === 't') capture = null
      else if (name === 'c' && cell) {
        const text = cellText(cell, sharedStrings, dateStyles, date1904)
        if (text !== '') {
          while (rows.length <= rowIdx) rows.push([])
          const r = rows[rowIdx]
          while (r.length < colIdx) r.push('')
          r[colIdx] = text
        }
        cell = null
      }
    },
    onText(t) {
      if (!cell || !capture) return
      if (capture === 'v') cell.v += t
      else cell.is += t
    },
  })
  return rows.map((r) => Array.from(r, (c) => (c === undefined ? '' : c)))
}

function cellText(cell, sharedStrings, dateStyles, date1904) {
  switch (cell.t) {
    case 's': {
      const i = Number(cell.v)
      return Number.isInteger(i) && i >= 0 && i < sharedStrings.length ? sharedStrings[i] : ''
    }
    case 'inlineStr': return decodeExcelEscapes(cell.is)
    case 'str': return decodeExcelEscapes(cell.v)
    case 'b': return cell.v.trim() === '1' ? 'TRUE' : 'FALSE'
    case 'e': return cell.v
    case 'd': return cell.v.slice(0, 10)
    default: {
      const v = cell.v.trim()
      if (v === '') return ''
      if (dateStyles.has(cell.s)) {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 1) {
          const r = excelSerialToDate(n, { date1904 })
          // An unconvertible serial (e.g. 60) stays numeric so the date
          // parser reports it instead of us inventing a date.
          if (r.date) return r.date
        }
      }
      return excelNumberText(v)
    }
  }
}

/**
 * @param {Buffer|Uint8Array} input
 * @param {{ sheet?: string|number }} [opts]  sheet name, or 0-based index
 * @returns {import('../model.js').ParsedTable}
 */
export function parseXlsx(input, opts = {}) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buf.length < 4 || buf.readUInt32LE(0) !== SIG_LOC) {
    throw billingParseError('INVALID_XLSX', 'File is not a valid .xlsx (it is not a ZIP archive)')
  }
  const zip = makeReader(buf)
  if (zip.has('EncryptionInfo') || zip.has('EncryptedPackage')) {
    throw billingParseError('ENCRYPTED', 'The workbook is encrypted or password-protected; export it without a password')
  }
  if (!zip.has('xl/workbook.xml')) {
    throw billingParseError('INVALID_XLSX', 'ZIP archive is not an Excel workbook (xl/workbook.xml missing)')
  }
  const { sheets, date1904 } = parseWorkbook(zip.read('xl/workbook.xml'), zip.read('xl/_rels/workbook.xml.rels'))
  if (!sheets.length) throw billingParseError('INVALID_XLSX', 'Workbook has no sheets')
  const sheetNames = sheets.map((s) => s.name)

  let chosen = sheets[0]
  if (opts.sheet !== undefined && opts.sheet !== null && opts.sheet !== '') {
    chosen = typeof opts.sheet === 'number' ? sheets[opts.sheet] : sheets.find((s) => s.name === opts.sheet)
    if (!chosen) {
      throw billingParseError('SHEET_NOT_FOUND', `Sheet ${JSON.stringify(opts.sheet)} not found; sheets are: ${sheetNames.join(', ')}`)
    }
  }
  const sheetXml = zip.read(chosen.path)
  if (sheetXml === null) throw billingParseError('INVALID_XLSX', `Sheet ${chosen.name} is missing from the workbook`)
  const shared = parseSharedStrings(zip.read('xl/sharedStrings.xml'))
  const dateStyles = parseStyles(zip.read('xl/styles.xml'))
  const records = parseSheet(sheetXml, shared, dateStyles, date1904)
  return buildTable(records, { sheetName: chosen.name, reportShortRows: false, meta: { format: 'xlsx', sheetNames, date1904 } })
}

export default parseXlsx
