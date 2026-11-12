// Test automation mode in words: the steps of a test, what happened to each
// and the lines of the test history. Pure, tested in
// admin/test/testAutomation.test.js. The codes come from
// server/testChannel/automation.js.
import { formatDue, formatTime } from '../reminders/dueChoices.js'
import { sameFirmDay } from '../../utils/firmTime.js'
import { STOP_REASONS, STATUS_REASONS, MESSAGE_REASONS } from '../automation/automationText.js'

/** On every screen of test mode. The same words the server puts on its email and notice. */
export const TEST_BANNER = 'TEST MODE — NO PRODUCTION ACTIONS'

export const TIMING_LABELS = { accelerated: 'Accelerated (minutes)', production: 'Real timing' }
// The test's own pretend status, in the inbox's words ("closed" reads Spam there).
export const STATUS_LABELS = { new: 'New', contacted: 'Contacted', no_response: 'No response', scheduled: 'Scheduled', closed: 'Closed (Spam)' }

// Why something in a test was only shown, skipped or failed.
const TEST_REASONS = {
  ...MESSAGE_REASONS,
  email_not_requested: 'you chose not to send it for real',
  email_not_configured: 'email is not set up on this server',
  not_production: 'this server is not the live one',
  opted_out: 'this address is on the firm’s opt-out list',
  invalid_address: 'the address cannot receive email',
  address_on_a_lead: 'a lead or client already has it, and nobody confirmed it is yours',
  texts_are_never_sent_in_test_mode: 'text messages are never sent in test mode',
  texts_not_requested: 'you chose not to send the texts for real',
  sms_not_configured: 'RingCentral is not set up on this server',
  sms_unavailable: 'RingCentral cannot send text messages from this connection right now',
  ringcentral_asked_to_wait: 'RingCentral asked the portal to slow down, so nothing was sent',
  unknown_delivery: 'RingCentral did not confirm it, so it may or may not have arrived; it is not sent again',
  no_phone: 'the test has no phone number',
  send_failed: 'it was not accepted for sending',
  interrupted: 'the server restarted mid-way, and a test step is never tried twice',
  marked_by_staff: 'set by hand',
  test_gone: 'the test was removed',
}
const why = (code, table = TEST_REASONS) => table[code] || String(code || '').replace(/[_:]/g, ' ') || 'no reason recorded'
const stopWhy = (code) => STOP_REASONS[code] || TEST_REASONS[code] || why(code)

/** 'followup:followup_2' → 'Follow-up 2 (text)'. */
export function stepLabel(type) {
  if (type === 'ack_email') return 'Acknowledgment email'
  if (type === 'ack_sms') return 'Acknowledgment text'
  if (type === 'escalation_1') return 'Escalation, level 1'
  if (type === 'escalation_2') return 'Escalation, level 2'
  if (type === 'no_response') return 'Status changes to No response'
  if (String(type).startsWith('followup:')) {
    const n = /(\d+)$/.exec(type)?.[1]
    return n ? `Follow-up ${n} (text)` : 'Follow-up (text)'
  }
  return String(type || '').replace(/[_:]/g, ' ')
}

/** A step that is a text message (never sent in a test). */
export const isText = (type) => type === 'ack_sms' || String(type).startsWith('followup:')

export const stepIcon = (type) => (type === 'ack_email' ? 'envelope' : type === 'no_response' ? 'circle-pause' : String(type).startsWith('escalation') ? 'bell' : 'comment-dots')

/** What a step does in a test, before it runs: the one real thing, or what is only shown. */
export function stepPlan(type, { sendEmail = false, sendSms = false, notifyMe = false } = {}) {
  if (type === 'ack_email') return sendEmail ? 'really sent, to the test’s address only' : 'shown only, not sent'
  if (isText(type)) return sendSms ? 'really texted, to the test’s phone only' : 'shown only, not sent'
  if (String(type).startsWith('escalation')) return notifyMe ? 'a notice to you only' : 'shown only: nobody is notified'
  return 'the test’s own status, never a lead’s'
}

