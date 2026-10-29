// Money parsing for billing imports. Amounts become integer cents using
// string and integer arithmetic only: no parseFloat, no float dollars.
//
// Accepted:  "$1,234.56"  "1234.5"  "1234"  "(50.00)"  "-$50"  "$-50"
//            "USD 10"  "10 USD"  "US$10"  "1.234,56" (European, only when a
//            dot thousands group AND a comma decimal make it unambiguous)
// Rejected:  more than 2 decimals, "1.234" (thousands or 3 decimals?),
//            "12,50" (comma decimal with no grouping to confirm it),
//            malformed grouping ("1,23,456"), exponents, any other text.
// Blank (or only whitespace) returns { cents: null, error: null }.

const MAX_DIGITS = 13 // whole dollars; keeps cents well inside 2^53

/**
 * @param {string|number|null|undefined} text
 * @returns {{ cents: number|null, error: string|null }}
 */
export function parseMoneyToCents(text) {
  if (text === null || text === undefined) return { cents: null, error: null }
  if (typeof text === 'number') {
    if (!Number.isFinite(text)) return fail(text, 'is not a finite number')
    text = String(text)
  }
  if (typeof text !== 'string') return fail(text, 'is not text')
  let s = text.replace(/ /g, ' ').trim()
  if (s === '') return { cents: null, error: null }
  const original = s

  let negative = false
  // Parentheses negative: "(50.00)", "($50.00)"
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  // Currency markers, either side.
  s = s.replace(/^(?:USD|US\$)\s*/i, '').replace(/\s*(?:USD)$/i, '').trim()
  let signs = 0
  // Sign and dollar sign in either order: "-$5", "$-5", "-5", "$5", "5-"
  for (;;) {
    if (s.startsWith('-')) { signs++; s = s.slice(1).trim(); continue }
    if (s.startsWith('+')) { s = s.slice(1).trim(); continue }
    if (s.startsWith('$')) { s = s.slice(1).trim(); continue }
    break
  }
  if (s.endsWith('-')) { signs++; s = s.slice(0, -1).trim() }
  if (signs > 1 || (signs === 1 && negative)) return fail(original, 'has more than one minus sign')
  if (signs === 1) negative = true
  if (s === '') return fail(original, 'has no digits')
  if (!/^[0-9.,]+$/.test(s)) return fail(original, 'is not a money amount')
  if (!/[0-9]/.test(s)) return fail(original, 'has no digits')

  const split = splitNumber(s)
  if (split.error) return fail(original, split.error)
  const { whole, frac } = split
  if (frac.length > 2) return fail(original, 'has more than 2 decimal places')
  const wholeDigits = whole.replace(/^0+(?=\d)/, '') || '0'
  if (wholeDigits.length > MAX_DIGITS) return fail(original, 'is too large')
  const cents = Number(wholeDigits) * 100 + Number((frac + '00').slice(0, 2))
  return { cents: negative && cents !== 0 ? -cents : cents, error: null }
}

/** Split a digits/commas/dots string into whole and fractional digit strings. */
function splitNumber(s) {
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (!hasDot && !hasComma) return { whole: s, frac: '' }

  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    const decimalSep = lastDot > lastComma ? '.' : ','
    const groupSep = decimalSep === '.' ? ',' : '.'
    const idx = s.lastIndexOf(decimalSep)
    const intPart = s.slice(0, idx)
    const frac = s.slice(idx + 1)
    if (intPart.includes(decimalSep)) return { error: `uses "${decimalSep}" more than once` }
    if (!validGrouping(intPart, groupSep)) return { error: 'has malformed thousands grouping' }
    if (!/^\d+$/.test(frac)) return { error: 'has a malformed decimal part' }
    return { whole: intPart.split(groupSep).join(''), frac }
  }

  if (hasComma) {
    // Commas only. Valid US grouping ("1,234", "12,345,678") is thousands.
    if (validGrouping(s, ',')) return { whole: s.split(',').join(''), frac: '' }
    if (/^\d+,\d{1,2}$/.test(s)) {
      return { error: 'uses a comma decimal without thousands grouping; ambiguous, enter it as 12.50' }
    }
    return { error: 'has malformed thousands grouping' }
  }

  // Dots only.
  const parts = s.split('.')
  if (parts.length === 2) {
    const [intPart, frac] = parts
    if (!/^\d*$/.test(intPart) || !/^\d+$/.test(frac)) return { error: 'has a malformed decimal part' }
    if (frac.length === 3 && intPart.length >= 1 && intPart.length <= 3 && intPart !== '0') {
      return { error: 'is ambiguous: "." could be a thousands separator or 3 decimal places' }
    }
    return { whole: intPart || '0', frac }
  }
  // "1.234.567": only readable as dot thousands grouping.
  if (validGrouping(s, '.')) return { whole: parts.join(''), frac: '' }
  return { error: 'has more than one decimal point' }
}

function validGrouping(intPart, sep) {
  if (!intPart.includes(sep)) return /^\d+$/.test(intPart)
  const groups = intPart.split(sep)
  if (!/^\d{1,3}$/.test(groups[0])) return false
  return groups.slice(1).every((g) => /^\d{3}$/.test(g))
}

function fail(original, why) {
  return { cents: null, error: `"${String(original)}" ${why}` }
}

/**
 * Format integer cents as "$1,234.56" (negative: "-$1,234.56").
 * @param {number} cents
 */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError(`formatCents expects integer cents, got ${cents}`)
  const neg = cents < 0
  const abs = neg ? -cents : cents
  const dollars = String(Math.trunc(abs / 100))
  const rem = String(abs % 100).padStart(2, '0')
  const grouped = dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}$${grouped}.${rem}`
}

export default { parseMoneyToCents, formatCents }
