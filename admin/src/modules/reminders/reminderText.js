// Callback reminders in words, and which ones belong where. Pure, tested in
// admin/test/reminders.test.js.
import { makeTranslate } from '../../i18n/translator.js'
import { REMINDERS } from '../../i18n/reminders.js'

const tr = makeTranslate(REMINDERS)

/**
 * What happened to a due reminder's email and notification, in one line, or
 * '' while it is not due yet. A final failure says so plainly: it is the
 * only trace of an email that never arrived.
 */
export function deliveryNote(r, formatTime, lang = 'en') {
  const e = r?.delivery?.email
  const p = r?.delivery?.push
  if (!e && !p) return ''
  const t = (key, vars) => tr(lang, key, vars)
  const pushed = p?.status === 'sent'
  if (e?.status === 'sent') {
    if (e.at) return t(pushed ? 'delivery.emailed_at_pushed' : 'delivery.emailed_at', { time: formatTime(e.at) })
    return t(pushed ? 'delivery.emailed_pushed' : 'delivery.emailed')
  }
  const parts = []
  if (e?.status === 'pending' && e.nextAttemptAt) parts.push(t('delivery.retrying', { time: formatTime(e.nextAttemptAt) }))
  else if (e?.status === 'pending' || e?.status === 'sending') parts.push(t('delivery.sending'))
  else if (e?.status === 'failed') parts.push(t('delivery.failed'))
  else if (e?.status === 'skipped_no_email') parts.push(t('delivery.no_email'))
  else if (e?.status === 'skipped_disabled') parts.push(t('delivery.disabled'))
  else if (e?.status === 'skipped_allowlist') parts.push(t('delivery.allowlist'))
  else if (e?.status === 'not_configured') parts.push(t('delivery.not_configured'))
  if (pushed) parts.push(t('delivery.pushed'))
  return parts.join(' ')
}

/** The reminders on one callback episode: on any of its calls (a reminder keeps its first call's id). */
export function remindersForEpisode(reminders, episode) {
  if (!episode) return []
  const ids = new Set(episode.callIds || [episode.id])
  return (reminders || []).filter((r) => r.target.kind === 'call' && ids.has(r.target.id))
}

/** What marks a reminder as announced: its id and due time, so a snoozed one counts as new. */
export const announceKey = (r) => `${r.id}@${new Date(r.dueAt).getTime()}`

/**
 * The due reminders to announce now: due (by status or time) and not
 * announced before in this tab. A snoozed reminder that comes round again
 * is announced again (its due time is part of the key).
 */
export function dueToAnnounce(reminders, seen, now = Date.now()) {
  return (reminders || []).filter((r) => {
    if (r.status !== 'due' && new Date(r.dueAt).getTime() > now) return false
    return !seen.has(announceKey(r))
  })
}
