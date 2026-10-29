// Transitional reverse proxy from camulaw.com/api/* and /webhooks/* to the API.
//
// Why it exists: when DNS for camulaw.com moves from the single combined
// service to this static host, browsers still holding the previous bundle keep
// posting the contact form and chat to camulaw.com/api/…, and Meta keeps
// delivering WhatsApp webhooks to camulaw.com/webhooks/whatsapp until the
// callback URL is changed in the Meta dashboard. Forwarding those requests
// means no lead and no webhook is lost during the cutover. Remove it (unset
// API_PROXY_TARGET) once traffic to these paths has stopped.
//
// The body is streamed through untouched, so the WhatsApp HMAC signature over
// the raw bytes still verifies at the API.
//
// Client IP: the API rate-limits by IP. Through this hop the API would see
// this server's address for every proxied visitor, so all of them would share
// one rate-limit bucket. When SITE_PROXY_SECRET is set (same value on both
// services) the real client IP is passed in X-CM-Client-IP and the API trusts
// it only alongside the matching secret.
import http from 'http'
import https from 'https'

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host',
])
export const CLIENT_IP_HEADER = 'x-cm-client-ip'
export const PROXY_SECRET_HEADER = 'x-cm-proxy-secret'

export function createApiProxy({ target, secret = '', timeoutMs = 30000, log = console } = {}) {
  const base = new URL(target)
  const transport = base.protocol === 'https:' ? https : http

  return function apiProxy(req, res) {
    const headers = {}
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase()
      if (HOP_BY_HOP.has(lower)) continue
      // Never let a visitor supply the trusted headers themselves.
      if (lower === CLIENT_IP_HEADER || lower === PROXY_SECRET_HEADER) continue
      headers[lower] = value
    }
    headers.host = base.host
    headers['x-forwarded-host'] = req.headers.host || ''
    headers['x-forwarded-proto'] = req.protocol || 'https'
    if (secret) {
      headers[PROXY_SECRET_HEADER] = secret
      headers[CLIENT_IP_HEADER] = req.ip || req.socket?.remoteAddress || ''
    }

    const upstream = transport.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || undefined,
      method: req.method,
      path: req.originalUrl || req.url,
      headers,
      timeout: timeoutMs,
    }, (upstreamRes) => {
      const outHeaders = {}
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (!HOP_BY_HOP.has(name.toLowerCase())) outHeaders[name] = value
      }
      res.writeHead(upstreamRes.statusCode || 502, outHeaders)
      upstreamRes.pipe(res)
    })

    upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')))
    // A visitor who disconnects mid-request must not hold an upstream socket
    // open until the timeout.
    res.on('close', () => { if (!res.writableFinished) upstream.destroy() })
    upstream.on('error', (err) => {
      log.error?.(`API proxy error for ${req.method} ${req.path}: ${err.message}`)
      if (!res.headersSent) res.status(502).json({ error: 'Service temporarily unavailable' })
      else res.destroy()
    })

    req.pipe(upstream)
  }
}
