// POST /webhooks/ringcentral: RingCentral delivers live call events here
// (integrations/ringcentral/telephonyEvents.js). Not a page and not for
// people: everything it receives shows in Calls, on the call it belongs to.
//
// - Creating the subscription: RingCentral sends a Validation-Token header
//   and expects it echoed within 3 seconds, with a 200 and a tiny response.
// - Every delivery after that carries our Verification-Token; anything else
//   is refused. The event is stored before answering, then the call is read
//   again so its classification takes the new evidence into account.
import { Router } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import getPool from '../db/pool.js'
import { isTrustedDelivery, storeNotification } from '../integrations/ringcentral/telephonyEvents.js'
import { classifyStored } from '../integrations/ringcentral/callLog.js'
import { requestQuickSync, endsCall } from '../integrations/ringcentral/quickSync.js'
import { clientKey } from '../httpSecurity.js'

const TOKEN_RE = /^[A-Za-z0-9._~+/=-]{1,256}$/

// onCallEnded: what to do when a party leaves a call (default: import the call
// log soon, so the call reaches Calls within about a minute).
export function createRingCentralWebhookRouter({ db = null, onCallEnded = () => requestQuickSync() } = {}) {
  const router = Router()
  const pool = () => db || getPool()

  // Only refused requests count, so a busy office's real deliveries are
  // never throttled while anyone guessing is held to a few a second.
  router.use(rateLimit({
    windowMs: 60 * 1000, max: 300, skipSuccessfulRequests: true, standardHeaders: false, legacyHeaders: false, keyGenerator: clientKey,
    handler: (_req, res) => res.status(429).end(),
  }))

  // The address check and anything without our token are answered before
  // the body is read or the database is asked.
  router.post('/', (req, res, next) => {
    const validation = req.get('Validation-Token')
    if (validation !== undefined) {
      if (!TOKEN_RE.test(validation)) return res.status(400).end()
      res.set('Validation-Token', validation)
      return res.status(200).type('application/json').end()
    }
    if (!req.get('Verification-Token')) return res.status(401).end()
    next()
  }, express.json({ limit: '256kb' }), async (req, res) => {
    try {
      if (!(await isTrustedDelivery(pool(), req.headers, req.body))) return res.status(401).end()
      const { stored, sessionId } = await storeNotification(pool(), req.body)
      res.status(200).type('application/json').end()
      if (stored && endsCall(req.body)) onCallEnded()
      if (stored && sessionId) {
        classifyStored(pool(), { keys: [sessionId], onlyKeys: true }).catch((err) => req.log?.warn({ err: { name: err?.name, code: err?.code } }, 'Call re-read after live event failed'))
      }
    } catch (err) {
      req.log?.error({ err }, 'RingCentral webhook error')
      if (!res.headersSent) res.status(500).end()
    }
  })

  return router
}

export default createRingCentralWebhookRouter
