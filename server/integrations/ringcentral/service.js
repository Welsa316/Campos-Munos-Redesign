// RingCentral connection lifecycle (docs/ringcentral-oauth.md):
//
//   startAuthorization     an administrator asks to connect: a one-time state
//                          (sent to RingCentral) and a browser-binding nonce
//                          (kept in an httpOnly cookie) are created; only their
//                          SHA-256 digests are stored.
//   completeAuthorization  RingCentral redirects back: the state is consumed
//                          atomically (once, before it expires), must match the
//                          cookie nonce and the administrator who started it,
//                          then the code is exchanged and the tokens are stored
//                          encrypted.
//   getAccessToken         for future API calls: returns a valid access token,
//                          refreshing it (and the rotated refresh token) under a
//                          row lock so two processes never race a refresh.
//   maintainConnection     keeps an idle connection alive: refreshes before the
//                          refresh token itself expires.
//   disconnect             revokes at RingCentral (best effort) and deletes the
//                          stored tokens.
//
// Read-only with respect to RingCentral's account: nothing here changes
// numbers, routing, queues, extensions or greetings. Tokens, codes and the
// client secret never reach logs, audit rows, errors or API responses.
import { createSecretBox, sha256Hex, digestsEqual, randomToken, keyId, SecretBoxError } from '../secretBox.js'
import { buildAuthorizeUrl, createPkcePair, exchangeCode, refreshTokens, revokeToken, RingCentralOAuthError } from './oauth.js'
import { audit } from '../../billing/audit.js'

export const PROVIDER = 'ringcentral'
export const STATE_TTL_MS = 10 * 60 * 1000
// Refresh the access token when it has less than this left.
export const ACCESS_TOKEN_SKEW_MS = 2 * 60 * 1000
// The keep-alive refreshes once the refresh token has less than this left
// (RingCentral's default refresh token lifetime is 7 days).
export const KEEPALIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000
const STATE_RE = /^[A-Za-z0-9_-]{43}$/

/** Every outcome the callback can report, by fixed code (never provider text). */
export const CALLBACK_OUTCOMES = Object.freeze([
  'connected', 'denied', 'invalid_state', 'expired_state', 'session_mismatch',
  'invalid_request', 'exchange_failed', 'not_configured', 'error',
])

export class RingCentralFlowError extends Error {
  constructor(outcome, message, status = 400) {
    super(message || outcome)
    this.name = 'RingCentralFlowError'
    this.outcome = outcome
    this.status = status
  }
}

export class RingCentralNotConnectedError extends Error {
  constructor(reason = 'not_connected') {
    super('RingCentral is not connected')
    this.name = 'RingCentralNotConnectedError'
    this.code = reason
  }
}

const ctx = (field) => `${PROVIDER}:${field}`

function boxFor(config) {
  if (!config?.encryptionKey) throw new RingCentralFlowError('not_configured', 'RingCentral is not configured', 503)
  return createSecretBox(config.encryptionKey)
}

function requireConfigured(config) {
  if (!config?.configured) throw new RingCentralFlowError('not_configured', 'RingCentral is not configured', 503)
}

