// Small wording helpers, so a count, a date or a name never reads wrong:
// "1 invoices", "invoice(s)", "NaN days ago", "Invalid Date", "null null".

import { zoneMidnight } from './firmTime.js'

/** "1 invoice", "3 invoices", "2 replies" (pass the plural when it is not +s). */
export function plural(n, one, many = `${one}s`) {
  const count = Number(n) || 0
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`
}

/** A Date for a value that is a real date, otherwise null (null, '', 'garbage'). */
export function toDate(value) {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A lead's name for a sentence or a label: first and last, else the email, else a fallback. */
export function leadName(lead, fallback = 'a lead with no name') {
  const name = [lead?.first_name, lead?.last_name].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ')
  return name || String(lead?.email || '').trim() || fallback
}

/** "today", "yesterday", "5 days ago"; '' for a value that is not a date. */
export function daysAgo(value, now = Date.now()) {
  const d = toDate(value)
  if (!d) return ''
  // Calendar days in the firm's time zone, not 24-hour spans: a message from
  // 9 PM is "yesterday" at 1 AM.
  const days = Math.round((zoneMidnight(now) - zoneMidnight(d)) / 86400000)
  if (days < 1) return 'today'
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * map[key] for a status shown as a labelled pill, or a neutral entry naming
 * the unknown key: a status the server adds later shows as itself instead
 * of throwing and blanking the whole list.
 */
export function known(map, key, tone = 'bg-gray-100 text-gray-700') {
  return map?.[key] || { label: key ? String(key).replace(/_/g, ' ') : 'Unknown', tone }
}

/**
 * Whether a keydown happened while an input method is composing (Japanese,
 * Chinese, accented letters): its Enter confirms the composition, it must
 * not send.
 */
export const isComposing = (e) => Boolean(e?.isComposing) || e?.keyCode === 229

/** Whether a file looks like a report the importer reads (.csv or .xlsx). */
export function isReportFile(file) {
  return /\.(csv|xlsx)$/i.test(String(file?.name || ''))
}
