// /api/work-queue — Home's "My follow-ups" (server/reminders/workQueue.js).
// Read-only; any signed-in account, answered with only what it may open
// (calls.view for callers, crm.view for website leads; neither: 403).
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { workQueue } from '../reminders/workQueue.js'

export function createWorkQueueRouter({ db = null, now } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth)
  router.get('/', async (req, res) => {
    if (!req.capabilities.has('calls.view') && !req.capabilities.has('crm.view')) {
      return res.status(403).json({ error: 'Your account cannot perform this action', code: 'forbidden' })
    }
    try {
      res.json(await workQueue(pool(), { accountId: req.account.id, caps: req.capabilities, now: now ? now() : new Date() }))
    } catch (err) {
      req.log?.error({ err }, 'Work queue error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })
  return router
}

export default createWorkQueueRouter
