// The firm's clock. "Today", business hours, call times and reminder times
// are New Orleans time (the server uses the same zone), whatever time zone
// the browser is in. The one place the portal turns an instant into the
// firm's wall clock and back; tested in admin/test/firmTime.test.js.
export const FIRM_TIME_ZONE = 'America/Chicago'

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: FIRM_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const KEY = new Intl.DateTimeFormat('en-CA', { timeZone: FIRM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The firm's wall clock at instant t: { year, month, day, hour, minute, second }. */
export const firmWall = (t) => Object.fromEntries(PARTS.formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]))

// How far the zone's wall clock is ahead of UTC at instant t, in ms.
function offsetAt(t) {
  const p = firmWall(t)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
}

/**
 * The instant New Orleans' wall clock reads y-mo-d h:mi. Checked twice so
 * a time on a day that changes clocks still lands right.
 */
export function firmInstant(y, mo, d, h = 0, mi = 0) {
  const local = Date.UTC(y, mo - 1, d, h, mi)
  let guess = local - offsetAt(local)
  guess = local - offsetAt(guess)
  return new Date(guess)
}

/** "2026-11-05": the firm's calendar day of an instant. */
export const firmDateKey = (d) => KEY.format(new Date(d))

/** Whether two instants fall on the same firm day. */
export const sameFirmDay = (a, b) => firmDateKey(a) === firmDateKey(b)

/** Midnight that began the firm's day containing `at`, as a Date. */
export function zoneMidnight(at = Date.now()) {
  const p = firmWall(new Date(at).getTime())
  return firmInstant(p.year, p.month, p.day)
}

/** Midnight that began the firm's day `n` days before the one containing `at`. */
export function zoneMidnightDaysAgo(n, at = Date.now()) {
  // From midday of today, n days back, lands inside the wanted day even
  // across a 23- or 25-hour day.
  const midday = zoneMidnight(at).getTime() + 12 * 3600e3
  return zoneMidnight(midday - n * 864e5)
}
