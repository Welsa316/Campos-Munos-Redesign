// Text messages through the firm's RingCentral account: sending, checking
// what happened to one, and reading what people send back. Kept apart from
// the call code (callLog.js, ringout.js); the automation (server/automation/)
// is the only caller.
//
// Checked against RingCentral's API reference and guides (2026-11):
//   send     POST /restapi/v1.0/account/~/extension/~/sms
//            { from: { phoneNumber }, to: [{ phoneNumber }], text }
//            app permission SMS, user permission OutboundSMS; "Medium" rate
//            group (40 requests a minute). A 200 only means RingCentral
//            accepted it: delivery is on the message record.
//   sender   GET  /restapi/v1.0/account/~/extension/~/phone-number
//            a number can send texts only when its `features` include
//            "SmsSender", and only from the extension it is assigned to.
//   record   GET  /restapi/v1.0/account/~/extension/~/message-store/{id}
//            messageStatus Queued | Sent | Delivered | DeliveryFailed |
//            SendingFailed, with deliveryErrorCode when it failed
//            (SMS-…-413: the person opted out).
//   inbound  GET  /restapi/v1.0/account/~/extension/~/message-store
//            ?messageType=SMS&direction=Inbound&dateFrom=…   (ReadMessages)
//            `subject` carries the text.
//
// Having RingOut does not mean texts can be sent: the app needs the SMS
// permission, the signed-in extension needs a number with SmsSender, and in
// the US that number must be on an approved TCR (10DLC) campaign, or
// verified if toll-free (docs/phase1-automation.md, "RingCentral SMS").
//
// The sender is never guessed: RINGCENTRAL_SMS_FROM names it and must be one
// of the numbers RingCentral lists with SmsSender for this extension. When
// it is not set and exactly one such number exists, that one is used; with
// several and none chosen, nothing is sent.
import { rcGet, rcSend, RingCentralApiError } from './api.js'
import { getAccessToken, RingCentralNotConnectedError } from './service.js'
import { phoneDigits, phoneKey } from '../../utils/phone.js'

export const SMS_PATH = '/restapi/v1.0/account/~/extension/~/sms'
export const NUMBERS_PATH = '/restapi/v1.0/account/~/extension/~/phone-number'
export const STORE_PATH = '/restapi/v1.0/account/~/extension/~/message-store'
export const TEXT_MAX = 1000
const CAPABILITY_TTL_MS = 10 * 60 * 1000
const DEFAULT_RETRY_AFTER_MS = 60 * 1000
const INBOUND_PER_PAGE = 100
const INBOUND_MAX_PAGES = 5

const STATE_KEY = 'ringcentral_sms'

// deps.getToken: for tests, in place of the stored connection.
const tokenFor = (db, config, deps) => (deps.getToken ? deps.getToken() : getAccessToken(db, config, deps))

async function readState(db) {
  return (await db.query('SELECT details FROM automation_state WHERE key = $1', [STATE_KEY])).rows[0]?.details || {}
}
async function writeState(db, patch) {
  await db.query(
    `INSERT INTO automation_state (key, details) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET details = automation_state.details || $2::jsonb, updated_at = NOW()`,
    [STATE_KEY, JSON.stringify(patch)]
  )
}

/** Which of the reasons text messages cannot be sent, in words for the health view. */
export const UNAVAILABLE = Object.freeze({
  not_configured: 'RingCentral is not configured on the API service',
  not_connected: 'RingCentral is not connected',
  needs_reauth: 'RingCentral needs to be connected again',
  app_permission_missing: 'The RingCentral app does not have the SMS permission. Add it in the RingCentral Developer Console, then connect again.',
  user_permission_missing: 'The connected RingCentral user is not allowed to send text messages',
  no_sms_number: 'The connected extension has no number RingCentral allows to send text messages (SMS is not enabled or the number is not registered)',
  sender_not_allowed: 'RINGCENTRAL_SMS_FROM is not one of the numbers RingCentral allows this extension to text from',
  sender_ambiguous: 'This extension has several numbers that can text. Set RINGCENTRAL_SMS_FROM to the one to use.',
  check_failed: 'RingCentral could not be asked which numbers can send text messages',
})

