// The Calls page's follow-up wording and grouping. Pure functions, so the
// page's promises ("open until someone connects", "never resolved before the
// server says so") are tested apart from the page.
//
// None of this decides what a call *was*: that is the server's evidence
// classification (callEvidence.js), read through callEvidenceText.js. This
// only says what is left to do about it.

import { who } from './callEvidenceText.js'

export const TIME_ZONE = 'America/Chicago'

const fmt = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, ...opts })
const KEY = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const TIME = fmt({ hour: 'numeric', minute: '2-digit' })
const DAY = fmt({ weekday: 'short', month: 'short', day: 'numeric' })

/** "2026-11-05" in the firm's time zone. */
export const dateKey = (d) => KEY.format(new Date(d))
export const timeOf = (d) => TIME.format(new Date(d))

/** "Today", "Yesterday", or "Tue, Nov 3", in the firm's time zone. */
export function dayName(d, now = Date.now()) {
  const key = dateKey(d)
  if (key === dateKey(now)) return 'Today'
  if (key === dateKey(new Date(now).getTime() - 864e5)) return 'Yesterday'
  return DAY.format(new Date(d))
}

/** "2:10 PM" today, "Yesterday 2:10 PM", "Tue, Nov 3 2:10 PM". */
export function when(d, now = Date.now()) {
  const day = dayName(d, now)
  return day === 'Today' ? timeOf(d) : `${day} ${timeOf(d)}`
}

// Needs attention, oldest trouble first (the server sets attentionGroup).
export const GROUPS = [
  { key: 'waiting', label: 'From earlier days', hint: 'follow up first' },
  { key: 'try_again', label: 'Try again', hint: 'a callback did not connect' },
  { key: 'new', label: 'New today', hint: '' },
]

/**
 * Needs attention as the page lists it: one section per group that has
 * calls, newest first inside each. Calls the server no longer marks as
 * needing attention are left out, whatever the list contains.
 */
export function attentionSections(calls) {
  const open = calls.filter((c) => c.needsAttention)
  return GROUPS.map((g) => ({
    ...g,
    calls: open.filter((c) => (c.attentionGroup || 'new') === g.key)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt) || b.id - a.id),
  })).filter((g) => g.calls.length)
}

/** When a dealt-with call was dealt with: marked handled, or closed by a later connected call. */
export const resolvedAt = (c) => c.handled?.at || c.connectedFollowUp?.at || null

/**
 * Handled, by the day each call was dealt with (not the day it came in),
 * most recent first. Calls the server does not report as dealt with are
 * left out, whatever the list contains.
 */
export function handledSections(calls, now = Date.now()) {
  const done = calls.filter((c) => !c.exclusion && resolvedAt(c))
    .sort((a, b) => new Date(resolvedAt(b)) - new Date(resolvedAt(a)) || b.id - a.id)
  const out = []
  for (const c of done) {
    const at = resolvedAt(c)
    const key = dateKey(at)
    let day = out[out.length - 1]
    if (!day || day.key !== key) {
      day = { key, label: dayName(at, now), date: DAY.format(new Date(at)), calls: [] }
      out.push(day)
    }
    day.calls.push(c)
  }
  return out
}

/** All calls, by day in the firm's time zone, newest first as served. */
export function daySections(calls, now = Date.now()) {
  const out = []
  for (const c of calls) {
    const key = dateKey(c.startedAt)
    let day = out[out.length - 1]
    if (!day || day.key !== key) {
      day = { key, label: dayName(c.startedAt, now), date: DAY.format(new Date(c.startedAt)), calls: [] }
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
export function followUpLine(c, now = Date.now()) {
  if (c.direction !== 'inbound') return null
  if (c.exclusion) return { tone: 'quiet', text: 'No callback needed' }
  if (c.handled) return { tone: 'done', text: `Handled${c.handled.by ? ` by ${c.handled.by}` : ''} · ${when(c.handled.at, now)}` }
  if (c.connectedFollowUp) {
    const at = when(c.connectedFollowUp.at, now)
    return { tone: 'done', text: c.connectedFollowUp.kind === 'called_back' ? `Called back and connected · ${at}` : `Caller reached us later · ${at}` }
  }
  if (!c.needsAttention) return null
  if (c.attemptAt) return { tone: 'open', text: `Tried ${when(c.attemptAt, now)} · still needs a callback` }
  if (c.attentionGroup === 'waiting') return { tone: 'open', text: `Waiting since ${dayName(c.startedAt, now).replace(/^Yesterday$/, 'yesterday')}` }
  return { tone: 'open', text: 'Callback needed' }
}

/** The longer account of the same, for the call's detail card. */
export function followUpDetail(c, now = Date.now()) {
  if (c.direction !== 'inbound') return 'An outgoing call. Nothing to follow up.'
  if (c.exclusion) return null // the card shows the exclusion itself
  if (c.handled) {
    const by = c.handled.by || 'a former user'
    return `Marked handled by ${by}, ${when(c.handled.at, now)}.${c.handled.note ? ` “${c.handled.note}”` : ''} How the call was classified, and who it is attributed to, is unchanged.`
  }
  if (c.connectedFollowUp) {
    const at = when(c.connectedFollowUp.at, now)
    return c.connectedFollowUp.kind === 'called_back'
      ? `Someone at the firm called this number back and the call connected, ${at}. That closed it.`
      : `The caller rang again and that call was answered, ${at}. That closed it.`
  }
  if (c.needsAttention) {
    const tried = c.attemptAt ? ` A callback was tried ${when(c.attemptAt, now)} but did not connect.` : ''
    return `Open.${tried} It stays in Needs attention until a callback connects, the caller gets through on a later call, or someone marks it handled.`
  }
  if (c.classification === 'answered') return 'Answered. Nothing to follow up.'
  if (!c.number) return 'The number was withheld, so there is no one to call back. It is not listed in Needs attention.'
  if (c.classification === 'unknown') return 'RingCentral recorded no outcome for this call, so it is not counted as missed and is not listed in Needs attention.'
  if (c.classification === 'system') return 'The phone system ended this call. Nothing to follow up.'
  return null
}

/** Outgoing: "Outgoing call · by Ciro Perez, ext. 102". */
export function outboundLine(c) {
  const by = who(c.firm?.name || c.firm?.extension ? { name: c.firm.name, extension: c.firm.extension } : null)
  const what = c.outcome === 'connected' ? 'Outgoing call' : c.outcome === 'no_answer' ? 'Outgoing call, no answer' : `Outgoing call (${c.result || 'other'})`
  return by ? `${what} · by ${by}` : what
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
