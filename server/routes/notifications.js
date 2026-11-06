// The desktop app's notifications (push/feed.js): it polls the feed while it
// runs and shows each item as the app's own notification.
//
//   GET  /api/notifications/feed?after=<id>   new items after the cursor;
//                                             without it, just the cursor
//   POST /api/notifications/test              a test item for yourself
import { Router } from 'express'
import crypto from 'crypto'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { route } from '../middleware/route.js'
import { accountLimiter } from '../middleware/accountLimiter.js'
import { feedFor, recordNotification } from '../push/feed.js'
import { TEST_NOTIFICATION, TEST_LIMIT } from '../push/send.js'

export function createNotificationsRouter({ db = null } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth)

  const wrap = route('Notification feed error', { brief: true })

  router.get('/feed', wrap(async (req, res) => {
    const raw = req.query.after
    const after = typeof raw === 'string' && /^\d{1,18}$/.test(raw) ? raw : null
    res.json(await feedFor(pool(), { accountId: req.account.id, after }))
  }))

  router.post('/test', accountLimiter(TEST_LIMIT('feed-test')), wrap(async (req, res) => {
    const id = await recordNotification(pool(), { accountId: req.account.id, eventKey: `test:${crypto.randomUUID()}`, ...TEST_NOTIFICATION, url: '/', tag: 'cm-test-notification' })
    res.status(201).json({ id: String(id) })
  }))

  return router
}
