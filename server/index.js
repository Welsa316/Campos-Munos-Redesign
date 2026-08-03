import dotenv from 'dotenv'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, sep } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import crypto from 'crypto'
import authRoutes from './routes/auth.js'
import submissionRoutes from './routes/submissions.js'
import { legacyTarget } from './legacyRedirects.js'
import getPool from './db/pool.js'
import logger from './logger.js'

const isProduction = process.env.NODE_ENV === 'production'

if (isProduction) {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'FRONTEND_URL']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    logger.fatal({ missing }, 'Missing required env vars in production')
    process.exit(1)
  }
  if (process.env.JWT_SECRET.length < 32 || /change[-_ ]?me/i.test(process.env.JWT_SECRET)) {
    logger.fatal('JWT_SECRET is too short or contains a placeholder value. Generate at least 32 random chars.')
    process.exit(1)
  }
}

const app = express()
const PORT = process.env.PORT || 3000

// Railway / any reverse proxy terminates TLS in front of us — needed so
// express-rate-limit sees the real client IP instead of every request
// appearing to come from the proxy.
app.set('trust proxy', 1)

// Custom CSP because the SPA loads from this same origin and needs to
// pull video from Cloudflare R2, gtag.js from Google, the elfsight
// widget, and inline scripts (JSON-LD + dataLayer init).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'",
        'https://www.googletagmanager.com',
        'https://static.elfsight.com',
        'https://*.elfsight.com',
        'https://*.elfsightcdn.com',
        'https://elfsightcdn.com',
      ],
      'script-src-elem': [
        "'self'",
        "'unsafe-inline'",
        'https://www.googletagmanager.com',
        'https://static.elfsight.com',
        'https://*.elfsight.com',
        'https://*.elfsightcdn.com',
        'https://elfsightcdn.com',
      ],
      'connect-src': [
        "'self'",
        'https://www.google-analytics.com',
        'https://region1.google-analytics.com',
        'https://*.google-analytics.com',
        // Elfsight loads widget code + review data from many subdomains
        // (service-reviews-ultimate.elfsight.com, phosphor.utils.elfsightcdn.com,
        // etc.) — wildcard both so the Google Reviews fetch isn't blocked in prod.
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
      'frame-src': ["'self'", 'https://static.elfsight.com', 'https://elfsightcdn.com', 'https://www.google.com/maps/'],
      'upgrade-insecure-requests': null,
    },
  },
}))
app.use(cors({
  origin: process.env.FRONTEND_URL || (isProduction ? false : true),
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '100kb' }))

// Structured request logging with a per-request id so traces can be
// correlated across log lines and surfaced to clients on 500s.
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}))

app.get('/healthz', (_req, res) => res.json({ ok: true }))
app.get('/readyz', async (_req, res) => {
  try {
    await getPool().query('SELECT 1')
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/submissions', submissionRoutes)

// API 404s — must be registered before the static + SPA fallback so an
// unknown /api/* path returns JSON instead of the SPA's index.html.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Serve the built Vue frontend from one Railway service. In dev this
// directory doesn't exist (Vite handles the frontend on :5174) — the
// existsSync guard keeps `npm run dev` working without a prior build.
const distDir = join(__dirname, '..', 'site', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    // Don't auto-redirect /route → /route/ for prerendered directories; our
    // canonicals have no trailing slash. Let those fall through to the handler
    // below, which serves the prerendered index.html directly.
    redirect: false,
    maxAge: '1y',
    setHeaders: (res, path) => {
      // index.html must always be revalidated so a redeploy is picked up
      // on the next request instead of being served from cache for a year.
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))

  // Wix → new-site migration: 301 the old indexed URLs (Spanish tree + /en/* mirror)
  // to their new equivalents, and fold in a www → apex redirect, so old search
  // results don't 404 and their ranking transfers. See legacyRedirects.js.
  //
  // Mounted after the API routes and express.static (so real assets are served
  // without passing through the map) but before the SPA catch-all below, which
  // would otherwise swallow every legacy path.
  app.use((req, res, next) => {
    const host = req.hostname || ''
    const legacy = legacyTarget(req.path)
    if (host.startsWith('www.')) {
      const dest = legacy || req.originalUrl
      return res.redirect(301, `https://${host.slice(4)}${dest}`)
    }
    if (legacy) return res.redirect(301, legacy)
    next()
  })

  // The set of URLs that are real pages, emitted by the frontend build from the
  // same data the app routes on. Used to send a true 404 for anything else — an
  // SPA otherwise answers every unknown URL with HTTP 200 and a "page not found"
  // body, which Google logs as a soft 404. If the manifest is missing we keep the
  // old behaviour (200 for everything) rather than risk hiding real pages.
  let validRoutes = null
  try {
    const manifest = JSON.parse(fs.readFileSync(join(distDir, 'route-manifest.json'), 'utf8'))
    if (Array.isArray(manifest.routes) && manifest.routes.length) {
      validRoutes = new Set(manifest.routes)
      logger.info({ count: validRoutes.size }, 'Loaded route manifest')
    }
  } catch {
    logger.warn('No route-manifest.json — unknown URLs will answer 200 (no soft-404 protection)')
  }

  // Serve the prerendered per-route index.html when the build produced one (so
  // non-JS crawlers get that route's real SEO <head>); otherwise fall back to the
  // SPA shell. The path is sanitized and confined to distDir to prevent traversal.
  app.get('*', (req, res, next) => {
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

    // Unknown URL: still serve the SPA (so the app renders its 404 page) but say
    // so in the status line, which is what search engines actually act on.
    const isKnown = validRoutes === null || validRoutes.has(rel === '' ? '/' : rel)
    res.setHeader('Cache-Control', 'no-cache')
    res.status(isKnown ? 200 : 404)
    res.sendFile(join(distDir, 'index.html'), (err) => { if (err) next(err) })
  })
} else {
  app.use((req, res) => res.status(404).json({ error: 'Not found' }))
}

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error in request')
  // Honor errors that carry a status (e.g. express.json() rejecting malformed
  // JSON → 400, or an oversized body → 413) instead of masking them all as 500.
  const status = err.status || err.statusCode || 500
  const message = status === 500 ? 'Internal server error' : (err.message || 'Request error')
  res.status(status).json({ error: message, requestId: req.id })
})

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening')
})

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully')
  server.close(async () => {
    try { await getPool().end() } catch { /* ignore */ }
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'))
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception')
  shutdown('uncaughtException')
})
