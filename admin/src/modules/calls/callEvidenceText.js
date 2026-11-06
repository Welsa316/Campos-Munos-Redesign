// Plain-language wording for a call's evidence-based classification
// (server/integrations/ringcentral/callEvidence.js). Pure functions, so the
// wording is tested apart from the page.

export const CLASS_LABEL = {
  answered: 'Answered',
  not_answered: 'Not answered',
  caller_hung_up: 'Caller hung up',
  ended_before_ringing: 'Ended before anyone was rung',
  voicemail: 'Voicemail',
  system: 'Handled by the phone system',
  unknown: 'Not confirmed',
}

export const CLASS_EXPLAINED = {
  answered: 'A person’s extension, or a phone the call was forwarded to, accepted the call.',
  not_answered: 'RingCentral offered the call to the people listed, their attempts were not answered, and no other phone, queue or menu accepted it.',
  caller_hung_up: 'RingCentral recorded that the caller hung up before the call was answered.',
  ended_before_ringing: 'RingCentral’s live events followed this call to its end, and no person’s phone was ever offered it. It ended at the phone system (a greeting, a menu, or a queue nobody could take). Who ended it is not recorded.',
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
  system_accepted: 'A queue or menu accepted the call, so it may have been passed to someone this record does not show.',
}
export const gapText = (g) => GAP_TEXT[g] || null
/** The gaps worth a sentence, in order (codes with no wording are left out). */
export const gapLines = (gaps) => (gaps || []).map(gapText).filter(Boolean)

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
  if (to.kind === 'caller') return `Back to the caller (ending ${to.numberEnd || '····'})`
  if (to.kind === 'line') return to.name ? `${to.name} (the line dialled)` : 'The line dialled'
  return to.name || '—'
}

// RingCentral extension types, in the words its admin portal uses. The
// routing steps and the live timeline both read them from here.
const TYPE_LABEL = {
  User: 'person', DigitalUser: 'person', VirtualUser: 'person', FlexibleUser: 'person',
  Department: 'call queue', IvrMenu: 'IVR menu', Announcement: 'announcement', Voicemail: 'voicemail box', CompanyExtension: 'company line',
  SharedLinesGroup: 'shared lines', PagingOnly: 'paging', ParkLocation: 'park location', Limited: 'common phone',
  ApplicationExtension: 'app', Site: 'site', Bot: 'bot', FaxUser: 'fax', ProxyAdmin: 'admin', DelegatedLinesGroup: 'delegated lines',
}

const REASON_SHORT = { 'No Answer': 'no answer', 'Not Answered': 'not answered', 'Line Busy': 'busy', Accepted: 'answered', 'Hang Up': 'caller hung up', Stopped: 'stopped' }
export const reasonShort = (r) => REASON_SHORT[r] || (r ? r.toLowerCase() : 'no reason given')
/** How one confirmed offer ended: its call-log reason, or, from the live events, that the phone rang. */
export const offerShort = (o) => (!o.reason && o.live ? 'phone rang' : reasonShort(o.reason))

/** The one line under the caller, for an incoming call. */
export function statusLine(c) {
  const cls = c.classification
  if (cls === 'answered') return c.answeredBy ? `Answered by ${who(c.answeredBy)}${c.answeredBy.onBehalfOf ? ` (${c.answeredBy.onBehalfOf}’s forwarding)` : ''}` : 'Answered'
  const offered = (c.offeredTo || []).map((o) => `${who(o)} · ${offerShort(o)}`)
  if (cls === 'not_answered') return `Not answered${offered.length ? ` · offered to ${offered.join('; ')}` : ''}`
  if (cls === 'caller_hung_up' && c.stage === 'before_ringing') return 'Caller hung up before anyone was rung'
  if (cls === 'caller_hung_up' && c.stage === 'while_ringing' && (c.rang || []).length) return `Caller hung up while ringing ${c.rang.map((p) => `${who(p)}${p.seconds != null ? ` (${p.seconds}s)` : ''}`).join(', ')}`
  if (cls === 'caller_hung_up') return (c.offeredTo || []).length ? `Caller hung up before an answer · offered to ${c.offeredTo.map(who).join(', ')}` : 'Caller hung up before an answer · no record of anyone being rung'
  if (cls === 'ended_before_ringing') return 'Ended at the phone system before anyone was rung'
  if (cls === 'voicemail') return (c.notAnsweredBy || []).length ? `Left a voicemail · not answered by ${c.notAnsweredBy.map(who).join(', ')}` : 'Left a voicemail'
  if (cls === 'system') return 'Handled by the phone system'
  if (cls === 'unknown' && (c.gaps || []).includes('forward_answer_unconfirmed')) return 'Not confirmed · accepted at a phone it was forwarded to'
  if (cls === 'unknown' && (c.systemOnly || []).length) return `Not confirmed · reached only the phone system (${c.systemOnly.join(', ')}); no one was shown as rung`
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
    case 'answered_live': return `RingCentral’s live events show it answered on ${target}’s phone.`
    case 'ended_before_ringing': return `RingCentral’s live events (${f.events}) followed the call to its end, and none shows a person’s phone being offered it.`
    case 'accepted_by_forwarded_phone': return `The phone ending ${f.to?.numberEnd || '····'} that the call was forwarded to${f.onBehalfOf ? ` (${f.onBehalfOf}’s forwarding)` : ''} accepted it. That is either the person or that phone’s own voicemail, and the call log cannot tell which.`
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

// RingCentral's live states, in plain words ("Proceeding": "The call is being
// forwarded to an endpoint"; "Answered": answered and media established).
const STATE_TEXT = {
  Setup: 'reached', Proceeding: 'ringing', Answered: 'answered', VoiceMail: 'voicemail', VMScreening: 'voicemail (listening)',
  Disconnected: 'ended', Gone: 'left the call', Hold: 'on hold', Parked: 'parked', FaxReceive: 'fax',
}
// On the phone system's side (the line, a queue, a greeting) "Answered" only
// means the call reached it, never that a person answered.
export const stateText = (code, party = null) => (code === 'Answered' && party && party.person !== true ? 'taken by the phone system' : STATE_TEXT[code] || (code ? code.toLowerCase() : '—'))

/** One party in the live timeline: "Yoletty, ext. 101" or "CML call queue". */
export function partyLabel(p) {
  if (p.person) return who({ name: p.name, extension: p.extension })
  // A party not confirmed as a person is never labelled as one.
  const type = TYPE_LABEL[p.type] === 'person' ? null : TYPE_LABEL[p.type]
  if (p.name || p.extension) return `${p.name || `ext. ${p.extension}`}${type ? ` (${type})` : ''}`
  return 'The firm’s line'
}
