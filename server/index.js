import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

import { createApp, addFallbackHandlers } from './app.js'
import { mountFrontends } from './frontends.js'
import getPool from './db/pool.js'
import { purgeExpiredUploads } from './billing/importService.js'
import { purgeActivity, ACTIVITY_RETENTION_DAYS } from './activity/recorder.js'
import { startReminderScheduler } from './billing/scheduler.js'
import { sweepPendingReplies } from './whatsapp/inbox.js'
import logger from './logger.js'
import { emailConfigProblems } from './utils/emailConfig.js'
import { pushConfig } from './push/config.js'
import { isProductionEnv, bootEnvProblems } from './utils/productionEnv.js'
import { notifyNewMissedCallers } from './push/missedCallAlerts.js'
import { purgeOldNotifications, purgeOldPushDeliveries } from './push/feed.js'
import { purgeOldAnnouncements } from './push/missedCallAlerts.js'
import { purgeClosedReminders, REMINDER_RETENTION_DAYS } from './reminders/reminders.js'

const isProduction = isProductionEnv(process.env)

// Run fn after firstMs, then every everyMs, without keeping the process alive.
function schedule(fn, firstMs, everyMs) {
  setTimeout(fn, firstMs).unref()
  setInterval(fn, everyMs).unref()
}

// 'true' / 'false' in the variable, or on in production only.
const flag = (name) => (process.env[name] ? process.env[name] === 'true' : isProduction)

