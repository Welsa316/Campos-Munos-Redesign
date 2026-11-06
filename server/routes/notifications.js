// The desktop app's notifications (push/feed.js): it polls the feed while it
// runs and shows each item as the app's own notification.
//
//   GET  /api/notifications/feed?after=<id>   new items after the cursor;
//                                             without it, just the cursor
//   POST /api/notifications/test              a test item for yourself
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import crypto from 'crypto'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { feedFor, recordNotification } from '../push/feed.js'
import { TEST_NOTIFICATION } from '../push/send.js'

export function createNotificationsRouter({ db = null } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  router.use(requireAuth)

  router.get('/feed', async (req, res) => {
    try {
      const raw = req.query.after
      const after = typeof raw === 'string' && /^\d{1,18}$/.test(raw) ? raw : null
      res.json(await feedFor(pool(), { accountId: req.account.id, after }))
    } catch (err) {
      req.log?.error({ err: { name: err?.name, code: err?.code } }, 'Notification feed error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  const testLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `feed-test:${req.account?.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many test notifications. Wait a few minutes and try again.', code: 'too_many_tests' },
  })
  router.post('/test', testLimiter, async (req, res) => {
    try {
      const id = await recordNotification(pool(), { accountId: req.account.id, eventKey: `test:${crypto.randomUUID()}`, ...TEST_NOTIFICATION, url: '/', tag: 'cm-test-notification' })
      res.status(201).json({ id: String(id) })
    } catch (err) {
      req.log?.error({ err: { name: err?.name, code: err?.code } }, 'Notification test error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
