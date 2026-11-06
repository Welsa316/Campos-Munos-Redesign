// Call a client from the portal with RingCentral RingOut
// (docs/ringcentral-call-log.md, "Calling from the portal").
//
// RingOut is a two-leg call placed through the firm's RingCentral connection:
// RingCentral first rings the staff member's own phone (the "ring me at"
// number each person saves; their RingCentral direct number rings their
// RingCentral app and desk phone), and once they answer it dials the client.
// The client sees the connected extension's caller ID, or
// RINGCENTRAL_RINGOUT_CALLER_ID when set.
//
//   POST   /restapi/v1.0/account/~/extension/~/ring-out        { from, to, playPrompt }
//   GET    /restapi/v1.0/account/~/extension/~/ring-out/{id}   status
//   DELETE /restapi/v1.0/account/~/extension/~/ring-out/{id}   cancel
// Needs the RingOut permission on the RingCentral app. Status values (call,
// caller, callee): InProgress, Success, Busy, NoAnswer, Rejected,
// GenericError, Finished, InternationalDisabled, DestinationBlocked,
// NotEnoughFunds, NoSuchUser, Invalid.
import { getAccessToken, maintainConnection, RingCentralNotConnectedError } from './service.js'
import { rcGet, rcSend, RingCentralApiError } from './api.js'
import { audit } from '../../billing/audit.js'
import { phoneDigits, isPremiumNumber, parseCountryCodes, inCountries } from '../../utils/phone.js'

const PATH = '/restapi/v1.0/account/~/extension/~/ring-out'

export class RingOutError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'RingOutError'
    this.code = code
    this.status = status
  }
}

/**
 * A number someone may be called on, as E.164, or null. North American
 * numbers may be typed without the country code; any other needs its '+'.
 * Refused: anything shorter than a full number (911, 411, short codes),
 * invalid North American area codes (0xx, 1xx), premium-rate and satellite
 * ranges (utils/phone.js), and non-numbers.
 */
export function normalizeDialNumber(raw) {
  const digits = phoneDigits(raw, { requirePlus: true })
  if (!digits || isPremiumNumber(digits)) return null
  return `+${digits}`
}

// RINGOUT_DAILY_LIMIT: calls one person may place in 24 hours (default 100).
export const DEFAULT_DAILY_LIMIT = 100
const dailyLimit = (env) => {
  const n = Number.parseInt(env.RINGOUT_DAILY_LIMIT, 10)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT
}

/**
 * Whether the firm calls this country from the portal.
 * RINGOUT_ALLOWED_COUNTRY_CODES: calling codes, comma-separated ("1,52,502");
 * unset or empty means every country. Applies to both legs, since RingCentral
 * dials the staff member's phone too.
 */
function assertCountryAllowed(e164, env, whose) {
  if (inCountries(e164.slice(1), parseCountryCodes(env.RINGOUT_ALLOWED_COUNTRY_CODES))) return
  throw new RingOutError('country_not_allowed', whose === 'you'
    ? 'Your phone is in a country the portal does not call. Ask the administrator.'
    : 'Calls to this country are not enabled for the portal. Ask the administrator.', 422)
}

const FAILED = new Set(['Busy', 'NoAnswer', 'Rejected', 'GenericError', 'InternationalDisabled', 'DestinationBlocked', 'NotEnoughFunds', 'NoSuchUser', 'Invalid'])

/**
 * RingCentral's three statuses → what the person sees:
 *   ringing_you | calling_client | connected | finished | failed (+ who, reason)
 */
export function ringOutPhase(status = {}) {
  const { callStatus, callerStatus, calleeStatus } = status || {}
  if (FAILED.has(callerStatus)) return { phase: 'failed', who: 'you', reason: callerStatus }
  if (FAILED.has(calleeStatus)) return { phase: 'failed', who: 'client', reason: calleeStatus }
  if (FAILED.has(callStatus)) return { phase: 'failed', who: null, reason: callStatus }
  if (callStatus === 'Success' || calleeStatus === 'Success') return { phase: 'connected' }
  if ([callStatus, callerStatus, calleeStatus].includes('Finished')) return { phase: 'finished' }
  if (callerStatus === 'Success') return { phase: 'calling_client' }
  return { phase: 'ringing_you' }
}

