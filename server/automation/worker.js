// One run of the automation. index.js calls it every minute, and once at
// boot; nothing in it needs the portal open or anyone signed in.
//
// A run, in order:
//   1. sweeps   (one instance at a time, under an advisory lock)
//               queue new leads the form request did not get to
//               read text replies and opt-outs         (if switched on)
//               read the calendar for bookings         (if switched on)
//               queue missed-caller texts and escalations
//               act on new evidence about open leads
//               confirm caller matches                 (if switched on)
//   2. jobs     run every job that is due (any number of instances: each
//               job is taken by one worker only)
//
// Every step is on its own: one that fails is recorded (automation_state,
// shown on the health view) and the rest carry on. A failing calendar never
// stops an acknowledgment; a failing text never stops the call import.
//
// With AUTOMATION_ENABLED not 'true' (or the worker paused) a run does
// nothing at all.
import { currentFlags } from './flags.js'
import { loadSettings } from './settings.js'
import { runDueJobs, recoverStuck } from './jobs.js'
import { leadHandlers, startMissedLeads } from './leads.js'
import { missedCallHandlers, queueMissedCallWork } from './missedCalls.js'
import { checkSmsDelivery } from './messaging.js'
import { applyLeadEvidence } from './leadStatus.js'
import { pollInboundSms } from './smsInbound.js'
import { syncBookings } from './scheduling/bookings.js'
import { autoConfirmMatches, RUN_EVERY_MS as MATCH_EVERY_MS } from './contactMatch.js'
import { noteSuccess, noteFailure, getState, dueToRun } from './state.js'
import { recordSystemEvent } from './events.js'
import { sendPush } from '../push/send.js'
import { accountsWith } from '../auth/account.js'

const SWEEP_LOCK = 'cm_automation_sweeps'
const errCode = (err) => String(err?.code || err?.name || 'error').slice(0, 80)

export const FAILED_MESSAGE_ALERT = Object.freeze({
  title: 'An automatic message was not sent',
  body: 'The portal could not send a message it was meant to. Open it to follow up yourself.',
})

async function step(db, key, log, fn, out) {
  try {
    out[key] = await fn()
    await noteSuccess(db, key).catch(() => {})
  } catch (err) {
    out[key] = { error: errCode(err) }
    await noteFailure(db, key, errCode(err)).catch(() => {})
    log?.warn?.({ step: key, err: { name: err?.name, code: err?.code } }, 'Automation step failed')
  }
}

async function sweeps(db, { flags, settings, sms, calendar, now, log }) {
  const out = {}
  await step(db, 'lead_intake', log, () => startMissedLeads(db, { flags, settings, now, log }), out)
  if (flags.on('sms_inbound') && sms) {
    // Its own state row (smsInbound.js) also paces it; a failure there must
    // not be recorded as a success here.
    try { out.sms_inbound = await pollInboundSms(db, sms, { now, log }) } catch (err) {
      out.sms_inbound = { error: errCode(err) }
      log?.warn?.({ step: 'sms_inbound', err: { name: err?.name, code: err?.code } }, 'Automation step failed')
    }
  }
  if (flags.on('scheduling') && calendar) {
    try { out.calendar = await syncBookings(db, calendar, { now, log }) } catch (err) {
      out.calendar = { error: errCode(err) }
      log?.warn?.({ step: 'calendar', err: { name: err?.name, code: err?.code } }, 'Automation step failed')
    }
  }
  await step(db, 'missed_calls', log, () => queueMissedCallWork(db, { flags, settings, now }), out)
  await step(db, 'lead_evidence', log, () => applyLeadEvidence(db, { flags, settings, log }), out)
  if (flags.on('contact_match')) {
    if (dueToRun(await getState(db, 'contact_match_pace'), now, MATCH_EVERY_MS)) {
      await step(db, 'contact_match', log, () => autoConfirmMatches(db, { log }), out)
      await noteSuccess(db, 'contact_match_pace', { lastRunAt: now.toISOString() }).catch(() => {})
    }
  }
  return out
}

// A job that ended 'failed' is told once to the people who can act on it.
async function reportFailures(db, results, { flags, env, pushOptions, log }) {
  for (const r of results) {
    if (r.result.status !== 'failed') continue
    const entityType = r.type.startsWith('lead') ? 'lead' : r.type === 'sms_delivery_check' ? null : 'call'
    await recordSystemEvent(db, { action: 'automation.job_failed', entityType, entityId: r.entityId, outcome: 'failed', details: { type: r.type, reason: r.result.outcome || 'failed' }, log })
    if (!flags.on('sla_escalation') || !entityType) continue
    const lead = entityType === 'lead'
    try {
      for (const accountId of await accountsWith(db, lead ? 'crm.manage' : 'calls.view')) {
        await sendPush(db, { accountId, eventKey: `job-failed:${r.id}`, ...FAILED_MESSAGE_ALERT, url: lead ? `/inbox?lead=${r.entityId}` : `/calls?call=${r.entityId}`, tag: `job-failed:${r.id}` }, { env, ...pushOptions })
      }
    } catch (err) {
      log?.warn?.({ err: { name: err?.name, code: err?.code } }, 'Failed-message notification could not be sent')
    }
  }
}

/**
 * One run. deps:
 *   mailer       mail to clients (reminders/email.js createResendMailer) or null
 *   staffMailer  mail to staff (the same mailer) or null
 *   sms          integrations/ringcentral/sms.js createRingCentralSms, or null
 *   calendar     a scheduling provider, or null
 * `now`: a fixed instant, for tests. Returns what happened.
 */
export async function runAutomation(db, { env = process.env, mailer = null, staffMailer = null, sms = null, calendar = null, pushOptions = {}, now = null, log = null } = {}) {
  const flags = await currentFlags(db, env)
  if (!flags.on('worker')) return { off: flags.why('worker') }
  const at = now || new Date()
  const settings = await loadSettings(db)
  const out = { sweeps: null, jobs: [] }

  await recoverStuck(db, { now }).catch((err) => log?.warn?.({ err: { name: err?.name, code: err?.code } }, 'Could not recover interrupted automation jobs'))

  // Sweeps: one instance at a time. An instance that does not get the lock
  // goes straight to the jobs.
  const client = await db.connect().catch(() => null)
  if (client) {
    try {
      const got = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [SWEEP_LOCK])).rows[0].ok
      if (got) {
        try {
          out.sweeps = await sweeps(db, { flags, settings, sms, calendar, now: at, log })
        } finally {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [SWEEP_LOCK]).catch(() => {})
        }
      }
    } catch (err) {
      log?.warn?.({ err: { name: err?.name, code: err?.code } }, 'Automation sweeps failed')
    } finally {
      client.release()
    }
  }

  const handlers = { ...leadHandlers(), ...missedCallHandlers(), sms_delivery_check: (job, ctx) => checkSmsDelivery(ctx.db, job, ctx) }
  const ctx = { db, env, flags, settings, mailer, staffMailer, sms, pushOptions, log, now: at, budget: { sms: settings.texting.perMinute } }
  out.jobs = await runDueJobs(db, handlers, { now, ctx, log })
  await reportFailures(db, out.jobs, { flags, env, pushOptions, log })
  await noteSuccess(db, 'worker', { jobs: out.jobs.length }).catch(() => {})
  return out
}

export default { runAutomation }
