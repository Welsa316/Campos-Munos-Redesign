// Reminder times in the firm's clock (New Orleans, America/Chicago), stored
// as UTC instants. "Tomorrow morning" is 9:00 AM on the next business day
// (Monday to Friday; public holidays are not skipped), and stays 9:00 local
// across a daylight-saving change. The portal has the same rules for what it
// shows before saving (admin/src/modules/reminders/dueChoices.js); both are
// tested against the same dates.
export const FIRM_TIME_ZONE = 'America/Chicago'
export const MORNING_HOUR = 9
// How far ahead a reminder may be set, and how far behind "now" a due time
// may be (a slow request, a clock a few seconds off).
export const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000
export const SKEW_MS = 60 * 1000

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: FIRM_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const wall = (t) => Object.fromEntries(PARTS.formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]))
function offsetAt(t) {
  const p = wall(t)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
}

/** The instant the firm's wall clock reads y-mo-d h:mi (checked twice, for a day that changes clocks). */
export function firmInstant(y, mo, d, h = 0, mi = 0) {
  const local = Date.UTC(y, mo - 1, d, h, mi)
  let guess = local - offsetAt(local)
  guess = local - offsetAt(guess)
  return new Date(guess)
}

/** 9:00 AM New Orleans time on the first business day after the one containing `now`. */
export function nextBusinessMorning(now = new Date(), hour = MORNING_HOUR) {
  const p = wall(new Date(now).getTime())
  let day = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() + 864e5)
  return firmInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, 0)
}

/** The firm's wall clock at `t`: { year, month, day, hour, minute }. */
export const firmWall = (t) => wall(new Date(t).getTime())

/**
 * A due time from the API: an ISO string with a time zone, or a preset.
 * Returns { at } or { error }. `now` is the server's clock.
 */
export function parseDue(value, now = new Date()) {
  let at = null
  if (value === 'in_30') at = new Date(now.getTime() + 30 * 60 * 1000)
  else if (value === 'in_60') at = new Date(now.getTime() + 60 * 60 * 1000)
  else if (value === 'tomorrow_morning') at = nextBusinessMorning(now)
  else if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(value)) at = new Date(value)
  if (!at || Number.isNaN(at.getTime())) return { error: 'Choose when to be reminded' }
  if (at.getTime() < now.getTime() - SKEW_MS) return { error: 'Choose a time in the future' }
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) return { error: 'Choose a time within the next year' }
  return { at }
}
