// The Calls page's follow-up wording and grouping. Pure functions, so the
// page's promises ("open until someone connects", "never resolved before the
// server says so") are tested apart from the page.
//
// None of this decides what a call *was*: that is the server's evidence
// classification (callEvidence.js), read through callEvidenceText.js. This
// only says what is left to do about it.
//
// Every wording function takes an optional lang ('en' or 'es', English by
// default): the words come from i18n/calls.js and dates use that language's
// format, always in New Orleans time.

import { who } from './callEvidenceText.js'
import { FIRM_TIME_ZONE, firmDateKey, sameFirmDay } from '../../utils/firmTime.js'
import { dueLine, formatDue, formatTime } from '../reminders/dueChoices.js'
import { tc, callsLocale } from '../../i18n/calls.js'

export const TIME_ZONE = FIRM_TIME_ZONE

const fmt = (lang, opts) => new Intl.DateTimeFormat(callsLocale(lang), { timeZone: TIME_ZONE, ...opts })
const TIME = { en: fmt('en', { hour: 'numeric', minute: '2-digit' }), es: fmt('es', { hour: 'numeric', minute: '2-digit' }) }
const DAY = { en: fmt('en', { weekday: 'short', month: 'short', day: 'numeric' }), es: fmt('es', { weekday: 'short', month: 'short', day: 'numeric' }) }
const pick = (table, lang) => (lang === 'es' ? table.es : table.en)

/** "2026-11-05" in the firm's time zone. */
export const dateKey = firmDateKey
/** "2:10 PM" ("2:10 p.m." in Spanish). */
export const timeOf = (d, lang = 'en') => pick(TIME, lang).format(new Date(d))
/** "Tue, Nov 3" ("mar, 3 de nov"), in the firm's time zone. */
export const dayDate = (d, lang = 'en') => pick(DAY, lang).format(new Date(d))

/** "Today", "Yesterday", or "Tue, Nov 3", in the firm's time zone. */
export function dayName(d, now = Date.now(), lang = 'en') {
  const key = dateKey(d)
  if (key === dateKey(now)) return tc(lang, 'day.today')
  if (key === dateKey(new Date(now).getTime() - 864e5)) return tc(lang, 'day.yesterday')
  return dayDate(d, lang)
}

/** "2:10 PM" today, "Yesterday 2:10 PM", "Tue, Nov 3 2:10 PM" ("Ayer, 2:10 p.m."). */
export function when(d, now = Date.now(), lang = 'en') {
  if (dateKey(d) === dateKey(now)) return timeOf(d, lang)
  return tc(lang, 'when.day_time', { day: dayName(d, now, lang), time: timeOf(d, lang) })
}

// Needs attention, oldest trouble first (the server sets attentionGroup).
export const GROUPS = [
  { key: 'waiting', label: 'From earlier days', hint: 'follow up first' },
  { key: 'try_again', label: 'Try again', hint: 'a callback did not connect' },
  { key: 'new', label: 'New today', hint: '' },
]

// --- callback episodes -------------------------------------------------------------
// Needs attention lists one item per person waiting for a call back (the
// server groups their unanswered calls into an episode), and below it the
// quiet review group: calls RingCentral recorded no outcome for.

export const REVIEW_GROUP = {
  key: 'review',
  label: 'Check if they still need help',
  note: 'RingCentral did not record how these calls ended. Nobody is counted as missing them.',
}

const byLatest = (a, b) => new Date(b.lastAt) - new Date(a.lastAt) || b.id - a.id
// "Today"/"Yesterday" ("Hoy"/"Ayer") in lower case inside a sentence.
const lower = (day, lang = 'en') => {
  for (const key of ['day.today', 'day.yesterday']) {
    const word = tc(lang, key)
    if (new RegExp(`^${word}\\b`).test(day)) return word.toLowerCase() + day.slice(word.length)
  }
  return day
}
// A time inside a Spanish sentence always reads in lower case ("se intentó
// ayer, 2:10 p.m."); English keeps the wording it always had.
export const inline = (at, lang) => (lang === 'es' ? lower(at, lang) : at)

/**
 * Needs attention by episode: one section per group that has any (the
 * server sets each episode's group from its first call), the most recently
 * active caller first inside each. Review episodes are never in these.
 */
