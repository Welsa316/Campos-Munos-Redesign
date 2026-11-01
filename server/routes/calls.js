// /api/calls — the RingCentral call log as the portal shows it
// (docs/ringcentral-call-log.md). Needs calls.view (administrators and the
// front desk). Read-only towards RingCentral.
//
//   GET  /api/calls        calls in a time range, with counts and import status
//                          (businessHours=1: Mon–Fri 9–5 New Orleans time only)
//   GET  /api/calls/summary unanswered business-hours calls, last 30 days
//   POST /api/calls/sync   import now (at most every 30 seconds; otherwise the
//                          last result is returned)
//   POST|DELETE /api/calls/:id/exclusion  mark a missed call as needing no
//                          callback, or count it again (calls.exclude)
//   GET|PUT /api/calls/ringout/me       the phone RingCentral rings for me first
//   POST    /api/calls/ringout          call a number (RingOut; calls.place)
//   GET|DELETE /api/calls/ringout/:id   progress / cancel (own calls only)
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability, { can } from '../middleware/requireCapability.js'
import { loadRingCentralConfig } from '../integrations/ringcentral/config.js'
import { getConnectionStatus } from '../integrations/ringcentral/service.js'
import { queryCalls, syncCallLog, getSyncState, summarizeMissed, OUTCOME_FILTERS } from '../integrations/ringcentral/callLog.js'
import { excludeCall, includeCall, CallExclusionError } from '../integrations/ringcentral/callExclusions.js'
import { placeRingOut, ringOutStatus, cancelRingOut, getMyPhone, setMyPhone, RingOutError } from '../integrations/ringcentral/ringout.js'

const MANUAL_SYNC_MIN_INTERVAL_MS = 30 * 1000
const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000

