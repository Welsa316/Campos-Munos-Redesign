// /api/calls — the RingCentral call log as the portal shows it
// (docs/ringcentral-call-log.md). Needs calls.view (administrators and the
// front desk). Read-only towards RingCentral.
//
//   GET  /api/calls        calls in a time range, with counts and import status
//                          (businessHours=1: Mon–Fri 9–5 New Orleans time only)
//   GET  /api/calls/changes a stamp that moves when anything on the page changes
//   GET  /api/calls/:id/evidence  one call's steps, facts and live timeline
//                          (each live party has a partyId unique in the call)
//   GET  /api/calls/summary unanswered business-hours calls, last 30 days
//   POST /api/calls/sync   import now (at most every 30 seconds; otherwise the
//                          last result is returned)
//   POST|DELETE /api/calls/:id/exclusion  mark a missed call as needing no
//                          callback, or count it again (calls.exclude)
//   POST|DELETE /api/calls/:id/handled  dealt with another way, or reopened
//                          (calls.exclude)
//   POST /api/calls/episodes/handled  { callIds, note }: every call of one
//                          callback episode handled (calls.exclude)
//   POST /api/calls/episodes/reopen   { callIds }: undo that (calls.exclude)
//   GET|POST /api/calls/handled/bulk  Clear the list (calls.clear); review=1
//                          includes the review group's calls
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
import { queryCalls, syncCallLog, getSyncState, summarizeMissed, OUTCOME_FILTERS, callEvidence, listPeople, callKpis, callsStamp, openCalls } from '../integrations/ringcentral/callLog.js'
import { UNANSWERED_CLASSES } from '../integrations/ringcentral/callEvidence.js'
import { excludeCall, includeCall, markHandled, unmarkHandled, markEpisodeHandled, reopenEpisode, clearOpenCalls, undoClear, CallExclusionError } from '../integrations/ringcentral/callExclusions.js'
import { placeRingOut, ringOutStatus, cancelRingOut, getMyPhone, setMyPhone, RingOutError } from '../integrations/ringcentral/ringout.js'
import { notifyNewMissedCallers } from '../push/missedCallAlerts.js'

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
    const [conn, sync] = await Promise.all([getConnectionStatus(pool(), cfg), getSyncState(pool())])
    return {
      configured: cfg.configured,
      connection: conn.status,
      canManageConnection: can(req, 'integrations.manage'),
      sync,
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
      // A RingCentral extension id (digits): calls proven offered to that person.
      const person = typeof req.query.person === 'string' && /^\d{1,20}$/.test(req.query.person) ? req.query.person : null
      // Independent reads run together: each costs a database round trip.
      const withKpis = ['1', 'true'].includes(String(req.query.kpis || ''))
      const [result, people, st, kpis, stamp] = await Promise.all([
        queryCalls(pool(), { from, to, outcome, q, limit: req.query.limit, businessHours, person, now: n }),
        listPeople(pool()),
        status(req),
        withKpis ? callKpis(pool(), { now: n }) : null,
        callsStamp(pool()),
      ])
      // The vocabulary the page works with comes from here, not from copies in the page.
      const vocabulary = { unansweredClasses: UNANSWERED_CLASSES, outcomeFilters: OUTCOME_FILTERS }
      res.json({ ...result, people, ...vocabulary, ...(kpis ? { kpis } : {}), stamp, ...st })
    } catch (err) {
      req.log?.error({ err }, 'List calls error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // Has anything on the Calls page changed? One cheap query; the page polls it
  // every few seconds and reloads the list only when the answer moves.
  router.get('/changes', async (req, res) => {
    try {
      res.json({ stamp: await callsStamp(pool()) })
    } catch (err) {
      req.log?.error({ err }, 'Calls change check error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // One call's evidence: every step RingCentral recorded, what each reason
  // means, who it was confirmed offered to, and why it is classified as it is.
  router.get('/:id(\\d{1,15})/evidence', async (req, res) => {
    try {
      const ev = await callEvidence(pool(), Number(req.params.id))
      if (!ev) return res.status(404).json({ error: 'Call not found' })
      res.json(ev)
    } catch (err) {
      req.log?.error({ err }, 'Call evidence error')
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
        // A new caller waiting for a call back is announced once; not waited for.
        if (result.status === 'ok') notifyNewMissedCallers(pool(), { now: clock() }).catch((err) => req.log?.warn({ err: { name: err?.name } }, 'Missed call notifications failed'))
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

  router.post('/:id(\\d{1,15})/exclusion', exclude, exclusionWrap(async (req, res) => {
    const b = req.body || {}
    // callIds: the rest of the call's callback episode, marked with it.
    const out = await excludeCall(pool(), { callId: Number(req.params.id), callIds: b.callIds, reason: b.reason, note: b.note, scope: b.scope, accountId: req.account.id })
    req.log?.info({ call: out.callId, scope: out.scope, reason: out.reason }, 'Missed call marked as needing no callback')
    res.json(out)
  }))

  router.delete('/:id(\\d{1,15})/exclusion', exclude, exclusionWrap(async (req, res) => {
    const out = await includeCall(pool(), { callId: Number(req.params.id) })
    req.log?.info({ call: out.callId, removedCall: out.removedCall, removedNumber: out.removedNumber }, 'Missed call counted again')
    res.json(out)
  }))

  // Dealt with another way (a callback from a mobile, an email): it leaves
  // Needs attention. Same permission as marking a call as needing no callback.
  router.post('/:id(\\d{1,15})/handled', exclude, exclusionWrap(async (req, res) => {
    res.json(await markHandled(pool(), { callId: Number(req.params.id), note: req.body?.note, accountId: req.account.id }))
  }))

  router.delete('/:id(\\d{1,15})/handled', exclude, exclusionWrap(async (req, res) => {
    res.json(await unmarkHandled(pool(), { callId: Number(req.params.id) }))
  }))

  // One person's callback episode at once: the ids the page listed for it.
  router.post('/episodes/handled', exclude, exclusionWrap(async (req, res) => {
    res.json(await markEpisodeHandled(pool(), { callIds: req.body?.callIds, note: req.body?.note, accountId: req.account.id }))
  }))
  router.post('/episodes/reopen', exclude, exclusionWrap(async (req, res) => {
    res.json(await reopenEpisode(pool(), { callIds: req.body?.callIds }))
  }))

  // Clear the list: every open call received before `before` (default now)
  // marked handled at once, with one note. Administrators only (calls.clear).
  const clear = requireCapability('calls.clear')
  const cutoff = (v) => {
    if (v == null || v === '') return clock()
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const flag = (v) => v === true || ['1', 'true'].includes(String(v ?? ''))
  // How many it would clear, for the confirmation: calls, the people they
  // are from, and the review group's calls (cleared only when asked).
  router.get('/handled/bulk', clear, exclusionWrap(async (req, res) => {
    const before = cutoff(req.query.before)
    if (!before) return res.status(400).json({ error: 'Invalid date', code: 'invalid_date' })
    const open = await openCalls(pool(), { before, now: clock(), review: flag(req.query.review) })
    res.json({ count: open.keys.length, people: open.people, review: open.review })
  }))
  router.post('/handled/bulk', clear, exclusionWrap(async (req, res) => {
    const before = cutoff(req.body?.before)
    if (!before) return res.status(400).json({ error: 'Invalid date', code: 'invalid_date' })
    const out = await clearOpenCalls(pool(), { before, note: req.body?.note, accountId: req.account.id, now: clock(), review: flag(req.body?.review) })
    req.log?.info({ cleared: out.cleared, batch: out.batch }, 'Needs attention cleared')
    res.json(out)
  }))
  router.delete('/handled/bulk/:batch([0-9a-f-]{36})', clear, exclusionWrap(async (req, res) => {
    res.json(await undoClear(pool(), { batch: req.params.batch }))
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
    const phone = await setMyPhone(pool(), req.account.id, typeof req.body?.phone === 'string' ? req.body.phone : null, env)
    res.json({ phone })
  }))

  router.post('/ringout', place, placeLimiter, ringWrap(async (req, res) => {
    const cfg = config()
    if (!cfg.configured) throw new RingOutError('not_configured', 'RingCentral is not set up on the server', 409)
    const out = await placeRingOut(pool(), cfg, { accountId: req.account.id, to: typeof req.body?.to === 'string' ? req.body.to : '', env }, deps)
    req.log?.info({ provider: 'ringcentral', ringout: out.id, phase: out.phase }, 'RingOut placed')
    res.status(201).json(out)
  }))

  router.get('/ringout/:id(\\d{1,15})', place, ringWrap(async (req, res) => {
    res.json(await ringOutStatus(pool(), config(), { id: Number(req.params.id), accountId: req.account.id }, deps))
  }))

  router.delete('/ringout/:id(\\d{1,15})', place, ringWrap(async (req, res) => {
    res.json(await cancelRingOut(pool(), config(), { id: Number(req.params.id), accountId: req.account.id }, deps))
  }))

  return router
}

export default createCallsRouter