export function episodeSections(episodes, lang = 'en') {
  const open = episodes.filter((e) => e.kind !== 'review')
  return GROUPS.map((g) => ({
    ...g,
    label: tc(lang, `group.${g.key}`),
    hint: g.hint ? tc(lang, `group.${g.key}.hint`) : '',
    episodes: open.filter((e) => (e.attentionGroup || 'new') === g.key).sort(byLatest),
  })).filter((g) => g.episodes.length)
}

/** The review group, most recent first; null when it is empty. */
export function reviewSection(review, lang = 'en') {
  const list = review.filter((e) => e.kind === 'review').sort(byLatest)
  return list.length ? { ...REVIEW_GROUP, label: tc(lang, 'group.review'), note: tc(lang, 'group.review.note'), episodes: list } : null
}

/**
 * "3 unanswered calls · first Mon, Nov 2 9:15 AM · last 10:05 AM". Null for a
 * single call: its row reads exactly as it did before episodes.
 */
export function episodeSummary(ep, now = Date.now(), lang = 'en') {
  if (!ep || ep.attempts < 2) return null
  const key = ep.kind === 'review' ? 'ep.summary_review' : 'ep.summary'
  return tc(lang, key, { count: ep.attempts, first: lower(when(ep.firstAt, now, lang), lang), last: lower(when(ep.lastAt, now, lang), lang) })
}

/**
 * What is left to do about the person, in one line (same tones as
 * followUpLine). Callbacks that did not connect are counted, not resolving.
 */
export function episodeLine(ep, now = Date.now(), lang = 'en') {
  if (ep.kind === 'review') return { tone: 'quiet', text: tc(lang, 'line.review') }
  const n = ep.callbackAttempts || 0
  if (n && ep.lastCallbackAttemptAt) {
    const at = when(ep.lastCallbackAttemptAt, now, lang)
    return { tone: 'open', text: n === 1 ? tc(lang, 'line.tried_once', { at: inline(at, lang) }) : tc(lang, 'line.tried_many', { count: n, at: lower(at, lang) }) }
  }
  if (ep.attentionGroup === 'waiting') return { tone: 'open', text: tc(lang, 'line.waiting_since', { day: lower(dayName(ep.firstAt, now, lang), lang) }) }
  return { tone: 'open', text: tc(lang, 'line.callback_needed') }
}

/** When a dealt-with call was dealt with: marked handled, or closed by a later connected call. */
export const resolvedAt = (c) => c.handled?.at || c.connectedFollowUp?.at || null

/**
 * Handled, by the day each call was dealt with (not the day it came in),
 * most recent first. Calls the server does not report as dealt with are
 * left out, whatever the list contains.
 */
export function handledSections(calls, now = Date.now(), lang = 'en') {
  const done = calls.filter((c) => !c.exclusion && resolvedAt(c))
    .sort((a, b) => new Date(resolvedAt(b)) - new Date(resolvedAt(a)) || b.id - a.id)
  const out = []
  for (const c of done) {
    const at = resolvedAt(c)
    const key = dateKey(at)
    let day = out[out.length - 1]
    if (!day || day.key !== key) {
      day = { key, label: dayName(at, now, lang), date: dayDate(at, lang), calls: [] }
      out.push(day)
    }
    day.calls.push(c)
  }
  return out
}

/** All calls, by day in the firm's time zone, newest first as served. */
export function daySections(calls, now = Date.now(), lang = 'en') {
  const out = []
  for (const c of calls) {
    const key = dateKey(c.startedAt)
    let day = out[out.length - 1]
    if (!day || day.key !== key) {
      day = { key, label: dayName(c.startedAt, now, lang), date: dayDate(c.startedAt, lang), calls: [] }
      out.push(day)
    }
    day.calls.push(c)
  }
  return out
}

/**
 * What is left to do about a call, in one short line, and its tone:
 * 'open' (someone needs to act), 'done' (dealt with), 'quiet' (nothing to do).
 * Only what the server sent counts as dealt with: a pending click never does.
 */
