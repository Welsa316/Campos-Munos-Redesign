// Plain-language wording for a call's evidence-based classification
// (server/integrations/ringcentral/callEvidence.js). Pure functions, so the
// wording is tested apart from the page.
//
// Each wording function takes an optional lang ('en' or 'es', English by
// default; the words are in i18n/calls.js). RingCentral's own codes, results
// and reasons are shown as RingCentral sent them.
import { tc, hasCallsKey } from '../../i18n/calls.js'

const CLASSES = ['answered', 'not_answered', 'caller_hung_up', 'ended_before_ringing', 'voicemail', 'system', 'unknown']
const table = (prefix, lang) => Object.fromEntries(CLASSES.map((k) => [k, tc(lang, `${prefix}.${k}`)]))

// English, as other sections (the contact history) read them.
export const CLASS_LABEL = table('class', 'en')
export const CLASS_EXPLAINED = table('explain', 'en')
/** The classification's label in a language; undefined for an unknown code. */
export const classLabel = (cls, lang = 'en') => (CLASSES.includes(cls) ? tc(lang, `class.${cls}`) : undefined)
/** The classification explained in a sentence; undefined for an unknown code. */
export const classExplained = (cls, lang = 'en') => (CLASSES.includes(cls) ? tc(lang, `explain.${cls}`) : undefined)

const GAPS = ['directory_unavailable', 'extension_type_unknown', 'alerting_unknown', 'no_legs', 'no_reason', 'no_record', 'system_accepted']
export const gapText = (g, lang = 'en') => (GAPS.includes(g) ? tc(lang, `gap.${g}`) : null)
/** The gaps worth a sentence, in order (codes with no wording are left out). */
export const gapLines = (gaps, lang = 'en') => (gaps || []).map((g) => gapText(g, lang)).filter(Boolean)

/** "Yoletty, ext. 101" */
export function who(p, lang = 'en') {
  if (!p) return ''
  if (p.kind === 'external') return tc(lang, 'who.forwarded', { end: p.numberEnd || '····' })
  const name = p.name || null
  const ext = p.extension || p.number || null
  return [name, ext ? tc(lang, 'who.ext', { ext }) : null].filter(Boolean).join(', ') || tc(lang, 'who.an_extension')
}

// RingCentral extension types, in the words its admin portal uses. The
// routing steps and the live timeline both read them from here.
const typeLabel = (type, lang = 'en') => (type && hasCallsKey(`type.${type}`) ? tc(lang, `type.${type}`) : undefined)
const isPersonType = (type) => typeLabel(type) === 'person'

/** Where one recorded step went. */
export function stepTarget(to, lang = 'en') {
  if (!to) return '—'
  if (to.kind === 'extension') {
    const base = who({ name: to.name, extension: to.number }, lang)
    // Linked on the Team tab: RingCentral's own name for the extension stays visible.
    const rc = to.rcName && to.rcName !== to.name ? tc(lang, 'step.rc_name', { name: to.rcName }) : ''
    return to.type ? `${base} (${typeLabel(to.type, lang) || to.type}${rc})` : `${base}${rc}`
  }
  if (to.kind === 'external') return tc(lang, 'step.phone_ending', { end: to.numberEnd || '····' })
  if (to.kind === 'caller') return tc(lang, 'step.back_to_caller', { end: to.numberEnd || '····' })
  if (to.kind === 'line') return to.name ? tc(lang, 'step.line_named', { name: to.name }) : tc(lang, 'step.line')
  return to.name || '—'
}

const REASONS = ['No Answer', 'Not Answered', 'Line Busy', 'Accepted', 'Hang Up', 'Stopped']
export const reasonShort = (r, lang = 'en') => (REASONS.includes(r) ? tc(lang, `reason.${r}`) : r ? r.toLowerCase() : tc(lang, 'reason.none'))
/** How one confirmed offer ended: its call-log reason, or, from the live events, that the phone rang. */
export const offerShort = (o, lang = 'en') => (!o.reason && o.live ? tc(lang, 'offer.phone_rang') : reasonShort(o.reason, lang))

