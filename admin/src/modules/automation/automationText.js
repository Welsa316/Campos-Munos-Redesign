// The automation's short codes in words, for the lead page, Home, the
// activity log and the administrator's Automation page. Pure, tested in
// admin/test/automation.test.js (English) and admin/test/i18nAdminPages.test.js
// (Spanish). The codes come from server/automation/. Every function takes an
// optional lang ('en' by default); the English tables below stay the English
// words, and their Spanish is in i18n/automation.js.
import { formatDue, formatTime } from '../reminders/dueChoices.js'
import { sameFirmDay } from '../../utils/firmTime.js'
import { translate } from '../../i18n/dashboard.js'
import { makeTranslate, clockCount } from '../../i18n/translator.js'
import { AUTOMATION, STOP_REASONS_ES, STATUS_REASONS_ES, MESSAGE_REASONS_ES, JOB_LABELS_ES } from '../../i18n/automation.js'
import { MESSAGES } from '../../i18n/messages.js'

const tr = makeTranslate(AUTOMATION)
const trMessages = makeTranslate(MESSAGES)

/** Why the follow-ups to a lead stopped ("…because …"). */
export const STOP_REASONS = {
  staff_replied: 'someone replied from the portal',
  connected_callback: 'a call back to them connected',
  client_called_and_was_answered: 'they called and someone answered',
  client_replied_by_text: 'they replied by text',
  consultation_booked: 'they booked a consultation',
  client_reached: 'someone reached them',
  archived: 'the lead was archived',
  stopped_by_staff: 'someone stopped automatic messages for this lead',
  spam: 'it was marked as spam',
  status_contacted: 'it was marked Contacted',
  status_no_response: 'it was marked No response',
  status_scheduled: 'it was marked Scheduled',
  status_retained: 'it was marked Retained',
  status_closed: 'it was marked Spam',
}

/** Why a lead's status is what it is. */
export const STATUS_REASONS = {
  set_by_staff: 'set by a person',
  vendor_rule: 'the sender is on the firm’s vendor list',
  staff_replied: 'someone replied from the portal',
  connected_callback: 'a call back to their number connected',
  client_called_and_was_answered: 'they called and someone answered',
  client_replied_by_text: 'they replied to a text',
  consultation_booked: 'a consultation was found on the calendar',
  follow_up_sequence_completed: 'every follow-up text was sent and nothing came back',
}

/** Why a message was not sent, or failed. */
export const MESSAGE_REASONS = {
  switched_off: 'this automation is switched off',
  no_sms_consent: 'they did not agree on the form to be texted',
  invalid_address: 'the address or number cannot receive it',
  country_not_allowed: 'the number is outside the countries texts go to',
  too_old: 'too much time had passed',
  too_late: 'its moment had passed',
  recently_acknowledged: 'they were already acknowledged today',
  cooldown: 'this number was texted recently',
  followed_up_on_another_lead: 'they were already followed up on another message of theirs this week',
  replies_not_read: 'replies cannot be read right now, so no text goes out',
  record_unavailable: 'RingCentral’s record of the text could not be read',
  step_removed: 'this follow-up step no longer exists',
  sequence_not_completed: 'the follow-ups did not all go out',
  suppressed_opt_out: 'they opted out of automatic messages',
  suppressed_staff: 'the firm listed them as not to be messaged',
  suppressed_invalid: 'the number cannot receive texts',
  suppressed_whatsapp_opt_out: 'this phone opted out of the firm’s WhatsApp messages',
  not_production: 'this server is not the live one',
  not_a_test_recipient: 'sending is limited to the test addresses',
  sms_unavailable: 'RingCentral cannot send text messages right now',
  email_not_configured: 'email is not set up on the server',
  email_failed: 'the email service did not accept it',
  email_rejected: 'the email service refused it',
  rejected: 'the email service refused it',
  sms_rejected: 'RingCentral refused it',
  unknown_delivery: 'it may or may not have been delivered, so it was not sent again',
  not_delivered: 'RingCentral accepted it but could not deliver it',
  gave_up: 'it kept failing',
  resolved: 'the caller was dealt with first',
  not_actionable: 'the call did not need a text',
}

// Each English table and its Spanish, for reasonText(code, table, 'es').
const SPANISH = new Map([[MESSAGE_REASONS, MESSAGE_REASONS_ES], [STOP_REASONS, STOP_REASONS_ES], [STATUS_REASONS, STATUS_REASONS_ES]])

export function reasonText(code, table = MESSAGE_REASONS, lang = 'en') {
  const words = lang === 'es' ? SPANISH.get(table) || {} : table
  return (Object.hasOwn(words, code ?? '') ? words[code] : null) || String(code || '').replace(/[_:]/g, ' ') || tr(lang, 'no_reason')
}

