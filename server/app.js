// The API's Express app, without listening or boot checks, so tests can mount
// it on an ephemeral port. index.js is the process entry point.
//
// Since the split (docs/architecture-split.md) this app serves only the API
// (/api/*, including the staff WhatsApp inbox at /api/whatsapp), the
// WhatsApp webhook (/webhooks/*) and health checks. The public
// site and the staff portal are separate deployments. In the transitional
// single-service deployment index.js additionally mounts both frontends via
// frontends.js; nothing in this file knows about them.
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import crypto from 'crypto'
import authRoutes from './routes/auth.js'
import submissionRoutes from './routes/submissions.js'
import { createBillingRouter } from './routes/billing.js'
import whatsappRoutes from './routes/whatsapp.js'
import { createWhatsappInboxRouter } from './routes/whatsappInbox.js'
import { redactVerifyToken } from './utils/whatsapp.js'
import {
  resolveOrigins, corsOptionsDelegate, requireTrustedOrigin, resolveClientIp,
} from './httpSecurity.js'
import getPool from './db/pool.js'
import logger from './logger.js'

export function createApp({ env = process.env, log = logger, beforeFallback } = {}) {
  const app = express()
  app.disable('x-powered-by')

  // Railway terminates TLS in front of us — needed so req.ip is the client,
  // not the proxy.
  app.set('trust proxy', 1)

  // helmet's defaults: this app serves JSON. The site's CSP (third-party
  // scripts, video CDN) lives with the site, in site/server/app.js.
  app.use(helmet())

  const origins = resolveOrigins(env)
  if (origins.conflicts.length) {
    log.warn({ origins: origins.conflicts }, 'Origin listed in both ADMIN_ORIGINS/FRONTEND_URL and PUBLIC_ORIGINS; treating it as public (no credentials)')
  }
  app.use(cors(corsOptionsDelegate(origins)))

  // Structured request logging with a per-request id, registered before the
  // body parsers so every request (including the WhatsApp webhook and
  // JSON-parse 400s) carries req.log.
  app.use(pinoHttp({
    logger: log,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    serializers: {
      // Meta's verification handshake carries the verify token in the query string.
      req: (req) => ({ id: req.id, method: req.method, url: redactVerifyToken(req.url), ip: req.remoteAddress }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }))

  app.use(resolveClientIp(env))

  // Meta WhatsApp Cloud API webhook. Mounted BEFORE express.json(): the
  // X-Hub-Signature-256 check is an HMAC over the raw bytes, so the router
  // parses its own body with express.raw(). See routes/whatsapp.js.
  app.use('/webhooks/whatsapp', whatsappRoutes)

  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))

  app.get('/healthz', (_req, res) => res.json({ ok: true }))
  app.get('/readyz', async (_req, res) => {
    try {
      await getPool().query('SELECT 1')
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false })
    }
  })

  // The API is never a page anyone should find in search.
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })
  app.use('/api', requireTrustedOrigin(origins))
  app.use('/api/auth', authRoutes)
  app.use('/api/submissions', submissionRoutes)
  app.use('/api/billing', createBillingRouter({ env }))
  app.use('/api/whatsapp', createWhatsappInboxRouter({ env }))

  // API 404s — registered before any frontend fallback so an unknown /api/*
  // path returns JSON instead of a page.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

  // Transitional deployment hook: index.js mounts the frontends here.
  if (beforeFallback) beforeFallback(app)

  return app
}

/** Terminal handlers. Added by index.js after any frontend mount. */
export function addFallbackHandlers(app) {
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  app.use((err, req, res, _next) => {
    req.log?.error({ err }, 'Unhandled error in request')
    // Honor errors that carry a status (e.g. express.json() rejecting malformed
    // JSON → 400, or an oversized body → 413) instead of masking them as 500.
    const status = err.status || err.statusCode || 500
    const message = status === 500 ? 'Internal server error' : (err.message || 'Request error')
    res.status(status).json({ error: message, requestId: req.id })
  })
  return app
}
