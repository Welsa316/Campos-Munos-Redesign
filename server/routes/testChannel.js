// /api/test-channel — the administrator's test forms (testChannel/) and the
// automation tests run on them (testChannel/automation.js).
// Administrators only (forms.test, ADMIN_ONLY).
//
//   POST   /link    a test link for the website, valid for an hour
//   GET    /        the test forms received, newest first
//   GET    /:id     one, with its chat messages and its automation test
//   DELETE /:id     remove one (and its automation test)
//   DELETE /        reset: remove every test form, automation test and the test history
//
//   GET    /automation                 what test mode is set to, what is waiting, the test history
//   PUT    /automation/prefs           this administrator's choices for their tests
//   POST   /automation/tests           make a test form here and start its automation test
//   POST   /:id/automation             start the automation test for a test form
//   POST   /:id/automation/actions     pretend something happened (a reply, a booking, …)
//
// The tests themselves arrive through the public form route
// (routes/submissions.js) carrying the link's token.
//
// Nothing under /automation is written to the staff activity log
// (activity/actions.js): every test action goes to the test's own history.
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import { parseOrigins } from '../httpSecurity.js'
import { emailConfigProblems } from '../utils/emailConfig.js'
import { mintTestToken, TEST_CAPABILITY } from '../testChannel/token.js'
import { listTestSubmissions, getTestSubmission } from '../testChannel/store.js'
import {
  TEST_BANNER, TIMINGS, ACCELERATED_STEP_MS, TestAutomationError, testAutomationOn, planTestSteps, startTestRun, createPortalTest, testAction,
  describeTestRun, testHistory, pendingTests, getTestPrefs, saveTestPrefs, noteTestsRemoved, emailGate,
} from '../testChannel/automation.js'
import { loadSettings } from '../automation/settings.js'
import { loadRingCentralConfig } from '../integrations/ringcentral/config.js'
import { looksLikeEmail } from '../reminders/email.js'
import { stripHtml } from '../utils/sanitize.js'

const ID = /^\d{1,9}$/
const text = (v, max) => stripHtml(String(v ?? '')).trim().slice(0, max)

/** Where the website lives: its first public origin, preferring the bare domain. */
export function websiteOrigin(env = process.env) {
  const list = parseOrigins(env.PUBLIC_ORIGINS)
  return list.find((o) => !/^https?:\/\/www\./.test(o)) || list[0] || 'https://camulaw.com'
}

