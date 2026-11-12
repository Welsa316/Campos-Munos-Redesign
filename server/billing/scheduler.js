// Periodic reminder work: create drafts for what became due today, cancel
// what no longer qualifies, and send what staff already approved (inside the
// sending window). Nothing here can send an unapproved message.
//
// One instance at a time: a session-level advisory lock is taken with
// pg_try_advisory_lock on a dedicated connection; an instance that does not
// get it simply skips this tick.
import { evaluate, dispatch } from './reminderService.js'
import { createWhatsAppProvider } from './providers/whatsapp/index.js'
import { handleWhatsAppEvent, sweepUnhandled } from './whatsappInbound.js'

const LOCK_KEY = 'billing_reminder_scheduler'

export function startReminderScheduler({ pool, env = process.env, log, intervalMinutes = 15 }) {
  // Off unless switched on. server/.env on a developer machine points at
  // production; a scheduler that starts by default would act on real data
  // from a laptop.
  if (String(env.BILLING_SCHEDULER_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    log?.info?.('Billing reminder scheduler off (BILLING_SCHEDULER_ENABLED is not true)')
    return { stop() {} }
  }
  let provider
  try {
    provider = createWhatsAppProvider(env, {
      onStatus: (st) => handleWhatsAppEvent(pool, {
        kind: 'status', key: `status:${st.providerMessageId}:${st.status}`, messageId: st.providerMessageId,
        status: st.status, raw: { errors: st.errors }, timestamp: st.timestamp,
      }).catch(() => {}),
    })
  } catch (err) {
    log?.warn?.({ err: err.message }, 'Reminder scheduler not started: WhatsApp misconfigured')
    return { stop() {} }
  }

  let running = false
  async function tick() {
    if (running) return
    running = true
    const client = await pool.connect().catch(() => null)
    if (!client) { running = false; return }
    try {
      const got = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [LOCK_KEY])).rows[0].ok
      if (!got) return
      try {
        const now = new Date()
        await sweepUnhandled(pool, { log })
        const ev = await evaluate(pool, { now })
        const sent = await dispatch(pool, provider, { now, env, log })
        if (ev.created || sent.sent || sent.failed || sent.unknown) log?.info?.({ drafts: ev.created, ...sent }, 'Reminder scheduler tick')
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {})
      }
    } catch (err) {
      log?.warn?.({ err: err.message }, 'Reminder scheduler tick failed')
    } finally {
      client.release()
      running = false
    }
  }

  const first = setTimeout(tick, 2 * 60 * 1000)
  const every = setInterval(tick, intervalMinutes * 60 * 1000)
  first.unref?.()
  every.unref?.()
  return { stop() { clearTimeout(first); clearInterval(every) }, tick }
}

export default { startReminderScheduler }
