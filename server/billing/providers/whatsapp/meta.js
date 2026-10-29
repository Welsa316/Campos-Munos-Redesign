// Meta WhatsApp Cloud API provider: sends one approved template message per
// call. Implements the messaging provider interface in ../../reminderModel.js.
//
// The one rule that shapes everything here: a retry must never send a second
// copy if the first may have gone out. So every response is sorted into
//   ok      — Meta accepted it and returned a wamid
//   failed  — Meta definitely did not accept it (retryable says whether trying
//             again later can help)
//   unknown — it may have been accepted (timeout or reset after the request
//             was written, a 5xx we cannot attribute, an unreadable body).
//             Never resent automatically; a late webhook receipt or staff
//             resolves it.
//
// Sources (checked 2026-10-29):
//   Error codes:   https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
//   Versions:      https://developers.facebook.com/docs/graph-api/changelog/versions
//                  (v26.0 released 2026-07-29, newest listed; v25.0 expires 2028-07-29)
//   Send endpoint: POST https://graph.facebook.com/{version}/{phone-number-id}/messages
//
// The access token only ever appears in the Authorization header. It is never
// logged, returned, or included in an error message (messages are scrubbed of
// it anyway, in case Meta or the network layer ever echoes it). Logs carry ids
// and codes only: never phone numbers or message text.

export const DEFAULT_GRAPH_API_VERSION = 'v26.0'
const GRAPH_BASE = 'https://graph.facebook.com'
const VERSION_RE = /^v\d{1,3}\.\d{1,3}$/
const PHONE_NUMBER_ID_RE = /^\d{5,32}$/
const MAX_MESSAGE_LENGTH = 300

export class WhatsAppConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WhatsAppConfigError'
    this.code = 'whatsapp_not_configured'
  }
}

/**
 * E.164 without the '+': 8 to 15 digits, no leading zero (country codes never
 * start with 0). Returns a boolean.
 */
export function validateRecipient(to) {
  return typeof to === 'string' && /^[1-9]\d{7,14}$/.test(to)
}

// ---------------------------------------------------------------------------
// Error classification. Each set cites the meaning from the error-codes page.

// Authorization / permission: 0 token not authenticated, 3 capability missing,
// 10 permission missing or account ineligible, 190 token expired,
// 200-299 permission not granted or removed, 131005 permission not granted.
const AUTH_CODES = new Set([0, 3, 10, 190, 131005])
const isAuthCode = (code) => AUTH_CODES.has(code) || (code >= 200 && code <= 299)

// Business account / sender state: 131031 account locked (policy violation),
// 368 account restricted for policy, 130497 restricted from a country,
// 131037 no approved display name, 131042 payment method problem,
// 131045 number registration error, 133010 number not registered.
const ACCOUNT_CODES = new Set([131031, 368, 130497, 131037, 131042, 131045, 133010])

// Recipient: 131026 not a WhatsApp user / undeliverable, 131030 recipient not
// in the allowed list (test numbers; no longer on the page, kept from earlier
// versions), 131021 sender and recipient are the same number,
// 131050 recipient opted out of marketing messages.
const RECIPIENT_CODES = new Set([131026, 131030, 131021, 131050])

// Template: 132000 parameter count mismatch, 132001 template missing in that
// language or not approved, 132005 translated text too long, 132007 policy
// violation, 132012 parameter format mismatch, 132015 paused for low quality,
// 132016 permanently disabled.
const TEMPLATE_CODES = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016])

// Rate limits (retry later): 4 app call limit, 80007 WABA rate limit,
// 130429 throughput limit, 131048 spam rate limit (sending restricted),
// 131056 too many messages to the same recipient, 131049 per-user
// engagement limit ("wait at least 24 hours").
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056, 131049])

// 131047: more than 24 hours since the user last replied. Templates are the
// fix, so for a template send this means something is misconfigured.
const WINDOW_CODES = new Set([131047])

