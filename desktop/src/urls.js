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

/** Portal and API origins from env; local testing overrides both. */
function resolveConfig(env = process.env) {
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

/** The URL if it is safe to open with the OS handler, else null. */
function externalUrl(url) {
  const u = parse(url)
  if (!u || !EXTERNAL_SCHEMES.has(u.protocol)) return null
  if (u.protocol === 'https:' && !u.hostname) return null
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
  if (!u || u.origin !== portalOrigin) return null
  return u.href
}

module.exports = { resolveConfig, isPortalUrl, externalUrl, portalPathUrl, DEFAULT_PORTAL, DEFAULT_API }