function reasonOf(err) {
  if (err instanceof RingCentralNotConnectedError) return err.code === 'needs_reauth' ? 'needs_reauth' : 'not_connected'
  if (err instanceof RingCentralApiError) {
    if (err.code === 'CMN-401') return 'app_permission_missing'
    if (['CMN-408', 'CMN-109', 'CMN-403'].includes(err.code)) return 'user_permission_missing'
  }
  return 'check_failed'
}

/**
 * Whether texts can be sent, and from which number. Asked of RingCentral at
 * most every ten minutes (the answer is kept in automation_state).
 * Returns { available, sender, reason, candidates, checkedAt }.
 */
export async function smsCapability(db, config, { env = process.env, deps = {}, now = new Date(), force = false } = {}) {
  if (!config?.configured) return { available: false, sender: null, reason: 'not_configured', candidates: [], checkedAt: null }
  const wanted = String(env.RINGCENTRAL_SMS_FROM ?? '').trim()
  const cached = await readState(db)
  if (!force && cached.checkedAt && cached.wanted === wanted && now.getTime() - new Date(cached.checkedAt).getTime() < CAPABILITY_TTL_MS) {
    return { available: Boolean(cached.available), sender: cached.sender || null, reason: cached.reason || null, candidates: cached.candidates || [], checkedAt: cached.checkedAt }
  }
  let out
  try {
    const token = await tokenFor(db, config, deps)
    const res = await rcGet(config, token, NUMBERS_PATH, { perPage: 100 }, deps)
    const candidates = (res.records || [])
      .filter((n) => Array.isArray(n.features) && n.features.includes('SmsSender') && phoneDigits(n.phoneNumber))
      .map((n) => `+${phoneDigits(n.phoneNumber)}`)
    let sender = null
    let reason = null
    if (!candidates.length) reason = 'no_sms_number'
    else if (wanted) {
      const want = phoneDigits(wanted)
      sender = candidates.find((c) => c === `+${want}`) || null
      if (!sender) reason = 'sender_not_allowed'
    } else if (candidates.length === 1) sender = candidates[0]
    else reason = 'sender_ambiguous'
    out = { available: Boolean(sender), sender, reason, candidates }
  } catch (err) {
    out = { available: false, sender: null, reason: reasonOf(err), candidates: [], errorCode: err?.code || null }
  }
  const checkedAt = now.toISOString()
  await writeState(db, { ...out, wanted, checkedAt })
  return { ...out, checkedAt }
}

/** Until when RingCentral asked us to stop sending (a 429), or null. */
export async function smsBackoffUntil(db, now = new Date()) {
  const until = (await readState(db)).backoffUntil
  return until && new Date(until).getTime() > now.getTime() ? new Date(until) : null
}

/**
 * Send one text. Never throws. Answers
 *   { ok: true, id, status }                      RingCentral accepted it
 *   { ok: false, outcome: 'failed', code, retryable, retryAfterMs }
 *                                                 definitely not sent
 *   { ok: false, outcome: 'unknown', code }       it may have gone out (a
 *                                                 timeout, a 5xx): never
 *                                                 sent again automatically
 */
