// RingCentral's live call events: the Account Telephony Sessions event filter,
// delivered by webhook to POST /webhooks/ringcentral (routes/ringcentralWebhook.js).
// docs/ringcentral-call-classification.md ("Live call events").
//
// The call log is written after a call ends and does not say whose phone
// rang. These events arrive while the call happens, one per change of a
// party's state (Setup, Proceeding = being offered to an endpoint, Answered =
// "media is established", VoiceMail, Disconnected), with a timestamp. They are
// stored per call and read with its call log records by the classifier.
//
// The subscription is created once by an administrator (Integrations page)
// and needs the Call Control app permission. It changes nothing about
// routing, numbers, queues or phones; deleting it stops the deliveries.
//
// Deliveries are trusted only when they carry the verification token set at
// registration (kept here as a SHA-256 digest) and name our subscription.
import crypto from 'crypto'
import { rcGet, rcSend, RingCentralApiError } from './api.js'

export const EVENT_FILTER = '/restapi/v1.0/account/~/telephony/sessions'
export const WEBHOOK_PATH = '/webhooks/ringcentral'
// RingCentral's maximum for a webhook (10 years). Renewed long before it ends.
export const LIFETIME_SECONDS = 315360000
export const RENEW_WITHIN_MS = 30 * 24 * 60 * 60 * 1000
export const RETENTION_DAYS = 400
const MAX_PARTIES = 30

const digest = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')
const s = (v, n = 120) => (v == null || v === '' ? null : String(v).slice(0, n))
const when = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }

export class EventSubscriptionError extends Error {
  constructor(code, message, status = 409) {
    super(message)
    this.name = 'EventSubscriptionError'
    this.code = code
    this.status = status
  }
}

/** Where RingCentral delivers: RINGCENTRAL_WEBHOOK_URL, or the API's own origin (from the OAuth redirect). */
export function webhookAddress(config, env = process.env) {
  const explicit = String(env.RINGCENTRAL_WEBHOOK_URL ?? '').trim()
  let url
  try { url = new URL(explicit || `${new URL(config.redirectUri).origin}${WEBHOOK_PATH}`) } catch { return null }
  return url.protocol === 'https:' ? url.toString() : null
}

/** A caller/callee as stored: the number stays in the database, the portal only ever sends its end. */
const who = (p) => (p && typeof p === 'object'
  ? { name: s(p.name), extensionId: s(p.extensionId, 40), phoneNumber: s(p.phoneNumber, 40), deviceId: s(p.deviceId, 40) }
  : null)

/**
 * Store one delivery. Returns { stored, sessionId } (stored: how many party
 * rows were new). The caller has already checked the token.
 */
export async function storeNotification(db, payload, { now = new Date() } = {}) {
  const body = payload?.body
  const tsid = s(body?.telephonySessionId, 200)
  const uuid = s(payload?.uuid, 200)
  if (!tsid || !uuid || !Array.isArray(body?.parties)) return { stored: 0, sessionId: tsid }
  let stored = 0
  for (const p of body.parties.slice(0, MAX_PARTIES)) {
    if (!p || typeof p !== 'object' || p.id == null) continue
    const party = {
      id: s(p.id, 200), extensionId: s(p.extensionId, 40), accountId: s(p.accountId, 40), direction: s(p.direction, 10),
      status: { code: s(p.status?.code, 40), reason: s(p.status?.reason, 60) },
      missedCall: typeof p.missedCall === 'boolean' ? p.missedCall : null,
      standAlone: typeof p.standAlone === 'boolean' ? p.standAlone : null,
      to: who(p.to), from: who(p.from),
    }
    const res = await db.query(
      `INSERT INTO rc_telephony_events (notification_uuid, telephony_session_id, session_id, sequence, event_time, party_id, extension_id,
              direction, status_code, status_reason, missed_call, party, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (notification_uuid, party_id) DO NOTHING`,
      [uuid, tsid, s(body.sessionId, 200), Number.isInteger(body.sequence) ? body.sequence : null, when(body.eventTime), party.id, party.extensionId,
        party.direction === 'Inbound' || party.direction === 'Outbound' ? party.direction : null, party.status.code, party.status.reason,
        party.missedCall, JSON.stringify(party), now]
    )
    stored += res.rowCount
  }
  if (stored) await db.query(`UPDATE rc_event_subscription SET last_event_at = $1 WHERE key = 'ringcentral'`, [now])
  return { stored, sessionId: tsid }
}

