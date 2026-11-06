import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

import { createApp, addFallbackHandlers } from './app.js'
import { mountFrontends } from './frontends.js'
import getPool from './db/pool.js'
import { purgeExpiredUploads } from './billing/importService.js'
import { startReminderScheduler } from './billing/scheduler.js'
import logger from './logger.js'
import { emailConfigProblems } from './utils/emailConfig.js'

const isProduction = process.env.NODE_ENV === 'production'

if (isProduction) {
  const required = ['JWT_SECRET', 'DATABASE_URL']
  const missing = required.filter(k => !process.env[k])
  // The portal's origin, for credentialed CORS and the cross-origin write
  // check. FRONTEND_URL is the original name and still works.
  if (!process.env.ADMIN_ORIGINS && !process.env.FRONTEND_URL) missing.push('ADMIN_ORIGINS (or FRONTEND_URL)')
  if (missing.length) {
    logger.fatal({ missing }, 'Missing required env vars in production')
    process.exit(1)
  }
  if (process.env.JWT_SECRET.length < 32 || /change[-_ ]?me/i.test(process.env.JWT_SECRET)) {
    logger.fatal('JWT_SECRET is too short or contains a placeholder value. Generate at least 32 random chars.')
    process.exit(1)
  }
}

// The WhatsApp webhook fails closed without these (GET → 403, POST → 503), so a
// missing value is a warning at boot rather than a crash: the rest of the site
// must keep serving while Meta is being configured.
for (const key of ['WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET']) {
  if (!process.env[key]) logger.warn({ key }, 'WhatsApp webhook env var not set; the webhook will refuse requests')
}

// Same for email: without these, website alerts and inbox replies stop.
const emailProblems = emailConfigProblems()
if (emailProblems.length) logger.warn({ problems: emailProblems }, 'Email is not configured; website alerts and inbox replies will not be sent')

const PORT = process.env.PORT || 3000
const app = createApp()

// Transitional single-service deployment: when the built site and portal are
// present next to this directory, serve them too (camulaw.com + /admin), so
// the current Railway service keeps working unchanged until DNS moves to the
// separate services. A standalone API deployment (root directory server/) has
// neither, and SERVE_FRONTENDS=false switches this off explicitly.
const frontends = await mountFrontends(app, {
  rootDir: join(__dirname, '..'),
  enabled: process.env.SERVE_FRONTENDS !== 'false',
  log: logger,
})
logger.info(frontends, 'Frontends mounted in this process')

addFallbackHandlers(app)

// Uploaded billing reports hold client financial data. Their raw bytes are
// deleted after BILLING_UPLOAD_RETENTION_DAYS (default 30); the import's
// metadata, staged rows and outcome stay for the audit trail.
const retentionDays = Number(process.env.BILLING_UPLOAD_RETENTION_DAYS) || 30
async function purgeUploads() {
  try {
    const n = await purgeExpiredUploads(getPool(), retentionDays)
    if (n) logger.info({ purged: n, retentionDays }, 'Purged expired billing uploads')
  } catch (err) {
    logger.warn({ err: err.message }, 'Billing upload purge failed')
  }
}
setTimeout(purgeUploads, 60 * 1000).unref()
setInterval(purgeUploads, 24 * 60 * 60 * 1000).unref()

// Payment reminders: drafts + sending of approved reminders (never unapproved).
startReminderScheduler({ pool: getPool(), env: process.env, log: logger })

// RingCentral: keep an idle connection alive. Refresh tokens expire (7 days
// by default) unless used, so refresh before that. Only in production by
// default (a developer machine must not rotate the firm's tokens), and only
// when the integration is configured and connected. Never logs a token.
const ringcentralKeepalive = process.env.RINGCENTRAL_KEEPALIVE
  ? process.env.RINGCENTRAL_KEEPALIVE === 'true'
  : isProduction
if (ringcentralKeepalive) {
  const { loadRingCentralConfig } = await import('./integrations/ringcentral/config.js')
  const { maintainConnection, RingCentralNotConnectedError } = await import('./integrations/ringcentral/service.js')
  const keepAlive = async () => {
    const cfg = loadRingCentralConfig(process.env)
    if (!cfg.configured) return
    try {
      const { refreshed } = await maintainConnection(getPool(), cfg)
      if (refreshed) logger.info({ provider: 'ringcentral' }, 'RingCentral tokens refreshed')
    } catch (err) {
      if (err instanceof RingCentralNotConnectedError && err.code === 'not_connected') return
      logger.warn({ provider: 'ringcentral', code: err.code }, 'RingCentral keep-alive could not refresh')
    }
  }
  setTimeout(keepAlive, 2 * 60 * 1000).unref()
  setInterval(keepAlive, 6 * 60 * 60 * 1000).unref()
}

// RingCentral call log import every 5 minutes (read-only; docs/ringcentral-call-log.md).
// Same default as the keep-alive: production only unless RINGCENTRAL_CALL_SYNC
// says otherwise. One run at a time across instances (advisory lock).
const callSyncOn = process.env.RINGCENTRAL_CALL_SYNC
  ? process.env.RINGCENTRAL_CALL_SYNC === 'true'
  : isProduction
if (callSyncOn) {
  const { loadRingCentralConfig } = await import('./integrations/ringcentral/config.js')
  const { syncCallLog } = await import('./integrations/ringcentral/callLog.js')
  let running = false
  const syncCalls = async () => {
    if (running) return
    const cfg = loadRingCentralConfig(process.env)
    if (!cfg.configured) return
    running = true
    try {
      const r = await syncCallLog(getPool(), cfg, {
        trigger: 'scheduled',
        backfillDays: Number(process.env.RINGCENTRAL_CALL_BACKFILL_DAYS) || undefined,
        retentionDays: Number(process.env.RINGCENTRAL_CALL_RETENTION_DAYS) || undefined,
      })
      if (r.status === 'error' && r.code !== 'not_connected') logger.warn({ provider: 'ringcentral', code: r.code }, 'Call log import failed')
      else if (r.status === 'ok' && r.new) logger.info({ provider: 'ringcentral', new: r.new }, 'Call log imported')
    } catch (err) {
      logger.warn({ provider: 'ringcentral', err: { name: err?.name, code: err?.code } }, 'Call log import error')
    } finally {
      running = false
    }
  }
  setTimeout(syncCalls, 90 * 1000).unref()
  setInterval(syncCalls, 5 * 60 * 1000).unref()

  // The live call-event subscription, once a day: its state, and a renewal a
  // month before it would expire. Never creates one (an administrator does).
  const { checkSubscription } = await import('./integrations/ringcentral/telephonyEvents.js')
  const { getAccessToken } = await import('./integrations/ringcentral/service.js')
  const checkEvents = async () => {
    const cfg = loadRingCentralConfig(process.env)
    if (!cfg.configured) return
    try {
      const r = await checkSubscription(getPool(), cfg, { token: await getAccessToken(getPool(), cfg) })
      if (r.status !== 'none' && r.status !== 'Active') logger.warn({ provider: 'ringcentral', status: r.status, code: r.code }, 'Live call-event subscription is not active')
    } catch (err) {
      logger.warn({ provider: 'ringcentral', err: { name: err?.name, code: err?.code } }, 'Live call-event subscription check failed')
    }
  }
  setTimeout(checkEvents, 10 * 60 * 1000).unref()
  setInterval(checkEvents, 24 * 60 * 60 * 1000).unref()
}

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
