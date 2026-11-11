// What happens to a website lead with nobody watching:
//
//   it arrives      → the vendor rules run; it gets an owner and a time by
//                     which a person should have made contact; its
//                     acknowledgment, follow-ups and escalation are queued
//   acknowledgment  → an email and (with consent) a text confirming receipt
//   follow-ups      → a text after one and three business days, only while
//                     nobody has reached them
//   no response     → after the last follow-up with still nothing: No response
//   escalation      → the owner is told when the lead has waited too long,
//                     then the next level
//
// Every step looks at the lead again right before acting (leadStop): a lead
// that was archived, answered, booked, marked spam or switched off by staff
// in the meantime gets nothing. Timing and wording come from the settings
// (settings.js, templates.js), never from here.
import { enqueue } from './jobs.js'
import { deliver, recentlyMessaged } from './messaging.js'
import { languageFor } from './templates.js'
import { addBusinessDays, addBusinessMinutes, nextBusinessTime, isBusinessTime } from './businessHours.js'
import { textingHours } from './settings.js'
import { applySpamRules } from './spam.js'
import { recordSystemEvent } from './events.js'
import { leadEvidence, humanContact, setLeadStatus } from './leadStatus.js'
import { notifyStaff } from './escalation.js'
import { phoneKey } from '../utils/phone.js'

const LEAD_COLUMNS = `id, first_name, last_name, email, phone, message, source, status, is_archived, created_at, language, sms_consent_at,
  owner_id, sla_due_at, escalation_level, automation_paused, automation_started_at, spam_state`

export async function loadLead(db, id) {
  return (await db.query(`SELECT ${LEAD_COLUMNS} FROM submissions WHERE id = $1`, [id])).rows[0] || null
}

/**
 * Why nothing automatic should be sent to this lead any more, or null.
 * `stage`: 'ack' (only a brand-new lead is acknowledged) or 'followup'.
 */
export function leadStop(lead) {
  if (!lead) return 'lead_gone'
  if (lead.is_archived) return 'archived'
  if (lead.spam_state === 'spam' || lead.spam_state === 'possible') return 'spam'
  if (lead.automation_paused) return 'stopped_by_staff'
  if (lead.status !== 'new') return `status_${lead.status}`
  return null
}

function messageVars(lead, settings, flags) {
  return {
    firstName: lead.first_name,
    firmName: settings.firm.name,
    officePhone: settings.firm.phone,
    bookingLink: flags.on('scheduling') ? settings.scheduling.bookingUrl : '',
  }
}

/**
 * Queue everything for a new lead. Safe to call again (every job has its own
 * key, and automation_started_at marks the lead done), which is how the
 * worker picks up a lead whose form request died before this ran.
 * Returns { started, jobs, spam }.
 */
export async function startLeadAutomation(db, submissionId, { flags, settings, now = new Date(), log = null }) {
  let lead = await loadLead(db, submissionId)
  if (!lead || lead.automation_started_at) return { started: false, jobs: 0 }

  // Vendor rules first: a listed sender is archived and gets nothing.
  let spam = null
  if (flags.on('lead_spam')) {
    spam = await applySpamRules(db, lead, settings.spam, { log })
    if (spam) lead = await loadLead(db, submissionId)
  }

  // Who follows it up, and by when a person should have made contact.
  const created = new Date(lead.created_at)
  const slaDue = addBusinessMinutes(created, settings.sla.newLeadMinutes, settings.hours)
  await db.query(
    `UPDATE submissions SET sla_due_at = COALESCE(sla_due_at, $2),
            owner_id = COALESCE(owner_id, (SELECT id FROM admin_users WHERE id = $3::int AND disabled_at IS NULL)),
            assigned_at = CASE WHEN owner_id IS NULL AND $3::int IS NOT NULL THEN NOW() ELSE assigned_at END
      WHERE id = $1`,
    [lead.id, slaDue, settings.ownership.defaultLeadOwnerId]
  )

  let jobs = 0
  const add = async (job) => { if ((await enqueue(db, { entityType: 'lead', entityId: lead.id, ...job })).created) jobs++ }
  const messaging = !leadStop(lead)
  if (messaging && flags.on('lead_ack')) {
    if (flags.on('lead_ack_email')) await add({ type: 'lead_ack_email', key: `lead-ack-email:${lead.id}`, runAt: now })
    if (flags.on('lead_ack_sms')) await add({ type: 'lead_ack_sms', key: `lead-ack-sms:${lead.id}`, runAt: now })
  }
  if (messaging && flags.on('lead_followup') && settings.followup.steps.length) {
    const texting = textingHours(settings)
    for (const step of settings.followup.steps) {
      const at = nextBusinessTime(addBusinessDays(created, step.afterBusinessDays, settings.hours), texting)
      await add({ type: 'lead_followup', key: `lead-followup:${lead.id}:${step.key}`, runAt: at, payload: { step: step.key } })
    }
    await add({ type: 'lead_no_response', key: `lead-no-response:${lead.id}`, runAt: addBusinessDays(created, settings.followup.noResponseAfterBusinessDays, settings.hours) })
  }
  // A possible-spam lead still gets a deadline: a person has to look at it.
  if (lead.spam_state !== 'spam' && flags.on('sla_escalation')) {
    await add({ type: 'lead_sla', key: `lead-sla:${lead.id}:1`, runAt: slaDue, payload: { level: 1 } })
  }
  await db.query('UPDATE submissions SET automation_started_at = NOW() WHERE id = $1 AND automation_started_at IS NULL', [lead.id])
  if (jobs) await recordSystemEvent(db, { action: 'automation.sequence_started', entityType: 'lead', entityId: lead.id, details: { jobs, language: languageFor(lead) }, log })
  return { started: true, jobs, spam: spam?.state || null }
}

