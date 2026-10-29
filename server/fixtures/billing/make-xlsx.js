// Builds fixtures/billing/invoice_summary.xlsx from SYNTHETIC data using only
// Node built-ins (zlib.deflateRawSync + a hand-written CRC-32 and ZIP
// writer). The ZIP and CRC code here is intentionally independent of the
// parser in billing/parsers/xlsx.js so the two cannot share a bug.
//
//   node fixtures/billing/make-xlsx.js
//
// buildZip / buildXlsx / crc32 are exported for the parser tests, which use
// them to craft edge-case workbooks (sparse cells, zip bombs, encryption).

import zlib from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * @param {{ name: string, data: Buffer|string, method?: 'deflate'|'store',
 *           declaredSize?: number, flags?: number }[]} entries
 *   declaredSize / flags override the honest values (for hostile-zip tests).
 */
export function buildZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8')
    const store = e.method === 'store'
    const body = store ? data : zlib.deflateRawSync(data)
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(data)
    const size = e.declaredSize ?? data.length
    const flags = e.flags ?? 0x0800 // UTF-8 names
    const method = store ? 0 : 8

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(flags, 8)
    cen.writeUInt16LE(method, 10)
    cen.writeUInt16LE(0, 12)
    cen.writeUInt16LE(0x21, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(body.length, 20)
    cen.writeUInt32LE(size, 24)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(offset, 42)
    centrals.push(cen, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function colName(i) {
  let s = ''
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

/** Days since Excel's 1900-system epoch (valid for dates after 1900-03-01). */
export function toSerial(y, m, d) {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000
}

/**
 * Cell specs: string → shared string; number → numeric; boolean → boolean;
 * null/undefined → no cell (sparse); { inline } → inline string;
 * { date: serial } → numeric with built-in date format 14;
 * { customDate: serial } → numeric with custom format 164 (mm/dd/yyyy);
 * { raw } → numeric with the exact <v> text given.
 * @param {{ sheets: { name: string, rows: any[][] }[], date1904?: boolean }} wb
 */
export function buildXlsx({ sheets, date1904 = false }) {
  const shared = []
  const sharedIdx = new Map()
  const ss = (s) => {
    if (!sharedIdx.has(s)) { sharedIdx.set(s, shared.length); shared.push(s) }
    return sharedIdx.get(s)
  }
  const sheetXml = sheets.map((sheet) => {
    const rowsXml = sheet.rows.map((cells, r) => {
      const cs = cells.map((v, c) => {
        if (v === null || v === undefined) return ''
        const ref = `${colName(c)}${r + 1}`
        if (typeof v === 'string') return `<c r="${ref}" t="s"><v>${ss(v)}</v></c>`
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
        if (v.inline !== undefined) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`
        if (v.date !== undefined) return `<c r="${ref}" s="1"><v>${v.date}</v></c>`
        if (v.customDate !== undefined) return `<c r="${ref}" s="2"><v>${v.customDate}</v></c>`
        if (v.raw !== undefined) return `<c r="${ref}"><v>${v.raw}</v></c>`
        throw new Error(`Unknown cell spec ${JSON.stringify(v)}`)
      }).join('')
      return cs ? `<row r="${r + 1}">${cs}</row>` : ''
    }).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`
  })

  const entries = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${date1904 ? '<workbookPr date1904="1"/>' : ''}<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>` },
    ...sheetXml.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ]
  // Shared strings are collected while rendering the sheets, so add last.
  entries.push({ name: 'xl/sharedStrings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>` })
  return buildZip(entries)
}

/** The committed fixture. Every name and id is invented. */
export function fixtureWorkbook() {
  return buildXlsx({
    sheets: [
      {
        name: 'Invoices',
        rows: [
          ['Client ID', 'Client Name', 'Invoice #', 'Invoice Date', 'Due Date', 'Invoice Total', 'Amount Paid', 'Balance Due', 'Status', 'Flagged'],
          ['EIM-C-0001', 'Prueba Uno', 'INV-1001', { date: toSerial(2026, 1, 5) }, { customDate: toSerial(2026, 2, 4) }, 1500, 1500, 0, 'Paid', false],
          ['EIM-C-0002', { inline: 'Prueba Dos' }, 'INV-1002', { date: toSerial(2026, 9, 1) }, { customDate: toSerial(2026, 12, 15) }, 2000, 500, 1500, 'Partial', true],
          // Sparse: no Invoice Date cell (D4) and no Flagged cell; the balance
          // is stored as the double Excel would hold for a computed 749.75.
          ['EIM-C-0007', 'Prueba Siete', 'INV-1009', null, { customDate: toSerial(2026, 9, 9) }, 1000, 250.25, { raw: '749.75000000000011' }, 'Partial'],
          ['EIM-C-0010', 'Prueba Ñandú Pérez', 'INV-1012', { date: toSerial(2026, 9, 20) }, { customDate: toSerial(2026, 12, 20) }, 1000, 100, 900, 'Pendiente', false],
        ],
      },
      {
        name: 'Notes',
        rows: [
          ['SYNTHETIC TEST DATA', 'Count'],
          ['Second sheet for sheet-selection tests', 42],
        ],
      },
    ],
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'invoice_summary.xlsx')
  writeFileSync(out, fixtureWorkbook())
  console.log(`wrote ${out}`)
}
