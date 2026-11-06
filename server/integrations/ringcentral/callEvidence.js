// What RingCentral actually recorded about a call, kept apart from what the
// portal concludes from it (docs/ringcentral-call-classification.md).
//
// rc_calls.rc_raw is the call log record as RingCentral sent it, minus
// anything that is a link to content (recordings, voicemail audio) or money
// (billing). The classifier reads only this and the extension directory, so a
// call can always be re-classified, and every conclusion names the fields
// behind it.
//
// The rule it follows: a call is only called answered, not answered, hung up
// or voicemail when a field whose meaning RingCentral documents says so.
//   - Each leg's `reason` has a documented meaning (reasonMeanings.js, from
//     RingCentral's API specification). `result` and `legType` have none, so
//     they are shown, never relied on.
//   - A leg only counts as an employee when the extension directory says that
//     extension is a person (User and the like), not a queue, IVR or the
//     company line.
//   - A missing leg proves nothing: nobody is "not alerted" because no leg
//     mentions them. "Abandoned before ringing" and "rejected" cannot be
//     established from the call log at all, so they are never assigned here.
// Anything else is 'unknown', with the reason why.
import { REASON_MEANING } from './reasonMeanings.js'

export const CLASSIFIER_VERSION = 2

const MAX_LEGS = 60
const DROP_KEYS = new Set(['recording', 'billing', 'uri', 'contentUri'])
const MAX_STRING = 300

function strip(v, depth = 0) {
  if (depth > 6) return null
  if (Array.isArray(v)) return v.slice(0, MAX_LEGS).map((x) => strip(x, depth + 1))
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) {
      if (DROP_KEYS.has(k)) continue
      // Whether a voicemail message exists is evidence; its link is not kept.
      if (k === 'message') { out.message = x && typeof x === 'object' ? { type: typeof x.type === 'string' ? x.type.slice(0, 40) : null } : null; continue }
      const s = strip(x, depth + 1)
      if (s !== undefined) out[k] = s
    }
    return out
  }
  if (typeof v === 'string') return v.slice(0, MAX_STRING)
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v
  return undefined
}

/** A call log record as stored: RingCentral's fields, without links, recordings or billing. */
export function sanitizeRecord(rec) {
  if (!rec || typeof rec !== 'object') return null
  return strip(rec)
}

// --- reading a call -------------------------------------------------------------

// Reasons that say the phone system, not a person, ended the attempt: the
// account refused it, a block list caught it, or the network failed.
const SYSTEM_REASONS = new Set([
  'Calls Not Accepted', 'Number Blocked', 'Number Not Allowed', 'Number Disabled', 'Call Loop', 'Max Call Limit', 'Too Many Calls',
  'Internal Error', 'Internal Call Error', 'Resource Error', 'Failed Try Again', 'No Digital Line', 'Restricted Number', 'Wrong Number',
  'Bad Number', 'Emergency Address not defined', 'Carrier is not active', 'EDGE trunk misconfigured',
])
const NOT_ANSWERED_REASONS = new Set(['No Answer', 'Not Answered', 'Line Busy'])

// Extension types (the directory's `type`) that are a person. The others are
// call queues ('Department'), IVR menus, announcements, voicemail-only boxes,
// shared lines, park locations, limited (common-area) phones and so on.
export const PERSON_TYPES = Object.freeze(['User', 'DigitalUser', 'VirtualUser', 'FlexibleUser'])

const digits = (v) => String(v ?? '').replace(/\D/g, '')
const last4 = (v) => { const d = digits(v); return d ? d.slice(-4) : null }
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)

/**
 * The extension a leg went to, completed from the directory when it knows
 * it. `person` is true or false when the directory says so, and null when it
 * cannot (directory unavailable, or no such extension in it).
 *
 * Only the extension id identifies an extension: a number can be given to
 * someone else later, so a leg that names only a number (or an id the
 * directory no longer has) is never matched to whoever has it now.
 */
function targetExtension(to, directory) {
  if (!to || typeof to !== 'object') return null
  const id = str(to.extensionId)
  const number = str(to.extensionNumber)
  if (!id && !number) return null
  const known = (id && directory?.byId?.get(id)) || null
  return {
    id,
    number: number || known?.number || null,
    name: str(to.name) || known?.name || null,
    type: known?.type || null,
    person: known ? PERSON_TYPES.includes(known.type) : null,
  }
}

