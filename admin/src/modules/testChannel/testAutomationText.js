// Test automation mode in words: the steps of a test, what happened to each
// and the lines of the test history. Pure, tested in
// admin/test/testAutomation.test.js (English) and
// admin/test/i18nAdminPages.test.js (Spanish). The codes come from
// server/testChannel/automation.js. Every function takes an optional lang
// ('en' by default); the English tables below stay the English words, and
// their Spanish is in i18n/testChannel.js.
import { formatDue, formatTime } from '../reminders/dueChoices.js'
import { sameFirmDay } from '../../utils/firmTime.js'
import { STOP_REASONS, STATUS_REASONS, MESSAGE_REASONS } from '../automation/automationText.js'
import { makeTranslate, clockCount } from '../../i18n/translator.js'
import { MESSAGE_REASONS_ES, STOP_REASONS_ES, STATUS_REASONS_ES } from '../../i18n/automation.js'
import { TEST_CHANNEL, STATUS_LABELS_ES, ACTION_LABELS_ES, NOTIFIED_ES, TEST_REASONS_ES as TEST_ONLY_ES } from '../../i18n/testChannel.js'

const tr = makeTranslate(TEST_CHANNEL)
// A word from an English table, or from its Spanish twin when lang is 'es'.
const pick = (en, es, code, lang) => (lang === 'es' && Object.hasOwn(es, code ?? '') ? es[code] : en[code])

/** On every screen of test mode. The same words the server puts on its email and notice. */
export const TEST_BANNER = 'TEST MODE — NO PRODUCTION ACTIONS'

export const TIMING_LABELS = { accelerated: 'Accelerated (minutes)', production: 'Real timing' }
// The test's own pretend status, in the inbox's words ("closed" reads Spam there).
export const STATUS_LABELS = { new: 'New', contacted: 'Contacted', no_response: 'No response', scheduled: 'Scheduled', closed: 'Closed (Spam)' }

// Why something in a test was only shown, skipped or failed.
export const TEST_REASONS = {
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
const TEST_REASONS_ES = { ...MESSAGE_REASONS_ES, ...TEST_ONLY_ES }
const why = (code, lang = 'en') => pick(TEST_REASONS, TEST_REASONS_ES, code, lang) || String(code || '').replace(/[_:]/g, ' ') || tr(lang, 'no_reason')
const stopWhy = (code, lang = 'en') => pick(STOP_REASONS, STOP_REASONS_ES, code, lang) || pick(TEST_REASONS, TEST_REASONS_ES, code, lang) || why(code, lang)

/** The test's pretend status in words ("No response"); an unknown one as sent. */
export const statusLabel = (key, lang = 'en') => pick(STATUS_LABELS, STATUS_LABELS_ES, key, lang) || key

/** 'followup:followup_2' → 'Follow-up 2 (text)'. */
export function stepLabel(type, lang = 'en') {
  if (['ack_email', 'ack_sms', 'escalation_1', 'escalation_2', 'no_response'].includes(type)) return tr(lang, `step.${type}`)
  if (String(type).startsWith('followup:')) {
    const n = /(\d+)$/.exec(type)?.[1]
    return n ? tr(lang, 'step.followup_n', { n }) : tr(lang, 'step.followup')
  }
  return String(type || '').replace(/[_:]/g, ' ')
}

/** A step that is a text message (never sent in a test). */
export const isText = (type) => type === 'ack_sms' || String(type).startsWith('followup:')

export const stepIcon = (type) => (type === 'ack_email' ? 'envelope' : type === 'no_response' ? 'circle-pause' : String(type).startsWith('escalation') ? 'bell' : 'comment-dots')

/** What a step does in a test, before it runs: the one real thing, or what is only shown. */
export function stepPlan(type, { sendEmail = false, sendSms = false, notifyMe = false } = {}, lang = 'en') {
  const t = (key) => tr(lang, key)
  if (type === 'ack_email') return t(sendEmail ? 'plan.email_real' : 'plan.shown')
  if (isText(type)) return t(sendSms ? 'plan.text_real' : 'plan.shown')
  if (String(type).startsWith('escalation')) return t(notifyMe ? 'plan.notify_me' : 'plan.notify_nobody')
  return t('plan.status')
}

// "today at 10:00 AM" (count: the hour, for "a la 1:05") or the day and time.
function dayAndTime(at, now, lang) {
  if (sameFirmDay(at, now)) {
    const time = formatTime(at, lang)
    return tr(lang, 'due.today', { time, count: clockCount(time) })
  }
  return tr(lang, 'due.day', { date: formatDue(at, lang) })
}

/** "in 0:42", "in 3 min", "today at 10:00 AM", "Thu, Nov 12, 10:00 AM"; "now" once due. */
export function dueText(dueAt, now = Date.now(), lang = 'en') {
  const ms = new Date(dueAt).getTime() - now
  if (ms <= 0) return tr(lang, 'due.now')
  if (ms < 10 * 60 * 1000) {
    const s = Math.ceil(ms / 1000)
    return tr(lang, 'due.in_clock', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })
  }
  if (ms < 60 * 60 * 1000) return tr(lang, 'due.in_min', { count: Math.round(ms / 60000) })
  return dayAndTime(dueAt, now, lang)
}

