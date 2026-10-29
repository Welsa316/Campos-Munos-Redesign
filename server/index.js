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