/** Every attempt RingCentral recorded for the call, oldest first: the records themselves, then their legs. */
function readSteps(raws, directory) {
  // A leg to the number the caller dialled is the line itself; one back to
  // the caller is the caller. Neither is a forward to someone's phone.
  const inbound = raws.filter((r) => r.direction !== 'Outbound')
  const dialled = new Set(inbound.map((r) => digits(r.to?.phoneNumber)).filter(Boolean))
  const caller = new Set(inbound.map((r) => digits(r.from?.phoneNumber)).filter(Boolean))
  const seen = new Set()
  const steps = []
  for (const rec of raws) {
    const legs = Array.isArray(rec.legs) ? rec.legs : []
    for (const [l, level] of [[rec, 'record'], ...legs.map((x) => [x, 'leg'])]) {
      if (!l || typeof l !== 'object') continue
      // Several records of one call can repeat the same leg: keep it once.
      const key = JSON.stringify([level, l.startTime, l.legType, l.to?.extensionId, l.to?.extensionNumber, digits(l.to?.phoneNumber), l.reason, l.result])
      if (seen.has(key)) continue
      seen.add(key)
      const ext = targetExtension(l.to, directory)
      const toDigits = digits(l.to?.phoneNumber)
      let to
      if (ext) to = { kind: 'extension', ...ext }
      else if (toDigits && dialled.has(toDigits)) to = { kind: 'line', number: str(l.to.phoneNumber), name: str(l.to?.name) }
      else if (toDigits && caller.has(toDigits)) to = { kind: 'caller', numberEnd: last4(toDigits) }
      else if (toDigits) to = { kind: 'external', numberEnd: last4(toDigits) }
      else to = { kind: 'none', name: str(l.to?.name) }
      const reason = str(l.reason)
      steps.push({
        level,
        at: str(l.startTime),
        seconds: Math.max(0, Math.trunc(Number(l.duration) || 0)),
        legType: str(l.legType),
        action: str(l.action),
        result: str(l.result),
        reason,
        reasonDescription: str(l.reasonDescription),
        reasonMeaning: (reason && REASON_MEANING[reason]) || null,
        master: l.master === true,
        voicemailMessage: Boolean(l.message && /^voice ?mail$/i.test(String(l.message.type || ''))),
        onBehalfOf: str(l.extension?.id),
        to,
      })
    }
  }
  const time = (s) => Date.parse(s.at) || 0
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.level === b.s.level ? 0 : a.s.level === 'record' ? -1 : 1) || time(a.s) - time(b.s) || a.i - b.i)
    .map((x) => x.s)
}

const isPerson = (s) => s.to.kind === 'extension' && s.to.person === true
const isUnsure = (s) => s.to.kind === 'extension' && s.to.person === null
const brief = (s) => ({ level: s.level, at: s.at, legType: s.legType, result: s.result, reason: s.reason, reasonMeaning: s.reasonMeaning, to: s.to })

/**
 * Classify one call from every RingCentral record of it (the records that
 * share its telephony session) and the extension directory
 * ({ available, byId: Map, byNumber: Map } of { id, number, name, type }).
 *
 * Returns { classification, answeredBy, offeredTo, notAnsweredBy, facts,
 * gaps, steps, rcResults, recordCount, version }. classification is null for
 * outgoing calls (they keep RingCentral's result).
 */