/** "now", "after 1 minute", "after 2 minutes" for the accelerated plan; a date for real timing. */
export function offsetText(dueAt, from, timing, lang = 'en') {
  const ms = new Date(dueAt).getTime() - new Date(from).getTime()
  if (ms <= 0) return tr(lang, 'offset.at_once')
  if (timing === 'accelerated') return tr(lang, 'offset.minutes', { count: Math.round(ms / 60000) })
  return dayAndTime(dueAt, from, lang)
}

/**
 * One step as { text, tone }: tone 'wait' | 'good' | 'shown' | 'quiet' | 'bad'.
 * `test`: the test form (for its address); `run`: its automation test.
 */
export function stepState(step, { test = {}, now = Date.now(), lang = 'en' } = {}) {
  const t = (key, vars) => tr(lang, key, vars)
  if (step.state === 'pending') return { tone: 'wait', text: t('state.due', { when: dueText(step.dueAt, now, lang) }) }
  if (step.state === 'running') return { tone: 'wait', text: t('state.running') }
  if (step.state === 'cancelled') return { tone: 'quiet', text: t('state.stopped', { why: stopWhy(step.outcome, lang) }) }
  if (step.state === 'skipped') return { tone: 'quiet', text: t('state.skipped', { why: why(step.outcome, lang) }) }
  if (step.state === 'failed') return { tone: 'bad', text: t('state.failed', { why: why(step.outcome, lang) }) }
  if (step.outcome === 'sent') return { tone: 'good', text: t('state.sent', { to: (isText(step.type) ? test.phone : test.email) || t('state.own_address') }) }
  if (step.outcome === 'simulated') return { tone: 'shown', text: t('state.simulated') }
  if (step.outcome === 'no_response') return { tone: 'shown', text: t('state.no_response') }
  if (/^level_/.test(step.outcome || '')) return { tone: 'shown', text: t('state.escalated') }
  if (step.outcome === 'already_escalated') return { tone: 'quiet', text: t('state.already_escalated') }
  return { tone: 'quiet', text: why(step.outcome, lang) }
}

export const ACTION_LABELS = {
  client_replied: 'Client replied',
  consultation_booked: 'Consultation booked',
  mark_contacted: 'Mark contacted',
  mark_closed: 'Mark closed',
  run_next: 'Run the next step now',
}
export const actionLabel = (action, lang = 'en') => pick(ACTION_LABELS, ACTION_LABELS_ES, action, lang) || String(action || '').replace(/_/g, ' ')

export const NOTIFIED = { nobody: 'nobody was notified', starter_only: 'only you were notified', starter_failed: 'the notice to you could not be shown' }
const steps = (list = [], lang = 'en') => list.map((type) => stepLabel(type, lang)).join(', ')
const capital = (text) => `${text[0].toUpperCase()}${text.slice(1)}`

/**
 * One line of the test history: { icon, tone, title, note, preview }.
 * `preview` is the message that was sent or shown ({ to, subject, body }), when there is one.
 */
