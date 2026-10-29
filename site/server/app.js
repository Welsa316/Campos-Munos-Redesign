// HTTP layer for the public website (camulaw.com).
//
// Everything here used to live in server/index.js, when one Express service
// served both the API and the site. It moved with the site so the website can
// deploy on its own (site/server/index.js) while the API runs at
// api.camulaw.com. The same router is still mounted by the API in the
// transitional single-service deployment (server/frontends.js), so behaviour is
// identical in both shapes and there is one copy of each rule:
//
//   - security headers / CSP for the site's third parties
//   - www → apex and the Wix legacy 301 map (legacyRedirects.js)
//   - prerendered per-route index.html for crawlers (scripts/prerender.js)
//   - a real HTTP 404 for unknown URLs (route-manifest.json)
//   - /admin* → the staff portal, when it lives on its own host
//   - /api/* and /webhooks/* → the API, while the cutover proxy is enabled
import express from 'express'
import helmet from 'helmet'
import fs from 'fs'
import { join, sep } from 'path'
import { legacyTarget } from './legacyRedirects.js'
import { createApiProxy } from './proxy.js'

export const SITE_CSP = {
  useDefaults: true,
  directives: {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      'https://www.googletagmanager.com',
      'https://bzrcdn.openai.com',
      'https://static.elfsight.com',
      'https://*.elfsight.com',
      'https://*.elfsightcdn.com',
      'https://elfsightcdn.com',
      // Google Ads (AW-16893588137): gtag loads the conversion and
      // remarketing scripts from these two hosts.
      'https://googleads.g.doubleclick.net',
      'https://www.googleadservices.com',
    ],
    'script-src-elem': [
      "'self'",
      "'unsafe-inline'",
      'https://www.googletagmanager.com',
      'https://bzrcdn.openai.com',
      'https://static.elfsight.com',
      'https://*.elfsight.com',
      'https://*.elfsightcdn.com',
      'https://elfsightcdn.com',
      // Google Ads (AW-16893588137): gtag loads the conversion and
      // remarketing scripts from these two hosts.
      'https://googleads.g.doubleclick.net',
      'https://www.googleadservices.com',
    ],
    'connect-src': [
      "'self'",
      'https://www.google-analytics.com',
      'https://region1.google-analytics.com',
      'https://*.google-analytics.com',
      // analytics.google.com is a DIFFERENT domain from *.google-analytics.com
      // and gtag posts hits there in some configurations.
      'https://analytics.google.com',
      'https://*.analytics.google.com',
      'https://www.googletagmanager.com',
      // OpenAI ads pixel: posts conversion events to bzr, and fetches its
      // configuration from the same CDN that serves the script.
      'https://bzr.openai.com',
      'https://bzrcdn.openai.com',
      // Google Ads conversions and remarketing (gtag sends these, not GA4).
      'https://www.google.com',
      'https://google.com',
      'https://googleads.g.doubleclick.net',
      'https://ad.doubleclick.net',
      'https://www.googleadservices.com',
      // Elfsight loads widget code + review data from many subdomains.
      'https://*.elfsight.com',
      'https://*.elfsightcdn.com',
      'https://elfsightcdn.com',
    ],
    'media-src': [
      "'self'",
      'https://pub-bc3780d3394f41c6801ba2012e17903c.r2.dev',
      'https://elfsightcdn.com',
      'https://*.elfsightcdn.com',
      'https://*.cdninstagram.com',
      'https://*.fbcdn.net',
    ],
    'img-src': [
      "'self'",
      'data:',
      'https://pub-bc3780d3394f41c6801ba2012e17903c.r2.dev',
      'https://www.google-analytics.com',
      // Google Ads pixel fallbacks when fetch/beacon is unavailable.
      'https://www.google.com',
      'https://googleads.g.doubleclick.net',
      'https://ad.doubleclick.net',
      'https://static.elfsight.com',
      'https://*.elfsight.com',
      'https://elfsightcdn.com',
      'https://*.elfsightcdn.com',
      'https://*.cdninstagram.com',
      'https://*.fbcdn.net',
      'https://*.googleusercontent.com',
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
      'https://elfsightcdn.com',
    ],
    'font-src': [
      "'self'",
      'data:',
      'https://fonts.gstatic.com',
      'https://elfsightcdn.com',
      'https://*.elfsightcdn.com',
    ],
    // Path-scoped so only the Maps embed can be framed, not arbitrary google.com pages.
    // td.doubleclick.net hosts the Google Ads conversion iframe.
    'frame-src': ["'self'", 'https://static.elfsight.com', 'https://elfsightcdn.com', 'https://www.google.com/maps/', 'https://td.doubleclick.net'],
    'upgrade-insecure-requests': null,
  },
}

/** CSP for a site whose API lives on another origin: the form posts there. */
export function siteCsp(apiOrigin) {
  if (!apiOrigin) return SITE_CSP
  return {
    ...SITE_CSP,
    directives: {
      ...SITE_CSP.directives,
      'connect-src': [...SITE_CSP.directives['connect-src'], apiOrigin],
    },
  }
}

