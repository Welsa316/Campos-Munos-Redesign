// Missed callers, with nobody watching the Calls page.
//
// Built on the call engine as it is (integrations/ringcentral/callLog.js):
// this file decides nothing about what a call was. It reads the open
// callback episodes Needs attention already lists — incoming calls proven
// not answered, from a number that can be called back, not internal, not
// marked as needing no callback, not yet closed by a connected callback or a
// later answered call — and for each one:
//
//   text-back   one automatic text, a few minutes after the call so
//               RingCentral's final record of it is in, and only if the
//               episode is still open then
//   escalation  the front desk is told when the caller has waited too long,
//               then the next level
//
// One job per episode (its id is the episode's first call), so a caller who
// rings five times is texted once. What is never texted, because it is
// never an open episode: answered calls, outgoing and internal calls,
// calls ended by the phone system, withheld numbers, numbers marked spam,
// verification, or a colleague's phone, and the "check if they still need
// help" group whose outcome RingCentral did not record.
import { queryCalls, episodeOpen, ATTENTION_DAYS } from '../integrations/ringcentral/callLog.js'
import { enqueue } from './jobs.js'
import { deliver, recentlyMessaged } from './messaging.js'
import { addBusinessMinutes, businessMinutesBetween } from './businessHours.js'
import { textingHours } from './settings.js'
import { recordSystemEvent } from './events.js'
import { notifyStaff } from './escalation.js'
import { phoneKey } from '../utils/phone.js'

const ENQUEUE_WINDOW_HOURS = 48

/**
 * Queue the text-back and the escalation for every caller now waiting.
 * Idempotent: each is keyed by its episode. Returns { texts, escalations }.
 */
export async function queueMissedCallWork(db, { flags, settings, now = new Date() }) {
  const wantText = flags.on('missed_call_sms')
  const wantSla = flags.on('sla_escalation')
  if (!wantText && !wantSla) return { texts: 0, escalations: 0 }
  const res = await queryCalls(db, {
    from: new Date(now.getTime() - ATTENTION_DAYS * 24 * 60 * 60 * 1000),
    to: new Date(now.getTime() + 60 * 1000),
    outcome: 'attention', limit: 1000, now,
  })
  const since = now.getTime() - ENQUEUE_WINDOW_HOURS * 60 * 60 * 1000
  let texts = 0
  let escalations = 0
  for (const e of res.episodes || []) {
    const first = new Date(e.firstAt)
    const last = new Date(e.lastAt)
    if (last.getTime() < since) continue
    if (wantText) {
      const r = await enqueue(db, {
        type: 'missed_call_sms', key: `missed-call-sms:${e.id}`, entityType: 'call', entityId: e.id,
        runAt: new Date(last.getTime() + settings.missedCall.settleMinutes * 60 * 1000), payload: { lastCallAt: last.toISOString() },
      })
      if (r.created) texts++
    }
    if (wantSla) {
      const r = await enqueue(db, {
        type: 'call_sla', key: `call-sla:${e.id}:1`, entityType: 'call', entityId: e.id,
        runAt: addBusinessMinutes(first, settings.sla.missedCallMinutes, settings.hours), payload: { level: 1 },
      })
      if (r.created) escalations++
    }
  }
  return { texts, escalations }
}

const skipped = (outcome) => ({ status: 'skipped', outcome })
const cancelled = (outcome) => ({ status: 'cancelled', outcome })

export function missedCallHandlers() {
  return {
    async missed_call_sms(job, ctx) {
      const { flags, settings, db } = ctx
      const now = ctx.now || new Date()
      if (!flags.on('missed_call_sms')) return skipped('switched_off')
      const callId = Number(job.entity_id)
      // The same question Needs attention asks, asked again now.
      if (!(await episodeOpen(db, callId))) return cancelled('resolved')
      const call = (await db.query(
        'SELECT id, counterpart_number, counterpart_key, direction, is_internal FROM rc_calls WHERE id = $1', [callId]
      )).rows[0]
      if (!call || call.direction !== 'inbound' || call.is_internal || !call.counterpart_key) return cancelled('not_actionable')
      // Not about a call from long ago (counted in texting hours, so a call
      // last night can still be answered this morning).
      const lastAt = new Date(job.payload?.lastCallAt || job.created_at)
      if (businessMinutesBetween(lastAt, now, textingHours(settings)) > settings.missedCall.maxAgeMinutes) return skipped('too_old')
      const since = new Date(now.getTime() - settings.missedCall.cooldownDays * 24 * 60 * 60 * 1000)
      if (await recentlyMessaged(db, { toKey: phoneKey(call.counterpart_number), purpose: 'missed_call', since, exceptKey: job.idempotency_key })) return skipped('cooldown')
      // The language only when a website lead with this number chose one.
      const lead = (await db.query(
        `SELECT language FROM submissions WHERE cm_phone_key(phone) = $1 AND language IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [call.counterpart_key]
      )).rows[0]
      return deliver(db, {
        job, channel: 'sms', purpose: 'missed_call', entityType: 'call', entityId: callId, to: call.counterpart_number,
        templateKey: 'missed_call_sms', language: lead?.language || 'bi',
        vars: { firmName: settings.firm.name, officePhone: settings.firm.phone, bookingLink: flags.on('scheduling') ? settings.scheduling.bookingUrl : '' },
        event: 'automation.missed_call_sms_sent',
      }, ctx)
    },

    async call_sla(job, ctx) {
      const { flags, settings, db } = ctx
      const now = ctx.now || new Date()
      if (!flags.on('sla_escalation')) return skipped('switched_off')
      const level = Number(job.payload?.level) === 2 ? 2 : 1
      const callId = Number(job.entity_id)
      if (!(await episodeOpen(db, callId))) return cancelled('resolved')
      const claimed = await db.query(
        'INSERT INTO call_episode_escalations (episode_id, level) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING episode_id', [callId, level]
      )
      if (!claimed.rowCount) return { status: 'done', outcome: 'already_escalated' }
      const told = await notifyStaff(db, { kind: 'caller', level, entityId: callId, capability: 'calls.view', path: `/calls?call=${callId}` }, ctx)
      await recordSystemEvent(db, { action: 'automation.caller_escalated', entityType: 'call', entityId: callId, details: { level, notified: told.accounts, emailed: told.emailed }, log: ctx.log })
      if (level === 1) {
        await enqueue(db, { type: 'call_sla', key: `call-sla:${callId}:2`, entityType: 'call', entityId: callId, runAt: addBusinessMinutes(now, settings.sla.missedCallSecondMinutes, settings.hours), payload: { level: 2 } })
      }
      return { status: 'done', outcome: `level_${level}` }
    },
  }
}

export default { queueMissedCallWork, missedCallHandlers }
