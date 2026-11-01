// RingCentral OAuth configuration, read from the API service's environment
// (Railway → API service → Variables). Nothing here is ever sent to the
// portal or the public site: the client secret and the token encryption key
// stay on the server.
//
// Required:
//   RINGCENTRAL_CLIENT_ID       app's client ID (RingCentral Developer Console)
//   RINGCENTRAL_CLIENT_SECRET   app's client secret
//   RINGCENTRAL_SERVER_URL      https://platform.ringcentral.com, or the sandbox
//                               https://platform.devtest.ringcentral.com
//   RINGCENTRAL_REDIRECT_URI    exactly the redirect URI registered on the app:
//                               https://api.camulaw.com/api/integrations/ringcentral/callback
// Optional:
//   RINGCENTRAL_TOKEN_ENCRYPTION_KEY  32 bytes (64 hex chars or base64) dedicated to
//                               encrypting stored tokens. Unset: a key is derived
//                               from RINGCENTRAL_CLIENT_SECRET with HKDF, so
//                               rotating the client secret means reconnecting once.
//   RINGCENTRAL_USE_PKCE        'true' adds a PKCE S256 challenge (off by default)
//   ADMIN_APP_URL               where the administrator lands after authorising
//                               (default https://admin.camulaw.com)
import { parseKey, deriveKey } from '../secretBox.js'

export const DEFAULT_SERVER_URL = 'https://platform.ringcentral.com'
export const DEFAULT_ADMIN_APP_URL = 'https://admin.camulaw.com'
export const CALLBACK_PATH = '/api/integrations/ringcentral/callback'
export const EXPECTED_PRODUCTION_REDIRECT_URI = `https://api.camulaw.com${CALLBACK_PATH}`

// The client secret is sent to this host, so it must be RingCentral's.
export const ALLOWED_SERVER_URLS = Object.freeze([
  'https://platform.ringcentral.com',
  'https://platform.devtest.ringcentral.com',
])

const trimSlash = (s) => String(s).replace(/\/+$/, '')
const isLocalHttp = (u) => u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)

/**
 * @returns {{ configured: boolean, problems: string[], clientId, clientSecret, redirectUri, serverUrl,
 *             adminAppUrl, encryptionKey, keySource, usePkce: boolean, environment: 'production'|'sandbox' }}
 */
export function loadRingCentralConfig(env = process.env) {
  const problems = []
  const isProduction = env.NODE_ENV === 'production'
  const clientId = String(env.RINGCENTRAL_CLIENT_ID ?? '').trim()
  const clientSecret = String(env.RINGCENTRAL_CLIENT_SECRET ?? '').trim()
  if (!clientId) problems.push('RINGCENTRAL_CLIENT_ID is not set')
  if (!clientSecret) problems.push('RINGCENTRAL_CLIENT_SECRET is not set')

  const rawServer = String(env.RINGCENTRAL_SERVER_URL ?? '').trim()
  const serverUrl = trimSlash(rawServer || DEFAULT_SERVER_URL)
  if (!ALLOWED_SERVER_URLS.includes(serverUrl)) problems.push(`RINGCENTRAL_SERVER_URL must be one of ${ALLOWED_SERVER_URLS.join(', ')}`)

  const redirectUri = String(env.RINGCENTRAL_REDIRECT_URI ?? '').trim()
  if (!redirectUri) {
    problems.push('RINGCENTRAL_REDIRECT_URI is not set')
  } else {
    try {
      const u = new URL(redirectUri)
      if (u.protocol !== 'https:' && !(isLocalHttp(u) && !isProduction)) problems.push('RINGCENTRAL_REDIRECT_URI must use https')
      if (u.pathname !== CALLBACK_PATH) problems.push(`RINGCENTRAL_REDIRECT_URI must end in ${CALLBACK_PATH}`)
      if (u.search || u.hash) problems.push('RINGCENTRAL_REDIRECT_URI must not carry a query or fragment')
    } catch {
      problems.push('RINGCENTRAL_REDIRECT_URI is not a valid URL')
    }
  }

  const adminAppUrl = trimSlash(String(env.ADMIN_APP_URL ?? '').trim() || DEFAULT_ADMIN_APP_URL)
  try {
    const u = new URL(adminAppUrl)
    if (u.protocol !== 'https:' && !(isLocalHttp(u) && !isProduction)) problems.push('ADMIN_APP_URL must use https')
    if (u.search || u.hash) problems.push('ADMIN_APP_URL must not carry a query or fragment')
  } catch {
    problems.push('ADMIN_APP_URL is not a valid URL')
  }

  let encryptionKey = null
  let keySource = null
  const rawKey = String(env.RINGCENTRAL_TOKEN_ENCRYPTION_KEY ?? '').trim()
  if (rawKey) {
    encryptionKey = parseKey(rawKey)
    keySource = 'dedicated'
    if (!encryptionKey) problems.push('RINGCENTRAL_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)')
  } else if (clientSecret) {
    encryptionKey = deriveKey(clientSecret, 'ringcentral-token-encryption')
    keySource = 'derived_from_client_secret'
  }

  return {
    configured: problems.length === 0,
    problems,
    clientId,
    clientSecret,
    redirectUri,
    serverUrl,
    adminAppUrl,
    encryptionKey,
    keySource,
    usePkce: String(env.RINGCENTRAL_USE_PKCE ?? '').trim().toLowerCase() === 'true',
    environment: serverUrl.includes('devtest') ? 'sandbox' : 'production',
  }
}

export default loadRingCentralConfig
