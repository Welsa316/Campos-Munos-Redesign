// The automation's short codes in words, for the lead page, Home, the
// activity log and the administrator's Automation page. Pure, tested in
// admin/test/automation.test.js. The codes come from server/automation/.
import { formatDue, formatTime } from '../reminders/dueChoices.js'
import { sameFirmDay } from '../../utils/firmTime.js'

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

export const reasonText = (code, table = MESSAGE_REASONS) => table[code] || String(code || '').replace(/[_:]/g, ' ') || 'no reason recorded'

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
export const jobLabel = (type) => JOB_LABELS[type] || String(type || '').replace(/_/g, ' ')

const PURPOSE = { lead_ack: 'Acknowledgment', lead_followup: 'Follow-up', missed_call: 'Missed-call text' }
const LANG = { es: 'Spanish', en: 'English', bi: 'Spanish and English' }
const day = (at, now) => (sameFirmDay(at, now) ? formatTime(at) : formatDue(at))

/**
 * A lead's automation as short lines, most useful first.
 * a: the `automation` object of GET /api/submissions/:id. Returns
 * [{ key, icon, tone: 'quiet'|'good'|'warn', text }].
 */
export function leadAutomationLines(a, now = Date.now()) {
  if (!a) return []
  const out = []
  const push = (key, icon, tone, text) => out.push({ key, icon, tone, text })
  for (const m of a.messages || []) {
    const what = `${PURPOSE[m.purpose] || 'Message'} by ${m.channel === 'sms' ? 'text' : 'email'}`
    if (m.status === 'sent') push(`m-${m.at}-${m.channel}`, m.channel === 'sms' ? 'comment-dots' : 'envelope', 'good', `${what} sent ${day(m.at, now)}${LANG[m.language] ? `, in ${LANG[m.language]}` : ''}`)
    else if (m.status === 'sending') push(`m-${m.at}-${m.channel}`, 'spinner', 'quiet', `${what} is being sent`)
    else push(`m-${m.at}-${m.channel}`, 'triangle-exclamation', 'warn', `${what} was not delivered: ${reasonText(m.status === 'unknown' ? 'unknown_delivery' : 'not_delivered')}`)
  }
  for (const b of a.bookings || []) {
    if (b.status === 'booked') push(`b-${b.startsAt}`, 'calendar-check', 'good', `Consultation on the calendar: ${b.startsAt ? formatDue(b.startsAt) : 'time not set'}`)
    else push(`b-${b.startsAt}-x`, 'calendar-xmark', 'warn', `A consultation${b.startsAt ? ` for ${formatDue(b.startsAt)}` : ''} was cancelled on the calendar`)
  }
  const next = (a.pending || []).filter((j) => j.type === 'lead_followup')
  if (next.length) push('next', 'clock', 'quiet', `${next.length === 1 ? 'One follow-up text is' : `${next.length} follow-up texts are`} queued; the next ${day(next[0].at, now) === formatTime(next[0].at) ? `today at ${formatTime(next[0].at)}` : `on ${formatDue(next[0].at)}`}, unless someone reaches them first`)
  else if (a.stopped) push('stopped', 'circle-pause', 'quiet', `Follow-ups stopped because ${reasonText(a.stopped.reason, STOP_REASONS)}`)
  if (a.paused) push('paused', 'pause', 'quiet', 'Automatic messages are stopped for this lead')
  if (a.escalationLevel > 0) push('esc', 'bell', 'warn', a.escalationLevel > 1 ? 'Escalated twice: nobody had contacted them in time' : 'Escalated: nobody had contacted them in time')
  else if (a.slaDueAt && (a.pending || []).some((j) => j.type === 'lead_sla')) push('sla', 'clock', 'quiet', `Someone should contact them by ${day(a.slaDueAt, now) === formatTime(a.slaDueAt) ? `${formatTime(a.slaDueAt)} today` : formatDue(a.slaDueAt)}`)
  return out
}

/** "Contacted · a call back to their number connected (set automatically)". */
export function statusWhy(a) {
  const s = a?.status
  if (!s?.reason) return ''
  return `${s.auto ? 'Set automatically: ' : ''}${reasonText(s.reason, STATUS_REASONS)}`
}