// Meta says the message was not sent and the condition is temporary:
// 131000 "something went wrong, message failed to send" (try again),
// 131016 service temporarily unavailable, 131057 account in maintenance mode,
// 133004 server temporarily unavailable.
const TRANSIENT_NOT_SENT_CODES = new Set([131000, 131016, 131057, 133004])

// Invalid request shape: 100 invalid parameter, 131008 required parameter
// missing, 131009 parameter value invalid, 135000 generic parameter error.
const RECIPIENT_DETAIL_RE = /\b(to|recipient|phone(?:[ _]number)?|wa_id)\b/i

/**
 * Pure classifier for a non-2xx Graph response whose body parsed as JSON.
 * Returns { outcome, retryable, category }.
 */
export function classifyGraphError(httpStatus, graphError) {
  const code = Number.isInteger(graphError?.code) ? graphError.code : null
  if (code === null) {
    return { outcome: 'unknown', retryable: false, category: 'unreadable_response' }
  }
  if (TRANSIENT_NOT_SENT_CODES.has(code)) return { outcome: 'failed', retryable: true, category: 'temporarily_unavailable' }
  if (RATE_LIMIT_CODES.has(code)) return { outcome: 'failed', retryable: true, category: 'rate_limited' }
  // A 5xx with any other code: Meta's own processing failed somewhere and we
  // cannot tell whether the message was queued first.
  if (httpStatus >= 500) return { outcome: 'unknown', retryable: false, category: 'server_error' }

  if (isAuthCode(code)) return { outcome: 'failed', retryable: false, category: 'auth' }
  if (ACCOUNT_CODES.has(code)) return { outcome: 'failed', retryable: false, category: 'account' }
  if (RECIPIENT_CODES.has(code)) return { outcome: 'failed', retryable: false, category: 'recipient' }
  if (TEMPLATE_CODES.has(code)) return { outcome: 'failed', retryable: false, category: 'template' }
  if (WINDOW_CODES.has(code)) return { outcome: 'failed', retryable: false, category: 'window' }
  if (code === 100) {
    const detail = `${graphError.error_data?.details ?? ''} ${graphError.message ?? ''}`
    return { outcome: 'failed', retryable: false, category: RECIPIENT_DETAIL_RE.test(detail) ? 'recipient' : 'invalid_request' }
  }
  if (httpStatus === 429) return { outcome: 'failed', retryable: true, category: 'rate_limited' }
  // Any other 4xx with a readable Graph error: Meta rejected the request.
  return { outcome: 'failed', retryable: false, category: 'rejected' }
}

// Network errors that happen before a single byte of the request is written:
// name resolution, refused or unreachable connection, connect timeout, TLS
// certificate failures. Anything else (reset, socket closed, abort) may have
// happened after the request was on the wire.
const PRE_SEND_NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
])

function networkErrorCode(err) {
  // undici wraps the socket error: TypeError('fetch failed', { cause }).
  // AggregateError (happy-eyeballs) carries the per-address errors.
  for (let e = err, depth = 0; e && depth < 4; e = e.cause, depth++) {
    if (typeof e.code === 'string') return e.code
    if (Array.isArray(e.errors) && e.errors.length && e.errors.every((x) => PRE_SEND_NETWORK_CODES.has(x?.code))) {
      return e.errors[0].code
    }
  }
  return null
}

// ---------------------------------------------------------------------------

