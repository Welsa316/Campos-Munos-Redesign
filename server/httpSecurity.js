// Cross-origin rules for the API once it lives on its own host.
//
// Three kinds of caller:
//   - the staff portal (admin.camulaw.com): cookie session, credentialed CORS
//   - the public website (camulaw.com): contact form + chat, never a cookie
//   - Meta's webhook and server-to-server calls: no browser, no CORS
//
// The session cookie is SameSite=Lax and host-only on the API. camulaw.com and
// admin.camulaw.com are the same *site* as api.camulaw.com, so Lax alone does
// not stop a script on the public site from sending a request with the staff
// cookie attached. Two rules close that:
//   1. Only portal origins get Access-Control-Allow-Credentials, so no other
//      page can read a credentialed response.
//   2. Any state-changing request that carries the session cookie (or that
//      logs in) must come from a portal origin, or from this same host in the
//      transitional single-service deployment. That stops a cross-origin
//      "fire and forget" POST, which CORS alone cannot.
import net from 'net'
import { safeEqual } from './utils/whatsapp.js'

export const CLIENT_IP_HEADER = 'x-cm-client-ip'
export const PROXY_SECRET_HEADER = 'x-cm-proxy-secret'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

/**
 * Resolve the origin lists from env.
 *   ADMIN_ORIGINS  — credentialed (portal). FRONTEND_URL is folded in, which
 *                    keeps the current single-origin configuration working.
 *   PUBLIC_ORIGINS — website origins, CORS without credentials.
 * In development with nothing configured, any origin is allowed with
 * credentials, as before.
 */
export function resolveOrigins(env = process.env) {
  const pub = parseOrigins(env.PUBLIC_ORIGINS)
  const wanted = [...new Set([...parseOrigins(env.ADMIN_ORIGINS), ...parseOrigins(env.FRONTEND_URL)])]
  // An origin listed as public is never credentialed, whatever else says so.
  // The likeliest way to get this wrong is copying the old service's
  // FRONTEND_URL (https://camulaw.com) onto the standalone API, which would
  // hand every script on the public site the staff session.
  const conflicts = wanted.filter((o) => pub.includes(o))
  const admin = wanted.filter((o) => !pub.includes(o))
  const isProduction = env.NODE_ENV === 'production'
  const openDev = !isProduction && admin.length === 0 && pub.length === 0
  return { admin, public: pub, openDev, conflicts }
}

/** Options delegate for the `cors` package. */
export function corsOptionsDelegate(origins) {
  return (req, callback) => {
    const origin = (req.header('Origin') || '').replace(/\/+$/, '')
    if (origins.openDev) return callback(null, { origin: true, credentials: true })
    if (origin && origins.admin.includes(origin)) return callback(null, { origin: true, credentials: true })
    if (origin && origins.public.includes(origin)) return callback(null, { origin: true, credentials: false })
    return callback(null, { origin: false })
  }
}

function hostOf(origin) {
  try { return new URL(origin).host.toLowerCase() } catch { return null }
}

/**
 * Reject state-changing, cookie-authenticated requests from untrusted origins.
 * Requests without the session cookie (the public contact form, chat, Meta)
 * are not this middleware's business and pass straight through.
 */
export function requireTrustedOrigin(origins, { cookieName = 'token' } = {}) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()
    // Express matches routes case-insensitively, so /api/AUTH/login reaches
    // the login route too; compare lowercased or the check is bypassable.
    const isAuthEndpoint = `${req.baseUrl}${req.path}`.toLowerCase().startsWith('/api/auth/')
    const hasSession = Boolean(req.cookies?.[cookieName])
    if (!hasSession && !isAuthEndpoint) return next()

    const origin = (req.get('origin') || '').replace(/\/+$/, '')
    if (!origin) {
      // Browsers always send Origin on cross-origin writes. A missing one is a
      // same-origin request from an old browser or a non-browser client, unless
      // Fetch Metadata says otherwise.
      if (req.get('sec-fetch-site') === 'cross-site') return deny(req, res)
      return next()
    }
    if (origins.openDev) return next()
    if (origins.admin.includes(origin)) return next()

    // Transitional single-service deployment: the portal is served from the
    // same host as the API (camulaw.com/admin → camulaw.com/api).
    const originHost = hostOf(origin)
    const ownHost = (req.get('host') || '').toLowerCase()
    if (originHost && originHost === ownHost) return next()
    // Same, but arriving through the website's cutover proxy.
    if (req.viaSiteProxy && originHost && originHost === String(req.get('x-forwarded-host') || '').toLowerCase()) {
      return next()
    }
    return deny(req, res)
  }
}

function deny(req, res) {
  req.log?.warn({ origin: req.get('origin') || null, path: req.path }, 'Cross-origin write refused')
  return res.status(403).json({ error: 'Origin not allowed' })
}

/**
 * The website's cutover proxy forwards the visitor's IP in X-CM-Client-IP,
 * authenticated by a shared secret. Without a valid secret the header is
 * ignored: anyone can send it.
 */
export function resolveClientIp(env = process.env) {
  const secret = env.SITE_PROXY_SECRET || ''
  return (req, _res, next) => {
    req.clientIp = req.ip
    req.viaSiteProxy = false
    const provided = req.get(PROXY_SECRET_HEADER)
    if (secret && provided && safeEqual(provided, secret)) {
      const forwarded = String(req.get(CLIENT_IP_HEADER) || '').trim()
      req.viaSiteProxy = true
      if (net.isIP(forwarded)) req.clientIp = forwarded
    }
    next()
  }
}

/** keyGenerator for express-rate-limit. */
export const clientKey = (req) => req.clientIp || req.ip

/** Cookie options for the staff session, shared by login/logout/rotation. */
export function sessionCookieOptions(env = process.env) {
  const isProduction = env.NODE_ENV === 'production'
  // Lax by default: portal and API are same-site, so the cookie travels, and
  // nothing cross-site can carry it. 'none' exists only for staging hosts on
  // *.up.railway.app, which is a public suffix (portal and API there are
  // cross-site); it requires Secure.
  const sameSite = ['lax', 'strict', 'none'].includes(env.COOKIE_SAMESITE) ? env.COOKIE_SAMESITE : 'lax'
  return {
    httpOnly: true,
    secure: isProduction || sameSite === 'none',
    sameSite,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  }
}