/**
 * Whether a delivery is ours: our verification token, and (when RingCentral
 * names one) our subscription. Constant-time comparison of the digests.
 */
export async function isTrustedDelivery(db, headers, payload) {
  const row = (await db.query(`SELECT subscription_id, token_digest FROM rc_event_subscription WHERE key = 'ringcentral'`)).rows[0]
  const token = headers['verification-token']
  if (!row?.token_digest || typeof token !== 'string' || !token) return false
  const a = Buffer.from(digest(token), 'hex')
  const b = Buffer.from(row.token_digest, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  if (payload?.subscriptionId && row.subscription_id && String(payload.subscriptionId) !== row.subscription_id) return false
  return true
}

/** Every stored event of these calls, by telephony session id, oldest first. */
export async function loadEvents(db, sessionIds) {
  const ids = [...new Set((sessionIds || []).filter(Boolean))]
  const out = new Map()
  if (!ids.length) return out
  const rows = (await db.query(
    `SELECT telephony_session_id, sequence, event_time, party FROM rc_telephony_events
      WHERE telephony_session_id = ANY($1::text[]) ORDER BY telephony_session_id, sequence NULLS LAST, event_time, id`,
    [ids]
  )).rows
  for (const r of rows) {
    if (!out.has(r.telephony_session_id)) out.set(r.telephony_session_id, [])
    out.get(r.telephony_session_id).push({ ...r.party, sequence: r.sequence, at: r.event_time ? r.event_time.toISOString() : null })
  }
  return out
}

// --- the subscription ------------------------------------------------------------

/** What the Integrations page shows. Never the token. */
export async function subscriptionStatus(db, config, env = process.env) {
  const row = (await db.query(`SELECT * FROM rc_event_subscription WHERE key = 'ringcentral'`)).rows[0]
  const events = (await db.query(`SELECT COUNT(*)::int AS n FROM rc_telephony_events WHERE received_at > NOW() - INTERVAL '1 day'`)).rows[0].n
  return {
    address: webhookAddress(config, env),
    registered: Boolean(row?.subscription_id),
    status: row?.status ?? null,
    expiresAt: row?.expires_at ?? null,
    createdAt: row?.created_at ?? null,
    checkedAt: row?.checked_at ?? null,
    lastEventAt: row?.last_event_at ?? null,
    eventsLastDay: events,
    lastErrorCode: row?.last_error_code ?? null,
    lastErrorAt: row?.last_error_at ?? null,
  }
}

const codeOf = (err) => {
  if (!(err instanceof RingCentralApiError)) return err?.code || 'error'
  if (err.status === 403) return 'missing_permission'
  if (err.status === 429) return 'rate_limited'
  return err.code
}

async function recordError(db, code, now) {
  await db.query(
    `INSERT INTO rc_event_subscription (key, last_error_code, last_error_at) VALUES ('ringcentral', $1, $2)
     ON CONFLICT (key) DO UPDATE SET last_error_code = EXCLUDED.last_error_code, last_error_at = EXCLUDED.last_error_at`,
    [code, now]
  )
}

/**
 * Create the subscription (or replace ours). RingCentral validates the
 * address during this request, so the receiver must already be deployed.
 */
export async function registerSubscription(db, config, { token, actorId = null, env = process.env, now = new Date(), deps = {} } = {}) {
  const address = webhookAddress(config, env)
  if (!address) throw new EventSubscriptionError('no_address', 'The API has no https address for RingCentral to deliver to', 409)
  const existing = (await db.query(`SELECT subscription_id FROM rc_event_subscription WHERE key = 'ringcentral'`)).rows[0]
  if (existing?.subscription_id) {
    try { await rcSend(config, token, 'DELETE', `/restapi/v1.0/subscription/${encodeURIComponent(existing.subscription_id)}`, undefined, deps) } catch { /* already gone */ }
  }
  // The token is stored (as a digest) before RingCentral is asked, so its very
  // first delivery is already verifiable.
  const verificationToken = crypto.randomBytes(24).toString('base64url')
  await db.query(
    `INSERT INTO rc_event_subscription (key, subscription_id, address, token_digest, status, created_at, created_by)
     VALUES ('ringcentral', NULL, $1, $2, 'Pending', $3, $4)
     ON CONFLICT (key) DO UPDATE SET subscription_id = NULL, address = EXCLUDED.address, token_digest = EXCLUDED.token_digest,
            status = 'Pending', created_at = EXCLUDED.created_at, created_by = EXCLUDED.created_by, expires_at = NULL`,
    [address, digest(verificationToken), now, actorId]
  )
  let sub
  try {
    sub = await rcSend(config, token, 'POST', '/restapi/v1.0/subscription', {
      eventFilters: [EVENT_FILTER],
      deliveryMode: { transportType: 'WebHook', address, verificationToken },
      expiresIn: LIFETIME_SECONDS,
    }, deps)
  } catch (err) {
    const code = codeOf(err)
    await db.query(`UPDATE rc_event_subscription SET status = NULL, token_digest = NULL WHERE key = 'ringcentral'`)
    await recordError(db, code, now)
    if (code === 'missing_permission') throw new EventSubscriptionError(code, 'RingCentral refused: the app needs the Call Control permission. Add it, then connect again.', 409)
    throw new EventSubscriptionError(code, `RingCentral did not create the subscription (${code})`, 502)
  }
  await db.query(
    `UPDATE rc_event_subscription SET subscription_id = $1, status = $2, expires_at = $3, checked_at = $4, last_error_code = NULL, last_error_at = NULL
      WHERE key = 'ringcentral'`,
    [s(sub.id, 200), s(sub.status, 40) || 'Active', when(sub.expirationTime), now]
  )
  return subscriptionStatus(db, config, env)
}

/** Delete our subscription in RingCentral and forget it. */
export async function removeSubscription(db, config, { token, env = process.env, deps = {} } = {}) {
  const row = (await db.query(`SELECT subscription_id FROM rc_event_subscription WHERE key = 'ringcentral'`)).rows[0]
  let removed = false
  if (row?.subscription_id && token) {
    try {
      await rcSend(config, token, 'DELETE', `/restapi/v1.0/subscription/${encodeURIComponent(row.subscription_id)}`, undefined, deps)
      removed = true
    } catch (err) {
      if (!(err instanceof RingCentralApiError) || err.status !== 404) throw err
    }
  }
  await db.query(`DELETE FROM rc_event_subscription WHERE key = 'ringcentral'`)
  return { removed, ...(await subscriptionStatus(db, config, env)) }
}

/**
 * Daily: read the subscription's state from RingCentral and renew it when
 * it is within a month of expiring. Never creates a new one by itself.
 */
export async function checkSubscription(db, config, { token, now = new Date(), deps = {} } = {}) {
  const row = (await db.query(`SELECT subscription_id, expires_at FROM rc_event_subscription WHERE key = 'ringcentral'`)).rows[0]
  if (!row?.subscription_id) return { status: 'none' }
  const path = `/restapi/v1.0/subscription/${encodeURIComponent(row.subscription_id)}`
  try {
    let sub = await rcGet(config, token, path, {}, deps)
    const expires = when(sub.expirationTime)
    if (sub.status === 'Active' && expires && expires.getTime() - now.getTime() < RENEW_WITHIN_MS) {
      sub = await rcSend(config, token, 'POST', `${path}/renew`, undefined, deps)
    }
    await db.query(
      `UPDATE rc_event_subscription SET status = $1, expires_at = $2, checked_at = $3, last_error_code = NULL, last_error_at = NULL WHERE key = 'ringcentral'`,
      [s(sub.status, 40), when(sub.expirationTime), now]
    )
    return { status: sub.status }
  } catch (err) {
    const code = err instanceof RingCentralApiError && err.status === 404 ? 'not_found' : codeOf(err)
    if (code === 'not_found') await db.query(`UPDATE rc_event_subscription SET status = 'Gone', checked_at = $1 WHERE key = 'ringcentral'`, [now])
    await recordError(db, code, now)
    return { status: 'error', code }
  }
}

export async function purgeOldEvents(db, now = new Date()) {
  return (await db.query(`DELETE FROM rc_telephony_events WHERE received_at < $1::timestamptz - make_interval(days => $2)`, [now, RETENTION_DAYS])).rowCount
}

export default {
  EVENT_FILTER, WEBHOOK_PATH, webhookAddress, storeNotification, isTrustedDelivery, loadEvents,
  subscriptionStatus, registerSubscription, removeSubscription, checkSubscription, purgeOldEvents,
}
