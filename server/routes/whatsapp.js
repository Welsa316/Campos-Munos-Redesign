// Meta WhatsApp Cloud API webhook.
//
//   GET  /webhooks/whatsapp  — one-time verification handshake from the Meta
//                              App Dashboard (echoes hub.challenge).
//   POST /webhooks/whatsapp  — inbound messages and delivery/read statuses.
//
// Mounted in index.js BEFORE express.json(): the signature is an HMAC of the
// raw bytes, so this router parses its own body with express.raw().
//
// Receiving only. Nothing here calls the Graph API or sends a message.
import { Router, raw } from 'express'
import logger from '../logger.js'
import whatsappEvents from '../db/whatsappEvents.js'
import { verifyChallenge, verifySignature, extractEvents } from '../utils/whatsapp.js'

const BODY_LIMIT = '1mb'
// Meta retries a delivery it thinks failed, usually within seconds. The
// in-memory set absorbs those before they reach Postgres; the UNIQUE index
// on whatsapp_events is the durable check behind it.
const RECENT_KEYS_MAX = 5000

/**
 * Bounded insertion-ordered set. `add` returns false when the key was already
 * present. Oldest keys are evicted once the cap is hit.
 */
export function createRecentKeys(max = RECENT_KEYS_MAX) {
  const keys = new Set()
  return {
    add(key) {
      if (keys.has(key)) return false
      keys.add(key)
      if (keys.size > max) keys.delete(keys.values().next().value)
      return true
    },
    has: (key) => keys.has(key),
    delete: (key) => keys.delete(key),
    get size() { return keys.size },
  }
}

export function createWhatsappRouter({
  env = process.env,
  store = whatsappEvents,
  log = logger,
  recentKeys = createRecentKeys(),
  // Called once per newly stored event (billing: delivery receipts, client
  // replies, opt-outs). Defaults to nothing so the router stays usable alone.
  onEvent = null,
} = {}) {
  const router = Router()

  router.get('/', (req, res) => {
    const challenge = verifyChallenge(req.query, env)
    if (challenge === null) {
      ;(req.log ?? log).warn({ mode: req.query['hub.mode'] }, 'WhatsApp webhook verification refused')
      return res.status(403).type('text/plain').send('Forbidden')
    }
    ;(req.log ?? log).info('WhatsApp webhook verified')
    res.status(200).type('text/plain').send(challenge)
  })

  // Accept any content type: a misdeclared header must still reach the
  // signature check (and fail there) rather than fall through to a 404.
  router.post('/', raw({ type: () => true, limit: BODY_LIMIT }), (req, res) => {
    const reqLog = req.log ?? log
    const appSecret = env.META_APP_SECRET
    if (!appSecret) {
      // Fail closed: without the secret we cannot tell Meta from anyone else.
      reqLog.error('META_APP_SECRET is not set; refusing WhatsApp webhook delivery')
      return res.status(503).json({ error: 'Webhook not configured' })
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : null
    if (!rawBody || !verifySignature(rawBody, req.get('x-hub-signature-256'), appSecret)) {
      reqLog.warn({ bytes: rawBody?.length ?? 0 }, 'WhatsApp webhook signature rejected')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    let payload
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'Malformed JSON' })
    }

    // The signature already proved this came from our Meta app. A delivery for
    // another product (Page, Instagram) pointed at this URL is still acknowledged
    // — a non-2xx would make Meta retry it for hours and eventually drop the
    // subscription — but nothing is stored.
    if (payload?.object !== 'whatsapp_business_account') {
      reqLog.warn({ object: payload?.object ?? null }, 'WhatsApp webhook: unexpected object, ignored')
      return res.sendStatus(200)
    }

    const events = extractEvents(payload)
    // Acknowledge first. Meta's deadline is short and it redelivers anything
    // not answered 200, so storage and any later work happen after the reply.
    res.sendStatus(200)

    const fresh = events.filter((evt) => recentKeys.add(evt.key))
    const skipped = events.length - fresh.length
    if (skipped) reqLog.info({ skipped }, 'WhatsApp webhook: redelivered events ignored')
    if (!fresh.length) return

    setImmediate(() => {
      processEvents(fresh, { store, log: reqLog, recentKeys, onEvent }).catch((err) => {
        reqLog.error({ err }, 'WhatsApp webhook processing failed')
      })
    })
  })

  return router
}

/**
 * Persist each event once. Logged fields are identifiers and types only — no
 * phone numbers, names or message text, which stay in the database row.
 *
 * Meta already has its 200 by the time this runs, so a failed insert is lost
 * unless someone replays it (Meta dashboard → Webhooks → Test, or a manual
 * POST). Releasing the key from the in-memory guard is what lets that replay
 * through instead of being dropped as a duplicate until the next restart.
 */
export async function processEvents(events, { store, log, recentKeys, onEvent = null }) {
  for (const evt of events) {
    try {
      const isNew = await store.recordEvent(evt)
      if (!isNew) {
        log.info({ key: evt.key }, 'WhatsApp event already recorded, skipped')
        continue
      }
      if (onEvent) {
        // Stored first, handled second: a failure here never loses the event,
        // and it is logged with ids only.
        try {
          await onEvent(evt, log)
        } catch (err) {
          log.error({ err: err.message, key: evt.key }, 'WhatsApp event handler failed')
        }
      }
      if (evt.kind === 'message') {
        log.info({ messageId: evt.messageId, messageType: evt.messageType, phoneNumberId: evt.phoneNumberId }, 'WhatsApp message received')
      } else {
        log.info({ messageId: evt.messageId, status: evt.status, phoneNumberId: evt.phoneNumberId }, 'WhatsApp message status')
        if (evt.status === 'failed') {
          log.warn({ messageId: evt.messageId, errors: evt.raw?.errors ?? null }, 'WhatsApp delivery failed')
        }
      }
    } catch (err) {
      recentKeys?.delete(evt.key)
      log.error({ err, key: evt.key }, 'WhatsApp event could not be stored')
    }
  }
}

export default createWhatsappRouter({
  onEvent: async (evt, log) => {
    const [{ default: getPool }, { handleWhatsAppEvent }] = await Promise.all([
      import('../db/pool.js'),
      import('../billing/whatsappInbound.js'),
    ])
    return handleWhatsAppEvent(getPool(), evt, { log })
  },
})
