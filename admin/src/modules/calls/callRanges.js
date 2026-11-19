// The All calls date ranges, in New Orleans days. Pure, tested in
// admin/test/callRanges.test.js.
import { zoneMidnight, zoneMidnightDaysAgo, firmInstant, firmDateKey } from '../../utils/firmTime.js'

export const RANGES = Object.freeze([
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'quarter', label: '90 days' },
  { key: 'half', label: '6 months' },
  { key: 'year', label: '12 months' },
  { key: 'custom', label: 'Dates…' },
])
export const RANGE_KEYS = Object.freeze(RANGES.map((r) => r.key))

// Calls are kept 12 months (server: RINGCENTRAL_CALL_RETENTION_DAYS), so no
// range reaches further back than that.
export const KEEP_DAYS = 365
// Days back from today's midnight, today included (7 days = today and the 6 before).
const DAYS_BACK = { week: 6, month: 29, quarter: 89, half: 181, year: 364 }

/** "2026-11-05" for a real calendar date, else null. */
export function dateKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d ? s : null
}
const startOf = (key) => {
  const [y, mo, d] = key.split('-').map(Number)
  return firmInstant(y, mo, d)
}
const dayAfter = (key) => {
  const [y, mo, d] = key.split('-').map(Number)
  const next = new Date(Date.UTC(y, mo - 1, d + 1))
  return firmInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

/**
 * The two days of a custom range, cleaned: real dates, in order, not in the
 * future, and no further back than calls are kept. Missing ones default to
 * the last 30 days. { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }.
 */
export function customDays({ from, to } = {}, now = Date.now()) {
  const today = firmDateKey(now)
  const oldest = firmDateKey(zoneMidnightDaysAgo(KEEP_DAYS - 1, now))
  let a = dateKey(from) || firmDateKey(zoneMidnightDaysAgo(29, now))
  let b = dateKey(to) || today
  if (a > b) [a, b] = [b, a]
  const clamp = (k) => (k > today ? today : k < oldest ? oldest : k)
  return { from: clamp(a), to: clamp(b) }
}

/** { from, to } instants for a range (custom: its two days, both whole). */
export function rangeBounds(key, custom = {}, now = Date.now()) {
  const soon = new Date(now + 60 * 1000)
  if (key === 'yesterday') return { from: zoneMidnightDaysAgo(1, now), to: zoneMidnight(now) }
  if (key in DAYS_BACK) return { from: zoneMidnightDaysAgo(DAYS_BACK[key], now), to: soon }
  if (key === 'custom') {
    const d = customDays(custom, now)
    const end = dayAfter(d.to)
    return { from: startOf(d.from), to: end > soon ? soon : end }
  }
  return { from: zoneMidnight(now), to: soon }
}

const short = (key, withYear) => startOf(key).toLocaleDateString('en-US', {
  timeZone: 'America/Chicago', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
})

/** How the list names its range: "today", "last 90 days", "Aug 1 – Sep 30". */
export function rangeLabel(key, custom = {}, now = Date.now()) {
  if (key === 'custom') {
    const d = customDays(custom, now)
    const thisYear = firmDateKey(now).slice(0, 4)
    const withYear = d.from.slice(0, 4) !== thisYear || d.to.slice(0, 4) !== thisYear
    return d.from === d.to ? short(d.from, withYear) : `${short(d.from, withYear)} – ${short(d.to, withYear)}`
  }
  const r = RANGES.find((x) => x.key === key)
  if (!r) return ''
  return key in DAYS_BACK ? `last ${r.label}` : r.label.toLowerCase()
}
