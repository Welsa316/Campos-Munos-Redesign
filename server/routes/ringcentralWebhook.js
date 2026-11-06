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

// RingCentral refuses an address whose answer to its check is over 1024
// bytes, headers included (SUB-525), and Railway adds about 150 of its own.
// The browser-only headers helmet sets on every response mean nothing to
// RingCentral's server, so the webhook answers without them.
const BROWSER_HEADERS = [
  'Content-Security-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy', 'Cross-Origin-Embedder-Policy',
  'Origin-Agent-Cluster', 'Referrer-Policy', 'X-DNS-Prefetch-Control', 'X-Download-Options', 'X-Frame-Options',
  'X-Permitted-Cross-Domain-Policies', 'X-XSS-Protection',
]

// onCallEnded: what to do when a party leaves a call (default: import the call
// log soon, so the call reaches Calls within about a minute).
export function createRingCentralWebhookRouter({ db = null, onCallEnded = () => requestQuickSync() } = {}) {
  const router = Router()
  const pool = () => db || getPool()

  // A busy office makes a few events a second; this only stops floods.
  router.use((_req, res, next) => {
    for (const h of BROWSER_HEADERS) res.removeHeader(h)
    next()
  })
  router.use(rateLimit({ windowMs: 60 * 1000, max: 1200, standardHeaders: false, legacyHeaders: false, keyGenerator: clientKey }))

  router.post('/', express.json({ limit: '256kb' }), async (req, res) => {
    const validation = req.get('Validation-Token')
    if (validation !== undefined) {
      if (!TOKEN_RE.test(validation)) return res.status(400).end()
      res.set('Validation-Token', validation)
      return res.status(200).type('application/json').end()
    }
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
