// Callback reminders in words, and which ones belong where. Pure, tested in
// admin/test/reminders.test.js.

/**
 * What happened to a due reminder's email and notification, in one line, or
 * '' while it is not due yet. A final failure says so plainly: it is the
 * only trace of an email that never arrived.
 */
export function deliveryNote(r, formatTime) {
  const e = r?.delivery?.email
  const p = r?.delivery?.push
  if (!e && !p) return ''
  const pushed = p?.status === 'sent'
  if (e?.status === 'sent') return `Emailed${e.at ? ` ${formatTime(e.at)}` : ''}${pushed ? ' and sent as a notification' : ''}.`
  const parts = []
  if (e?.status === 'pending' && e.nextAttemptAt) parts.push(`The email did not go through yet; trying again at ${formatTime(e.nextAttemptAt)}.`)
  else if (e?.status === 'pending' || e?.status === 'sending') parts.push('Sending the email…')
  else if (e?.status === 'failed') parts.push('The email could not be sent.')
  else if (e?.status === 'skipped_no_email') parts.push('No email was sent: this account has no valid email address.')
  else if (e?.status === 'skipped_disabled') parts.push('Nothing was sent: this account is disabled.')
  else if (e?.status === 'skipped_allowlist') parts.push('No email was sent (this server only emails test addresses).')
  else if (e?.status === 'not_configured') parts.push('No email was sent: email is not set up on the server.')
  if (pushed) parts.push('A notification was sent.')
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