export function followUpLine(c, now = Date.now(), lang = 'en') {
  if (c.direction !== 'inbound') return null
  const T = (key, vars) => tc(lang, key, vars)
  if (c.exclusion) return { tone: 'quiet', text: T('line.no_callback') }
  if (c.handled?.bulk) return { tone: 'done', text: T(c.handled.by ? 'line.cleared_by' : 'line.cleared', { by: c.handled.by, at: inline(when(c.handled.at, now, lang), lang) }) }
  if (c.handled) return { tone: 'done', text: T(c.handled.by ? 'line.handled_by' : 'line.handled', { by: c.handled.by, at: inline(when(c.handled.at, now, lang), lang) }) }
  if (c.connectedFollowUp) {
    const at = inline(when(c.connectedFollowUp.at, now, lang), lang)
    return { tone: 'done', text: T(c.connectedFollowUp.kind === 'called_back' ? 'line.called_back' : 'line.reached_later', { at }) }
  }
  if (c.needsReview) return { tone: 'quiet', text: T('line.review') }
  if (!c.needsAttention) return null
  if (c.attemptAt) return { tone: 'open', text: T('line.tried_once', { at: inline(when(c.attemptAt, now, lang), lang) }) }
  if (c.attentionGroup === 'waiting') {
    const day = dayName(c.startedAt, now, lang)
    return { tone: 'open', text: T('line.waiting_since', { day: lang === 'es' ? lower(day, lang) : day.replace(/^Yesterday$/, 'yesterday') }) }
  }
  return { tone: 'open', text: T('line.callback_needed') }
}

/** The longer account of the same, for the call's detail card. */
export function followUpDetail(c, now = Date.now(), lang = 'en') {
  const T = (key, vars) => tc(lang, key, vars)
  if (c.direction !== 'inbound') return T('detail.outgoing')
  if (c.exclusion) return null // the card shows the exclusion itself
  if (c.handled) {
    const by = c.handled.by || T('detail.former_user')
    const note = c.handled.note ? ` “${c.handled.note}”` : ''
    return T(c.handled.bulk ? 'detail.cleared' : 'detail.handled', { by, at: inline(when(c.handled.at, now, lang), lang), note })
  }
  if (c.connectedFollowUp) {
    const at = inline(when(c.connectedFollowUp.at, now, lang), lang)
    return T(c.connectedFollowUp.kind === 'called_back' ? 'detail.called_back' : 'detail.reached_later', { at })
  }
  if (c.needsAttention) {
    const tried = c.attemptAt ? T('detail.open_tried', { at: inline(when(c.attemptAt, now, lang), lang) }) : ''
    return T('detail.open', { tried })
  }
  if (c.needsReview) return T('detail.review')
  if (c.classification === 'answered') return T('detail.answered')
  if (!c.number) return T('detail.withheld')
  if (c.classification === 'unknown') return T('detail.unknown')
  if (c.classification === 'system') return T('detail.system')
  return null
}

/** Outgoing: "Outgoing call · by Ciro Perez, ext. 102". */
export function outboundLine(c, lang = 'en') {
  const by = who(c.firm?.name || c.firm?.extension ? { name: c.firm.name, extension: c.firm.extension } : null, lang)
  const what = c.outcome === 'connected' ? tc(lang, 'out.connected')
    : c.outcome === 'no_answer' ? tc(lang, 'out.no_answer')
      : tc(lang, 'out.other', { result: c.result || tc(lang, 'out.other_result') })
  return by ? tc(lang, 'out.by', { what, by }) : what
}

/**
 * A reminder's due line on the Calls page: the reminders module's own
 * wording in English ("Due now", "Overdue since 9:00 AM", "Fri, Nov 7,
 * 9:00 AM"), and the same rule in Spanish.
 */
export function reminderDue(r, now = Date.now(), lang = 'en') {
  if (lang !== 'es') return dueLine(r, now)
  const t = new Date(r.dueAt).getTime()
  if (r.status === 'due' || t <= now) {
    if (Math.round((now - t) / 60000) < 5) return tc(lang, 'due.now')
    return tc(lang, 'due.overdue', { when: sameFirmDay(t, now) ? formatTime(t, lang) : formatDue(t, lang) })
  }
  return formatDue(t, lang)
}

/**
 * Whether a list change is small enough to animate row by row. A new view
 * (tab, filter, search) or a large import swaps the list without motion.
 */
export function animateChange(before, after, limit = 6) {
  const was = new Set(before)
  const now = new Set(after)
  let changed = 0
  for (const id of now) if (!was.has(id)) changed++
  for (const id of was) if (!now.has(id)) changed++
  return changed > 0 && changed <= limit
}
