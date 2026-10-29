import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWhatsAppProvider, whatsappSendingEnabled, whatsappProviderMode, DEFAULT_GRAPH_API_VERSION, WhatsAppConfigError } from './index.js'

const TOKEN = 'EAAGfakeTOKENfactory0987654321'
const META = { WHATSAPP_PROVIDER: 'meta', WHATSAPP_ACCESS_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: '109876543210987' }
const noFetch = async () => { throw new Error('no network in factory tests') }

test('mock by default and for mock in any case/whitespace', () => {
  for (const v of [undefined, '', '  ', 'mock', ' MOCK ']) {
    assert.equal(createWhatsAppProvider({ WHATSAPP_PROVIDER: v }).mode, 'mock', String(v))
  }
})

test('meta with credentials (trim/lowercase), default and overridden version', () => {
  const p = createWhatsAppProvider({ ...META, WHATSAPP_PROVIDER: ' Meta ' }, { fetchImpl: noFetch })
  assert.deepEqual(p.describe(), { mode: 'meta', configured: true, graphVersion: DEFAULT_GRAPH_API_VERSION, phoneNumberId: '109876543210987' })
  const v = createWhatsAppProvider({ ...META, WHATSAPP_GRAPH_API_VERSION: ' v25.0 ' }, { fetchImpl: noFetch })
  assert.equal(v.describe().graphVersion, 'v25.0')
  assert.ok(!JSON.stringify(p.describe()).includes(TOKEN))
})

test('meta without credentials throws, never falls back to mock', () => {
  for (const env of [
    { WHATSAPP_PROVIDER: 'meta' },
    { ...META, WHATSAPP_ACCESS_TOKEN: '  ' },
    { ...META, WHATSAPP_PHONE_NUMBER_ID: '' },
  ]) {
    assert.throws(() => createWhatsAppProvider(env), (err) => err instanceof WhatsAppConfigError && !err.message.includes(TOKEN))
  }
})

test('a misspelled provider throws', () => {
  for (const v of ['metta', 'cloud', 'meta-api', 'true']) {
    assert.throws(() => createWhatsAppProvider({ ...META, WHATSAPP_PROVIDER: v }), WhatsAppConfigError, v)
    assert.throws(() => whatsappProviderMode({ WHATSAPP_PROVIDER: v }), WhatsAppConfigError)
  }
})

test('a malformed version override throws', () => {
  assert.throws(() => createWhatsAppProvider({ ...META, WHATSAPP_GRAPH_API_VERSION: 'latest' }), WhatsAppConfigError)
})

test('whatsappSendingEnabled only for "true"', () => {
  for (const v of ['true', ' TRUE ', 'True']) assert.equal(whatsappSendingEnabled({ WHATSAPP_SENDING_ENABLED: v }), true, v)
  for (const v of [undefined, '', 'false', '1', 'yes', 'on', 'truee']) assert.equal(whatsappSendingEnabled({ WHATSAPP_SENDING_ENABLED: v }), false, String(v))
})

test('mock deps pass through', async () => {
  const seen = []
  const p = createWhatsAppProvider({}, { onStatus: (r) => seen.push(r.status), delayMs: 0, now: () => new Date(0) })
  await p.sendTemplate({ to: '15045550101', templateName: 'payment_due_soon', languageCode: 'es', bodyParams: ['a'], idempotencyKey: 'k' })
  await p.flushReceipts()
  assert.deepEqual(seen, ['delivered', 'read'])
})