/** The one line under the caller, for an incoming call. */
export function statusLine(c, lang = 'en') {
  const T = (key, vars) => tc(lang, key, vars)
  const whoOf = (p) => who(p, lang)
  const cls = c.classification
  if (cls === 'answered') return c.answeredBy ? T('status.answered_by', { who: whoOf(c.answeredBy) }) + (c.answeredBy.onBehalfOf ? T('status.forwarding', { name: c.answeredBy.onBehalfOf }) : '') : classLabel('answered', lang)
  const offered = (c.offeredTo || []).map((o) => `${whoOf(o)} · ${offerShort(o, lang)}`)
  if (cls === 'not_answered') return offered.length ? T('status.not_answered_offered', { list: offered.join('; ') }) : classLabel('not_answered', lang)
  if (cls === 'caller_hung_up' && c.stage === 'before_ringing') return T('status.hung_up_before_ringing')
  if (cls === 'caller_hung_up' && c.stage === 'while_ringing' && (c.rang || []).length) return T('status.hung_up_while_ringing', { list: c.rang.map((p) => `${whoOf(p)}${p.seconds != null ? ` (${p.seconds}s)` : ''}`).join(', ') })
  if (cls === 'caller_hung_up') return (c.offeredTo || []).length ? T('status.hung_up_offered', { list: c.offeredTo.map(whoOf).join(', ') }) : T('status.hung_up_no_record')
  if (cls === 'ended_before_ringing') return T('status.ended_before_ringing')
  if (cls === 'voicemail') return (c.notAnsweredBy || []).length ? T('status.voicemail_not_answered', { list: c.notAnsweredBy.map(whoOf).join(', ') }) : T('status.voicemail')
  if (cls === 'system') return classLabel('system', lang)
  if (cls === 'unknown' && (c.gaps || []).includes('forward_answer_unconfirmed')) return T('status.unknown_forwarded')
  if (cls === 'unknown' && (c.systemOnly || []).length) return T('status.unknown_system_only', { list: c.systemOnly.join(', ') })
  if (cls === 'unknown') return c.result ? T('status.unknown_result', { result: c.result }) : classLabel('unknown', lang)
  return c.result || T('status.call')
}

/** One fact the classification rests on, as a sentence. */
export function factText(f, lang = 'en') {
  // Every value printed as written (a missing one reads as it always has).
  const T = (key, vars = {}) => tc(lang, key, Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, `${x}`])))
  const target = f.to?.kind === 'extension' ? who({ name: f.to.name, extension: f.to.number }, lang) : f.to?.kind === 'external' ? T('fact.target_phone', { end: f.to.numberEnd }) : T('fact.target_line')
  const v = { target, Target: cap(target) }
  switch (f.code) {
    case 'accepted': return T('fact.accepted', v)
    case 'accepted_by_system': return T('fact.accepted_by_system', { ...v, type: typeLabel(f.to?.type, lang) || f.to?.type || T('fact.not_a_person') })
    case 'accepted_by_unconfirmed_extension': return T('fact.accepted_by_unconfirmed_extension', v)
    case 'voicemail_message': return T('fact.voicemail_message', { whose: f.to?.kind === 'extension' ? T('fact.voicemail_whose', v) : '' })
    case 'caller_hung_up': return T('fact.caller_hung_up', { while: f.level === 'leg' && f.to?.kind === 'extension' ? T('fact.caller_hung_up_while', v) : '' })
    case 'not_answered_by': return T('fact.not_answered_by', { ...v, reason: f.reason })
    case 'system_reason': return `${f.reason}.`
    case 'answered_live': return T('fact.answered_live', v)
    case 'ended_before_ringing': return T('fact.ended_before_ringing', { events: f.events })
    case 'accepted_by_forwarded_phone': return T('fact.accepted_by_forwarded_phone', { end: f.to?.numberEnd || '····', whose: f.onBehalfOf ? T('status.forwarding', { name: f.onBehalfOf }) : '' })
    case 'stopped_ambiguous': return T('fact.stopped_ambiguous', v)
    case 'connected_not_accepted': return T('fact.connected_not_accepted', v)
    default: return f.code
  }
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/**
 * Seconds from the call's start, for the routing sequence. Signed: a step
 * stamped before the start (two clocks a little apart) shows as "−2s"
 * rather than being folded into "+0s".
 */
export function offset(at, start) {
  const a = Date.parse(at)
  const b = Date.parse(start)
  if (Number.isNaN(a) || Number.isNaN(b)) return ''
  const signed = Math.round((a - b) / 1000)
  const s = Math.abs(signed)
  const sign = signed < 0 ? '−' : '+'
  return s < 60 ? `${sign}${s}s` : `${sign}${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

// RingCentral's live states, in plain words ("Proceeding": "The call is being
// forwarded to an endpoint"; "Answered": answered and media established).
const STATES = ['Setup', 'Proceeding', 'Answered', 'VoiceMail', 'VMScreening', 'Disconnected', 'Gone', 'Hold', 'Parked', 'FaxReceive']
// On the phone system's side (the line, a queue, a greeting) "Answered" only
// means the call reached it, never that a person answered.
export const stateText = (code, party = null, lang = 'en') => (code === 'Answered' && party && party.person !== true
  ? tc(lang, 'state.system_took')
  : STATES.includes(code) ? tc(lang, `state.${code}`) : (code ? code.toLowerCase() : '—'))

/** One party in the live timeline: "Yoletty, ext. 101" or "CML call queue". */
export function partyLabel(p, lang = 'en') {
  if (p.person) return who({ name: p.name, extension: p.extension }, lang)
  // A party not confirmed as a person is never labelled as one.
  const type = isPersonType(p.type) ? null : typeLabel(p.type, lang)
  if (p.name || p.extension) return `${p.name || tc(lang, 'who.ext', { ext: p.extension })}${type ? ` (${type})` : ''}`
  return tc(lang, 'party.firm_line')
}