// One forced token refresh if RingCentral says the token stopped working.
async function withToken(db, config, deps, fn) {
  let token = await getAccessToken(db, config, deps)
  try {
    return await fn(token)
  } catch (err) {
    if (!(err instanceof RingCentralApiError) || err.status !== 401) throw err
    await maintainConnection(db, config, { force: true }, deps)
    token = await getAccessToken(db, config, deps)
    return fn(token)
  }
}

function translate(err) {
  if (err instanceof RingOutError) return err
  if (err instanceof RingCentralNotConnectedError) {
    const why = {
      needs_reauth: 'RingCentral needs to be connected again (Integrations).',
      environment_mismatch: 'The saved RingCentral connection is for a different RingCentral environment than the server uses. Connect again (Integrations).',
      encryption_key_mismatch: 'The server cannot read the saved RingCentral connection. Connect again (Integrations).',
    }[err.code] || 'RingCentral is not connected.'
    return new RingOutError(err.code || 'not_connected', why, 409)
  }
  if (err instanceof RingCentralApiError) {
    if (err.status === 403) return new RingOutError('missing_permission', 'RingCentral did not allow placing calls. Add the RingOut permission to the RingCentral app, then connect again.', 409)
    if (err.status === 429) return new RingOutError('rate_limited', 'RingCentral asked us to slow down. Try again in a minute.', 429)
    if (err.status === 400) return new RingOutError('rejected', 'RingCentral could not place this call. Check both numbers.', 422)
    return new RingOutError(err.code || 'error', 'RingCentral did not answer. Try again.', 502)
  }
  return err
}

const last4 = (n) => String(n || '').slice(-4)

export async function getMyPhone(db, accountId) {
  return (await db.query('SELECT ringout_phone FROM admin_users WHERE id = $1', [accountId])).rows[0]?.ringout_phone || null
}

export async function setMyPhone(db, accountId, raw, env = process.env) {
  const phone = raw == null || raw === '' ? null : normalizeDialNumber(raw)
  if (raw && !phone) throw new RingOutError('invalid_number', 'Enter a full phone number, e.g. (504) 555-0101')
  if (phone) assertCountryAllowed(phone, env, 'you')
  await db.query('UPDATE admin_users SET ringout_phone = $2 WHERE id = $1', [accountId, phone])
  return phone
}

// Calls being placed right now, by account and number: a double click
// arriving before the first request has an answer waits for it instead of
// placing a second call. (One API process; the 30-second check below covers
// clicks after the first answer.)
const placing = new Map()

export async function placeRingOut(db, config, opts, deps = {}) {
  const key = `${opts.accountId}:${normalizeDialNumber(opts.to) || String(opts.to)}`
  const already = placing.get(key)
  if (already) return { ...(await already), repeated: true }
  const attempt = placeOnce(db, config, opts, deps)
  placing.set(key, attempt)
  try {
    return await attempt
  } finally {
    placing.delete(key)
  }
}