export function eventLine(e, lang = 'en') {
  const t = (key, vars) => tr(lang, key, vars)
  const d = e.detail || {}
  const label = stepLabel(e.step, lang)
  const preview = e.body ? { to: e.recipient || '', subject: e.subject || '', body: e.body } : null
  const who = e.by || t('ev.an_admin')
  if (e.kind === 'started') {
    const real = [d.sendEmail ? t('ev.real.email') : '', d.sendSms ? t('ev.real.sms') : ''].filter(Boolean)
    const held = [d.emailHeld ? t('ev.email_held', { why: why(d.emailHeld, lang) }) : '', d.smsHeld ? t('ev.sms_held', { why: why(d.smsHeld, lang) }) : ''].filter(Boolean)
    const where = d.sendEmail && d.sendSms ? 'both' : d.sendSms ? 'phone' : 'address'
    return {
      icon: 'play', tone: 'quiet', title: t('ev.started', { timing: t(d.timing === 'production' ? 'ev.timing.production' : 'ev.timing.accelerated') }),
      // count: 1 for the email alone, so Spanish says "se enviara" (and "se enviaran" for the texts).
      note: [real.length ? t('ev.asked', { what: real.join(t('ev.and')), where: t(`ev.where.${where}`), count: real.length === 1 && d.sendEmail ? 1 : 2 }) : held.length ? '' : t('ev.nothing_real'), ...held].filter(Boolean).join(' '),
      preview: null,
    }
  }
  if (e.kind === 'sent' && e.channel === 'sms') return { icon: 'comment-dots', tone: 'good', title: t('ev.sent', { label, to: e.recipient }), note: d.from ? t('ev.from_number_n', { from: d.from }) : t('ev.from_number'), preview }
  if (e.kind === 'sent') return { icon: 'envelope', tone: 'good', title: t('ev.sent', { label, to: e.recipient }), note: d.replyTo ? t('ev.reply_to', { to: d.replyTo }) : '', preview }
  if (e.kind === 'simulated' && String(e.step).startsWith('escalation')) {
    return { icon: 'bell', tone: 'shown', title: t('ev.escalation', { label, notified: pick(NOTIFIED, NOTIFIED_ES, d.notified, lang) || pick(NOTIFIED, NOTIFIED_ES, 'nobody', lang) }), note: t('ev.escalation_note'), preview: e.body ? { to: '', subject: e.subject || '', body: e.body } : null }
  }
  if (e.kind === 'simulated') return { icon: e.channel === 'sms' ? 'comment-dots' : 'envelope', tone: 'shown', title: t('ev.shown', { label }), note: t('ev.not_sent', { why: `${why(d.reason, lang)}${d.why ? ` (${why(d.why, lang)})` : ''}` }), preview }
  if (e.kind === 'skipped') return { icon: 'ban', tone: 'quiet', title: t('ev.skipped', { label }), note: `${capital(why(d.reason, lang))}.`, preview: null }
  if (e.kind === 'cancelled') return { icon: 'circle-pause', tone: 'quiet', title: t('ev.stopped', { why: stopWhy(d.reason, lang) }), note: steps(d.steps, lang), preview: null }
  if (e.kind === 'failed') return { icon: 'triangle-exclamation', tone: 'bad', title: t('ev.failed', { label }), note: `${capital(why(d.reason, lang))}${d.error ? ` (${d.error})` : ''}.`, preview }
  if (e.kind === 'status') {
    return {
      icon: 'user-check', tone: 'shown', title: t('ev.status', { from: statusLabel(d.from, lang), to: statusLabel(d.to, lang) }),
      note: d.auto ? t('ev.set_auto', { why: pick(STATUS_REASONS, STATUS_REASONS_ES, d.reason, lang) || why(d.reason, lang) }) : t('ev.set_by', { who }), preview: null,
    }
  }
  if (e.kind === 'action') return { icon: 'bolt', tone: 'quiet', title: t('ev.pressed', { who, action: actionLabel(d.action, lang) }), note: e.step ? label : '', preview: null }
  if (e.kind === 'reset') {
    return { icon: 'trash', tone: 'quiet', title: t(d.all ? 'ev.reset_all' : 'ev.reset_one'), note: d.all ? t('ev.reset_note', { count: d.removed }) : '', preview: null }
  }
  return { icon: 'circle-info', tone: 'quiet', title: String(e.kind || ''), note: '', preview }
}

/** The line under a test's name in the list: its pretend status and what is waiting. */
export function listNote(t, lang = 'en') {
  if (!t.automation_status) return ''
  const status = statusLabel(t.automation_status, lang)
  return t.automation_pending ? tr(lang, 'note.running', { count: t.automation_pending }) : tr(lang, 'note.done', { status })
}
