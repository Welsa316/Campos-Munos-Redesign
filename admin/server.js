// Static host for the built staff portal (admin.camulaw.com).
//
// Serves dist/ with an SPA fallback and locks the portal down harder than the
// public site: no third-party scripts at all, never framed, never indexed,
// never cached by intermediaries. All data comes from the API origin, which is
// the only cross-origin connection the CSP allows.
import express from 'express'
import helmet from 'helmet'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createAdminServer({
  distDir = join(__dirname, 'dist'),
  apiOrigin = process.env.API_ORIGIN || '',
} = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  const connectSrc = ["'self'"]
  if (apiOrigin) connectSrc.push(apiOrigin)

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': connectSrc,
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
      },
    },
    referrerPolicy: { policy: 'same-origin' },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false },
  }))

  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  const indexFile = join(distDir, 'index.html')
  if (!fs.existsSync(indexFile)) {
    app.use((_req, res) => res.status(503).type('text/plain').send('Admin build missing: run npm run build'))
    return app
  }

  app.use(express.static(distDir, {
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      // Hashed assets are immutable; everything else is revalidated so a
      // deploy is picked up on the next load.
      if (/[\\/]assets[\\/]/.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      else res.setHeader('Cache-Control', 'no-cache')
    },
  }))

  // SPA fallback for page navigations only. A missing asset must be a 404,
  // not index.html served as JavaScript.
  app.get('*', (req, res) => {
    if (/\.[a-z0-9]{1,8}$/i.test(req.path)) return res.status(404).type('text/plain').send('Not found')
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(indexFile)
  })

  return app
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 4174
  createAdminServer().listen(port, () => console.log(`Admin portal listening on :${port}`))
}