export function classifyCall(records, { direction, directory = null } = {}) {
  const raws = (Array.isArray(records) ? records : []).filter((r) => r && typeof r === 'object')
  const out = {
    version: CLASSIFIER_VERSION,
    recordCount: raws.length,
    rcResults: [...new Set(raws.map((r) => str(r.result)).filter(Boolean))],
    classification: null, answeredBy: null, offeredTo: [], notAnsweredBy: [], facts: [], gaps: [], steps: [],
  }
  if (direction !== 'inbound') return out
  if (!raws.length) return { ...out, classification: 'unknown', gaps: ['no_record'] }

  const steps = readSteps(raws, directory)
  const legs = steps.filter((s) => s.level === 'leg')
  // Who-was-offered-it comes from legs when RingCentral sent them; a record
  // without legs stands in for its one attempt.
  const attempts = legs.length ? legs : steps
  const gaps = new Set()
  if (!directory?.available) gaps.add('directory_unavailable')
  if (!legs.length) gaps.add('no_legs')
  const facts = []
  const fact = (code, s, extra = {}) => facts.push({ code, ...brief(s), ...extra })

  // Confirmed offers: a leg to a person's extension. Its reason says how that
  // attempt ended; an Accepted attempt wins over another one to the same person.
  // A leg their voicemail took (it carries the message) does not show their
  // phone was offered the call.
  // Nor does an attempt that failed to reach a device (an offline desk
  // phone: No Digital Line, or a network error).
  const offeredTo = []
  for (const s of attempts.filter((x) => isPerson(x) && !x.voicemailMessage && !SYSTEM_REASONS.has(x.reason))) {
    const entry = { extensionId: s.to.id, extension: s.to.number, name: s.to.name, reason: s.reason, at: s.at }
    const prev = offeredTo.find((o) => (o.extensionId && o.extensionId === entry.extensionId) || (!o.extensionId && o.extension === entry.extension))
    if (!prev) offeredTo.push(entry)
    else if (entry.reason === 'Accepted' || !prev.reason) Object.assign(prev, entry)
  }
  const notAnsweredBy = attempts.filter((s) => isPerson(s) && NOT_ANSWERED_REASONS.has(s.reason))
  // Someone is charged with not answering only when the call is proven not
  // answered by anyone; on a call the evidence cannot settle, nobody is.
  const PROVEN_UNANSWERED = ['not_answered', 'caller_hung_up', 'voicemail']
  const done = (classification, extra = {}) => ({
    ...out, classification, facts, steps, offeredTo, gaps: [...gaps],
    notAnsweredBy: PROVEN_UNANSWERED.includes(classification) ? dedupePeople(notAnsweredBy) : [],
    ...extra,
  })

  // 1. Answered: a person's extension accepted it ("The call was connected
  //    to and accepted by this number"). An attempt that carries a voicemail
  //    message was accepted by voicemail, not by the person.
  const accepted = attempts.filter((s) => s.reason === 'Accepted' && !s.voicemailMessage)
  const bySystem = accepted.filter((x) => x.to.kind === 'extension' && x.to.person === false)
  for (const s of bySystem) fact('accepted_by_system', s)
  const byPerson = accepted.filter(isPerson)
  if (byPerson.length) {
    const s = byPerson[byPerson.length - 1]
    fact('accepted', s)
    return done('answered', { answeredBy: { kind: 'extension', extensionId: s.to.id, extension: s.to.number, name: s.to.name } })
  }
  // An extension the directory cannot place accepted it. It may have been a
  // person, so nothing below can be concluded.
  const unsure = accepted.filter(isUnsure)
  if (unsure.length) {
    for (const s of unsure) fact('accepted_by_unconfirmed_extension', s)
    gaps.add('extension_type_unknown')
    return done('unknown')
  }
  // A phone the call was forwarded to accepted it. That is either the person
  // or that phone's own voicemail, which the call log cannot tell apart.
  const forwarded = accepted.filter((s) => s.to.kind === 'external')
  if (forwarded.length) {
    for (const s of forwarded) fact('accepted_by_forwarded_phone', s, { onBehalfOf: (s.onBehalfOf && directory?.byId?.get(s.onBehalfOf)?.name) || null })
    gaps.add('forward_answer_unconfirmed')
    return done('unknown')
  }

  // 2. Voicemail: a voicemail message is linked to the call.
  const vm = steps.find((s) => s.voicemailMessage)
  if (vm) {
    for (const s of notAnsweredBy) fact('not_answered_by', s)
    fact('voicemail_message', vm)
    return done('voicemail')
  }

  // "Stopped": "This attempt was stopped because the call was answered by
  // another phone". With no answer recorded anywhere, that contradicts both a
  // hang-up and "nobody answered", so neither is concluded.
  const stopped = attempts.filter((s) => s.reason === 'Stopped')
  if (stopped.length) {
    for (const s of stopped) fact('stopped_ambiguous', s)
    return done('unknown')
  }

  // 3. The caller hung up before the call was answered. Whether anyone was
  //    rung before that is only known when a leg shows it.
  const hangUps = steps.filter((s) => s.reason === 'Hang Up')
  if (hangUps.length) {
    for (const s of notAnsweredBy) fact('not_answered_by', s)
    for (const s of hangUps) fact('caller_hung_up', s)
    if (!offeredTo.length) gaps.add('alerting_unknown')
    return done('caller_hung_up')
  }

  // 4. Offered to a person whose leg says it was not answered (or was busy),
  //    and nothing else took the call: a queue or menu that accepted it may
  //    have passed it to someone the log does not show.
  if (notAnsweredBy.length && !bySystem.length) {
    for (const s of notAnsweredBy) fact('not_answered_by', s)
    return done('not_answered')
  }
  if (notAnsweredBy.length) {
    for (const s of notAnsweredBy) fact('not_answered_by', s)
    gaps.add('system_accepted')
    return done('unknown')
  }

  // 5. The phone system ended it (block list, account not accepting calls, a
  //    network or configuration error), and no person was offered it.
  const system = steps.filter((s) => SYSTEM_REASONS.has(s.reason))
  if (system.length && !offeredTo.length) {
    for (const s of system) fact('system_reason', s)
    return done('system')
  }

  // 6. Nothing documented settles it.
  for (const s of steps.filter((x) => x.reason === 'Connected')) fact('connected_not_accepted', s)
  if (!steps.some((s) => s.reason)) gaps.add('no_reason')
  if (steps.some(isUnsure)) gaps.add('extension_type_unknown')
  return done('unknown')
}

function dedupePeople(steps) {
  const out = []
  for (const s of steps) {
    if (out.some((o) => (o.extensionId && o.extensionId === s.to.id) || (!o.extensionId && o.extension === s.to.number))) continue
    out.push({ extensionId: s.to.id, extension: s.to.number, name: s.to.name, reason: s.reason })
  }
  return out
}

export const CLASSIFICATIONS = Object.freeze(['answered', 'not_answered', 'caller_hung_up', 'voicemail', 'system', 'unknown'])
// Proven not answered by anyone: these are the missed calls that need a
// callback. 'unknown' is never counted as missed (nothing proves it was), and
// 'system' (a blocked number, a network error) needs no callback.
export const UNANSWERED_CLASSES = Object.freeze(['not_answered', 'caller_hung_up', 'voicemail'])

export default { sanitizeRecord, classifyCall, CLASSIFIER_VERSION, PERSON_TYPES, CLASSIFICATIONS, UNANSWERED_CLASSES }