// Fatal only under NODE_ENV=production; when Railway alone says production
// the same problems are logged as warnings (utils/productionEnv.js).
const bootProblems = bootEnvProblems(process.env)
for (const problem of bootProblems.warn) logger.warn(problem)
if (bootProblems.fatal.length) {
  for (const problem of bootProblems.fatal) logger.fatal(problem)
  process.exit(1)
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

// And desktop notifications: without the VAPID keys the setting says so and
// nothing is sent.
const push = pushConfig(process.env)
if (!push.configured) logger.warn({ problems: push.problems }, 'Desktop notifications are not configured; nothing will be pushed')

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
schedule(purgeUploads, 60 * 1000, 24 * 60 * 60 * 1000)

// The activity log keeps ACTIVITY_RETENTION_DAYS (400): a full year to look
// back on, with some margin. Older rows are deleted once a day.
async function purgeOldActivity() {
  try {
    const n = await purgeActivity(getPool())
    if (n) logger.info({ purged: n, retentionDays: ACTIVITY_RETENTION_DAYS }, 'Purged old activity log rows')
  } catch (err) {
    logger.warn({ err: err.message }, 'Activity log purge failed')
  }
}
schedule(purgeOldActivity, 60 * 1000, 24 * 60 * 60 * 1000)

// The desktop app's notification feed and the per-computer push records
// keep a month (push/feed.js), missed-call announcements a week, finished
// callback reminders REMINDER_RETENTION_DAYS (180) with their delivery
// history. Their own daily timer, so the purge does not wait on a new
// missed caller. Each is tried on its own.
async function purgeNotificationFeed() {
  const steps = [
    ['notifications', purgeOldNotifications],
    ['pushDeliveries', purgeOldPushDeliveries],
    ['missedCallAnnouncements', purgeOldAnnouncements],
    ['closedReminders', purgeClosedReminders],
  ]
  const purged = {}
  for (const [name, purge] of steps) {
    try {
      const r = await purge(getPool())
      if (r.rowCount) purged[name] = r.rowCount
    } catch (err) {
      logger.warn({ err: err.message, step: name }, 'Notification history purge failed')
    }
  }
  if (Object.keys(purged).length) logger.info({ purged, reminderRetentionDays: REMINDER_RETENTION_DAYS }, 'Purged old notification history')
}
schedule(purgeNotificationFeed, 90 * 1000, 24 * 60 * 60 * 1000)

// Staff WhatsApp replies cut off mid-send become 'unknown' (whatsapp/inbox.js).
async function sweepReplies() {
  try {
    const n = await sweepPendingReplies(getPool())
    if (n) logger.warn({ replies: n }, 'WhatsApp replies left pending were marked unknown')
  } catch (err) {
    logger.warn({ err: err.message }, 'WhatsApp pending reply sweep failed')
  }
}
schedule(sweepReplies, 2 * 60 * 1000, 5 * 60 * 1000)

// Payment reminders: drafts + sending of approved reminders (never unapproved).
startReminderScheduler({ pool: getPool(), env: process.env, log: logger })

// Callback reminders (server/reminders/worker.js): due reminders are emailed
// and pushed to the person they are for, once each, from this process alone
// (no portal needs to be open). Every minute and once at boot; safe with
// several instances. REMINDER_WORKER=false switches it off. Outside
// production nothing is emailed unless REMINDER_EMAIL_ALLOWLIST is set
// (development: tech@camulaw.com only), so a copy of real data can never
// email the firm's staff from a developer's machine.
if (process.env.REMINDER_WORKER !== 'false') {
  const { runReminderWorker } = await import('./reminders/worker.js')
  const { createResendMailer, emailAllowlist } = await import('./reminders/email.js')
  let mailer = null
  if (!emailProblems.includes('RESEND_API_KEY is not set') && !emailProblems.includes('RESEND_API_KEY is still the placeholder')) {
    if (isProduction || emailAllowlist(process.env)) mailer = createResendMailer({ apiKey: process.env.RESEND_API_KEY, env: process.env })
    else logger.warn('Callback reminder emails are off: set REMINDER_EMAIL_ALLOWLIST outside production')
  }
  let running = false
  // The sweep that closes reminders whose caller was dealt with (one query
  // per open episode) runs every ten minutes; each reminder is checked again
  // right before it is sent, and portal actions close theirs at once.
  const SWEEP_EVERY_MS = 10 * 60 * 1000
  let lastSweep = 0
  const runReminders = async () => {
    if (running) return
    running = true
    try {
      const sweep = Date.now() - lastSweep >= SWEEP_EVERY_MS
      const r = await runReminderWorker(getPool(), { mailer, env: process.env, log: logger, sweep })
      if (sweep) lastSweep = Date.now()
      if (r.claimed.length || r.delivered.length || r.resolved.length) {
        logger.info({ claimed: r.claimed.length, delivered: r.delivered.length, resolved: r.resolved.length, recovered: r.recovered }, 'Callback reminders processed')
      }
    } catch (err) {
      logger.warn({ err: { name: err?.name, code: err?.code, message: err?.message } }, 'Callback reminder run failed')
    } finally {
      running = false
    }
  }
  schedule(runReminders, 15 * 1000, 60 * 1000)
}

// Phase 1 automation (server/automation/, docs/phase1-automation.md): lead
// acknowledgment and follow-ups, missed-call text-back, escalation, booking
// detection. Every minute and once at boot, from this process alone; safe
// with several instances. OFF unless AUTOMATION_ENABLED is exactly 'true'
// (the same reason as the billing scheduler: server/.env on a developer
// machine points at production), and each automation has its own switch on
// top of that. Outside production nothing is sent to anyone but the
// addresses in AUTOMATION_TEST_RECIPIENTS.
const automationWanted = String(process.env.AUTOMATION_ENABLED ?? '').trim().toLowerCase() === 'true'
// A worker takes jobs out of the queue even when it may not send them (it
// finishes them as "skipped"). So one that is not production never starts
// without a list of test recipients: a developer machine pointed at the
// live database must not eat real clients' acknowledgments.
const automationBlocked = automationWanted && !isProduction && !String(process.env.AUTOMATION_TEST_RECIPIENTS ?? '').trim()
if (automationBlocked) logger.warn('Automation worker NOT started: outside production it needs AUTOMATION_TEST_RECIPIENTS (and never point it at the production database)')
if (automationWanted && !automationBlocked) {
  const { runAutomation } = await import('./automation/worker.js')
  const { purgeOldJobs } = await import('./automation/jobs.js')
  const { createResendMailer } = await import('./reminders/email.js')
  const { loadRingCentralConfig } = await import('./integrations/ringcentral/config.js')
  const { createRingCentralSms } = await import('./integrations/ringcentral/sms.js')
  const { loadSettings } = await import('./automation/settings.js')
  const { loadGoogleCalendarConfig, createGoogleCalendarProvider } = await import('./automation/scheduling/google.js')
  const emailReady = !emailProblems.includes('RESEND_API_KEY is not set') && !emailProblems.includes('RESEND_API_KEY is still the placeholder')
  const mailer = emailReady ? createResendMailer({ apiKey: process.env.RESEND_API_KEY, env: process.env }) : null
  // Built once: the calendar provider keeps its access token between runs.
  let calendar = null
  let calendarId = null
  const calendarFor = async () => {
    const cfg = loadGoogleCalendarConfig(process.env, await loadSettings(getPool()))
    if (!cfg.configured) return null
    if (!calendar || calendarId !== cfg.calendarId) { calendar = createGoogleCalendarProvider(cfg); calendarId = cfg.calendarId }
    return calendar
  }
  let running = false
  const runAll = async () => {
    if (running) return
    running = true
    try {
      const rc = loadRingCentralConfig(process.env)
      const sms = rc.configured ? createRingCentralSms(getPool(), rc, { env: process.env }) : null
      const r = await runAutomation(getPool(), { env: process.env, mailer, staffMailer: mailer, sms, calendar: await calendarFor().catch(() => null), log: logger })
      if (r.jobs?.length) logger.info({ jobs: r.jobs.length, failed: r.jobs.filter((j) => j.result.status === 'failed').length }, 'Automation jobs run')
    } catch (err) {
      logger.warn({ err: { name: err?.name, code: err?.code, message: err?.message } }, 'Automation run failed')
    } finally {
      running = false
    }
  }
  schedule(runAll, 30 * 1000, 60 * 1000)
  schedule(() => purgeOldJobs(getPool()).catch((err) => logger.warn({ err: err.message }, 'Automation job purge failed')), 2 * 60 * 1000, 24 * 60 * 60 * 1000)
  logger.info('Automation worker on (AUTOMATION_ENABLED=true); each automation still needs its own switch')
} else if (!automationWanted) {
  logger.info('Automation worker off (AUTOMATION_ENABLED is not true)')
}

// Test automation mode (server/testChannel/automation.js): the lead
// automation rehearsed on the administrator's test forms. Separate from the
// worker above and from every production switch: it reads and writes the
// test tables only, so it runs while all automations are off. On in
// production; elsewhere only with TEST_AUTOMATION_ENABLED=true, because a
// developer machine may be pointed at the live database and must not pick
// up the administrator's test steps. TEST_AUTOMATION_ENABLED=false switches
// it off everywhere.
{
  const { testAutomationOn, runDueTestSteps } = await import('./testChannel/automation.js')
  if (testAutomationOn(process.env)) {
    const { createResendMailer } = await import('./reminders/email.js')
    const emailReady = !emailProblems.includes('RESEND_API_KEY is not set') && !emailProblems.includes('RESEND_API_KEY is still the placeholder')
    const mailer = emailReady ? createResendMailer({ apiKey: process.env.RESEND_API_KEY, env: process.env }) : null
    let running = false
    const runTests = async () => {
      if (running) return
      running = true
      try {
        const done = await runDueTestSteps(getPool(), { mailer, env: process.env, log: logger })
        if (done.length) logger.info({ steps: done.length }, 'Test automation steps run')
      } catch (err) {
        logger.warn({ err: { name: err?.name, code: err?.code, message: err?.message } }, 'Test automation run failed')
      } finally {
        running = false
      }
    }
    // Every few seconds: a test's acknowledgment should feel immediate. One
    // indexed look at a table that is nearly always empty.
    schedule(runTests, 5 * 1000, 5 * 1000)
    logger.info('Test automation mode on (test channel only; no production automation is involved)')
  }
}

// RingCentral: keep an idle connection alive. Refresh tokens expire (7 days
// by default) unless used, so refresh before that. Only in production by
// default (a developer machine must not rotate the firm's tokens), and only
// when the integration is configured and connected. Never logs a token.
if (flag('RINGCENTRAL_KEEPALIVE')) {
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
  schedule(keepAlive, 2 * 60 * 1000, 6 * 60 * 60 * 1000)
}

// RingCentral call log import every 5 minutes (read-only; docs/ringcentral-call-log.md).
// Same default as the keep-alive: production only unless RINGCENTRAL_CALL_SYNC
// says otherwise. One run at a time across instances (advisory lock).
if (flag('RINGCENTRAL_CALL_SYNC')) {
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
      // A new caller waiting for a call back is announced once (push/missedCallAlerts.js).
      if (r.status === 'ok') await notifyNewMissedCallers(getPool()).catch((err) => logger.warn({ err: { name: err?.name, code: err?.code } }, 'Missed call notifications failed'))
    } catch (err) {
      logger.warn({ provider: 'ringcentral', err: { name: err?.name, code: err?.code } }, 'Call log import error')
    } finally {
      running = false
    }
  }
  schedule(syncCalls, 90 * 1000, 5 * 60 * 1000)
}

// The live call-event subscription, once a day: its state, and a renewal a
// month before it would expire. Never creates one (an administrator does).
// Its own switch, RINGCENTRAL_EVENT_CHECK (it used to run only with the call
// import on); same production-only default.
if (flag('RINGCENTRAL_EVENT_CHECK')) {
  const { loadRingCentralConfig } = await import('./integrations/ringcentral/config.js')
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
  schedule(checkEvents, 10 * 60 * 1000, 24 * 60 * 60 * 1000)
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
