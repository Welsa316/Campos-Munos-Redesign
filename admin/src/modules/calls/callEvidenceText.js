// Plain-language wording for a call's evidence-based classification
// (server/integrations/ringcentral/callEvidence.js). Pure functions, so the
// wording is tested apart from the page.

export const CLASS_LABEL = {
  answered: 'Answered',
  not_answered: 'Not answered',
  caller_hung_up: 'Caller hung up',
  voicemail: 'Voicemail',
  system: 'Handled by the phone system',
  unknown: 'Not confirmed',
}

export const CLASS_EXPLAINED = {
  answered: 'A person’s extension, or a phone the call was forwarded to, accepted the call.',
  not_answered: 'RingCentral offered the call to the people listed and their attempts were not answered. Nobody accepted it.',
  caller_hung_up: 'RingCentral recorded that the caller hung up before the call was answered.',
  voicemail: 'A voicemail message is attached to this call.',
  system: 'The phone system ended the call (for example a blocked number or a refused call). No person was offered it.',
  unknown: 'RingCentral’s record does not establish how this call ended, so it is not counted as answered or missed.',
}

const GAP_TEXT = {
  directory_unavailable: 'RingCentral’s extension list could not be read, so no extension can be confirmed as a person.',
  extension_type_unknown: 'An extension on this call is not in RingCentral’s extension list, so it cannot be confirmed as a person.',
  alerting_unknown: 'No step shows the call being offered to anyone. That does not prove nobody was rung.',
  no_legs: 'RingCentral sent no step-by-step detail for this call.',
  no_reason: 'RingCentral gave no reason for how this call ended.',
  no_record: 'This call was imported before RingCentral’s full record was kept.',
}
export const gapText = (g) => GAP_TEXT[g] || null

/** "Yoletty, ext. 101" */
export function who(p) {
  if (!p) return ''
  if (p.kind === 'external') return `a forwarded phone ending ${p.numberEnd || '····'}`
  const name = p.name || null
  const ext = p.extension || p.number || null
  return [name, ext ? `ext. ${ext}` : null].filter(Boolean).join(', ') || 'an extension'
}

/** Where one recorded step went. */
export function stepTarget(to) {
  if (!to) return '—'
  if (to.kind === 'extension') {
    const base = who({ name: to.name, extension: to.number })
    // Linked on the Team tab: RingCentral's own name for the extension stays visible.
    const rc = to.rcName && to.rcName !== to.name ? `, “${to.rcName}” in RingCentral` : ''
    return to.type ? `${base} (${TYPE_LABEL[to.type] || to.type}${rc})` : `${base}${rc}`
  }
  if (to.kind === 'external') return `Phone ending ${to.numberEnd || '····'}`
  if (to.kind === 'line') return to.name ? `${to.name} (the line dialled)` : 'The line dialled'
  return to.name || '—'
}

// RingCentral extension types, in the words its admin portal uses.
const TYPE_LABEL = {
  User: 'person', DigitalUser: 'person', VirtualUser: 'person', FlexibleUser: 'person',
  Department: 'call queue', IvrMenu: 'IVR menu', Announcement: 'announcement', Voicemail: 'voicemail box',
  SharedLinesGroup: 'shared lines', PagingOnly: 'paging', ParkLocation: 'park location', Limited: 'common phone',
  ApplicationExtension: 'app', Site: 'site', Bot: 'bot', FaxUser: 'fax', ProxyAdmin: 'admin', DelegatedLinesGroup: 'delegated lines',
}

const REASON_SHORT = { 'No Answer': 'no answer', 'Not Answered': 'not answered', 'Line Busy': 'busy', Accepted: 'answered', 'Hang Up': 'caller hung up', Stopped: 'stopped' }
export const reasonShort = (r) => REASON_SHORT[r] || (r ? r.toLowerCase() : 'no reason given')

/** The one line under the caller, for an incoming call. */
export function statusLine(c) {
  const cls = c.classification
  if (cls === 'answered') return c.answeredBy ? `Answered by ${who(c.answeredBy)}${c.answeredBy.onBehalfOf ? ` (${c.answeredBy.onBehalfOf}’s forwarding)` : ''}` : 'Answered'
  const offered = (c.offeredTo || []).map((o) => `${who(o)} · ${reasonShort(o.reason)}`)
  if (cls === 'not_answered') return `Not answered${offered.length ? ` · offered to ${offered.join('; ')}` : ''}`
  if (cls === 'caller_hung_up') return (c.offeredTo || []).length ? `Caller hung up before an answer · offered to ${c.offeredTo.map(who).join(', ')}` : 'Caller hung up before an answer · no record of anyone being rung'
  if (cls === 'voicemail') return (c.notAnsweredBy || []).length ? `Left a voicemail · not answered by ${c.notAnsweredBy.map(who).join(', ')}` : 'Left a voicemail'
  if (cls === 'system') return 'Handled by the phone system'
  if (cls === 'unknown') return `Not confirmed${c.result ? ` · RingCentral’s result: ${c.result}` : ''}`
  return c.result || 'Call'
}

/** One fact the classification rests on, as a sentence. */
export function factText(f) {
  const target = f.to?.kind === 'extension' ? who({ name: f.to.name, extension: f.to.number }) : f.to?.kind === 'external' ? `the phone ending ${f.to.numberEnd}` : 'the line'
  switch (f.code) {
    case 'accepted': return `${cap(target)} accepted the call.`
    case 'accepted_by_system': return `${cap(target)} took the call. It is part of the phone system (${TYPE_LABEL[f.to?.type] || f.to?.type || 'not a person'}), so this is not an answer.`
    case 'accepted_by_unconfirmed_extension': return `${cap(target)} accepted the call, but it cannot be confirmed whether that extension is a person.`
    case 'voicemail_message': return `A voicemail message is attached${f.to?.kind === 'extension' ? ` (${target}’s voicemail)` : ''}.`
    case 'caller_hung_up': return `The caller hung up before the call was answered${f.level === 'leg' && f.to?.kind === 'extension' ? `, while it was offered to ${target}` : ''}.`
    case 'not_answered_by': return `${cap(target)} did not answer (${f.reason}).`
    case 'system_reason': return `${f.reason}.`
    case 'stopped_ambiguous': return `${cap(target)}’s attempt was “Stopped”. RingCentral’s API reference says that means another phone answered, but no other phone on this call shows an answer, so it is not counted either way.`
    case 'connected_not_accepted': return `${cap(target)} picked up as a system that did not accept the call (reason “Connected”, for example a voicemail greeting).`
    default: return f.code
  }
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Seconds from the call's start, for the routing sequence. */
export function offset(at, start) {
  const a = Date.parse(at)
  const b = Date.parse(start)
  if (Number.isNaN(a) || Number.isNaN(b)) return ''
  const s = Math.max(0, Math.round((a - b) / 1000))
  return s < 60 ? `+${s}s` : `+${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
