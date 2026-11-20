// The inbox's times, in English or Spanish: how long ago a lead came in (the
// list) and when a message in the conversation was sent (the lead). Pure,
// so it is tested in admin/test/i18nMessages.test.js. English unless asked.
import { makeTranslate, clockCount } from '../../i18n/translator.js'
import { MESSAGES } from '../../i18n/messages.js'
import { toDate } from '../../utils/text.js'

const translate = makeTranslate(MESSAGES)
const localeOf = (lang) => (lang === 'es' ? 'es-US' : 'en-US')

/** "Just now", "5m ago", "3h ago", "Yesterday", "4d ago", then "Nov 2". */
export function relativeTime(value, now = Date.now(), lang = 'en') {
  const then = new Date(value).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return translate(lang, 'rel.now')
  if (mins < 60) return translate(lang, 'rel.mins', { count: mins })
  if (hours < 24) return translate(lang, 'rel.hours', { count: hours })
  if (days === 1) return translate(lang, 'rel.yesterday')
  if (days < 7) return translate(lang, 'rel.days', { count: days })
  return new Date(value).toLocaleDateString(localeOf(lang), { month: 'short', day: 'numeric' })
}

/** "Today at 3:05 PM", "Yesterday at …", "Nov 2 at …"; '' for a value that is not a date. */
export function threadDate(value, now = new Date(), lang = 'en') {
  const d = toDate(value)
  if (!d) return ''
  const locale = localeOf(lang)
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  // The hour on the clock, for "a la 1:05" against "a las 3:05".
  const count = clockCount(time)
  if (d.toDateString() === now.toDateString()) return translate(lang, 'date.today', { time, count })
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return translate(lang, 'date.yesterday', { time, count })
  const date = d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  return translate(lang, 'date.other', { date, time, count })
}