/** What each kind of automatic step is called. */
export const JOB_LABELS = {
  lead_ack_email: 'Acknowledgment email',
  lead_ack_sms: 'Acknowledgment text',
  lead_followup: 'Follow-up text',
  lead_no_response: 'Marking “No response”',
  lead_sla: 'Escalation of a waiting lead',
  missed_call_sms: 'Missed-call text',
  call_sla: 'Escalation of a waiting caller',
  sms_delivery_check: 'Delivery check',
}
export const jobLabel = (type, lang = 'en') => (lang === 'es' && Object.hasOwn(JOB_LABELS_ES, type ?? '') ? JOB_LABELS_ES[type] : JOB_LABELS[type]) || String(type || '').replace(/_/g, ' ')

const PURPOSES = ['lead_ack', 'lead_followup', 'missed_call']
const LANGS = ['es', 'en', 'bi']
const day = (at, now, lang = 'en') => (sameFirmDay(at, now) ? formatTime(at, lang) : formatDue(at, lang))
// A time today ("a las 10:31 a. m.") or a day and time ("el mar, 10 de nov, …"),
// through one of the dictionary's { time, day } pairs. English reads as day().
function when(at, now, lang, keys = ['when.time', 'when.day']) {
  if (sameFirmDay(at, now)) {
    const time = formatTime(at, lang)
    return tr(lang, keys[0], { time, count: clockCount(time) })
  }
  return tr(lang, keys[1], { date: formatDue(at, lang) })
}

/**
 * A lead's automation as short lines, most useful first.
 * a: the `automation` object of GET /api/submissions/:id. Returns
 * [{ key, icon, tone: 'quiet'|'good'|'warn', text }].
 */
export function leadAutomationLines(a, now = Date.now(), lang = 'en') {
  if (!a) return []
  const t = (key, vars) => tr(lang, key, vars)
  const out = []
  const push = (key, icon, tone, text) => out.push({ key, icon, tone, text })
  for (const m of a.messages || []) {
    const what = t('line.what', { purpose: t(PURPOSES.includes(m.purpose) ? `purpose.${m.purpose}` : 'purpose.other'), channel: t(m.channel === 'sms' ? 'channel.sms' : 'channel.email') })
    if (m.status === 'sent') push(`m-${m.at}-${m.channel}`, m.channel === 'sms' ? 'comment-dots' : 'envelope', 'good', `${t('line.sent', { what, when: when(m.at, now, lang) })}${LANGS.includes(m.language) ? t('line.in_lang', { lang: t(`lang.${m.language}`) }) : ''}`)
    else if (m.status === 'sending') push(`m-${m.at}-${m.channel}`, 'spinner', 'quiet', t('line.sending', { what }))
    else push(`m-${m.at}-${m.channel}`, 'triangle-exclamation', 'warn', t('line.not_delivered', { what, why: reasonText(m.status === 'unknown' ? 'unknown_delivery' : 'not_delivered', MESSAGE_REASONS, lang) }))
  }
  for (const b of a.bookings || []) {
    if (b.status === 'booked') push(`b-${b.startsAt}`, 'calendar-check', 'good', t('line.booked', { when: b.startsAt ? formatDue(b.startsAt, lang) : t('line.time_not_set') }))
    else push(`b-${b.startsAt}-x`, 'calendar-xmark', 'warn', b.startsAt ? t('line.booking_cancelled_for', { when: formatDue(b.startsAt, lang) }) : t('line.booking_cancelled'))
  }
  const next = (a.pending || []).filter((j) => j.type === 'lead_followup')
  if (next.length) push('next', 'clock', 'quiet', t('line.queued', { count: next.length, next: when(next[0].at, now, lang, ['next.today', 'next.day']) }))
  else if (a.stopped) push('stopped', 'circle-pause', 'quiet', t('line.stopped', { why: reasonText(a.stopped.reason, STOP_REASONS, lang) }))
  if (a.paused) push('paused', 'pause', 'quiet', t('line.paused'))
  if (a.escalationLevel > 0) push('esc', 'bell', 'warn', t(a.escalationLevel > 1 ? 'line.escalated_twice' : 'line.escalated'))
  else if (a.slaDueAt && (a.pending || []).some((j) => j.type === 'lead_sla')) push('sla', 'clock', 'quiet', t('line.sla', { by: when(a.slaDueAt, now, lang, ['by.today', 'by.day']) }))
  return out
}

