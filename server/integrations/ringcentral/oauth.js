// RingCentral OAuth 2.0 Authorization Code flow: the HTTP calls only.
// State, storage and session checks live in service.js.
//
// References (RingCentral developer guide, "Authorization code flow"):
//   GET  {server}/restapi/oauth/authorize?response_type=code&client_id&redirect_uri&state
//   POST {server}/restapi/oauth/token    grant_type=authorization_code | refresh_token
//        HTTP Basic auth with client_id:client_secret, form-encoded body
//   POST {server}/restapi/oauth/revoke   token=<token>, Basic auth
// Token responses carry access_token, expires_in, refresh_token,
// refresh_token_expires_in, scope, owner_id, endpoint_id. Refresh tokens are
// rotated on every refresh: the new one replaces the old one.
//
// Every call goes through an injected fetch so tests never reach RingCentral.
// Errors never carry tokens, codes or the client secret.
import crypto from 'crypto'

const TIMEOUT_MS = 15_000

export class RingCentralOAuthError extends Error {
  /**
   * @param {string} code      RingCentral's `error` (invalid_grant, ...) or ours
   * @param {Object} [opts]    status, retryable
   */
  constructor(code, { status = null, retryable = false, message } = {}) {
    super(message || code)
    this.name = 'RingCentralOAuthError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

/** PKCE S256 pair (RFC 7636). */
export function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildAuthorizeUrl(config, { state, codeChallenge } = {}) {
  if (!state) throw new Error('state is required')
  const u = new URL(`${config.serverUrl}/restapi/oauth/authorize`)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', config.clientId)
  u.searchParams.set('redirect_uri', config.redirectUri)
  u.searchParams.set('state', state)
  if (codeChallenge) {
    u.searchParams.set('code_challenge', codeChallenge)
    u.searchParams.set('code_challenge_method', 'S256')
  }
  return u.toString()
}

const basicAuth = (config) => `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`

async function postForm(config, path, params, { fetchImpl = globalThis.fetch } = {}) {
  let res
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined
    res = await fetchImpl(`${config.serverUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(config),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
      signal,
    })
  } catch {
    throw new RingCentralOAuthError('network_error', { retryable: true, message: 'Could not reach RingCentral' })
  }
  const text = await res.text().catch(() => '')
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (res.status >= 200 && res.status < 300) return body ?? {}

  // Only RingCentral's error code is kept. error_description can echo request
  // values, so it is reduced to a fixed, short form.
  const code = typeof body?.error === 'string' && /^[a-z_]{1,64}$/i.test(body.error) ? body.error
    : typeof body?.errorCode === 'string' && /^[A-Za-z0-9-]{1,32}$/.test(body.errorCode) ? body.errorCode
    : `http_${res.status}`
  throw new RingCentralOAuthError(code, {
    status: res.status,
    retryable: res.status === 429 || res.status >= 500,
    message: `RingCentral refused the request (${res.status} ${code})`,
  })
}

function normalizeTokenResponse(body, now = Date.now()) {
  const accessToken = typeof body?.access_token === 'string' ? body.access_token : ''
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : ''
  if (!accessToken || !refreshToken) {
    throw new RingCentralOAuthError('invalid_token_response', { message: 'RingCentral returned no access or refresh token' })
  }
  const secs = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback)
  return {
    accessToken,
    refreshToken,
    tokenType: typeof body.token_type === 'string' ? body.token_type : 'bearer',
    // Defaults are RingCentral's documented lifetimes (1 hour, 7 days).
    accessTokenExpiresAt: new Date(now + secs(body.expires_in, 3600) * 1000),
    refreshTokenExpiresAt: new Date(now + secs(body.refresh_token_expires_in, 604800) * 1000),
    scope: typeof body.scope === 'string' ? body.scope.slice(0, 2000) : null,
    ownerId: body.owner_id != null ? String(body.owner_id).slice(0, 64) : null,
    endpointId: body.endpoint_id != null ? String(body.endpoint_id).slice(0, 128) : null,
  }
}

export async function exchangeCode(config, { code, codeVerifier }, deps = {}) {
  const params = { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }
  if (codeVerifier) params.code_verifier = codeVerifier
  const body = await postForm(config, '/restapi/oauth/token', params, deps)
  return normalizeTokenResponse(body, deps.now ? deps.now().getTime() : Date.now())
}

export async function refreshTokens(config, { refreshToken }, deps = {}) {
  const body = await postForm(config, '/restapi/oauth/token', { grant_type: 'refresh_token', refresh_token: refreshToken }, deps)
  return normalizeTokenResponse(body, deps.now ? deps.now().getTime() : Date.now())
}

export async function revokeToken(config, { token }, deps = {}) {
  await postForm(config, '/restapi/oauth/revoke', { token }, deps)
}