/** /admin, /admin/, /admin/login → the same place on the portal's own host. */
export function adminRedirectTarget(path, adminUrl) {
  const m = /^\/admin(?:\/(.*))?$/.exec(path)
  if (!m || !adminUrl) return null
  return `${adminUrl.replace(/\/+$/, '')}/${m[1] || ''}`
}

/**
 * Build the site router.
 *
 * @param {object} opts
 * @param {string} opts.distDir     built site (site/dist)
 * @param {string} [opts.adminUrl]  portal origin; /admin* redirects there when set
 * @param {string} [opts.apiOrigin] API origin, added to the CSP connect-src
 * @param {string} [opts.apiProxyTarget] forward /api and /webhooks here when set
 * @param {string} [opts.proxySecret] shared secret for forwarding the client IP
 * @param {object} [opts.log]
 */
export function createSiteRouter({
  distDir,
  adminUrl = '',
  apiOrigin = '',
  apiProxyTarget = '',
  proxySecret = '',
  log = console,
} = {}) {
  const router = express.Router()

  router.use(helmet({ contentSecurityPolicy: siteCsp(apiOrigin) }))

  if (apiProxyTarget) {
    const proxy = createApiProxy({ target: apiProxyTarget, secret: proxySecret, log })
    router.use('/api', proxy)
    router.use('/webhooks', proxy)
  }

  if (adminUrl) {
    router.use((req, res, next) => {
      const dest = adminRedirectTarget(req.path, adminUrl)
      if (!dest) return next()
      // 302, not 301: a permanent redirect is cached by browsers indefinitely,
      // which would make rolling the portal back to /admin impossible.
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
      res.redirect(302, dest + query)
    })
  }

  router.use(express.static(distDir, {
    index: false,
    // Don't auto-redirect /route → /route/ for prerendered directories; our
    // canonicals have no trailing slash. Let those fall through to the handler
    // below, which serves the prerendered index.html directly.
    redirect: false,
    maxAge: '1y',
    setHeaders: (res, path) => {
      // index.html must always be revalidated so a redeploy is picked up
      // on the next request instead of being served from cache for a year.
      if (path.endsWith('index.html') || path.endsWith('route-manifest.json')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))

  // Wix → new-site migration: 301 the old indexed URLs (Spanish tree + /en/*
  // mirror) to their new equivalents, and fold in a www → apex redirect.
  // After static (so real assets are never looked up in the map) and before
  // the SPA catch-all (which would otherwise swallow every legacy path).
  router.use((req, res, next) => {
    const host = req.hostname || ''
    const legacy = legacyTarget(req.path)
    if (host.startsWith('www.')) {
      const dest = legacy || req.originalUrl
      return res.redirect(301, `https://${host.slice(4)}${dest}`)
    }
    if (legacy) return res.redirect(301, legacy)
    next()
  })

  // The set of URLs that are real pages, emitted by the build from the same
  // data the app routes on. Anything else gets a true 404, not a soft 404. A
  // missing manifest keeps the old behaviour (200 for everything) rather than
  // risk hiding real pages.
  let validRoutes = null
  try {
    const manifest = JSON.parse(fs.readFileSync(join(distDir, 'route-manifest.json'), 'utf8'))
    if (Array.isArray(manifest.routes) && manifest.routes.length) {
      validRoutes = new Set(manifest.routes)
      log.info?.(`Loaded route manifest (${validRoutes.size} routes)`)
    }
  } catch {
    log.warn?.('No route-manifest.json — unknown URLs will answer 200 (no soft-404 protection)')
  }

  // Serve the prerendered per-route index.html when the build produced one (so
  // non-JS crawlers get that route's real SEO <head>); otherwise the SPA shell.
  // The path is sanitized and confined to distDir to prevent traversal.
  router.get('*', (req, res, next) => {
    let rel = ''
    try {
      rel = decodeURIComponent(req.path).replace(/\/+$/, '')
    } catch {
      rel = '' // malformed percent-encoding — treat as unknown
    }

    if (rel && !rel.includes('..') && !rel.includes('\0')) {
      const candidate = join(distDir, rel, 'index.html')
      if (candidate.startsWith(distDir + sep) && fs.existsSync(candidate)) {
        res.setHeader('Cache-Control', 'no-cache')
        return res.sendFile(candidate, (err) => { if (err) next(err) })
      }
    }

    const isKnown = validRoutes === null || validRoutes.has(rel === '' ? '/' : rel)
    res.setHeader('Cache-Control', 'no-cache')
    res.status(isKnown ? 200 : 404)
    res.sendFile(join(distDir, 'index.html'), (err) => { if (err) next(err) })
  })

  return router
}

/** Standalone app for the site's own deployment (see site/server/index.js). */
export function createSiteApp(opts = {}) {
  const app = express()
  app.disable('x-powered-by')
  // Railway terminates TLS in front of us; needed for req.ip / req.protocol.
  app.set('trust proxy', 1)
  app.get('/healthz', (_req, res) => res.json({ ok: true }))
  app.use(createSiteRouter(opts))
  app.use((err, req, res, _next) => {
    opts.log?.error?.(`Site request error on ${req.method} ${req.path}: ${err.message}`)
    if (!res.headersSent) res.status(err.status || 500).type('text/plain').send('Server error')
  })
  return app
}
