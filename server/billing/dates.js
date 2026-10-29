// Date parsing for billing imports. Output is always 'YYYY-MM-DD' in the
// firm's calendar; no time zones are applied and any time of day is dropped.
//
// Accepted:  2026-01-05, 2026/01/05, 2026-01-05T10:00:00Z (date part kept)
//            1/5/2026, 01/05/2026, 1-5-2026, 1/5/26 (US month-first; the firm
//            is in Louisiana. Two-digit years are read as 20xx.)
//            Jan 5, 2026 / January 5 2026 / 5 Jan 2026 / 5 de enero de 2026
//            Excel serial numbers (number or numeric string, 1900 system)
// Rejected:  impossible dates (2/30/2026), day-first dates that are not valid
//            month-first (13/01/2026 is NOT silently reread as 13 January),
//            Excel serial 60 (Excel's fictitious 1900-02-29), anything else.
// Blank returns { date: null, error: null }.

const MONTHS = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
}

/** Highest serial Excel accepts (9999-12-31). */
const MAX_SERIAL = 2958465

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y, m) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

function ymd(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function build(y, m, d, original) {
  if (!(m >= 1 && m <= 12)) return fail(original, `has no month ${m}`)
  if (!(y >= 1900 && y <= 9999)) return fail(original, `has an out-of-range year ${y}`)
  if (!(d >= 1 && d <= daysInMonth(y, m))) return fail(original, 'is not a real calendar date')
  return { date: ymd(y, m, d), error: null }
}

function fail(original, why) {
  return { date: null, error: `"${String(original)}" ${why}` }
}

/**
 * Convert an Excel 1900-system serial (whole days; any fraction is the time
 * of day and is dropped) to 'YYYY-MM-DD'. Serial 60 is Excel's fake
 * 1900-02-29 (inherited Lotus bug) and is rejected. With date1904 the epoch
 * is 1904-01-01 = serial 0.
 * @returns {{ date: string|null, error: string|null }}
 */
export function excelSerialToDate(serial, { date1904 = false } = {}) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return fail(serial, 'is not an Excel serial number')
  const whole = Math.floor(serial)
  if (date1904) {
    if (whole < 0 || whole > MAX_SERIAL - 1462) return fail(serial, 'is outside the Excel date range')
    return fromEpochDays(Date.UTC(1904, 0, 1), whole)
  }
  if (whole < 1 || whole > MAX_SERIAL) return fail(serial, 'is outside the Excel date range')
  if (whole === 60) return fail(serial, 'is Excel serial 60, the nonexistent date 1900-02-29')
  // Serials 1..59 count from 1899-12-31; from 61 on Excel is one day ahead
  // because of the phantom leap day, so count from 1899-12-30.
  const epoch = whole < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  return fromEpochDays(epoch, whole)
}

function fromEpochDays(epochMs, days) {
  const dt = new Date(epochMs + days * 86400000)
  return { date: ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()), error: null }
}

/**
 * @param {string|number|null|undefined} text
 * @returns {{ date: string|null, error: string|null }}
 */
export function parseDate(text) {
  if (text === null || text === undefined) return { date: null, error: null }
  if (typeof text === 'number') return excelSerialToDate(text)
  if (typeof text !== 'string') return fail(text, 'is not a date')
  const s = text.replace(/ /g, ' ').trim()
  if (s === '') return { date: null, error: null }

  // Excel serial as text: "46027" or "46027.5"
  if (/^\d+(\.\d+)?$/.test(s)) {
    return excelSerialToDate(Number(s))
  }

  // ISO / year-first, optional time part
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/)
  if (m) return build(+m[1], +m[2], +m[3], s)

  // US month-first, optional time part
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}.*)?$/)
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return build(year, +m[1], +m[2], s)
  }

  // Month names (English and Spanish), accents ignored
  const plain = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  // "Jan 5, 2026", "January 5 2026", "Jan. 5, 2026"
  m = plain.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/)
  if (m && MONTHS[m[1]]) return build(+m[3], MONTHS[m[1]], +m[2], s)
  // "5 Jan 2026", "5-Jan-2026", "5 de enero de 2026"
  m = plain.match(/^(\d{1,2})[\s-]+(?:de\s+)?([a-z]+)\.?[\s-]+(?:de\s+|del\s+)?(\d{4})$/)
  if (m && MONTHS[m[2]]) return build(+m[3], MONTHS[m[2]], +m[1], s)

  return fail(s, 'is not a recognised date')
}

export default { parseDate, excelSerialToDate }
