// Mock WhatsApp provider for development and tests. It never touches the
// network. It implements the same interface as meta.js (see
// ../../reminderModel.js) and reports delivery receipts through onStatus, the
// same path real webhook receipts take, marked simulated.
//
// Simulated outcomes are deterministic by the recipient's last four digits:
//   …0000  failed, 131026 (not a WhatsApp user), not retryable
//   …1111  failed, 130429 (rate limit), retryable
//   …2222  outcome 'unknown' (as if the request timed out after sending)
//   …3333  sent, then a 'failed' receipt (undeliverable)
//   other  sent, then 'delivered', then 'read' receipts
//
// Idempotency: a key that produced a send (or an 'unknown') is refused if it
// is seen again, so a dispatcher bug cannot double-send. A definite failure
// does not consume the key: nothing went out, so a retry with the same key is
// allowed.
import { validateRecipient, validateTemplateRequest, validateTextRequest } from './meta.js'

export const MOCK_ID_PREFIX = 'wamid.SIMULATED.'

export function createMockWhatsAppProvider({
  onStatus,
  now = () => new Date(),
  delayMs = 0,
  random,
} = {}) {
  let counter = 0
  const sentLog = []
  const usedKeys = new Set()
  const pending = new Set()

  // Optional jitter on receipt delays (random() in [0, 1)); outcomes never
  // depend on it.
  const receiptDelay = () => (typeof random === 'function' ? Math.round(delayMs * (1 + random())) : delayMs)

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  function scheduleReceipts(providerMessageId, receipts) {
    if (typeof onStatus !== 'function' || !receipts.length) return
    const chain = (async () => {
      for (const r of receipts) {
        await wait(receiptDelay())
        try {
          await onStatus({ providerMessageId, status: r.status, timestamp: now(), simulated: true, ...(r.errors ? { errors: r.errors } : {}) })
        } catch {
          // A failing receipt handler must not crash the process; the real
          // webhook path has its own error handling.
        }
      }
    })()
    pending.add(chain)
    chain.finally(() => pending.delete(chain))
  }

  const failure = (outcome, code, message, retryable) => ({ ok: false, outcome, error: { code, message, retryable }, simulated: true })

  async function sendTemplate({ to, templateName, languageCode, bodyParams = [], idempotencyKey } = {}) {
    if (!validateRecipient(to)) return failure('failed', 'invalid_recipient', 'Recipient must be E.164 digits without +, 8 to 15 digits', false)
    const problem = validateTemplateRequest({ templateName, languageCode, bodyParams, idempotencyKey })
    if (problem) return failure('failed', 'invalid_request', problem, false)
    if (usedKeys.has(idempotencyKey)) {
      return failure('failed', 'duplicate_idempotency_key', 'This idempotency key was already used for a send', false)
    }

    const suffix = to.slice(-4)
    const entry = { to, templateName, languageCode, bodyParams: [...bodyParams], idempotencyKey }

    if (suffix === '0000') return failure('failed', 131026, 'Simulated: recipient is not a WhatsApp user', false)
    if (suffix === '1111') return failure('failed', 130429, 'Simulated: rate limit hit', true)

    usedKeys.add(idempotencyKey)
    if (suffix === '2222') {
      sentLog.push({ ...entry, outcome: 'unknown', providerMessageId: null })
      return failure('unknown', 'timeout', 'Simulated: no response after sending; the message may have been sent', false)
    }

    const providerMessageId = `${MOCK_ID_PREFIX}${++counter}`
    sentLog.push({ ...entry, outcome: 'sent', providerMessageId })
    if (suffix === '3333') {
      scheduleReceipts(providerMessageId, [{ status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] }])
    } else {
      scheduleReceipts(providerMessageId, [{ status: 'delivered' }, { status: 'read' }])
    }
    return { ok: true, providerMessageId, simulated: true }
  }

  // Free text, same outcomes by last four digits. Ids carry a random part:
  // a bare counter restarts at 1 on every boot, and provider_message_id is
  // UNIQUE in wa_outbound_messages.
  async function sendText({ to, body, idempotencyKey } = {}) {
    if (!validateRecipient(to)) return failure('failed', 'invalid_recipient', 'Recipient must be E.164 digits without +, 8 to 15 digits', false)
    const problem = validateTextRequest({ body, idempotencyKey })
    if (problem) return failure('failed', 'invalid_request', problem, false)
    if (usedKeys.has(idempotencyKey)) {
      return failure('failed', 'duplicate_idempotency_key', 'This idempotency key was already used for a send', false)
    }
    const suffix = to.slice(-4)
    const entry = { to, text: body, idempotencyKey }
    if (suffix === '0000') return failure('failed', 131026, 'Simulated: recipient is not a WhatsApp user', false)
    if (suffix === '1111') return failure('failed', 130429, 'Simulated: rate limit hit', true)
    usedKeys.add(idempotencyKey)
    if (suffix === '2222') {
      sentLog.push({ ...entry, outcome: 'unknown', providerMessageId: null })
      return failure('unknown', 'timeout', 'Simulated: no response after sending; the message may have been sent', false)
    }
    const providerMessageId = `${MOCK_ID_PREFIX}text.${globalThis.crypto.randomUUID()}`
    sentLog.push({ ...entry, outcome: 'sent', providerMessageId })
    return { ok: true, providerMessageId, simulated: true }
  }

  return {
    mode: 'mock',
    describe: () => ({ mode: 'mock', configured: true, graphVersion: null }),
    sendTemplate,
    sendText,
    /** Copies of everything that would have gone out (sent or unknown). */
    getSentLog: () => sentLog.map((e) => (e.bodyParams ? { ...e, bodyParams: [...e.bodyParams] } : { ...e })),
    clearSentLog() {
      sentLog.length = 0
      usedKeys.clear()
    },
    /** Resolves once every scheduled receipt has been handed to onStatus. */
    async flushReceipts() {
      while (pending.size) await Promise.all([...pending])
    },
  }
}

export default createMockWhatsAppProvider
