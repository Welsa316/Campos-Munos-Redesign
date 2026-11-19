// When a callback reminder is due, in the firm's clock (New Orleans), and how
// it reads. Pure, so the daylight-saving cases are tested apart from the
// page. "Tomorrow morning" is 9:00 AM on the next business day (Monday to
// Friday), the same rule as the server (server/reminders/dueTime.js), so
// the time shown before saving is the time saved.
import { FIRM_TIME_ZONE, firmWall as wall, firmInstant, sameFirmDay } from '../../utils/firmTime.js'
import { makeTranslate } from '../../i18n/translator.js'
import { REMINDERS } from '../../i18n/reminders.js'

const tr = makeTranslate(REMINDERS)

export const MORNING_HOUR = 9

/** 9:00 AM New Orleans time on the first business day after the one containing `now`. */
export function nextBusinessMorning(now = Date.now()) {
  const p = wall(new Date(now).getTime())
  let day = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() + 864e5)
  return firmInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), MORNING_HOUR, 0)
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TIME_ZONE, weekday: 'long' })
const WEEKDAY_ES = new Intl.DateTimeFormat('es-US', { timeZone: FIRM_TIME_ZONE, weekday: 'long' })

/**
 * The quick choices, each with its exact time. The morning one says which
 * morning when it is not literally tomorrow ("Monday morning" on a Friday).
 */
export function dueChoices(now = Date.now(), lang = 'en') {
  const t = new Date(now).getTime()
  const morning = nextBusinessMorning(t)
  const isTomorrow = sameFirmDay(morning, t + 864e5)
  const weekday = (lang === 'es' ? WEEKDAY_ES : WEEKDAY).format(morning)
  return [
    { key: 'in_30', label: tr(lang, 'due.in_30'), at: new Date(t + 30 * 60 * 1000) },
    { key: 'in_60', label: tr(lang, 'due.in_60'), at: new Date(t + 60 * 60 * 1000) },
    { key: 'tomorrow_morning', label: isTomorrow ? tr(lang, 'due.tomorrow_morning') : tr(lang, 'due.weekday_morning', { weekday }), at: morning },
  ]
}

const FULL = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const TIME = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
// Home's Spanish ("vie, 7 de nov, 9:00 a.m.").
const FULL_ES = new Intl.DateTimeFormat('es-US', { timeZone: FIRM_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const TIME_ES = new Intl.DateTimeFormat('es-US', { timeZone: FIRM_TIME_ZONE, hour: 'numeric', minute: '2-digit' })

/** "Fri, Nov 7, 9:00 AM" (New Orleans time). */
export const formatDue = (at, lang = 'en') => (lang === 'es' ? FULL_ES : FULL).format(new Date(at)).replace(' at ', ', ')
/** "9:00 AM". */
export const formatTime = (at, lang = 'en') => (lang === 'es' ? TIME_ES : TIME).format(new Date(at))

/** For the date and time inputs: { date: 'YYYY-MM-DD', time: 'HH:MM' } in New Orleans time. */
export function toInputs(at) {
  const p = wall(new Date(at).getTime())
  const two = (n) => String(n).padStart(2, '0')
  return { date: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour)}:${two(p.minute)}` }
}

/** The instant those inputs mean in New Orleans time, or null when incomplete. */
export function fromInputs(date, time) {
  const d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(date || ''))
  const t = /^(\d\d):(\d\d)$/.exec(String(time || ''))
  if (!d || !t) return null
  const at = firmInstant(Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2]))
  // 2:30 AM on the spring-forward day does not exist; it would land an hour off.
  const back = toInputs(at)
  return back.date === date && back.time === time ? at : null
}

/**
 * Why a picked time cannot be saved, or '' (the server checks the same:
 * not in the past, at most a year out).
 */
export function dueProblem(at, now = Date.now(), lang = 'en') {
  if (!at) return tr(lang, 'due.problem.none')
  const t = new Date(at).getTime()
  if (t < now - 60 * 1000) return tr(lang, 'due.problem.past')
  if (t > now + 366 * 864e5) return tr(lang, 'due.problem.year')
  return ''
}

/** What a reminder's line says: "Fri, Nov 7, 9:00 AM", or "Due now" / "Overdue since 9:00 AM". */
export function dueLine(r, now = Date.now(), lang = 'en') {
  const t = new Date(r.dueAt).getTime()
  if (r.status === 'due' || t <= now) {
    const mins = Math.round((now - t) / 60000)
    if (mins < 5) return tr(lang, 'due.now')
    const sameDay = sameFirmDay(t, now)
    return tr(lang, 'due.overdue_since', { when: sameDay ? formatTime(t, lang) : formatDue(t, lang) })
  }
  return formatDue(t, lang)
}

/** Overdue (past due by 5 minutes or more), due (just now), or later. */
export function dueState(r, now = Date.now()) {
  const t = new Date(r.dueAt).getTime()
  if (r.status !== 'due' && t > now) return 'upcoming'
  return now - t >= 5 * 60 * 1000 ? 'overdue' : 'due'
}