/** Run fn inside a transaction on one client (a Pool or a Client works). */
async function inTransaction(db, fn) {
  // A pg.Pool hands out a dedicated client; a client (or pool client) is used as is.
  const client = typeof db.totalCount === 'number' ? await db.connect() : null
  const c = client || db
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (err) {
    try { await c.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    client?.release()
  }
}

// --- authorization -------------------------------------------------------------

export async function startAuthorization(db, config, { adminUserId, now = new Date() }) {
  requireConfigured(config)
  if (!adminUserId) throw new RingCentralFlowError('session_mismatch', 'Sign in again', 401)
  const box = boxFor(config)
  const state = randomToken(32)
  const bindingNonce = randomToken(32)
  const pkce = config.usePkce ? createPkcePair() : null
  const expiresAt = new Date(now.getTime() + STATE_TTL_MS)

  // Old attempts are useless after they expire; keep a day for diagnosis.
  await db.query(`DELETE FROM integration_oauth_states WHERE expires_at < $1::timestamptz - INTERVAL '1 day'`, [now])
  await db.query(
    `INSERT INTO integration_oauth_states (provider, state_hash, binding_hash, code_verifier_enc, admin_user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [PROVIDER, sha256Hex(state), sha256Hex(bindingNonce), pkce ? box.seal(pkce.verifier, ctx('code_verifier')) : null, adminUserId, now, expiresAt]
  )
  await audit(db, { actorId: adminUserId, action: 'ringcentral.authorize_started', entityType: 'integration', entityId: PROVIDER, details: { environment: config.environment, pkce: Boolean(pkce) } })
  return {
    authorizeUrl: buildAuthorizeUrl(config, { state, codeChallenge: pkce?.challenge }),
    bindingNonce,
    expiresAt,
  }
}

/**
 * @param {Object} input
 * @param {string} input.state           from the query string
 * @param {string} [input.bindingNonce]  from the httpOnly cookie
 * @param {Object|null} input.account    the signed-in portal account, or null
 * @param {string} [input.code]
 * @param {string} [input.error]         RingCentral's error parameter
 */
export async function completeAuthorization(db, config, { state, bindingNonce, account, code, error }, deps = {}) {
  const now = deps.now ? deps.now() : new Date()
  requireConfigured(config)
  if (typeof state !== 'string' || !STATE_RE.test(state)) throw new RingCentralFlowError('invalid_state')

  // Consumed first, atomically: a replayed or concurrent callback for the
  // same state finds nothing to consume.
  const consumed = (await db.query(
    `UPDATE integration_oauth_states SET consumed_at = $3
      WHERE provider = $1 AND state_hash = $2 AND consumed_at IS NULL
      RETURNING admin_user_id, binding_hash, code_verifier_enc, expires_at`,
    [PROVIDER, sha256Hex(state), now]
  )).rows[0]
  if (!consumed) throw new RingCentralFlowError('invalid_state')

  const fail = async (outcome, details = {}) => {
    await audit(db, { actorId: account?.id ?? null, action: 'ringcentral.authorize_failed', entityType: 'integration', entityId: PROVIDER, details: { outcome, ...details } })
    return new RingCentralFlowError(outcome)
  }

  if (new Date(consumed.expires_at).getTime() <= now.getTime()) throw await fail('expired_state')
  // The browser that finishes must be the browser that started.
  if (typeof bindingNonce !== 'string' || !digestsEqual(sha256Hex(bindingNonce), consumed.binding_hash)) {
    throw await fail('invalid_state', { reason: 'browser_binding' })
  }
  // And so must the administrator, who must still be allowed to do this.
  if (!account || account.disabled || account.id !== consumed.admin_user_id || !account.capabilities?.has('integrations.manage')) {
    throw await fail('session_mismatch')
  }
  if (error) {
    const outcome = error === 'access_denied' ? 'denied' : 'invalid_request'
    throw await fail(outcome, { providerError: /^[a-z_]{1,40}$/.test(String(error)) ? String(error) : 'other' })
  }
  if (typeof code !== 'string' || !code || code.length > 2048) throw await fail('invalid_request')

  const box = boxFor(config)
  let codeVerifier
  if (consumed.code_verifier_enc) {
    try { codeVerifier = box.open(consumed.code_verifier_enc, ctx('code_verifier')) } catch { throw await fail('invalid_state', { reason: 'verifier' }) }
  }

  let tokens
  try {
    tokens = await exchangeCode(config, { code, codeVerifier }, deps)
  } catch (err) {
    if (err instanceof RingCentralOAuthError) throw await fail('exchange_failed', { code: err.code, status: err.status })
    throw err
  }

  // The previous connection's tokens (if any) are replaced; revoke them after.
  const previous = (await db.query('SELECT refresh_token_enc FROM integration_connections WHERE provider = $1', [PROVIDER])).rows[0]
  await saveTokens(db, box, config, tokens, { connectedBy: account.id, now, fresh: true })
  await audit(db, { actorId: account.id, action: 'ringcentral.connected', entityType: 'integration', entityId: PROVIDER, details: { environment: config.environment, ownerId: tokens.ownerId } })

  if (previous?.refresh_token_enc) {
    try {
      await revokeToken(config, { token: box.open(previous.refresh_token_enc, ctx('refresh_token')) }, deps)
    } catch { /* the old session expires on its own; a failed revoke is not the administrator's problem */ }
  }
  return { outcome: 'connected', ownerId: tokens.ownerId }
}

async function saveTokens(db, box, config, tokens, { connectedBy = null, now, fresh = false }) {
  const values = [
    PROVIDER, config.environment,
    box.seal(tokens.accessToken, ctx('access_token')), tokens.accessTokenExpiresAt,
    box.seal(tokens.refreshToken, ctx('refresh_token')), tokens.refreshTokenExpiresAt,
    tokens.tokenType, tokens.scope, tokens.ownerId, tokens.endpointId, now,
  ]
  if (fresh) {
    await db.query(
      `INSERT INTO integration_connections (provider, status, environment, access_token_enc, access_token_expires_at,
              refresh_token_enc, refresh_token_expires_at, token_type, scope, owner_id, endpoint_id, connected_by, connected_at, updated_at)
       VALUES ($1, 'connected', $2, $3, $4, $5, $6, $7, $8, $9, $10, $12, $11, $11)
       ON CONFLICT (provider) DO UPDATE SET status = 'connected', environment = EXCLUDED.environment,
              access_token_enc = EXCLUDED.access_token_enc, access_token_expires_at = EXCLUDED.access_token_expires_at,
              refresh_token_enc = EXCLUDED.refresh_token_enc, refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
              token_type = EXCLUDED.token_type, scope = EXCLUDED.scope, owner_id = EXCLUDED.owner_id, endpoint_id = EXCLUDED.endpoint_id,
              connected_by = EXCLUDED.connected_by, connected_at = EXCLUDED.connected_at, last_refreshed_at = NULL,
              last_error_code = NULL, last_error_at = NULL, updated_at = EXCLUDED.updated_at`,
      [...values, connectedBy]
    )
  } else {
    await db.query(
      `UPDATE integration_connections SET status = 'connected', environment = $2,
              access_token_enc = $3, access_token_expires_at = $4, refresh_token_enc = $5, refresh_token_expires_at = $6,
              token_type = $7, scope = COALESCE($8, scope), owner_id = COALESCE($9, owner_id), endpoint_id = COALESCE($10, endpoint_id),
              last_refreshed_at = $11, last_error_code = NULL, last_error_at = NULL, updated_at = $11
        WHERE provider = $1`,
      values
    )
  }
}

// --- status ----------------------------------------------------------------------

/** What the portal may see. Never a token. */
export async function getConnectionStatus(db, config) {
  const row = (await db.query(
    `SELECT c.status, c.environment, split_part(c.refresh_token_enc, '.', 2) AS token_kid, c.access_token_expires_at, c.refresh_token_expires_at, c.scope, c.owner_id,
            c.connected_at, c.last_refreshed_at, c.last_error_code, c.last_error_at,
            COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1)) AS connected_by_name
       FROM integration_connections c LEFT JOIN admin_users u ON u.id = c.connected_by
      WHERE c.provider = $1`,
    [PROVIDER]
  )).rows[0]
  return {
    provider: PROVIDER,
    configured: Boolean(config?.configured),
    // Names of missing/invalid variables only, never values.
    configProblems: config?.configured ? [] : (config?.problems || []),
    environment: config?.environment ?? null,
    redirectUri: config?.redirectUri || null,
    status: row ? row.status : 'not_connected',
    connection: row ? {
      environment: row.environment,
      environmentMismatch: Boolean(config?.environment && row.environment !== config.environment),
      // Whether this server's key can read the stored tokens (key ids are
      // public fingerprints, not key material).
      encryptionKeyMatches: row.token_kid && config?.encryptionKey ? row.token_kid === keyId(config.encryptionKey) : null,
      ownerId: row.owner_id,
      scope: row.scope,
      connectedAt: row.connected_at,
      connectedBy: row.connected_by_name,
      lastRefreshedAt: row.last_refreshed_at,
      accessTokenExpiresAt: row.access_token_expires_at,
      refreshTokenExpiresAt: row.refresh_token_expires_at,
      lastErrorCode: row.last_error_code,
      lastErrorAt: row.last_error_at,
    } : null,
  }
}

// --- tokens ---------------------------------------------------------------------

const PERMANENT_REFRESH_ERRORS = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client', 'OAU-210', 'OAU-211', 'OAU-213'])

async function noteError(c, code, now) {
  await c.query('UPDATE integration_connections SET last_error_code = $2, last_error_at = $3 WHERE provider = $1', [PROVIDER, code, now])
}

async function markNeedsReauth(c, code, now) {
  await c.query(
    `UPDATE integration_connections SET status = 'needs_reauth', access_token_enc = NULL, access_token_expires_at = NULL,
            refresh_token_enc = NULL, refresh_token_expires_at = NULL, last_error_code = $2, last_error_at = $3, updated_at = $3
      WHERE provider = $1`,
    [PROVIDER, code, now]
  )
}

/**
 * Refresh under a row lock when `shouldRefresh(row)` says so; returns the
 * access token. Shared by getAccessToken (API calls) and maintainConnection.
 */
async function withLockedConnection(db, config, shouldRefresh, deps = {}) {
  requireConfigured(config)
  const now = deps.now ? deps.now() : new Date()
  const box = boxFor(config)
  let reauthCode = null
  let refreshed = false

  const result = await inTransaction(db, async (c) => {
    const row = (await c.query('SELECT * FROM integration_connections WHERE provider = $1 FOR UPDATE', [PROVIDER])).rows[0]
    if (!row) throw new RingCentralNotConnectedError('not_connected')
    if (row.status !== 'connected') throw new RingCentralNotConnectedError('needs_reauth')
    if (row.environment !== config.environment) {
      // Tokens for the sandbox are useless against production and vice versa.
      // Not wiped: this process may simply be misconfigured (a developer
      // machine pointed at the production database); reconnecting replaces them.
      await noteError(c, 'environment_mismatch', now)
      return { unusable: 'environment_mismatch' }
    }

    const open = (field) => box.open(row[`${field}_enc`], ctx(field))
    try {
      if (!shouldRefresh(row, now)) return { accessToken: open('access_token'), expiresAt: row.access_token_expires_at }
      if (row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() <= now.getTime()) {
        await markNeedsReauth(c, 'refresh_token_expired', now)
        reauthCode = 'refresh_token_expired'
        return null
      }
      const tokens = await refreshTokens(config, { refreshToken: open('refresh_token') }, { ...deps, now: () => now })
      await saveTokens(c, box, config, tokens, { now })
      refreshed = true
      return { accessToken: tokens.accessToken, expiresAt: tokens.accessTokenExpiresAt }
    } catch (err) {
      if (err instanceof SecretBoxError) {
        // This process holds a different key than the one that sealed the
        // tokens (the client secret was rotated without a dedicated key, or a
        // misconfigured process). Never wipe: the right process can still read
        // them, and reconnecting replaces them.
        const codeName = err.code === 'key_changed' ? 'encryption_key_mismatch' : 'stored_token_unreadable'
        await noteError(c, codeName, now)
        return { unusable: codeName }
      }
      if (err instanceof RingCentralOAuthError) {
        if (!err.retryable && (PERMANENT_REFRESH_ERRORS.has(err.code) || err.status === 400 || err.status === 401)) {
          await markNeedsReauth(c, err.code, now)
          reauthCode = err.code
          return null
        }
        await noteError(c, err.code, now)
        // Commit the error note, then report it.
        return { transientError: err }
      }
      throw err
    }
  })

  if (reauthCode) {
    await audit(db, { action: 'ringcentral.needs_reauth', entityType: 'integration', entityId: PROVIDER, details: { reason: reauthCode } })
    throw new RingCentralNotConnectedError('needs_reauth')
  }
  if (result?.transientError) throw result.transientError
  if (result?.unusable) throw new RingCentralNotConnectedError(result.unusable)
  if (refreshed) await audit(db, { action: 'ringcentral.token_refreshed', entityType: 'integration', entityId: PROVIDER, details: {} })
  return { ...result, refreshed }
}

/** A valid access token for a RingCentral API call (refreshing if needed). */
export async function getAccessToken(db, config, deps = {}) {
  const { accessToken } = await withLockedConnection(
    db, config,
    (row, now) => !row.access_token_expires_at || new Date(row.access_token_expires_at).getTime() - now.getTime() < ACCESS_TOKEN_SKEW_MS,
    deps
  )
  return accessToken
}

/**
 * Refresh when forced, or when the refresh token is within
 * KEEPALIVE_THRESHOLD_MS of expiring. Returns whether a
 * refresh happened. Never returns a token.
 */
export async function maintainConnection(db, config, { force = false } = {}, deps = {}) {
  const { refreshed } = await withLockedConnection(db, config, (row, now) => {
    if (force) return true
    const t = (v) => (v ? new Date(v).getTime() : 0)
    // An expired access token alone is no reason: the next API call refreshes it.
    return t(row.refresh_token_expires_at) - now.getTime() < KEEPALIVE_THRESHOLD_MS
  }, deps)
  return { refreshed }
}

export async function disconnect(db, config, { actorId }, deps = {}) {
  const row = (await db.query('DELETE FROM integration_connections WHERE provider = $1 RETURNING refresh_token_enc', [PROVIDER])).rows[0]
  await db.query('DELETE FROM integration_oauth_states WHERE provider = $1 AND consumed_at IS NULL', [PROVIDER])
  let revoked = false
  if (row?.refresh_token_enc && config?.configured) {
    try {
      const box = boxFor(config)
      await revokeToken(config, { token: box.open(row.refresh_token_enc, ctx('refresh_token')) }, deps)
      revoked = true
    } catch { /* stored tokens are deleted either way */ }
  }
  await audit(db, { actorId, action: 'ringcentral.disconnected', entityType: 'integration', entityId: PROVIDER, details: { hadConnection: Boolean(row), revoked } })
  return { disconnected: Boolean(row), revoked }
}

export default {
  startAuthorization, completeAuthorization, getConnectionStatus, getAccessToken, maintainConnection, disconnect,
}
