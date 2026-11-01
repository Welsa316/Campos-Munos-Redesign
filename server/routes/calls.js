// /api/calls — the RingCentral call log as the portal shows it
// (docs/ringcentral-call-log.md). Needs calls.view (administrators and the
// front desk). Read-only towards RingCentral.
//
//   GET  /api/calls        calls in a time range, with counts and import status
//                          (businessHours=1: Mon–Fri 9–5 New Orleans time only)
//   GET  /api/calls/summary unanswered business-hours calls, last 30 days
//   POST /api/calls/sync   import now (at most every 30 seconds; otherwise the
//                          last result is returned)
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability, { can } from '../middleware/requireCapability.js'
import { loadRingCentralConfig } from '../integrations/ringcentral/config.js'
import { getConnectionStatus } from '../integrations/ringcentral/service.js'
import { queryCalls, syncCallLog, getSyncState, summarizeMissed, OUTCOME_FILTERS } from '../integrations/ringcentral/callLog.js'

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

  return router
}

export default createCallsRouter