export function createMetaWhatsAppProvider({
  accessToken,
  phoneNumberId,
  graphVersion = DEFAULT_GRAPH_API_VERSION,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  log,
} = {}) {
  const token = typeof accessToken === 'string' ? accessToken.trim() : ''
  const numberId = typeof phoneNumberId === 'string' ? phoneNumberId.trim() : String(phoneNumberId ?? '')
  if (!VERSION_RE.test(graphVersion ?? '')) {
    throw new WhatsAppConfigError("Graph API version must look like 'v26.0'")
  }
  if (numberId && !PHONE_NUMBER_ID_RE.test(numberId)) {
    throw new WhatsAppConfigError('WhatsApp phone number id must be digits only')
  }
  if (typeof fetchImpl !== 'function') throw new WhatsAppConfigError('fetchImpl must be a function')
  const configured = Boolean(token && numberId)
  const url = `${GRAPH_BASE}/${graphVersion}/${numberId}/messages`

  // Remove the token and anything shaped like a phone number from text that
  // may be returned to callers or shown to staff.
  const scrub = (text) => {
    let s = String(text ?? '')
    if (token) s = s.split(token).join('[REDACTED]')
    s = s.replace(/\+?\d{8,15}\b/g, '[number]')
    return s.length > MAX_MESSAGE_LENGTH ? `${s.slice(0, MAX_MESSAGE_LENGTH)}…` : s
  }

  const fail = (outcome, error, logFields, what = 'template') => {
    log?.warn?.({ outcome, code: error.code, category: error.category, retryable: error.retryable, ...logFields }, `WhatsApp ${what} not confirmed`)
    return { ok: false, outcome, error, simulated: false }
  }

  async function sendTemplate({ to, templateName, languageCode, bodyParams = [], idempotencyKey } = {}) {
    const ids = { idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null }
    if (!configured) {
      return fail('failed', { code: 'not_configured', category: 'config', message: 'WhatsApp Cloud API credentials are not configured', retryable: false }, ids)
    }
    if (!validateRecipient(to)) {
      return fail('failed', { code: 'invalid_recipient', category: 'recipient', message: 'Recipient must be E.164 digits without +, 8 to 15 digits', retryable: false }, ids)
    }
    const problem = validateTemplateRequest({ templateName, languageCode, bodyParams, idempotencyKey })
    if (problem) return fail('failed', { code: 'invalid_request', category: 'invalid_request', message: problem, retryable: false }, ids)

    const template = { name: templateName, language: { code: languageCode } }
    if (bodyParams.length) {
      template.components = [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }]
    }
    const body = JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template })
    return deliver(body, ids, 'template')
  }

  /**
   * Free text. Meta delivers it only inside the 24-hour customer-service
   * window that opens when the client writes; outside it the answer is error
   * 131047 and a template is the only way. The caller checks the window
   * first (server/whatsapp/inbox.js); this is the transport.
   */
  async function sendText({ to, body: text, idempotencyKey } = {}) {
    const ids = { idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null }
    if (!configured) {
      return fail('failed', { code: 'not_configured', category: 'config', message: 'WhatsApp Cloud API credentials are not configured', retryable: false }, ids, 'text')
    }
    if (!validateRecipient(to)) {
      return fail('failed', { code: 'invalid_recipient', category: 'recipient', message: 'Recipient must be E.164 digits without +, 8 to 15 digits', retryable: false }, ids, 'text')
    }
    const problem = validateTextRequest({ body: text, idempotencyKey })
    if (problem) return fail('failed', { code: 'invalid_request', category: 'invalid_request', message: problem, retryable: false }, ids, 'text')
    const body = JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: text } })
    return deliver(body, ids, 'text')
  }

  async function deliver(body, ids, what) {
    const fail_ = (outcome, error, logFields) => fail(outcome, error, logFields, what)
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    timer.unref?.()

    let res
    let text
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
      text = await res.text()
    } catch (err) {
      clearTimeout(timer)
      const netCode = timedOut ? null : networkErrorCode(err)
      if (!res && netCode && PRE_SEND_NETWORK_CODES.has(netCode)) {
        return fail_('failed', { code: 'network_error', category: 'network', message: `Could not reach the WhatsApp Cloud API (${netCode})`, retryable: true }, { ...ids, netCode })
      }
      // Timeout, reset, or failure while reading the response: the request
      // may have been processed. Never retry automatically.
      const code = timedOut ? 'timeout' : 'network_error'
      const message = timedOut
        ? `No response from the WhatsApp Cloud API within ${timeoutMs} ms; the message may have been sent`
        : `Connection to the WhatsApp Cloud API failed after sending (${netCode ?? 'unknown'}); the message may have been sent`
      return fail_('unknown', { code, category: 'network', message, retryable: false, httpStatus: res?.status ?? null }, { ...ids, netCode, httpStatus: res?.status ?? null })
    }
    clearTimeout(timer)

    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    const httpStatus = res.status
    const fbtraceId = typeof json?.error?.fbtrace_id === 'string' ? json.error.fbtrace_id : null

    if (res.ok) {
      const providerMessageId = json?.messages?.[0]?.id
      if (typeof providerMessageId === 'string' && providerMessageId) {
        log?.info?.({ providerMessageId, ...ids }, `WhatsApp ${what} accepted`)
        return { ok: true, providerMessageId, simulated: false }
      }
      // 2xx without a message id: Meta probably accepted it, but we have
      // nothing to match receipts against. Treat as unknown.
      return fail_('unknown', { code: 'unreadable_response', category: 'unreadable_response', message: `WhatsApp Cloud API returned ${httpStatus} without a message id; the message may have been sent`, retryable: false, httpStatus }, { ...ids, httpStatus })
    }

    const graphError = json && typeof json.error === 'object' ? json.error : null
    const { outcome, retryable, category } = classifyGraphError(httpStatus, graphError)
    const metaCode = Number.isInteger(graphError?.code) ? graphError.code : null
    const metaSubcode = Number.isInteger(graphError?.error_subcode) ? graphError.error_subcode : null
    const detail = graphError?.error_data?.details
    const message = graphError
      ? scrub([graphError.message, detail].filter(Boolean).join(': ') || `WhatsApp Cloud API error ${metaCode}`)
      : `WhatsApp Cloud API returned ${httpStatus} with an unreadable body; the message may have been sent`
    const error = {
      code: metaCode ?? (outcome === 'unknown' ? 'unreadable_response' : `http_${httpStatus}`),
      category,
      message,
      retryable,
      httpStatus,
      metaCode,
      metaSubcode,
      metaType: typeof graphError?.type === 'string' ? graphError.type : null,
      fbtraceId,
    }
    return fail_(outcome, error, { ...ids, httpStatus, metaCode, metaSubcode, fbtraceId })
  }

  return {
    mode: 'meta',
    describe: () => ({ mode: 'meta', configured, graphVersion, phoneNumberId: numberId || null }),
    sendTemplate,
    sendText,
  }
}