async function placeOnce(db, config, { accountId, to: rawTo, env = process.env }, deps = {}) {
  const to = normalizeDialNumber(rawTo)
  if (!to) throw new RingOutError('invalid_number', 'That is not a number we can call. Use a full number, e.g. (504) 555-0101.')
  const from = await getMyPhone(db, accountId)
  if (!from) throw new RingOutError('no_phone', 'Save the phone that should ring for you first.', 409)
  if (from === to) throw new RingOutError('same_number', 'The number to call is your own phone.')
  assertCountryAllowed(to, env, 'client')
  assertCountryAllowed(from, env, 'you')
  const placed = (await db.query(
    `SELECT COUNT(*)::int AS n FROM rc_ringouts WHERE placed_by = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [accountId]
  )).rows[0].n
  if (placed >= dailyLimit(env)) {
    throw new RingOutError('daily_limit', 'You have placed the most calls allowed from the portal in 24 hours. Use your phone, or ask the administrator.', 429)
  }
  // A second click while the first call is still ringing you is the same call.
  const ringing = (await db.query(
    `SELECT id, to_number, phase FROM rc_ringouts
      WHERE placed_by = $1 AND to_number = $2 AND phase IN ('ringing_you', 'calling_client')
        AND created_at > NOW() - INTERVAL '30 seconds'
      ORDER BY id DESC LIMIT 1`,
    [accountId, to]
  )).rows[0]
  if (ringing) return { id: Number(ringing.id), to: ringing.to_number, phase: ringing.phase, repeated: true }
  const callerId = normalizeDialNumber(env.RINGCENTRAL_RINGOUT_CALLER_ID)

  let res
  try {
    res = await withToken(db, config, deps, (token) => rcSend(config, token, 'POST', PATH, {
      from: { phoneNumber: from },
      to: { phoneNumber: to },
      ...(callerId ? { callerId: { phoneNumber: callerId } } : {}),
      // No "press 1 to connect" prompt: answering connects the client.
      playPrompt: false,
    }, deps))
  } catch (err) {
    const e = translate(err)
    await audit(db, { actorId: accountId, action: 'calls.ringout_failed', entityType: 'ringout', details: { code: e.code, toLast4: last4(to) } })
    throw e
  }
  const id = String(res?.id ?? '')
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new RingOutError('error', 'RingCentral did not confirm the call.', 502)
  const view = ringOutPhase(res.status)
  const row = (await db.query(
    `INSERT INTO rc_ringouts (rc_ringout_id, placed_by, to_number, from_number, phase, rc_status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [id, accountId, to, from, view.phase, JSON.stringify({ ...(res.status || {}), reason: view.reason })]
  )).rows[0]
  await audit(db, { actorId: accountId, action: 'calls.ringout_placed', entityType: 'ringout', entityId: row.id, details: { toLast4: last4(to) } })
  return { id: Number(row.id), to, ...view }
}

async function ownRow(db, id, accountId) {
  const row = (await db.query('SELECT * FROM rc_ringouts WHERE id = $1 AND placed_by = $2', [id, accountId])).rows[0]
  if (!row) throw new RingOutError('not_found', 'Call not found', 404)
  return row
}

export async function ringOutStatus(db, config, { id, accountId }, deps = {}) {
  const row = await ownRow(db, id, accountId)
  if (['failed', 'finished', 'cancelled'].includes(row.phase)) return { id: Number(row.id), to: row.to_number, phase: row.phase, ...(row.rc_status?.reason ? { reason: row.rc_status.reason } : {}) }
  let view
  try {
    const res = await withToken(db, config, deps, (token) => rcGet(config, token, `${PATH}/${encodeURIComponent(row.rc_ringout_id)}`, {}, deps))
    view = ringOutPhase(res.status)
    await db.query('UPDATE rc_ringouts SET phase = $2, rc_status = $3, updated_at = NOW() WHERE id = $1', [row.id, view.phase, JSON.stringify({ ...(res.status || {}), reason: view.reason })])
  } catch (err) {
    // RingCentral forgets a RingOut shortly after it ends.
    if (err instanceof RingCentralApiError && err.status === 404) {
      const phase = row.phase === 'connected' || row.phase === 'calling_client' ? 'finished' : row.phase
      await db.query('UPDATE rc_ringouts SET phase = $2, updated_at = NOW() WHERE id = $1', [row.id, phase])
      return { id: Number(row.id), to: row.to_number, phase }
    }
    throw translate(err)
  }
  return { id: Number(row.id), to: row.to_number, ...view }
}

export async function cancelRingOut(db, config, { id, accountId }, deps = {}) {
  const row = await ownRow(db, id, accountId)
  try {
    await withToken(db, config, deps, (token) => rcSend(config, token, 'DELETE', `${PATH}/${encodeURIComponent(row.rc_ringout_id)}`, undefined, deps))
  } catch (err) {
    if (!(err instanceof RingCentralApiError && err.status === 404)) throw translate(err)
  }
  await db.query(`UPDATE rc_ringouts SET phase = 'cancelled', updated_at = NOW() WHERE id = $1`, [row.id])
  await audit(db, { actorId: accountId, action: 'calls.ringout_cancelled', entityType: 'ringout', entityId: row.id, details: {} })
  return { id: Number(row.id), to: row.to_number, phase: 'cancelled' }
}

export default { normalizeDialNumber, ringOutPhase, placeRingOut, ringOutStatus, cancelRingOut, getMyPhone, setMyPhone }