export function createCallsRouter({ db = null, env = process.env, fetchImpl, now, sleep, pageDelayMs } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  const config = () => loadRingCentralConfig(env)
  const clock = () => (now ? now() : new Date())
  const deps = { ...(fetchImpl ? { fetchImpl } : {}), ...(now ? { now } : {}) }

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  router.use(requireAuth, requireCapability('calls.view'))

  async function status(req) {
    const cfg = config()
    const conn = await getConnectionStatus(pool(), cfg)
    return {
      configured: cfg.configured,
      connection: conn.status,
      canManageConnection: can(req, 'integrations.manage'),
      sync: await getSyncState(pool()),
    }
  }

  router.get('/', async (req, res) => {
    try {
      const n = clock()
      const parse = (v, fallback) => {
        const d = typeof v === 'string' && v ? new Date(v) : fallback
        return Number.isNaN(d?.getTime?.()) ? null : d
      }
      const to = parse(req.query.to, new Date(n.getTime() + 60 * 1000))
      const from = parse(req.query.from, new Date(n.getTime() - 7 * 24 * 60 * 60 * 1000))
      if (!from || !to || from >= to || to - from > MAX_RANGE_MS) return res.status(400).json({ error: 'Invalid date range' })
      const outcome = typeof req.query.outcome === 'string' && OUTCOME_FILTERS.includes(req.query.outcome) ? req.query.outcome : 'all'
      const q = typeof req.query.q === 'string' ? req.query.q : ''
      const businessHours = ['1', 'true'].includes(String(req.query.businessHours || ''))
      const result = await queryCalls(pool(), { from, to, outcome, q, limit: req.query.limit, businessHours })
      res.json({ ...result, ...(await status(req)) })
    } catch (err) {
      req.log?.error({ err }, 'List calls error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Home dashboard: unanswered calls in business hours, last 30 days.
  router.get('/summary', async (req, res) => {
    try {
      const n = clock()
      const from = typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : null
      if (from && (Number.isNaN(from.getTime()) || from >= n || n - from > 31 * 24 * 60 * 60 * 1000)) return res.status(400).json({ error: 'Invalid start' })
      const missed = await summarizeMissed(pool(), { now: n, days: 30, from })
      res.json({ missed, ...(await status(req)) })
    } catch (err) {
      req.log?.error({ err }, 'Call summary error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/sync', async (req, res) => {
    try {
      const cfg = config()
      if (!cfg.configured) return res.status(409).json({ error: 'RingCentral is not set up on the server', code: 'not_configured', ...(await status(req)) })
      const state = await getSyncState(pool())
      const last = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0
      let result = { status: 'skipped' }
      if (clock().getTime() - last >= MANUAL_SYNC_MIN_INTERVAL_MS) {
        result = await syncCallLog(pool(), cfg, {
          trigger: 'manual', deps,
          backfillDays: Number(env.RINGCENTRAL_CALL_BACKFILL_DAYS) || undefined,
          retentionDays: Number(env.RINGCENTRAL_CALL_RETENTION_DAYS) || undefined,
          ...(sleep ? { sleep } : {}), ...(pageDelayMs != null ? { pageDelayMs } : {}),
        })
        req.log?.info({ provider: 'ringcentral', sync: result.status, code: result.code, fetched: result.fetched, new: result.new }, 'Call log import')
      }
      res.json({ result, ...(await status(req)) })
    } catch (err) {
      req.log?.error({ err }, 'Call sync error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // --- Missed calls that need no callback (calls.exclude) ------------------------

  const exclude = requireCapability('calls.exclude')
  const exclusionWrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof CallExclusionError) return res.status(err.status).json({ error: err.message, code: err.code })
      req.log?.error({ err }, 'Call exclusion error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  router.post('/:id(\\d+)/exclusion', exclude, exclusionWrap(async (req, res) => {
    const b = req.body || {}
    const out = await excludeCall(pool(), { callId: Number(req.params.id), reason: b.reason, note: b.note, scope: b.scope, accountId: req.account.id })
    req.log?.info({ call: out.callId, scope: out.scope, reason: out.reason }, 'Missed call marked as needing no callback')
    res.json(out)
  }))

  router.delete('/:id(\\d+)/exclusion', exclude, exclusionWrap(async (req, res) => {
    const out = await includeCall(pool(), { callId: Number(req.params.id) })
    req.log?.info({ call: out.callId, removedCall: out.removedCall, removedNumber: out.removedNumber }, 'Missed call counted again')
    res.json(out)
  }))

  // --- RingOut: call a number from the portal (calls.place) ---------------------

  const place = requireCapability('calls.place')
  // A slip that fires many calls is stopped well before it costs anything.
  const placeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => `account:${req.account?.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many calls placed in a few minutes. Wait a moment and try again.', code: 'too_many_calls' },
  })
  const ringWrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof RingOutError) return res.status(err.status).json({ error: err.message, code: err.code })
      req.log?.error({ err: { name: err?.name, code: err?.code } }, 'RingOut error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  router.get('/ringout/me', place, ringWrap(async (req, res) => {
    const conn = await getConnectionStatus(pool(), config())
    res.json({ phone: await getMyPhone(pool(), req.account.id), connection: conn.status, configured: conn.configured })
  }))

  router.put('/ringout/me', place, ringWrap(async (req, res) => {
    const phone = await setMyPhone(pool(), req.account.id, typeof req.body?.phone === 'string' ? req.body.phone : null)
    res.json({ phone })
  }))

  router.post('/ringout', place, placeLimiter, ringWrap(async (req, res) => {
    const cfg = config()
    if (!cfg.configured) throw new RingOutError('not_configured', 'RingCentral is not set up on the server', 409)
    const out = await placeRingOut(pool(), cfg, { accountId: req.account.id, to: typeof req.body?.to === 'string' ? req.body.to : '', env }, deps)
    req.log?.info({ provider: 'ringcentral', ringout: out.id, phase: out.phase }, 'RingOut placed')
    res.status(201).json(out)
  }))

  router.get('/ringout/:id(\\d+)', place, ringWrap(async (req, res) => {
    res.json(await ringOutStatus(pool(), config(), { id: Number(req.params.id), accountId: req.account.id }, deps))
  }))

  router.delete('/ringout/:id(\\d+)', place, ringWrap(async (req, res) => {
    res.json(await cancelRingOut(pool(), config(), { id: Number(req.params.id), accountId: req.account.id }, deps))
  }))

  return router
}

export default createCallsRouter
