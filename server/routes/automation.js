// /api/automation — the administrator's view of what the portal does on its
// own (server/automation/, docs/phase1-automation.md). Administrators only:
// integrations.view to read, integrations.manage to change.
//
//   GET    /health                    every switch, last runs, counts, failures
//   PUT    /flags/:key                { paused } pause or resume one automation
//   GET    /settings                  timing, hours, templates, rules
//   PUT    /settings/:section         save one section
//   GET    /exceptions                failed automatic work nobody has handled
//   POST   /jobs/:id/retry            try a failed job once more, now
//   POST   /jobs/:id/acknowledge      dealt with another way: off the list
//   GET    /suppressions              who gets no automatic messages
//   POST   /suppressions              { channel, address, reason }
//   DELETE /suppressions/:id
//   POST   /spam/apply                run the vendor rules over leads still New
//   POST   /sms/check                 ask RingCentral now whether texts can be sent
//
// Switching an automation ON is not here on purpose: that is a variable on
// the API service (automation/flags.js), so nothing starts sending because
// of a click.
import { Router } from 'express'
import { param } from 'express-validator'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import validate from '../middleware/validate.js'
import { route } from '../middleware/route.js'
import { setPaused, isFlag } from '../automation/flags.js'
import { loadSettings, saveSection, SettingsError, SECTIONS, FOLLOWUP_CHANNELS } from '../automation/settings.js'
import { VARIABLES, LANGUAGES, SMS_MAX } from '../automation/templates.js'
import { automationHealth, listExceptions } from '../automation/health.js'
import { retryJob, acknowledgeJob } from '../automation/jobs.js'
import { listSuppressions, suppress, unsuppress, CHANNELS, REASONS } from '../automation/suppression.js'
import { applySpamRulesToOpen } from '../automation/spam.js'
import { loadRingCentralConfig } from '../integrations/ringcentral/config.js'
import { smsCapability, UNAVAILABLE } from '../integrations/ringcentral/sms.js'

class AutomationError extends Error {
  constructor(message, status = 400, code = 'automation_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

const idParam = param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid id')

export function createAutomationRouter({ db = null, env = process.env, fetchImpl } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  const wrap = route('Automation route error', { errors: [AutomationError, SettingsError] })
  const read = requireCapability('integrations.view')
  const write = requireCapability('integrations.manage')
  const deps = fetchImpl ? { fetchImpl } : {}

  router.use(requireAuth)

  router.get('/health', read, wrap(async (_req, res) => {
    res.json(await automationHealth(pool(), { env }))
  }))

  router.put('/flags/:key', write, wrap(async (req, res) => {
    const key = String(req.params.key)
    if (!isFlag(key)) throw new AutomationError('Unknown automation', 404, 'not_found')
    if (typeof req.body?.paused !== 'boolean') throw new AutomationError('Say whether to pause or resume')
    await setPaused(pool(), key, req.body.paused, { actorId: req.account.id })
    req.activityDetails = { automation: key, paused: req.body.paused }
    res.json(await automationHealth(pool(), { env }))
  }))

  router.get('/settings', read, wrap(async (_req, res) => {
    res.json({ settings: await loadSettings(pool()), sections: SECTIONS, followupChannels: FOLLOWUP_CHANNELS, templateVariables: VARIABLES, templateLanguages: LANGUAGES, smsMax: SMS_MAX })
  }))

  router.put('/settings/:section', write, wrap(async (req, res) => {
    const section = String(req.params.section)
    const saved = await saveSection(pool(), section, req.body, { actorId: req.account.id })
    req.activityDetails = { section }
    res.json({ section, value: saved })
  }))

  router.get('/exceptions', read, wrap(async (_req, res) => {
    res.json({ items: await listExceptions(pool()) })
  }))

  router.post('/jobs/:id/retry', write, idParam, validate, wrap(async (req, res) => {
    if (!(await retryJob(pool(), req.params.id))) throw new AutomationError('Only failed work can be tried again', 409, 'bad_state')
    res.json({ ok: true })
  }))

  router.post('/jobs/:id/acknowledge', write, idParam, validate, wrap(async (req, res) => {
    if (!(await acknowledgeJob(pool(), req.params.id, req.account.id))) throw new AutomationError('This is not waiting for anyone', 409, 'bad_state')
    res.json({ ok: true })
  }))

  router.get('/suppressions', read, wrap(async (_req, res) => {
    res.json({ items: await listSuppressions(pool()), channels: CHANNELS, reasons: REASONS })
  }))

  router.post('/suppressions', write, wrap(async (req, res) => {
    const { channel, address } = req.body || {}
    const reason = req.body?.reason || 'staff'
    if (typeof address !== 'string' || !address.trim() || address.length > 254) throw new AutomationError('Enter a phone number or an email address')
    try {
      const r = await suppress(pool(), { channel, address, reason, source: 'staff', actorId: req.account.id })
      req.activityDetails = { channel, reason }
      res.status(r.created ? 201 : 200).json({ created: r.created })
    } catch (err) {
      if (err?.status === 400) throw new AutomationError(err.message)
      throw err
    }
  }))

  router.delete('/suppressions/:id', write, idParam, validate, wrap(async (req, res) => {
    if (!(await unsuppress(pool(), { id: req.params.id, actorId: req.account.id }))) throw new AutomationError('Not on the list', 404, 'not_found')
    res.json({ ok: true })
  }))

  router.post('/spam/apply', write, wrap(async (req, res) => {
    const settings = await loadSettings(pool())
    const out = await applySpamRulesToOpen(pool(), settings.spam, { log: req.log })
    req.activityDetails = out
    res.json(out)
  }))

  router.post('/sms/check', write, wrap(async (_req, res) => {
    const cap = await smsCapability(pool(), loadRingCentralConfig(env), { env, deps, force: true })
    res.json({ available: cap.available, sender: cap.sender, reason: cap.reason, reasonText: cap.reason ? UNAVAILABLE[cap.reason] || cap.reason : null, candidates: cap.candidates, checkedAt: cap.checkedAt })
  }))

  return router
}

export default createAutomationRouter
