'use strict'
// URL rules for the shell, kept free of Electron so they test in plain Node.
// Everything that decides "load this in the app" or "hand this to the OS"
// goes through here.

const DEFAULT_PORTAL = 'https://admin.camulaw.com'
const DEFAULT_API = 'https://api.camulaw.com'

// Schemes we are willing to pass to the operating system. Anything else
// (file:, javascript:, custom app schemes, plain http) is dropped.
const EXTERNAL_SCHEMES = new Set(['https:', 'mailto:', 'tel:'])

function parse(value) {
  try {
    return new URL(String(value))
  } catch {
    return null
  }
}

function originOf(value, fallback) {
  const u = parse(value)
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return new URL(fallback).origin
  return u.origin
}

/**
 * Portal and API origins. Running from source, CM_PORTAL_URL / CM_API_URL
 * point the app at a local server; an installed app ignores them, so nothing
 * that can set the environment can aim it at another site.
 */
function resolveConfig(env = process.env, { allowOverrides = true } = {}) {
  if (!allowOverrides) return { portalOrigin: DEFAULT_PORTAL, apiOrigin: DEFAULT_API }
  return {
    portalOrigin: originOf(env.CM_PORTAL_URL, DEFAULT_PORTAL),
    apiOrigin: originOf(env.CM_API_URL, DEFAULT_API),
  }
}

/** True when the URL is on the portal origin (so it may load in the window). */
function isPortalUrl(url, portalOrigin) {
  const u = parse(url)
  return !!u && u.origin === portalOrigin
}

// Hosts on this computer or the office network. A link in the portal has no
// business sending the browser there, where it could reach a router's admin
// page or a local service.
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (h.includes(':')) {
    // ::1, unspecified, link-local fe80::/10, unique-local fc00::/7, and IPv4-mapped ::ffff:a.b.c.d
    if (h === '::1' || h === '::') return true
    if (/^fe[89ab]/.test(h) || /^f[cd]/.test(h)) return true
    if (h.startsWith('::ffff:')) return true
  }
  return false
}

// mailto: may carry attachments that some mail apps honour ("attach=" a
// file from this computer to a message the user then sends).
const MAILTO_DROP = new Set(['attach', 'attachment', 'file'])

/** The URL if it is safe to open with the OS handler, else null. */
function externalUrl(url) {
  const u = parse(url)
  if (!u || !EXTERNAL_SCHEMES.has(u.protocol)) return null
  if (u.protocol === 'https:' && (!u.hostname || isPrivateHost(u.hostname))) return null
  if (u.protocol === 'mailto:' && u.search) {
    const kept = [...new URLSearchParams(u.search)].filter(([k]) => !MAILTO_DROP.has(k.toLowerCase()))
    u.search = kept.length ? new URLSearchParams(kept).toString() : ''
  }
  return u.href
}

/**
 * A full portal URL for an in-portal path from a notification ("/calls",
 * "/inbox?lead=12"), or null. Rejects protocol-relative "//host" and
 * "/\host", which browsers treat as another site.
 */
function portalPathUrl(path, portalOrigin) {
  if (typeof path !== 'string' || path.length > 500) return null
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null
  // URL parsing strips tabs and newlines, which could turn "/\t/x" into "//x".
  if (/[\u0000-\u001f\u007f]/.test(path)) return null
  const u = parse(portalOrigin + path)
  // "/./" + "/x" and the like only collapse to "//x" once parsed.
  if (!u || u.origin !== portalOrigin || u.pathname.startsWith('//')) return null
  return u.href
}

/** The browser reload keys: Cmd/Ctrl+R (with or without Shift) and F5. */
function isReloadShortcut(input) {
  if (!input || input.type !== 'keyDown') return false
  const key = String(input.key || '').toLowerCase()
  if (key === 'f5') return true
  return key === 'r' && Boolean(input.meta || input.control) && !input.alt
}

module.exports = { resolveConfig, isPortalUrl, externalUrl, portalPathUrl, isReloadShortcut, DEFAULT_PORTAL, DEFAULT_API }