// Home's rows for leads that need a person (work queue kind 'lead_attention').
const ATTENTION = {
  client_replied: { title: (who) => `${who} replied by text`, icon: 'comment-dots', tone: 'due', when: 'Waiting since' },
  message_failed: { title: (who) => `An automatic message to ${who} was not sent`, icon: 'triangle-exclamation', tone: 'due', when: 'Since' },
  booking_cancelled: { title: (who) => `${who}’s consultation was cancelled`, icon: 'calendar-xmark', tone: 'due', when: 'Since' },
  overdue: { title: (who) => `Nobody has contacted ${who} yet`, icon: 'clock', tone: 'overdue', when: 'Due since' },
  possible_spam: { title: (who) => `Check: possible vendor message from ${who}`, icon: 'ban', tone: 'quiet', when: 'Received' },
  no_response: { title: (who) => `No response from ${who} after the follow-ups`, icon: 'circle-pause', tone: 'quiet', when: 'Since' },
}
export function attentionText(item, now = Date.now()) {
  const a = ATTENTION[item.reason] || { title: (who) => `${who} needs someone`, icon: 'bell', tone: 'quiet', when: 'Since' }
  return { title: a.title(item.name || 'a website lead'), icon: a.icon, tone: a.tone, when: `${a.when} ${day(item.at, now)}` }
}
export const ATTENTION_LABELS = {
  client_replied: 'Replied by text', message_failed: 'Message not sent', booking_cancelled: 'Booking cancelled',
  overdue: 'Waiting for first contact', possible_spam: 'Possible vendor message', no_response: 'No response',
}

/** A switch's state as a chip: { label, tone }. f: one of health.flags. */
export function flagChip(f) {
  if (f.on) return { label: 'On', tone: 'good' }
  if (f.paused) return { label: 'Paused', tone: 'warn' }
  if (f.why === 'switched_off') return { label: 'Off', tone: 'quiet' }
  if (String(f.why || '').startsWith('needs:')) return { label: 'Waiting', tone: 'quiet' }
  return { label: 'Off', tone: 'quiet' }
}
/** Why a switch that is not on is not on, in a sentence. */
export function flagWhy(f, flags = []) {
  if (f.on) return ''
  if (f.why === 'switched_off') return `Off on the server. Set ${f.env}=true on the API service to switch it on.`
  if (f.paused) return 'Paused here. Resume to let it run again.'
  const need = String(f.why || '').startsWith('needs:') ? f.why.slice(6) : null
  const label = flags.find((x) => x.key === need)?.label
  return need ? `Its own switch is on, but it needs “${label || need}” to be on too.` : ''
}

/** The extra line under a row of the activity log the portal wrote itself. */
export function systemEventBits(e) {
  const d = e.details || {}
  const bits = []
  if (d.channel) bits.push(d.channel === 'sms' ? 'by text' : 'by email')
  if (e.action === 'automation.lead_status' && d.to) bits.push(`to ${String(d.to).replace(/_/g, ' ')}: ${reasonText(d.reason, STATUS_REASONS)}`)
  else if (e.action === 'automation.sequence_cancelled') bits.push(`because ${reasonText(d.reason, STOP_REASONS)}`)
  else if (e.action === 'automation.job_failed') bits.push(`${jobLabel(d.type)}: ${reasonText(d.reason)}`)
  else if (e.action === 'automation.lead_spam') bits.push(d.state === 'spam' ? 'a listed sender; archived' : 'a listed phrase; left in the inbox for someone to check')
  else if (e.action === 'automation.contact_matched') bits.push('the phone number and the email address both agree')
  else if (['automation.lead_escalated', 'automation.caller_escalated'].includes(e.action)) bits.push(`level ${d.level || 1}${d.notified != null ? `, ${d.notified} ${d.notified === 1 ? 'person' : 'people'} notified` : ''}${d.emailed ? ', one email' : ''}`)
  else if (d.reason) bits.push(reasonText(d.reason))
  return bits
}
