// /api/push — desktop notifications for the signed-in account (server/push/).
// Any signed-in account; everything is about the caller's own computers.
//
//   GET    /config                 { configured, publicKey }
//   POST   /subscriptions          { subscription } register or refresh this browser
//   POST   /subscriptions/status   { endpoint } is this browser on for me?
//   DELETE /subscriptions          { endpoint } turn this browser off
//   POST   /test                   { endpoint } a test notification to this browser (rate-limited)
//
// The endpoint travels in the body, not the URL, so it never lands in an
// access log: it is the address anyone could push to.
import { Router } from 'express'
import crypto from 'crypto'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import { route } from '../middleware/route.js'
import { accountLimiter } from '../middleware/accountLimiter.js'
import { pushConfig } from '../push/config.js'
import { sendPush, TEST_NOTIFICATION, TEST_LIMIT } from '../push/send.js'
import {
  isPushEndpoint, parseSubscription, saveSubscription, findOwnSubscription, removeOwnSubscription, countOwnSubscriptions,
} from '../push/subscriptions.js'

const NOT_CONFIGURED = { error: 'Desktop notifications are not set up on the server yet. Ask the office administrator.', code: 'push_not_configured' }

export function createPushRouter({ env = process.env, db = null, transport } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  // Brief: an error here could carry a push endpoint, which must not reach the logs.
  const wrap = route('Push route error', { brief: true })
  const endpointOf = (req) => (isPushEndpoint(req.body?.endpoint) ? req.body.endpoint : null)

  // A test is for checking this computer works, not for sending many.
  const testLimiter = accountLimiter(TEST_LIMIT('push-test'))

  router.use(requireAuth)

  router.get('/config', (_req, res) => {
    const cfg = pushConfig(env)
    res.json({ configured: cfg.configured, publicKey: cfg.publicKey })
  })

  router.post('/subscriptions', wrap(async (req, res) => {
    if (!pushConfig(env).configured) return res.status(503).json(NOT_CONFIGURED)
    const sub = parseSubscription(req.body?.subscription)
    if (!sub) return res.status(400).json({ error: 'This browser sent a subscription the portal cannot use.', code: 'invalid_subscription' })
    const row = await saveSubscription(pool(), req.account.id, sub, req.headers['user-agent'])
    req.activityDetails = { created: Boolean(row.inserted) }
    res.status(row.inserted ? 201 : 200).json({ enabled: true, devices: await countOwnSubscriptions(pool(), req.account.id) })
  }))

  router.post('/subscriptions/status', wrap(async (req, res) => {
    const cfg = pushConfig(env)
    const endpoint = endpointOf(req)
    const row = endpoint ? await findOwnSubscription(pool(), req.account.id, endpoint) : null
    res.json({
      configured: cfg.configured,
      enabled: Boolean(row),
      lastSuccessAt: row?.last_success_at ?? null,
      lastFailureAt: row?.last_failure_at ?? null,
      devices: await countOwnSubscriptions(pool(), req.account.id),
    })
  }))

  router.delete('/subscriptions', wrap(async (req, res) => {
    const endpoint = endpointOf(req)
    if (!endpoint) return res.status(400).json({ error: 'No subscription given.', code: 'invalid_subscription' })
    const removed = await removeOwnSubscription(pool(), req.account.id, endpoint)
    res.json({ removed, devices: await countOwnSubscriptions(pool(), req.account.id) })
  }))

  router.post('/test', testLimiter, wrap(async (req, res) => {
    if (!pushConfig(env).configured) return res.status(503).json(NOT_CONFIGURED)
    const endpoint = endpointOf(req)
    const row = endpoint ? await findOwnSubscription(pool(), req.account.id, endpoint) : null
    if (!row) return res.status(404).json({ error: 'Notifications are not turned on on this computer.', code: 'not_subscribed' })
    const result = await sendPush(pool(), {
      accountId: req.account.id,
      eventKey: `test:${crypto.randomUUID()}`,
      ...TEST_NOTIFICATION,
      url: '/',
      tag: 'cm-test-notification',
      subscriptionId: row.id,
      ttl: 120,
    }, { env, ...(transport ? { transport } : {}) })
    const outcome = result.devices[0]?.outcome || result.status
    req.activityDetails = { outcome }
    if (outcome === 'sent') return res.json({ outcome })
    if (outcome === 'expired') return res.status(410).json({ outcome, error: 'This computer’s subscription has expired. Turn notifications on again.', code: 'expired' })
    res.status(502).json({ outcome, error: 'The push service did not accept the test notification. Try again later.', code: 'push_failed' })
  }))

  return router
}