export async function sendSms(db, config, { from, to, text }, { deps = {}, now = new Date() } = {}) {
  const dest = phoneDigits(to)
  const src = phoneDigits(from)
  const body = String(text ?? '')
  if (!dest || !src) return { ok: false, outcome: 'failed', code: 'invalid_number', retryable: false }
  if (!body.trim() || body.length > TEXT_MAX) return { ok: false, outcome: 'failed', code: 'invalid_text', retryable: false }
  let token
  try {
    token = await tokenFor(db, config, deps)
  } catch (err) {
    // Nothing was sent: the token could not be had.
    return { ok: false, outcome: 'failed', code: reasonOf(err) === 'check_failed' ? (err?.code || 'token_error') : reasonOf(err), retryable: !(err instanceof RingCentralNotConnectedError) }
  }
  try {
    const res = await rcSend(config, token, 'POST', SMS_PATH, { from: { phoneNumber: `+${src}` }, to: [{ phoneNumber: `+${dest}` }], text: body }, deps)
    const status = res?.messageStatus || res?.to?.[0]?.messageStatus || null
    if (status === 'SendingFailed' || status === 'DeliveryFailed') {
      return { ok: false, outcome: 'failed', code: safeDeliveryCode(res?.deliveryErrorCode) || status, retryable: false, id: res?.id != null ? String(res.id) : null }
    }
    if (res?.id == null) return { ok: false, outcome: 'unknown', code: 'no_message_id' }
    return { ok: true, id: String(res.id), status }
  } catch (err) {
    if (!(err instanceof RingCentralApiError)) return { ok: false, outcome: 'unknown', code: 'exception' }
    if (err.status === 429) {
      const wait = err.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS
      // A request during the penalty restarts it, so everything waits.
      await writeState(db, { backoffUntil: new Date(now.getTime() + wait).toISOString() }).catch(() => {})
      return { ok: false, outcome: 'failed', code: err.code, retryable: true, retryAfterMs: wait }
    }
    // No answer, or a server error: RingCentral may have taken it.
    if (err.status == null || err.status >= 500) return { ok: false, outcome: 'unknown', code: err.code }
    return { ok: false, outcome: 'failed', code: err.code, retryable: false }
  }
}

const safeDeliveryCode = (v) => (typeof v === 'string' && /^SMS-[A-Z]{2,4}-\d{2,4}$/.test(v) ? v : null)

/** What a delivery error means for the address: 'opt_out', 'invalid', or null. */
export function deliveryErrorKind(code) {
  if (!code) return null
  if (/-413$/.test(code)) return 'opt_out'
  if (/^SMS-(RC|UP)-410$/.test(code) || code === 'SMS-CAR-411') return 'invalid'
  return null
}

/** The record of a message we sent: { status, deliveryErrorCode }, or null when it cannot be read. */
export async function smsDelivery(db, config, messageId, { deps = {} } = {}) {
  if (!/^\d{1,25}$/.test(String(messageId))) return null
  try {
    const token = await tokenFor(db, config, deps)
    const res = await rcGet(config, token, `${STORE_PATH}/${messageId}`, {}, deps)
    return { status: res?.messageStatus || res?.to?.[0]?.messageStatus || null, deliveryErrorCode: safeDeliveryCode(res?.deliveryErrorCode) }
  } catch {
    return null
  }
}

/**
 * Texts people sent to this extension since `dateFrom`, oldest first:
 * [{ id, fromKey, text, at }]. `text` is for the caller to classify and
 * drop; it is not stored. Throws RingCentralApiError / NotConnected.
 */
export async function listInboundSms(db, config, { dateFrom, deps = {} } = {}) {
  const token = await tokenFor(db, config, deps)
  const out = []
  for (let page = 1; page <= INBOUND_MAX_PAGES; page++) {
    const res = await rcGet(config, token, STORE_PATH, {
      messageType: 'SMS', direction: 'Inbound', dateFrom: new Date(dateFrom).toISOString(), perPage: INBOUND_PER_PAGE, page,
    }, deps)
    for (const m of res.records || []) {
      if (m?.id == null || m.direction !== 'Inbound' || (m.type && m.type !== 'SMS')) continue
      const fromKey = phoneKey(m.from?.phoneNumber)
      const at = m.creationTime ? new Date(m.creationTime) : null
      if (!fromKey || !at || Number.isNaN(at.getTime())) continue
      out.push({ id: String(m.id), fromKey, text: typeof m.subject === 'string' ? m.subject : '', at })
    }
    const pages = Number(res.paging?.totalPages) || 1
    if (page >= pages) break
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The provider the automation uses; tests pass a fake with the same four functions. */
export function createRingCentralSms(db, config, { env = process.env, deps = {} } = {}) {
  return {
    capability: (opts = {}) => smsCapability(db, config, { env, deps, ...opts }),
    backoffUntil: (now) => smsBackoffUntil(db, now),
    send: (msg, opts = {}) => sendSms(db, config, msg, { deps, ...opts }),
    delivery: (id) => smsDelivery(db, config, id, { deps }),
    inbound: (opts) => listInboundSms(db, config, { ...opts, deps }),
  }
}

export default { smsCapability, sendSms, smsDelivery, listInboundSms, createRingCentralSms, deliveryErrorKind, UNAVAILABLE }
