// The firm's office hours, in one place: Monday to Friday, 9:00 AM to
// 5:00 PM, New Orleans time (America/Chicago), as published on the website.
// An administrator can change the days and times (automation settings,
// 'hours'); the time zone is the firm's.
//
// Follow-ups and escalations count business time, so a lead who writes at
// 6 PM on Friday is "one business day old" on Monday evening, not Saturday.
// Public holidays are not excluded (the same as the rest of the portal).
import { FIRM_TIME_ZONE, firmWall, firmInstant } from '../reminders/dueTime.js'

export const DEFAULT_HOURS = Object.freeze({ timeZone: FIRM_TIME_ZONE, days: Object.freeze([1, 2, 3, 4, 5]), start: '09:00', end: '17:00' })

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const minutesOf = (hhmm) => { const m = HHMM.exec(hhmm); return Number(m[1]) * 60 + Number(m[2]) }

/** A usable hours object from settings, or the defaults when it is not valid. */
export function normalizeHours(value) {
  const v = value && typeof value === 'object' ? value : {}
  const days = Array.isArray(v.days) ? [...new Set(v.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null
  const ok = days?.length && HHMM.test(v.start || '') && HHMM.test(v.end || '') && minutesOf(v.start) < minutesOf(v.end)
  return ok ? { timeZone: FIRM_TIME_ZONE, days, start: v.start, end: v.end } : { ...DEFAULT_HOURS, days: [...DEFAULT_HOURS.days] }
}

export function hoursProblem(value) {
  const v = value || {}
  if (!Array.isArray(v.days) || !v.days.length || !v.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return 'Choose at least one office day'
  if (!HHMM.test(v.start || '') || !HHMM.test(v.end || '')) return 'Office hours must be times like 09:00'
  if (minutesOf(v.start) >= minutesOf(v.end)) return 'The office must open before it closes'
  return null
}

// The firm's calendar day containing t, and that day's window as instants.
function dayOf(t) {
  const w = firmWall(t)
  return { y: w.year, m: w.month, d: w.day }
}
const weekday = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d)).getUTCDay()
const nextDay = ({ y, m, d }) => { const n = new Date(Date.UTC(y, m - 1, d + 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate() } }
function windowOf(day, hours) {
  if (!hours.days.includes(weekday(day))) return null
  const [sh, sm] = hours.start.split(':').map(Number)
  const [eh, em] = hours.end.split(':').map(Number)
  return { open: firmInstant(day.y, day.m, day.d, sh, sm).getTime(), close: firmInstant(day.y, day.m, day.d, eh, em).getTime() }
}

/** Is the office open at t? */
export function isBusinessTime(t, hours = DEFAULT_HOURS) {
  const ms = new Date(t).getTime()
  const w = windowOf(dayOf(ms), hours)
  return Boolean(w && ms >= w.open && ms < w.close)
}

/** t itself when the office is open, else the next time it opens. */
export function nextBusinessTime(t, hours = DEFAULT_HOURS) {
  const ms = new Date(t).getTime()
  let day = dayOf(ms)
  for (let i = 0; i < 370; i++) {
    const w = windowOf(day, hours)
    if (w) {
      if (ms < w.open) return new Date(w.open)
      if (ms < w.close) return new Date(ms)
    }
    day = nextDay(day)
  }
  return new Date(ms)
}

/**
 * The instant `minutes` of office time after t. Time outside office hours
 * does not count: 30 minutes after Friday 4:50 PM is Monday 9:20 AM.
 */
export function addBusinessMinutes(t, minutes, hours = DEFAULT_HOURS) {
  let left = Math.max(0, Math.round(Number(minutes) || 0)) * 60 * 1000
  let cur = nextBusinessTime(t, hours).getTime()
  for (let i = 0; i < 2000; i++) {
    const w = windowOf(dayOf(cur), hours)
    const room = w ? w.close - cur : 0
    if (left < room || (left === room && left === 0)) return new Date(cur + left)
    if (left === room) return new Date(w.close)
    left -= room
    cur = nextBusinessTime((w ? w.close : cur) + 1, hours).getTime()
  }
  return new Date(cur)
}

/** Whole business days after t, landing at the same office-time offset into the day. */
export function addBusinessDays(t, days, hours = DEFAULT_HOURS) {
  const [sh, sm] = hours.start.split(':').map(Number)
  const [eh, em] = hours.end.split(':').map(Number)
  return addBusinessMinutes(t, Math.max(0, Number(days) || 0) * ((eh * 60 + em) - (sh * 60 + sm)), hours)
}

/** Office minutes between two instants (0 when b is not after a). */
export function businessMinutesBetween(a, b, hours = DEFAULT_HOURS) {
  const end = new Date(b).getTime()
  let cur = nextBusinessTime(a, hours).getTime()
  let total = 0
  for (let i = 0; i < 2000 && cur < end; i++) {
    const w = windowOf(dayOf(cur), hours)
    if (!w) break
    total += Math.max(0, Math.min(w.close, end) - cur)
    if (end <= w.close) break
    cur = nextBusinessTime(w.close + 1, hours).getTime()
  }
  return Math.floor(total / 60000)
}

export default { DEFAULT_HOURS, normalizeHours, hoursProblem, isBusinessTime, nextBusinessTime, addBusinessMinutes, addBusinessDays, businessMinutesBetween }
