// Transitional single-service mode.
//
// Before the split, this one Express process served the API, the public site
// and the staff portal on camulaw.com. The target architecture runs them as
// three services (docs/architecture-split.md), but the live Railway service
// builds from the repo root and will keep doing so until DNS is moved. This
// module keeps that service behaving exactly as before:
//
//   camulaw.com/admin/*  → the built portal (admin/dist, built with ADMIN_BASE=/admin/)
//   camulaw.com/*        → the site's own router (site/server/app.js): CSP,
//                          www/legacy redirects, prerendered heads, real 404s
//
// It only activates when those builds exist beside server/. A standalone API
// deployment (Railway root directory = server/) has neither, so it serves the
// API alone. Both frontends are loaded with dynamic import so the standalone
// API never needs the site's code or dependencies.
import express from 'express'
import helmet from 'helmet'
import fs from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

const ADMIN_CSP = {
  useDefaults: true,
  directives: {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  },
}

export function createAdminMount(adminDist) {
  const router = express.Router()
  const indexFile = join(adminDist, 'index.html')
  // www.camulaw.com/admin folds into the apex as it did before the split,
  // so the portal never runs (and keeps a separate session) on www.
  router.use((req, res, next) => {
    const host = req.hostname || ''
    if (!host.startsWith('www.')) return next()
    res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`)
  })
  router.use(helmet({ contentSecurityPolicy: ADMIN_CSP, referrerPolicy: { policy: 'same-origin' } }))
  router.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })
  router.use(express.static(adminDist, {
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      if (/[\\/]assets[\\/]/.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      else res.setHeader('Cache-Control', 'no-cache')
    },
  }))
  router.get('*', (req, res, next) => {
    if (/\.[a-z0-9]{1,8}$/i.test(req.path)) return res.status(404).type('text/plain').send('Not found')
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(indexFile, (err) => { if (err) next(err) })
  })
  return router
}

export async function mountFrontends(app, { rootDir, enabled = true, log = console } = {}) {
  const mounted = { admin: false, site: false }
  if (!enabled) return mounted

  const adminDist = join(rootDir, 'admin', 'dist')
  if (fs.existsSync(join(adminDist, 'index.html'))) {
    app.use('/admin', createAdminMount(adminDist))
    mounted.admin = true
  }

  const siteDist = join(rootDir, 'site', 'dist')
  const siteRouterModule = join(rootDir, 'site', 'server', 'app.js')
  if (fs.existsSync(join(siteDist, 'index.html')) && fs.existsSync(siteRouterModule)) {
    const { createSiteRouter } = await import(pathToFileURL(siteRouterModule).href)
    app.use(createSiteRouter({
      distDir: siteDist,
      log: { info: (m) => log.info(m), warn: (m) => log.warn(m), error: (m) => log.error(m) },
    }))
    mounted.site = true
  }

  return mounted
}
