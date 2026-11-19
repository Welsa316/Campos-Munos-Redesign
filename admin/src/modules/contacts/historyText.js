// One line per event in a contact's history (GET /api/contacts/history).
// Pure, so the wording is tested apart from the page.
import { CLASS_LABEL } from '../calls/callEvidenceText.js'
import { when as whenEn, dateKey } from '../calls/callsInbox.js'
import { FIRM_TIME_ZONE } from '../../utils/firmTime.js'
import { makeTranslate } from '../../i18n/translator.js'
import { CONTACTS } from '../../i18n/contacts.js'

const tr = makeTranslate(CONTACTS)

/**
 * label: turns a consultation-type key into its name (consultationLabel).
 * lang 'es' for Spanish; English is the default and the Calls wording.
 */
export function historyLine(e, label = (k) => k, lang = 'en') {
  const t = (key, vars) => tr(lang, key, vars)
  // "… by Ana" when someone is named, the plain line otherwise.
  const by = (key) => (e.employee ? t(`${key}_by`, { name: e.employee }) : t(key))
  switch (e.type) {
    case 'call':
      if (e.direction === 'outbound') {
        return t(e.outcome === 'connected' ? 'line.out_connected' : e.outcome === 'no_answer' ? 'line.out_no_answer' : 'line.out')
      }
      if (e.classification === 'answered') return by('line.in_answered')
      return t('line.in_other', { what: classWord(e.classification, lang) })
    case 'submission': {
      const what = t(e.channel === 'chat' ? 'line.chat' : 'line.enquiry')
      return e.consultationType ? t('line.with_type', { what, type: label(e.consultationType) }) : what
    }
    case 'reply': return by('line.reply')
    case 'lead_note': return by('line.lead_note')
    case 'call_note': return by('line.call_note')
    default: return t('line.other')
  }
}

// How an incoming call ended, in lower case. English reads the Calls page's
// own labels so the two never disagree.
function classWord(c, lang) {
  if (lang !== 'es') return (CLASS_LABEL[c] || 'not confirmed').toLowerCase()
  return tr(lang, Object.hasOwn(CONTACTS.es, `class.${c}`) ? `class.${c}` : 'class.unknown')
}

const TIME_ES = new Intl.DateTimeFormat('es-US', { timeZone: FIRM_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
const DAY_ES = new Intl.DateTimeFormat('es-US', { timeZone: FIRM_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })

/** When an event happened: "2:10 PM" today, "Yesterday 2:10 PM", "Tue, Nov 3 2:10 PM"; Spanish with lang 'es'. */
export function historyWhen(d, now = Date.now(), lang = 'en') {
  if (lang !== 'es') return whenEn(d, now)
  const time = TIME_ES.format(new Date(d))
  const key = dateKey(d)
  if (key === dateKey(now)) return time
  if (key === dateKey(new Date(now).getTime() - 864e5)) return `${tr(lang, 'when.yesterday')} ${time}`
  return `${DAY_ES.format(new Date(d))} ${time}`
}

/** The server's source name ("Website"), in Spanish with lang 'es'; an unknown one as sent. */
export const sourceName = (source, lang = 'en') =>
  (Object.hasOwn(CONTACTS.en, `source.${source}`) ? tr(lang, `source.${source}`) : source)

/** The name on a website lead that is only a possible match. */
export const possibleMatch = (e) => e.type === 'submission' && e.match === 'possible'

export const HISTORY_ICON = { call: 'phone', submission: 'inbox', reply: 'envelope', lead_note: 'note-sticky', call_note: 'note-sticky' }

/**
 * The query for the next older page of a history. The server's `next` is
 * an opaque cursor (events sharing a time are not skipped); an API without
 * it gets the older before=<last event's time>.
 */
export function olderPageParam(next, events) {
  if (typeof next === 'string' && next) return `&cursor=${encodeURIComponent(next)}`
  const last = events?.[events.length - 1]
  return last?.at ? `&before=${encodeURIComponent(last.at)}` : ''
}
