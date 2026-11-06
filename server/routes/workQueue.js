// /api/work-queue — Home's "My follow-ups" (server/reminders/workQueue.js).
// Read-only; any signed-in account, answered with only what it may open
// (calls.view for callers, crm.view for website leads; neither: 403).
import { Router } from 'express'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { requireAnyCapability } from '../middleware/requireCapability.js'
import { route } from '../middleware/route.js'
import { workQueue } from '../reminders/workQueue.js'

export function createWorkQueueRouter({ db = null, now } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth)
  router.get('/', requireAnyCapability('calls.view', 'crm.view'), route('Work queue error')(async (req, res) => {
    res.json(await workQueue(pool(), { accountId: req.account.id, caps: req.capabilities, now: now ? now() : new Date() }))
  }))
  return router
}

export default createWorkQueueRouter