/**
 * Leads from the last hour whose jobs were never queued: the form request
 * died first, or the worker was restarting. Only the last hour on purpose:
 * switching the automation on must not reach back and acknowledge
 * yesterday's leads, which the front desk has long since dealt with.
 */
export async function startMissedLeads(db, opts) {
  const rows = (await db.query(
    "SELECT id FROM submissions WHERE automation_started_at IS NULL AND created_at > NOW() - INTERVAL '1 hour' ORDER BY id LIMIT 200"
  )).rows
  let started = 0
  for (const r of rows) if ((await startLeadAutomation(db, r.id, opts)).started) started++
  return started
}

// --- job handlers --------------------------------------------------------------------

export const FOLLOWUP_MAX_LATE_MS = 3 * 24 * 60 * 60 * 1000
const skipped = (outcome) => ({ status: 'skipped', outcome })
const cancelled = (outcome) => ({ status: 'cancelled', outcome })

function tooOld(lead, settings, now) {
  return now.getTime() - new Date(lead.created_at).getTime() > settings.ack.maxAgeHours * 60 * 60 * 1000
}

export function leadHandlers() {
  return {
    async lead_ack_email(job, ctx) {
      const { flags, settings } = ctx
      const now = ctx.now || new Date()
      if (!flags.on('lead_ack_email')) return skipped('switched_off')
      const lead = await loadLead(ctx.db, job.entity_id)
      const stop = leadStop(lead)
      if (stop) return cancelled(stop)
      if (tooOld(lead, settings, now)) return skipped('too_old')
      // The same person writing twice in a day is told once.
      if (await recentlyMessaged(ctx.db, { toKey: String(lead.email).trim().toLowerCase(), purpose: 'lead_ack', since: new Date(now.getTime() - 24 * 60 * 60 * 1000), exceptKey: job.idempotency_key, channel: 'email' })) return skipped('recently_acknowledged')
      return deliver(ctx.db, {
        job, channel: 'email', purpose: 'lead_ack', entityType: 'lead', entityId: lead.id, to: lead.email,
        templateKey: 'lead_ack_email', language: languageFor(lead), vars: messageVars(lead, settings, flags), event: 'automation.lead_ack_sent',
      }, ctx)
    },

    async lead_ack_sms(job, ctx) {
      const { flags, settings } = ctx
      const now = ctx.now || new Date()
      if (!flags.on('lead_ack_sms')) return skipped('switched_off')
      const lead = await loadLead(ctx.db, job.entity_id)
      const stop = leadStop(lead)
      if (stop) return cancelled(stop)
      if (settings.ack.smsRequiresFormConsent && !lead.sms_consent_at) return skipped('no_sms_consent')
      if (tooOld(lead, settings, now)) return skipped('too_old')
      if (await recentlyMessaged(ctx.db, { toKey: phoneKey(lead.phone), purpose: 'lead_ack', since: new Date(now.getTime() - 24 * 60 * 60 * 1000), exceptKey: job.idempotency_key, channel: 'sms' })) return skipped('recently_acknowledged')
      return deliver(ctx.db, {
        job, channel: 'sms', purpose: 'lead_ack', entityType: 'lead', entityId: lead.id, to: lead.phone,
        templateKey: 'lead_ack_sms', language: languageFor(lead), vars: messageVars(lead, settings, flags), event: 'automation.lead_ack_sent',
        anyHour: settings.ack.smsOutsideHours,
      }, ctx)
    },

    async lead_followup(job, ctx) {
      const { flags, settings } = ctx
      if (!flags.on('lead_followup')) return skipped('switched_off')
      const step = settings.followup.steps.find((s) => s.key === job.payload?.step)
      if (!step) return skipped('step_removed')
      // A follow-up that could not run for days (the worker was off) is not
      // sent late: its moment has passed.
      if ((ctx.now || new Date()).getTime() - new Date(job.run_at).getTime() > FOLLOWUP_MAX_LATE_MS) return skipped('too_late')
      const lead = await loadLead(ctx.db, job.entity_id)
      const stop = leadStop(lead)
      if (stop) return cancelled(stop)
      if (settings.ack.smsRequiresFormConsent && !lead.sms_consent_at) return skipped('no_sms_consent')
      // The last look, with fresh evidence: reached, booked or answered since?
      const ev = await leadEvidence(ctx.db, lead)
      if (ev.bookingAt) return cancelled('consultation_booked')
      if (ev.callAt) return cancelled(ev.callKind)
      if (ev.smsReplyAt) return cancelled('client_replied_by_text')
      return deliver(ctx.db, {
        job, channel: step.channel, purpose: 'lead_followup', entityType: 'lead', entityId: lead.id, to: lead.phone,
        templateKey: step.templateKey, language: languageFor(lead), vars: messageVars(lead, settings, flags), event: 'automation.lead_followup_sent',
      }, ctx)
    },

    // The sequence is over. No response only when it really ran: every
    // follow-up went out and nothing came back.
    async lead_no_response(job, ctx) {
      const { flags } = ctx
      if (!flags.on('lead_status')) return skipped('switched_off')
      const lead = await loadLead(ctx.db, job.entity_id)
      const stop = leadStop(lead)
      if (stop) return cancelled(stop)
      const ev = await leadEvidence(ctx.db, lead)
      if (humanContact(ev) || ev.smsReplyAt) return cancelled('client_reached')
      const steps = (await ctx.db.query(
        "SELECT status, outcome FROM automation_jobs WHERE entity_type = 'lead' AND entity_id = $1 AND type = 'lead_followup'", [String(lead.id)]
      )).rows
      const sent = steps.filter((s) => s.status === 'done' && ['sent', 'already_sent'].includes(s.outcome)).length
      if (steps.some((s) => ['pending', 'running'].includes(s.status))) return { status: 'defer', runAt: new Date((ctx.now || new Date()).getTime() + 60 * 60 * 1000) }
      if (!sent || sent < steps.length) return skipped('sequence_not_completed')
      const to = await setLeadStatus(ctx.db, lead.id, 'no_response', { from: ['new'], reason: 'follow_up_sequence_completed', trigger: 'sequence', log: ctx.log })
      return to ? { status: 'done', outcome: 'no_response' } : cancelled('status_changed')
    },

    // Nobody has reached this lead in time: tell its owner (level 1), then
    // the next level (level 2). Once per level.
    async lead_sla(job, ctx) {
      const { flags, settings } = ctx
      const now = ctx.now || new Date()
      if (!flags.on('sla_escalation')) return skipped('switched_off')
      const level = Number(job.payload?.level) === 2 ? 2 : 1
      const lead = await loadLead(ctx.db, job.entity_id)
      if (!lead || lead.is_archived || lead.spam_state === 'spam') return cancelled(lead ? 'archived' : 'lead_gone')
      if (lead.status !== 'new') return cancelled(`status_${lead.status}`)
      if (humanContact(await leadEvidence(ctx.db, lead))) return cancelled('client_reached')
      // Nobody is told at night or at the weekend: a deadline that passed
      // while the office was closed (or the worker was off) waits for it to open.
      if (!isBusinessTime(now, settings.hours)) return { status: 'defer', runAt: nextBusinessTime(now, settings.hours) }
      const claimed = await ctx.db.query(
        'UPDATE submissions SET escalation_level = $2, escalated_at = NOW() WHERE id = $1 AND escalation_level < $2 RETURNING id', [lead.id, level]
      )
      if (!claimed.rowCount) return { status: 'done', outcome: 'already_escalated' }
      const told = await notifyStaff(ctx.db, {
        kind: 'lead', level, entityId: lead.id, ownerId: lead.owner_id, capability: 'crm.manage', path: `/inbox?lead=${lead.id}`,
      }, ctx)
      await recordSystemEvent(ctx.db, { action: 'automation.lead_escalated', entityType: 'lead', entityId: lead.id, details: { level, notified: told.accounts, emailed: told.emailed }, log: ctx.log })
      if (level === 1) {
        await enqueue(ctx.db, { type: 'lead_sla', key: `lead-sla:${lead.id}:2`, entityType: 'lead', entityId: lead.id, runAt: addBusinessMinutes(now, settings.sla.newLeadSecondMinutes, settings.hours), payload: { level: 2 } })
      }
      return { status: 'done', outcome: `level_${level}` }
    },
  }
}

export default { startLeadAutomation, startMissedLeads, leadHandlers, leadStop, loadLead }
