// The switches for everything the portal does on its own
// (docs/phase1-automation.md, "Feature flags").
//
// Two things must both be true for an automation to act:
//   1. its environment variable is exactly 'true' (Railway → API service →
//      Variables). Unset, misspelt or anything else means off, so deploying
//      this code changes nothing by itself.
//   2. an administrator has not paused it in the portal (Integrations →
//      Automation), which takes effect on the next run without a deploy.
//
// Finishing the code and switching it on are separate steps on purpose.

export const FLAGS = Object.freeze({
  worker: { env: 'AUTOMATION_ENABLED', label: 'Automation worker', group: 'core',
    about: 'Runs queued work every minute. Off: nothing below runs, whatever its own switch says.' },
  lead_ack: { env: 'LEAD_ACK_ENABLED', label: 'New-lead acknowledgment', group: 'leads', sends: true,
    about: 'Confirms to a new website lead that the firm received their message.' },
  lead_ack_email: { env: 'LEAD_ACK_EMAIL_ENABLED', label: 'Acknowledgment by email', group: 'leads', sends: true, needs: ['lead_ack'],
    about: 'The acknowledgment as an email, from the firm’s address, with replies going to the office inbox.' },
  lead_ack_sms: { env: 'LEAD_ACK_SMS_ENABLED', label: 'Acknowledgment by text message', group: 'leads', sends: true, needs: ['lead_ack', 'sms_sending', 'sms_inbound'],
    about: 'The acknowledgment as a text, only to a lead who agreed on the form to be texted.' },
  lead_followup: { env: 'LEAD_FOLLOWUP_ENABLED', label: 'Lead follow-up sequence', group: 'leads', sends: true, needs: ['sms_sending', 'sms_inbound'],
    about: 'Texts a lead again after one and three business days while nobody has reached them.' },
  lead_status: { env: 'LEAD_STATUS_AUTOMATION_ENABLED', label: 'Lead status from evidence', group: 'leads',
    about: 'Moves a lead to Contacted, Scheduled or No response when a call, a booking or a finished sequence proves it.' },
  lead_spam: { env: 'LEAD_SPAM_AUTOMATION_ENABLED', label: 'Vendor and spam rules', group: 'leads',
    about: 'Applies the sender rules an administrator maintains; anything less certain is only marked for review.' },
  contact_match: { env: 'CONTACT_AUTO_MATCH_ENABLED', label: 'Confirm caller matches', group: 'leads',
    about: 'Confirms that a caller is a website lead when the phone number and the email address both agree.' },
  sla_escalation: { env: 'SLA_ESCALATION_ENABLED', label: 'Stale lead and caller escalation', group: 'leads',
    about: 'Tells the owner, then the manager, when a new lead or a missed caller has waited too long.' },
  sms_sending: { env: 'RINGCENTRAL_SMS_ENABLED', label: 'RingCentral text messages (sending)', group: 'phone', sends: true,
    about: 'Allows any automatic text message to be sent from the firm’s RingCentral number.' },
  sms_inbound: { env: 'RINGCENTRAL_SMS_INBOUND_ENABLED', label: 'RingCentral text messages (reading replies)', group: 'phone',
    about: 'Reads replies and STOP requests, so follow-ups stop and opt-outs are honoured. Every automatic text needs it: nothing is texted while replies cannot be read.' },
  missed_call_sms: { env: 'MISSED_CALL_SMS_ENABLED', label: 'Missed-call text-back', group: 'phone', sends: true, needs: ['sms_sending', 'sms_inbound'],
    about: 'Texts a caller the firm missed, once per caller waiting for a call back.' },
  scheduling: { env: 'SCHEDULING_ENABLED', label: 'Consultation bookings', group: 'scheduling',
    about: 'Reads the firm’s calendar for consultations booked by a lead, and offers the booking link in messages.' },
})

export const FLAG_KEYS = Object.freeze(Object.keys(FLAGS))
export const isFlag = (key) => Object.hasOwn(FLAGS, key)

/** The variable is exactly 'true' (case and surrounding space ignored). */
export const envOn = (env, name) => String(env?.[name] ?? '').trim().toLowerCase() === 'true'

/** The automations an administrator paused: { key: { at, by } }. */
export async function loadPaused(db) {
  const row = (await db.query("SELECT value FROM automation_settings WHERE key = 'paused'")).rows[0]
  const value = row?.value && typeof row.value === 'object' ? row.value : {}
  return Object.fromEntries(Object.entries(value).filter(([k]) => isFlag(k)))
}

export async function setPaused(db, key, paused, { actorId = null, now = new Date() } = {}) {
  if (!isFlag(key)) throw Object.assign(new Error('Unknown automation'), { status: 404, code: 'not_found' })
  const current = await loadPaused(db)
  if (paused) current[key] = { at: now.toISOString(), by: actorId }
  else delete current[key]
  await db.query(
    `INSERT INTO automation_settings (key, value, updated_by) VALUES ('paused', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [JSON.stringify(current), actorId]
  )
  return current
}

/**
 * Whether each automation may act now. `on(key)` is true only when its own
 * variable is set, it is not paused, and the same holds for everything it
 * needs (a text-message automation needs sending switched on too).
 */
export function resolveFlags(env = process.env, paused = {}) {
  const own = (key) => envOn(env, FLAGS[key].env) && !paused[key]
  const on = (key) => isFlag(key) && own(key) && (FLAGS[key].needs || []).every(on)
  const why = (key) => {
    if (!envOn(env, FLAGS[key].env)) return 'switched_off'
    if (paused[key]) return 'paused'
    const missing = (FLAGS[key].needs || []).find((k) => !on(k))
    return missing ? `needs:${missing}` : null
  }
  return { on, why, paused }
}

export async function currentFlags(db, env = process.env) {
  return resolveFlags(env, await loadPaused(db))
}

export default { FLAGS, FLAG_KEYS, isFlag, envOn, loadPaused, setPaused, resolveFlags, currentFlags }
