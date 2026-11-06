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
import { createTestChannelRouter } from './routes/testChannel.js'
import { createBillingRouter } from './routes/billing.js'
import whatsappRoutes from './routes/whatsapp.js'
import { createWhatsappInboxRouter } from './routes/whatsappInbox.js'
import { redactUrlSecrets } from './utils/redactUrl.js'
import { createIntegrationsRouter } from './routes/integrations.js'
import { createCallsRouter } from './routes/calls.js'
import { createContactsRouter } from './routes/contacts.js'
import { createTeamRouter } from './routes/team.js'
import { createActivityRouter } from './routes/activity.js'
import { createPushRouter } from './routes/push.js'
import { createNotificationsRouter } from './routes/notifications.js'
import { createRemindersRouter } from './routes/reminders.js'
import { createWorkQueueRouter } from './routes/workQueue.js'
import { createRingCentralWebhookRouter } from './routes/ringcentralWebhook.js'
import { activityRecorder } from './activity/recorder.js'
import {
  resolveOrigins, corsOptionsDelegate, requireTrustedOrigin, resolveClientIp,
} from './httpSecurity.js'
import getPool from './db/pool.js'
import logger from './logger.js'

// A caller-supplied request id is kept only when it looks like an id, so a
// header cannot put arbitrary text into our logs and error bodies.
const REQUEST_ID = /^[\w-]{8,64}$/

export function requestIdFor(req) {
  const given = req.headers['x-request-id']
  return typeof given === 'string' && REQUEST_ID.test(given) ? given : crypto.randomUUID()
}

// The desktop app's feed poll (GET /api/notifications/feed).
export function isFeedPoll(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0]
  return req.method === 'GET' && path === '/api/notifications/feed'
}

// /readyz is unauthenticated. One database round trip every few seconds is
// enough to answer it; concurrent probes share the one in flight.
export function readinessCheck(query, { ttlMs = 5000, now = Date.now } = {}) {
  let cached = null
  let inFlight = null
  return async () => {
    if (cached && now() - cached.at < ttlMs) return cached.ok
    if (!inFlight) {
      inFlight = query()
        .then(() => true, () => false)
        .then((ok) => { cached = { ok, at: now() }; inFlight = null; return ok })
    }
    return inFlight
  }
}

export function createApp({ env = process.env, log = logger, beforeFallback, readyQuery, pushTransport } = {}) {
  const app = express()
  app.disable('x-powered-by')

  // Railway terminates TLS in front of us — needed so req.ip is the client,
  // not the proxy.
  app.set('trust proxy', 1)

  // helmet's defaults: this app serves JSON. The site's CSP (third-party
  // scripts, video CDN) lives with the site, in site/server/app.js.
  // Not on the RingCentral webhook: RingCentral refuses an address whose
  // answer to its check is over 1024 bytes, headers included (SUB-525),
  // Railway adds about 150 of its own, and browser headers mean nothing to
  // RingCentral's server.
  const securityHeaders = helmet()
  app.use((req, res, next) => (req.path.startsWith('/webhooks/ringcentral') ? next() : securityHeaders(req, res, next)))

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
    genReqId: requestIdFor,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      // Every desktop app polls the feed every 20 seconds; its successes are noise.
      if (isFeedPoll(req)) return 'debug'
      return 'info'
    },
    serializers: {
      // Meta's verification handshake carries the verify token in the query
      // string, and the OAuth callback the authorization code and state.
      req: (req) => ({ id: req.id, method: req.method, url: redactUrlSecrets(req.url), ip: req.remoteAddress }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }))

  app.use(resolveClientIp(env))

  // Meta WhatsApp Cloud API webhook. Mounted BEFORE express.json(): the
  // X-Hub-Signature-256 check is an HMAC over the raw bytes, so the router
  // parses its own body with express.raw(). See routes/whatsapp.js.
  app.use('/webhooks/whatsapp', whatsappRoutes)
  // RingCentral live call events (verification token, own JSON parser).
  app.use('/webhooks/ringcentral', createRingCentralWebhookRouter())

  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))

  app.get('/healthz', (_req, res) => res.json({ ok: true }))
  const ready = readinessCheck(readyQuery || (() => getPool().query('SELECT 1')))
  app.get('/readyz', async (_req, res) => {
    if (await ready()) res.json({ ok: true })
    else res.status(503).json({ ok: false })
  })

  app.use('/api', (req, res, next) => {
    // The API is never a page anyone should find in search, and no answer
    // may be kept by a browser or proxy (Team returns one-time passwords).
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.setHeader('Cache-Control', 'no-store')
    // Every error body names the request, so a screenshot of an error can
    // be matched to its log line. Routes write { error } as before.
    const json = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body) && body.requestId === undefined && req.id) {
        return json({ ...body, requestId: req.id })
      }
      return json(body)
    }
    next()
  })
  app.use('/api', requireTrustedOrigin(origins))
  // Who changed what, written as each response finishes (server/activity/).
  app.use('/api', activityRecorder())
  app.use('/api/auth', authRoutes)
  app.use('/api/submissions', submissionRoutes)
  app.use('/api/billing', createBillingRouter({ env }))
  app.use('/api/whatsapp', createWhatsappInboxRouter({ env }))
  // OAuth connections (RingCentral). The callback is registered with
  // RingCentral as https://api.camulaw.com/api/integrations/ringcentral/callback.
  app.use('/api/integrations', createIntegrationsRouter({ env }))
  // RingCentral call log (read-only).
  app.use('/api/calls', createCallsRouter({ env }))
  app.use('/api/contacts', createContactsRouter())
  // Staff accounts (Team tab) and the activity log: administrators only.
  app.use('/api/team', createTeamRouter())
  app.use('/api/activity', createActivityRouter())
  // The administrator's test forms, kept out of the inbox.
  app.use('/api/test-channel', createTestChannelRouter({ env }))
  // Desktop notifications for the signed-in account's own computers.
  app.use('/api/push', createPushRouter({ env, transport: pushTransport }))
  app.use('/api/notifications', createNotificationsRouter())
  // Callback reminders on callers and website leads (server/reminders/).
  app.use('/api/reminders', createRemindersRouter())
  // Home's "My follow-ups" (read-only).
  app.use('/api/work-queue', createWorkQueueRouter())

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
    const raw = Number(err.status || err.statusCode)
    const status = raw >= 400 && raw <= 599 ? raw : 500
    // Only client errors say what went wrong; a 5xx message can carry
    // internals (an upstream's reply, a hostname).
    const message = status < 500 ? (err.message || 'Request error') : 'Internal server error'
    res.status(status).json({ error: message, requestId: req.id })
  })
  return app
}
