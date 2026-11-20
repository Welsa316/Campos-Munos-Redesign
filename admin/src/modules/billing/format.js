// Money and dates for the billing views, in the language on the switch
// (locale 'en-US' or 'es-US', from useT). English by default, so a caller
// that passes no locale (Home's overdue card) reads as it always has.
// Kept apart from api.js so the text helpers can be tested under node.

const currency = {}
/** Integer cents → "$1,234.56". Division happens once, for display only. */
export function money(cents, locale = 'en-US') {
  if (cents == null) return '—'
  currency[locale] ||= new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })
  return currency[locale].format(Number(cents) / 100)
}

/** "Nov 5, 2026" for a date, "Nov 5, 2026, 1:05 PM" for a moment; Spanish "5 nov 2026". */
export function shortDate(value, locale = 'en-US') {
  if (!value) return '—'
  const s = String(value)
  // DATE values arrive as 'YYYY-MM-DD'; format without a time zone shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10))
  if (m && s.length <= 10) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
