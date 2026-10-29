// Picks the WhatsApp messaging provider from env. Policy:
//   WHATSAPP_PROVIDER           'mock' (default) or 'meta'. Anything else, or
//                               'meta' without credentials, is a configuration
//                               error. There is never a silent fallback to mock.
//   WHATSAPP_ACCESS_TOKEN       system-user token (meta only; never logged)
//   WHATSAPP_PHONE_NUMBER_ID    the firm's Cloud API phone number id (meta only)
//   WHATSAPP_GRAPH_API_VERSION  default DEFAULT_GRAPH_API_VERSION
//   WHATSAPP_SENDING_ENABLED    'true' to allow real sends. The dispatcher must
//                               refuse to call a 'meta' provider without it.
import { createMetaWhatsAppProvider, DEFAULT_GRAPH_API_VERSION, WhatsAppConfigError, validateRecipient } from './meta.js'
import { createMockWhatsAppProvider } from './mock.js'

export { DEFAULT_GRAPH_API_VERSION, WhatsAppConfigError, validateRecipient }

export function whatsappSendingEnabled(env = process.env) {
  return String(env.WHATSAPP_SENDING_ENABLED ?? '').trim().toLowerCase() === 'true'
}

export function whatsappProviderMode(env = process.env) {
  const raw = String(env.WHATSAPP_PROVIDER ?? '').trim().toLowerCase()
  if (raw === '' || raw === 'mock') return 'mock'
  if (raw === 'meta') return 'meta'
  throw new WhatsAppConfigError("WHATSAPP_PROVIDER must be 'mock' or 'meta'")
}

/**
 * @param {Object} [env]
 * @param {Object} [deps]  { fetchImpl, log, timeoutMs } for meta;
 *                         { onStatus, now, delayMs, random } for mock
 */
export function createWhatsAppProvider(env = process.env, deps = {}) {
  const mode = whatsappProviderMode(env)
  if (mode === 'mock') {
    return createMockWhatsAppProvider({
      onStatus: deps.onStatus,
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.delayMs !== undefined ? { delayMs: deps.delayMs } : {}),
      ...(deps.random ? { random: deps.random } : {}),
    })
  }

  const accessToken = String(env.WHATSAPP_ACCESS_TOKEN ?? '').trim()
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()
  const missing = [!accessToken && 'WHATSAPP_ACCESS_TOKEN', !phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID'].filter(Boolean)
  if (missing.length) throw new WhatsAppConfigError(`WHATSAPP_PROVIDER=meta requires ${missing.join(' and ')}`)

  return createMetaWhatsAppProvider({
    accessToken,
    phoneNumberId,
    graphVersion: String(env.WHATSAPP_GRAPH_API_VERSION ?? '').trim() || DEFAULT_GRAPH_API_VERSION,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
    log: deps.log,
  })
}

export default createWhatsAppProvider