/** "in 0:42", "in 3 min", "today at 10:00 AM", "Thu, Nov 12, 10:00 AM"; "now" once due. */
export function dueText(dueAt, now = Date.now()) {
  const ms = new Date(dueAt).getTime() - now
  if (ms <= 0) return 'now'
  if (ms < 10 * 60 * 1000) {
    const s = Math.ceil(ms / 1000)
    return `in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  if (ms < 60 * 60 * 1000) return `in ${Math.round(ms / 60000)} min`
  return sameFirmDay(dueAt, now) ? `today at ${formatTime(dueAt)}` : formatDue(dueAt)
}

/** "now", "after 1 minute", "after 2 minutes" for the accelerated plan; a date for real timing. */
export function offsetText(dueAt, from, timing) {
  const ms = new Date(dueAt).getTime() - new Date(from).getTime()
  if (ms <= 0) return 'at once'
  if (timing === 'accelerated') {
    const m = Math.round(ms / 60000)
    return `after about ${m} minute${m === 1 ? '' : 's'}`
  }
  return sameFirmDay(dueAt, from) ? `today at ${formatTime(dueAt)}` : formatDue(dueAt)
}

/**
 * One step as { text, tone }: tone 'wait' | 'good' | 'shown' | 'quiet' | 'bad'.
 * `test`: the test form (for its address); `run`: its automation test.
 */
export function stepState(step, { test = {}, now = Date.now() } = {}) {
  if (step.state === 'pending') return { tone: 'wait', text: `Due ${dueText(step.dueAt, now)}` }
  if (step.state === 'running') return { tone: 'wait', text: 'Running now' }
  if (step.state === 'cancelled') return { tone: 'quiet', text: `Stopped because ${stopWhy(step.outcome)}` }
  if (step.state === 'skipped') return { tone: 'quiet', text: `Skipped: ${why(step.outcome)}` }
  if (step.state === 'failed') return { tone: 'bad', text: `Failed: ${why(step.outcome)}` }
  if (step.outcome === 'sent') return { tone: 'good', text: `Really sent to ${(isText(step.type) ? test.phone : test.email) || 'the test’s own address'}` }
  if (step.outcome === 'simulated') return { tone: 'shown', text: 'Shown only, nothing was sent' }
  if (step.outcome === 'no_response') return { tone: 'shown', text: 'The test’s status changed to No response' }
  if (/^level_/.test(step.outcome || '')) return { tone: 'shown', text: 'Escalated in the test only' }
  if (step.outcome === 'already_escalated') return { tone: 'quiet', text: 'Already escalated' }
  return { tone: 'quiet', text: why(step.outcome) }
}

const ACTION_LABELS = {
  client_replied: 'Client replied',
  consultation_booked: 'Consultation booked',
  mark_contacted: 'Mark contacted',
  mark_closed: 'Mark closed',
  run_next: 'Run the next step now',
}
export const actionLabel = (action) => ACTION_LABELS[action] || String(action || '').replace(/_/g, ' ')

const NOTIFIED = { nobody: 'nobody was notified', starter_only: 'only you were notified', starter_failed: 'the notice to you could not be shown' }
const steps = (list = []) => list.map(stepLabel).join(', ')

/**
 * One line of the test history: { icon, tone, title, note, preview }.
 * `preview` is the message that was sent or shown ({ to, subject, body }), when there is one.
 */
export function eventLine(e) {
  const d = e.detail || {}
  const label = stepLabel(e.step)
  const preview = e.body ? { to: e.recipient || '', subject: e.subject || '', body: e.body } : null
  const who = e.by || 'An administrator'
  if (e.kind === 'started') {
    const real = [d.sendEmail ? 'the acknowledgment email' : '', d.sendSms ? 'the text messages' : ''].filter(Boolean)
    const held = [d.emailHeld ? `The acknowledgment email is shown only: ${why(d.emailHeld)}.` : '', d.smsHeld ? `The texts are shown only: ${why(d.smsHeld)}.` : ''].filter(Boolean)
    return {
      icon: 'play', tone: 'quiet', title: `Test started, ${d.timing === 'production' ? 'real timing' : 'accelerated timing'}`,
      note: [real.length ? `You asked for ${real.join(' and ')} to be really sent, to the test’s own ${d.sendEmail && d.sendSms ? 'address and phone' : d.sendSms ? 'phone' : 'address'} only.` : held.length ? '' : 'Nothing is really sent in this test.', ...held].filter(Boolean).join(' '),
      preview: null,
    }
  }
  if (e.kind === 'sent' && e.channel === 'sms') return { icon: 'comment-dots', tone: 'good', title: `${label} really sent to ${e.recipient}`, note: `From the firm’s RingCentral number${d.from ? ` ${d.from}` : ''}. It also shows in RingCentral’s own message history.`, preview }
  if (e.kind === 'sent') return { icon: 'envelope', tone: 'good', title: `${label} really sent to ${e.recipient}`, note: d.replyTo ? `A reply to it goes to ${d.replyTo}, not to the office.` : '', preview }
  if (e.kind === 'simulated' && String(e.step).startsWith('escalation')) {
    return { icon: 'bell', tone: 'shown', title: `${label}: ${NOTIFIED[d.notified] || 'nobody was notified'}`, note: 'For a real lead this tells its owner, or everyone who works leads.', preview: e.body ? { to: '', subject: e.subject || '', body: e.body } : null }
  }
  if (e.kind === 'simulated') return { icon: e.channel === 'sms' ? 'comment-dots' : 'envelope', tone: 'shown', title: `${label} shown only`, note: `Not sent: ${why(d.reason)}${d.why ? ` (${why(d.why)})` : ''}.`, preview }
  if (e.kind === 'skipped') return { icon: 'ban', tone: 'quiet', title: `${label} skipped`, note: `${why(d.reason)[0].toUpperCase()}${why(d.reason).slice(1)}.`, preview: null }
  if (e.kind === 'cancelled') return { icon: 'circle-pause', tone: 'quiet', title: `Stopped because ${stopWhy(d.reason)}`, note: steps(d.steps), preview: null }
  if (e.kind === 'failed') return { icon: 'triangle-exclamation', tone: 'bad', title: `${label} failed`, note: `${why(d.reason)[0].toUpperCase()}${why(d.reason).slice(1)}${d.error ? ` (${d.error})` : ''}.`, preview }
  if (e.kind === 'status') {
    return {
      icon: 'user-check', tone: 'shown', title: `Test status: ${STATUS_LABELS[d.from] || d.from} → ${STATUS_LABELS[d.to] || d.to}`,
      note: d.auto ? `Set automatically: ${STATUS_REASONS[d.reason] || why(d.reason)}.` : `Set by ${who}.`, preview: null,
    }
  }
  if (e.kind === 'action') return { icon: 'bolt', tone: 'quiet', title: `${who} pressed “${actionLabel(d.action)}”`, note: e.step ? label : '', preview: null }
  if (e.kind === 'reset') {
    return { icon: 'trash', tone: 'quiet', title: d.all ? 'Test data reset' : 'A test form was removed', note: d.all ? `${d.removed} test form${d.removed === 1 ? '' : 's'} removed, with their automation tests and the history before this line.` : '', preview: null }
  }
  return { icon: 'circle-info', tone: 'quiet', title: String(e.kind || ''), note: '', preview }
}

/** The line under a test's name in the list: its pretend status and what is waiting. */
export function listNote(t) {
  if (!t.automation_status) return ''
  const status = STATUS_LABELS[t.automation_status] || t.automation_status
  return t.automation_pending ? `Automation test running · ${t.automation_pending} waiting` : `Automation test done · ${status}`
}
