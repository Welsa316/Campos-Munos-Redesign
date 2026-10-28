// Meta WhatsApp Cloud API webhook helpers. Pure functions, no I/O, so the
// handshake, signature check and payload flattening can be tested without a
// server. The route in routes/whatsapp.js wires them to Express and Postgres.
import crypto from 'crypto'

const SIGNATURE_PREFIX = 'sha256='
const HMAC_HEX_LENGTH = 64
// A verify token is a shared secret; the .env.example placeholder and very
// short values must never complete the handshake.
const MIN_VERIFY_TOKEN_LENGTH = 16
const PLACEHOLDER_RE = /change[-_ ]?me/i

export function isUsableVerifyToken(token) {
  return typeof token === 'string' && token.length >= MIN_VERIFY_TOKEN_LENGTH && !PLACEHOLDER_RE.test(token)
}

/**
 * Constant-time string equality. Lengths are compared first via a fixed
 * digest so a length mismatch doesn't short-circuit on the first byte.
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length
}

/**
 * Meta's verification handshake: GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
 * Returns the challenge to echo back, or null when anything is off. An
 * unconfigured WHATSAPP_VERIFY_TOKEN never matches — an empty token must not
 * let an empty query through.
 */
export function verifyChallenge(query, env = process.env) {
  const expected = env.WHATSAPP_VERIFY_TOKEN
  if (!isUsableVerifyToken(expected)) return null
  const mode = query?.['hub.mode']
  const token = query?.['hub.verify_token']
  const challenge = query?.['hub.challenge']
  if (mode !== 'subscribe') return null
  if (typeof challenge !== 'string' || !challenge) return null
  if (!safeEqual(token, expected)) return null
  return challenge
}

/**
 * X-Hub-Signature-256 is "sha256=" + hex HMAC-SHA256 of the raw request body
 * keyed with the app secret. The body must be the exact bytes Meta sent —
 * re-serialising parsed JSON reorders keys and breaks the digest, which is
 * why the route reads the body as a Buffer.
 */
export function verifySignature(rawBody, header, appSecret) {
  if (!Buffer.isBuffer(rawBody)) return false
  if (typeof appSecret !== 'string' || !appSecret) return false
  if (typeof header !== 'string' || !header.startsWith(SIGNATURE_PREFIX)) return false
  const provided = header.slice(SIGNATURE_PREFIX.length).toLowerCase()
  if (provided.length !== HMAC_HEX_LENGTH || !/^[0-9a-f]+$/.test(provided)) return false
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
}

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0

function toDate(unixSeconds) {
  const n = Number(unixSeconds)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null
}

/**
 * Flatten a webhook payload into a list of events we can store and
 * deduplicate. Only the `messages` field is handled; each inbound message
 * becomes one 'message' event keyed by its wamid, and each status change
 * (sent → delivered → read / failed) becomes one 'status' event keyed by
 * wamid + status, since the same id legitimately arrives several times.
 * Malformed entries are skipped, never thrown on.
 */
export function extractEvents(payload) {
  const events = []
  if (!payload || !Array.isArray(payload.entry)) return events

  for (const entry of payload.entry) {
    if (!entry || !Array.isArray(entry.changes)) continue
    for (const change of entry.changes) {
      if (!change || change.field !== 'messages' || !change.value || typeof change.value !== 'object') continue
      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id ?? null
      const displayPhoneNumber = value.metadata?.display_phone_number ?? null
      const contacts = Array.isArray(value.contacts) ? value.contacts : []

      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          if (!msg || !isNonEmptyString(msg.id)) continue
          const contact = contacts.find((c) => c?.wa_id === msg.from)
          events.push({
            kind: 'message',
            key: `message:${msg.id}`,
            messageId: msg.id,
            from: isNonEmptyString(msg.from) ? msg.from : null,
            contactName: contact?.profile?.name ?? null,
            recipient: null,
            status: null,
            messageType: isNonEmptyString(msg.type) ? msg.type : 'unknown',
            phoneNumberId,
            displayPhoneNumber,
            wabaId: isNonEmptyString(entry.id) ? entry.id : null,
            timestamp: toDate(msg.timestamp),
            raw: msg,
          })
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          if (!st || !isNonEmptyString(st.id) || !isNonEmptyString(st.status)) continue
          events.push({
            kind: 'status',
            key: `status:${st.id}:${st.status}`,
            messageId: st.id,
            from: null,
            contactName: null,
            recipient: isNonEmptyString(st.recipient_id) ? st.recipient_id : null,
            status: st.status,
            messageType: null,
            phoneNumberId,
            displayPhoneNumber,
            wabaId: isNonEmptyString(entry.id) ? entry.id : null,
            timestamp: toDate(st.timestamp),
            raw: st,
          })
        }
      }
    }
  }
  return events
}

/**
 * The verify token travels in the query string of Meta's handshake, and the
 * request logger prints req.url. Mask it so the token never lands in logs.
 * The dot may arrive percent-encoded (%2E); qs decodes both to the same key.
 */
const VERIFY_TOKEN_PARAM_RE = /(hub(?:\.|%2e)verify_token=)[^&]*/gi
export function redactVerifyToken(url) {
  if (typeof url !== 'string' || !/verify_token=/i.test(url)) return url
  return url.replace(VERIFY_TOKEN_PARAM_RE, '$1%5BREDACTED%5D')
}