export function validateTemplateRequest({ templateName, languageCode, bodyParams, idempotencyKey }) {
  if (typeof templateName !== 'string' || !/^[a-z0-9_]{1,512}$/.test(templateName)) return 'templateName must be a lowercase Meta template name'
  if (typeof languageCode !== 'string' || !/^[a-z]{2,3}(_[A-Za-z]{2,4})?$/.test(languageCode)) return 'languageCode must look like es or en_US'
  if (!Array.isArray(bodyParams) || !bodyParams.every((p) => typeof p === 'string' && p.trim().length > 0)) return 'bodyParams must be non-empty strings'
  // Meta rejects template parameters containing new lines, tabs or more than
  // four consecutive spaces (error 132012/131009); refuse them locally.
  if (bodyParams.some((p) => /[\n\t]| {5,}/.test(p))) return 'bodyParams may not contain new lines, tabs or more than four spaces in a row'
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) return 'idempotencyKey is required'
  return null
}

// Meta's limit for a text message body.
export const MAX_TEXT_LENGTH = 4096

export function validateTextRequest({ body, idempotencyKey }) {
  if (typeof body !== 'string' || !body.trim()) return 'body must be non-empty text'
  if (body.length > MAX_TEXT_LENGTH) return `body may be at most ${MAX_TEXT_LENGTH} characters`
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) return 'idempotencyKey is required'
  return null
}

export default createMetaWhatsAppProvider
