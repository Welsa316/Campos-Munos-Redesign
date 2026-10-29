import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createMockWhatsAppProvider } from './mock.js'

// The mock must never touch the network: any fetch call fails the suite.
const realFetch = globalThis.fetch
let netCalls = 0
before(() => {
  globalThis.fetch = async () => {
    netCalls++
    throw new Error('mock WhatsApp provider must not use the network')
  }
})
after(() => {
  globalThis.fetch = realFetch
  assert.equal(netCalls, 0)
})

const FIXED = new Date('2026-10-29T15:00:00Z')
const req = (to, key, extra = {}) => ({ to, templateName: 'payment_due_soon', languageCode: 'es', bodyParams: ['Ana', '$100.00', '1 de noviembre'], idempotencyKey: key, ...extra })

function setup() {
  const receipts = []
  const p = createMockWhatsAppProvider({ instanceId: 'T', onStatus: (r) => { receipts.push(r) }, now: () => FIXED, delayMs: 0 })
  return { p, receipts }
}

test('describe()', () => {
  assert.deepEqual(createMockWhatsAppProvider().describe(), { mode: 'mock', configured: true, graphVersion: null })
})

test('normal number: sent, then delivered then read receipts via onStatus', async () => {
  const { p, receipts } = setup()
  const r = await p.sendTemplate(req('15045550101', 'k1'))
  assert.deepEqual(r, { ok: true, providerMessageId: 'wamid.SIMULATED.T.1', simulated: true })
  assert.equal(receipts.length, 0, 'receipts are asynchronous')
  await p.flushReceipts()
  assert.deepEqual(receipts, [
    { providerMessageId: 'wamid.SIMULATED.T.1', status: 'delivered', timestamp: FIXED, simulated: true },
    { providerMessageId: 'wamid.SIMULATED.T.1', status: 'read', timestamp: FIXED, simulated: true },
  ])
  const r2 = await p.sendTemplate(req('15045550102', 'k2'))
  assert.equal(r2.providerMessageId, 'wamid.SIMULATED.T.2')
})

test('…0000 → failed 131026, not retryable, nothing sent', async () => {
  const { p, receipts } = setup()
  const r = await p.sendTemplate(req('15045550000', 'k1'))
  assert.equal(r.ok, false)
  assert.equal(r.outcome, 'failed')
  assert.equal(r.error.code, 131026)
  assert.equal(r.error.retryable, false)
  assert.equal(r.simulated, true)
  await p.flushReceipts()
  assert.equal(receipts.length, 0)
  assert.deepEqual(p.getSentLog(), [])
})

test('…1111 → failed 130429, retryable; a definite failure does not consume the key', async () => {
  const { p } = setup()
  const r = await p.sendTemplate(req('15045551111', 'k1'))
  assert.equal(r.outcome, 'failed')
  assert.equal(r.error.code, 130429)
  assert.equal(r.error.retryable, true)
  const again = await p.sendTemplate(req('15045551111', 'k1'))
  assert.equal(again.error.code, 130429, 'retry with the same key is allowed after a definite failure')
})

test('…2222 → unknown; the key is consumed', async () => {
  const { p, receipts } = setup()
  const r = await p.sendTemplate(req('15045552222', 'k1'))
  assert.equal(r.ok, false)
  assert.equal(r.outcome, 'unknown')
  assert.equal(r.error.retryable, false)
  const again = await p.sendTemplate(req('15045552222', 'k1'))
  assert.equal(again.error.code, 'duplicate_idempotency_key')
  await p.flushReceipts()
  assert.equal(receipts.length, 0)
  assert.equal(p.getSentLog().length, 1)
  assert.equal(p.getSentLog()[0].outcome, 'unknown')
})

test('…3333 → sent, then a failed receipt with errors', async () => {
  const { p, receipts } = setup()
  const r = await p.sendTemplate(req('15045553333', 'k1'))
  assert.equal(r.ok, true)
  await p.flushReceipts()
  assert.equal(receipts.length, 1)
  assert.equal(receipts[0].status, 'failed')
  assert.equal(receipts[0].providerMessageId, r.providerMessageId)
  assert.equal(receipts[0].simulated, true)
  assert.equal(receipts[0].errors[0].code, 131026)
})

test('duplicate idempotency key is refused and not logged', async () => {
  const { p, receipts } = setup()
  assert.equal((await p.sendTemplate(req('15045550101', 'same'))).ok, true)
  const dup = await p.sendTemplate(req('15045550199', 'same'))
  assert.deepEqual(dup.error, { code: 'duplicate_idempotency_key', message: dup.error.message, retryable: false })
  assert.equal(dup.ok, false)
  assert.equal(dup.outcome, 'failed')
  assert.equal(p.getSentLog().length, 1)
  await p.flushReceipts()
  assert.equal(receipts.length, 2, 'only the first send produced receipts')
})

test('sent log records exactly what would have gone out; clearSentLog resets', async () => {
  const { p } = setup()
  await p.sendTemplate(req('15045550101', 'a'))
  await p.sendTemplate(req('15045550000', 'b')) // failed: not logged
  await p.sendTemplate(req('50212345678', 'c', { templateName: 'payment_overdue', languageCode: 'en_US', bodyParams: [] }))
  assert.deepEqual(p.getSentLog(), [
    { to: '15045550101', templateName: 'payment_due_soon', languageCode: 'es', bodyParams: ['Ana', '$100.00', '1 de noviembre'], idempotencyKey: 'a', outcome: 'sent', providerMessageId: 'wamid.SIMULATED.T.1' },
    { to: '50212345678', templateName: 'payment_overdue', languageCode: 'en_US', bodyParams: [], idempotencyKey: 'c', outcome: 'sent', providerMessageId: 'wamid.SIMULATED.T.2' },
  ])
  p.getSentLog()[0].bodyParams.push('mutated')
  assert.equal(p.getSentLog()[0].bodyParams.length, 3, 'log is a copy')
  p.clearSentLog()
  assert.deepEqual(p.getSentLog(), [])
  await p.flushReceipts()
})

test('invalid input is refused like the real provider', async () => {
  const { p } = setup()
  assert.equal((await p.sendTemplate(req('+15045550101', 'x'))).error.code, 'invalid_recipient')
  assert.equal((await p.sendTemplate(req('15045550101', ''))).error.code, 'invalid_request')
  assert.deepEqual(p.getSentLog(), [])
})

test('a throwing onStatus does not break sending', async () => {
  const p = createMockWhatsAppProvider({ instanceId: 'T', onStatus: () => { throw new Error('handler down') } })
  assert.equal((await p.sendTemplate(req('15045550101', 'k'))).ok, true)
  await p.flushReceipts()
})

test('delayMs delays receipts', async () => {
  const receipts = []
  const p = createMockWhatsAppProvider({ instanceId: 'T', onStatus: (r) => receipts.push(r.status), delayMs: 15 })
  await p.sendTemplate(req('15045550101', 'k'))
  await new Promise((r) => setTimeout(r, 5))
  assert.deepEqual(receipts, [])
  await p.flushReceipts()
  assert.deepEqual(receipts, ['delivered', 'read'])
})

test('two simulators (or one after a restart) never hand out the same message id', async () => {
  const a = createMockWhatsAppProvider()
  const b = createMockWhatsAppProvider()
  const send = (p, key) => p.sendTemplate({ to: '15045550101', templateName: 'payment_due_soon', languageCode: 'es', bodyParams: ['A'], idempotencyKey: key })
  const ra = await send(a, 'k1')
  const rb = await send(b, 'k2')
  assert.notEqual(ra.providerMessageId, rb.providerMessageId)
})