/** "Contacted · a call back to their number connected (set automatically)". */
export function statusWhy(a, lang = 'en') {
  const s = a?.status
  if (!s?.reason) return ''
  const why = reasonText(s.reason, STATUS_REASONS, lang)
  return s.auto ? tr(lang, 'status.auto', { why }) : why
}

// Home's rows for leads that need a person (work queue kind 'lead_attention').
// The words live in i18n/dashboard.js (attn.*), in English and Spanish.
const ATTENTION = {
  client_replied: { icon: 'comment-dots', tone: 'due', when: 'waiting' },
  message_failed: { icon: 'triangle-exclamation', tone: 'due', when: 'since' },
  booking_cancelled: { icon: 'calendar-xmark', tone: 'due', when: 'since' },
  overdue: { icon: 'clock', tone: 'overdue', when: 'due' },
  possible_spam: { icon: 'ban', tone: 'quiet', when: 'received' },
  no_response: { icon: 'circle-pause', tone: 'quiet', when: 'since' },
}
export function attentionText(item, now = Date.now(), lang = 'en') {
  const known = Object.hasOwn(ATTENTION, item.reason ?? '')
  const a = known ? ATTENTION[item.reason] : { icon: 'bell', tone: 'quiet', when: 'since' }
  const who = item.name || translate(lang, 'fu.a_website_lead')
  return {
    title: translate(lang, known ? `attn.${item.reason}` : 'attn.other', { who }),
    icon: a.icon,
    tone: a.tone,
    when: `${translate(lang, `attn.when.${a.when}`)} ${day(item.at, now, lang)}`,
  }
}
export const ATTENTION_LABELS = {
  client_replied: 'Replied by text', message_failed: 'Message not sent', booking_cancelled: 'Booking cancelled',
  overdue: 'Waiting for first contact', possible_spam: 'Possible vendor message', no_response: 'No response',
}

/** A switch's state as a chip: { label, tone }. f: one of health.flags. */
export function flagChip(f, lang = 'en') {
  const chip = (key, tone) => ({ label: tr(lang, `chip.${key}`), tone })
  if (f.on) return chip('on', 'good')
  if (f.paused) return chip('paused', 'warn')
  if (f.why === 'switched_off') return chip('off', 'quiet')
  if (String(f.why || '').startsWith('needs:')) return chip('waiting', 'quiet')
  return chip('off', 'quiet')
}
/** Why a switch that is not on is not on, in a sentence. */
export function flagWhy(f, flags = [], lang = 'en') {
  if (f.on) return ''
  if (f.why === 'switched_off') return tr(lang, 'why.switched_off', { env: f.env })
  if (f.paused) return tr(lang, 'why.paused')
  const need = String(f.why || '').startsWith('needs:') ? f.why.slice(6) : null
  const label = flags.find((x) => x.key === need)?.label
  return need ? tr(lang, 'why.needs', { label: label || need }) : ''
}

// A lead status in words: English the code itself ("no response"), Spanish
// the inbox's own name for it.
const statusName = (to, lang) => (lang === 'es' && Object.hasOwn(MESSAGES.es, `status.${to}`) ? trMessages(lang, `status.${to}`) : String(to).replace(/_/g, ' '))

/** The extra line under a row of the activity log the portal wrote itself. */
export function systemEventBits(e, lang = 'en') {
  const t = (key, vars) => tr(lang, key, vars)
  const d = e.details || {}
  const bits = []
  if (d.channel) bits.push(t(d.channel === 'sms' ? 'sys.by_sms' : 'sys.by_email'))
  if (e.action === 'automation.lead_status' && d.to) bits.push(t('sys.status_to', { to: statusName(d.to, lang), why: reasonText(d.reason, STATUS_REASONS, lang) }))
  else if (e.action === 'automation.sequence_cancelled') bits.push(t('sys.because', { why: reasonText(d.reason, STOP_REASONS, lang) }))
  else if (e.action === 'automation.job_failed') bits.push(t('sys.job_failed', { job: jobLabel(d.type, lang), why: reasonText(d.reason, MESSAGE_REASONS, lang) }))
  else if (e.action === 'automation.lead_spam') bits.push(t(d.state === 'spam' ? 'sys.spam_listed' : 'sys.spam_phrase'))
  else if (e.action === 'automation.contact_matched') bits.push(t('sys.matched'))
  else if (['automation.lead_escalated', 'automation.caller_escalated'].includes(e.action)) bits.push(`${t('sys.level', { level: d.level || 1 })}${d.notified != null ? t('sys.notified', { count: d.notified }) : ''}${d.emailed ? t('sys.emailed') : ''}`)
  else if (d.reason) bits.push(reasonText(d.reason, MESSAGE_REASONS, lang))
  return bits
}
