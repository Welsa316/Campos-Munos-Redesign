// The firm's clock. "Today", business hours and call times are New Orleans
// time (the server's business-hours filter uses the same zone), whatever
// time zone the browser is in.
export const FIRM_TIME_ZONE = 'America/Chicago'

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: FIRM_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})
// The zone's wall clock at instant t: { year, month, day, hour, minute, second }.
const wall = (t) => Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]))
// How far the zone's wall clock is ahead of UTC at instant t, in ms.
function offsetAt(t) {
  const p = wall(t)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
}

/**
 * Midnight that began the firm's day containing `at`, as a Date. Checked
 * twice so a day that changes clocks (2 a.m.) still starts at midnight.
 */
export function zoneMidnight(at = Date.now()) {
  const t = new Date(at).getTime()
  const p = wall(t)
  const day = Date.UTC(p.year, p.month - 1, p.day)
  let guess = day - offsetAt(t)
  guess = day - offsetAt(guess)
  return new Date(guess)
}

/** Midnight that began the firm's day `n` days before the one containing `at`. */
export function zoneMidnightDaysAgo(n, at = Date.now()) {
  // From midday of today, n days back, lands inside the wanted day even
  // across a 23- or 25-hour day.
  const midday = zoneMidnight(at).getTime() + 12 * 3600e3
  return zoneMidnight(midday - n * 864e5)
}