export function createTestChannelRouter({ db = null, env = process.env } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth, requireCapability(TEST_CAPABILITY))

  // A refusal with a reason the page can act on, or a plain 500.
  const fail = (req, res, err, what) => {
    if (err instanceof TestAutomationError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra })
    req.log?.error({ err }, what)
    res.status(500).json({ error: 'Internal server error' })
  }

  // What the page offers when starting a test, from the body of a request.
  const options = (b) => ({
    timing: TIMINGS.includes(b?.timing) ? b.timing : 'accelerated',
    sendEmail: b?.sendEmail === true,
    sendSms: b?.sendSms === true,
    notifyMe: b?.notifyMe === true,
    confirmKnown: b?.confirmKnown === true,
  })

  router.post('/link', (req, res) => {
    try {
      const { token, expiresAt } = mintTestToken({ accountId: req.account.id, tokenVersion: req.account.tokenVersion }, { secret: env.JWT_SECRET || process.env.JWT_SECRET })
      // In the fragment, so it never reaches a server log or a Referer; the
      // website reads it and takes it out of the address (site/src/utils/testMode.js).
      const site = websiteOrigin(env)
      res.json({ expiresAt, contactUrl: `${site}/consulta#cm-test=${token}`, siteUrl: `${site}/#cm-test=${token}` })
    } catch (err) {
      req.log?.error({ err }, 'Test link error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.get('/', async (req, res) => {
    try {
      res.json({ items: await listTestSubmissions(pool()) })
    } catch (err) {
      req.log?.error({ err }, 'Test channel list error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // --- test automation mode (before /:id, which would read "automation" as an id) ---

  router.get('/automation', async (req, res) => {
    try {
      const settings = await loadSettings(pool())
      const now = new Date()
      // In the order things happen (with real timing the escalation comes before the follow-ups).
      const schedule = (timing) => planTestSteps({ created: now, timing, settings }).map((s) => ({ type: s.type, dueAt: s.dueAt })).sort((a, b) => a.dueAt - b.dueAt)
      const emailProblems = emailConfigProblems(env)
      res.json({
        banner: TEST_BANNER,
        on: testAutomationOn(env),
        acceleratedStepSeconds: ACCELERATED_STEP_MS / 1000,
        // What a test started now would do, in each timing.
        schedules: { now, accelerated: schedule('accelerated'), production: schedule('production') },
        email: { configured: emailProblems.length === 0 },
        // Whether RingCentral is set up on this server at all; whether it
        // can text right now is only known when a text is tried.
        sms: { configured: Boolean(loadRingCentralConfig(env).configured) },
        textConsentRequired: Boolean(settings.ack.smsRequiresFormConsent),
        prefs: await getTestPrefs(pool(), req.account.id),
        pending: await pendingTests(pool()),
        history: await testHistory(pool(), { limit: 100 }),
      })
    } catch (err) { fail(req, res, err, 'Test automation read error') }
  })

  router.put('/automation/prefs', async (req, res) => {
    try {
      const b = req.body || {}
      res.json({ prefs: await saveTestPrefs(pool(), req.account.id, { autoStart: b.autoStart === true, timing: b.timing, sendEmail: b.sendEmail === true, sendSms: b.sendSms === true, notifyMe: b.notifyMe === true }) })
    } catch (err) { fail(req, res, err, 'Test automation preferences error') }
  })

  router.post('/automation/tests', async (req, res) => {
    try {
      const b = req.body || {}
      const firstName = text(b.firstName, 255)
      const email = String(b.email ?? '').trim().toLowerCase()
      if (!firstName) return res.status(400).json({ error: 'A first name is needed for the greeting' })
      if (!looksLikeEmail(email)) return res.status(400).json({ error: 'Enter the email address the test should use' })
      const opts = options(b)
      // Checked before anything is stored, so a refusal leaves no test form behind.
      if (!testAutomationOn(env)) throw new TestAutomationError('test_automation_off', 'Test automation is switched off on this server', 409)
      const c = await pool().connect()
      try {
        await c.query('BEGIN')
        const testId = await createPortalTest(c, { firstName, lastName: text(b.lastName, 255), email, phone: text(b.phone, 50), language: b.language, smsConsent: b.smsConsent === true }, { sentBy: req.account.id })
        const started = await startTestRun(c, { testId, by: req.account.id, ...opts, env })
        await c.query('COMMIT')
        res.status(201).json({ id: testId, ...started })
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        c.release()
      }
    } catch (err) { fail(req, res, err, 'Test automation start error') }
  })

  router.post('/:id/automation', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid test ID' })
    try {
      res.status(201).json(await startTestRun(pool(), { testId: Number(req.params.id), by: req.account.id, ...options(req.body), env }))
    } catch (err) { fail(req, res, err, 'Test automation start error') }
  })

  router.post('/:id/automation/actions', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid test ID' })
    try {
      await testAction(pool(), { testId: Number(req.params.id), action: String(req.body?.action || ''), by: req.account.id, env })
      res.json({ ok: true, automation: await describeTestRun(pool(), Number(req.params.id)) })
    } catch (err) { fail(req, res, err, 'Test automation action error') }
  })

  router.get('/:id', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid test ID' })
    try {
      const row = await getTestSubmission(pool(), Number(req.params.id))
      if (!row) return res.status(404).json({ error: 'Test form not found' })
      res.json({ ...row, automation: await describeTestRun(pool(), row.id), email_gate: emailGate(env, row.email) })
    } catch (err) {
      req.log?.error({ err }, 'Test channel read error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.delete('/:id', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ error: 'Invalid test ID' })
    try {
      const r = await pool().query('DELETE FROM test_submissions WHERE id = $1 RETURNING id', [Number(req.params.id)])
      if (!r.rowCount) return res.status(404).json({ error: 'Test form not found' })
      await noteTestsRemoved(pool(), { count: 1, actorId: req.account.id }).catch((err) => req.log?.warn({ err }, 'Test history note failed'))
      res.json({ ok: true, id: r.rows[0].id })
    } catch (err) {
      req.log?.error({ err }, 'Test channel delete error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Reset: every test form, and with them (ON DELETE CASCADE) every
  // automation test, its steps and its history. Leads are not touched.
  router.delete('/', async (req, res) => {
    try {
      const r = await pool().query('DELETE FROM test_submissions')
      await noteTestsRemoved(pool(), { count: r.rowCount, all: true, actorId: req.account.id }).catch((err) => req.log?.warn({ err }, 'Test history note failed'))
      req.activityDetails = { count: r.rowCount }
      res.json({ ok: true, removed: r.rowCount })
    } catch (err) {
      req.log?.error({ err }, 'Test channel clear error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
