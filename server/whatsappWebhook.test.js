// Meta WhatsApp Cloud API webhook: verification handshake, signature check,
// event extraction and duplicate suppression. Spins the router up on a real
// port so the raw-body + signature path is exercised end to end.
// Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import express from 'express'
import {
  verifyChallenge,
  verifySignature,
  extractEvents,
  redactVerifyToken,
} from './utils/whatsapp.js'
import { createWhatsappRouter } from './routes/whatsapp.js'

const APP_SECRET = 'app-secret-for-tests'
const VERIFY_TOKEN = 'verify-token-for-tests'
const env = { META_APP_SECRET: APP_SECRET, WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN }

const sign = (body, secret = APP_SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

const incomingMessage = (id = 'wamid.ABC123') => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: '1000',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550001111', phone_number_id: '2000' },
        contacts: [{ profile: { name: 'Ana' }, wa_id: '15550002222' }],
        messages: [{ from: '15550002222', id, timestamp: '1700000000', type: 'text', text: { body: 'Hola' } }],
      },
    }],
  }],
})

const statusUpdate = (status = 'delivered', id = 'wamid.OUT1') => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: '1000',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550001111', phone_number_id: '2000' },
        statuses: [{ id, status, timestamp: '1700000001', recipient_id: '15550002222' }],
      },
    }],
  }],
})

// --- pure helpers -----------------------------------------------------------

test('verifyChallenge accepts the subscribe handshake with the right token', () => {
  const q = { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345' }
  assert.equal(verifyChallenge(q, env), '12345')
})

test('verifyChallenge rejects a wrong token, wrong mode, missing challenge or unconfigured token', () => {
  const ok = { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' }
  assert.equal(verifyChallenge({ ...ok, 'hub.verify_token': 'nope' }, env), null)
  assert.equal(verifyChallenge({ ...ok, 'hub.verify_token': VERIFY_TOKEN + 'x' }, env), null)
  assert.equal(verifyChallenge({ ...ok, 'hub.mode': 'unsubscribe' }, env), null)
  assert.equal(verifyChallenge({ ...ok, 'hub.challenge': undefined }, env), null)
  assert.equal(verifyChallenge(ok, {}), null)
  assert.equal(verifyChallenge({ ...ok, 'hub.verify_token': ['a', 'b'] }, env), null)
})

test('verifyChallenge refuses a placeholder or short configured token even when the query matches it', () => {
  for (const weak of ['change-me-to-a-random-64-char-string', 'CHANGE_ME', 'short', '']) {
    const q = { 'hub.mode': 'subscribe', 'hub.verify_token': weak, 'hub.challenge': '1' }
    assert.equal(verifyChallenge(q, { WHATSAPP_VERIFY_TOKEN: weak }), null, weak)
  }
})

test('verifySignature matches only an HMAC of the exact raw bytes', () => {
  const raw = Buffer.from(JSON.stringify(incomingMessage()))
  assert.equal(verifySignature(raw, sign(raw), APP_SECRET), true)
  assert.equal(verifySignature(raw, sign(raw, 'other-secret'), APP_SECRET), false)
  assert.equal(verifySignature(Buffer.from(raw.toString() + ' '), sign(raw), APP_SECRET), false)
  assert.equal(verifySignature(raw, sign(raw).replace('sha256=', 'sha1='), APP_SECRET), false)
  assert.equal(verifySignature(raw, 'sha256=abc', APP_SECRET), false)
  assert.equal(verifySignature(raw, undefined, APP_SECRET), false)
  assert.equal(verifySignature(raw, sign(raw), ''), false)
  assert.equal(verifySignature('not a buffer', sign(raw), APP_SECRET), false)
})

test('extractEvents flattens messages and statuses with stable dedupe keys', () => {
  const [msg] = extractEvents(incomingMessage())
  assert.equal(msg.kind, 'message')
  assert.equal(msg.key, 'message:wamid.ABC123')
  assert.equal(msg.messageId, 'wamid.ABC123')
  assert.equal(msg.from, '15550002222')
  assert.equal(msg.phoneNumberId, '2000')
  assert.equal(msg.messageType, 'text')
  assert.equal(msg.timestamp.toISOString(), '2023-11-14T22:13:20.000Z')

  const [st] = extractEvents(statusUpdate('read'))
  assert.equal(st.kind, 'status')
  // The same outbound message reports sent → delivered → read; each is its own event.
  assert.equal(st.key, 'status:wamid.OUT1:read')
  assert.equal(st.status, 'read')
  assert.equal(st.recipient, '15550002222')
})

test('extractEvents ignores malformed entries instead of throwing', () => {
  assert.deepEqual(extractEvents(null), [])
  assert.deepEqual(extractEvents({ object: 'whatsapp_business_account' }), [])
  assert.deepEqual(extractEvents({ entry: [{ changes: [{ field: 'account_update', value: {} }] }] }), [])
  assert.deepEqual(extractEvents({ entry: [{ changes: [{ field: 'messages', value: { messages: [{ type: 'text' }] } }] }] }), [])
  assert.deepEqual(extractEvents({ entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }] }), [])
})

test('redactVerifyToken hides the token value in a logged URL and leaves everything else', () => {
  assert.equal(
    redactVerifyToken('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=secret-1&hub.challenge=9'),
    '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=%5BREDACTED%5D&hub.challenge=9'
  )
  assert.equal(redactVerifyToken('/api/submissions?page=2'), '/api/submissions?page=2')
  assert.equal(redactVerifyToken('/healthz'), '/healthz')
  // qs decodes a percent-encoded dot to the same key, so the handshake would
  // still succeed — and the token must still not be printed.
  assert.equal(
    redactVerifyToken('/webhooks/whatsapp?hub.mode=subscribe&hub%2Everify_token=secret-1&hub.challenge=9'),
    '/webhooks/whatsapp?hub.mode=subscribe&hub%2Everify_token=%5BREDACTED%5D&hub.challenge=9'
  )
  assert.ok(!redactVerifyToken('/w?HUB.VERIFY_TOKEN=secret-2').includes('secret-2'))
})

// --- router -----------------------------------------------------------------

function memoryStore() {
  const seen = new Set()
  const stored = []
  return {
    stored,
    async recordEvent(evt) {
      if (seen.has(evt.key)) return false
      seen.add(evt.key)
      stored.push(evt)
      return true
    },
  }
}

const silentLog = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLog } }

async function startApp({ store = memoryStore(), overrides = {}, onEvent = null } = {}) {
  const app = express()
  // Mirror index.js: the webhook mounts BEFORE express.json so it owns its raw body.
  app.use('/webhooks/whatsapp', createWhatsappRouter({ env: { ...env, ...overrides }, store, log: silentLog, onEvent }))
  app.use(express.json())
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
  const base = `http://127.0.0.1:${server.address().port}/webhooks/whatsapp`
  const post = (payload, { signature, headers = {} } = {}) => {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature === null ? {} : { 'x-hub-signature-256': signature ?? sign(body) }), ...headers },
      body,
    })
  }
  // closeAllConnections so a failing test with a request still in flight can't hang the run.
  const close = () => { server.closeAllConnections(); return new Promise((r) => server.close(r)) }
  const settle = () => new Promise((r) => setTimeout(r, 60))
  return { base, post, close, settle, store }
}

test('GET answers the challenge as plain text when the token matches', async () => {
  const { base, close } = await startApp()
  try {
    const res = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-42`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^text\/plain/)
    assert.equal(await res.text(), 'challenge-42')
  } finally { await close() }
})

test('GET refuses a wrong token and never echoes the challenge', async () => {
  const { base, close } = await startApp()
  try {
    const res = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-42`)
    assert.equal(res.status, 403)
    assert.ok(!(await res.text()).includes('challenge-42'))
  } finally { await close() }
})

test('GET refuses everything when WHATSAPP_VERIFY_TOKEN is not configured', async () => {
  const { base, close } = await startApp({ overrides: { WHATSAPP_VERIFY_TOKEN: '' } })
  try {
    const res = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=&hub.challenge=c`)
    assert.equal(res.status, 403)
  } finally { await close() }
})

test('POST with a valid signature returns 200 and stores the message once', async () => {
  const { post, close, settle, store } = await startApp()
  try {
    const res = await post(incomingMessage())
    assert.equal(res.status, 200)
    await settle()
    assert.equal(store.stored.length, 1)
    assert.equal(store.stored[0].key, 'message:wamid.ABC123')
    assert.equal(store.stored[0].raw.text.body, 'Hola')
  } finally { await close() }
})

test('POST rejects a missing, malformed or wrong signature and stores nothing', async () => {
  const { post, close, settle, store } = await startApp()
  try {
    assert.equal((await post(incomingMessage(), { signature: null })).status, 401)
    assert.equal((await post(incomingMessage(), { signature: 'sha256=deadbeef' })).status, 401)
    assert.equal((await post(incomingMessage(), { signature: 'garbage' })).status, 401)
    const body = JSON.stringify(incomingMessage())
    assert.equal((await post(body, { signature: sign(body, 'wrong-secret') })).status, 401)
    // A signature computed over different bytes than the ones sent.
    assert.equal((await post(body + ' ', { signature: sign(body) })).status, 401)
    await settle()
    assert.equal(store.stored.length, 0)
  } finally { await close() }
})

test('POST fails closed when META_APP_SECRET is not configured', async () => {
  const { post, close, settle, store } = await startApp({ overrides: { META_APP_SECRET: '' } })
  try {
    const res = await post(incomingMessage())
    assert.equal(res.status, 503)
    await settle()
    assert.equal(store.stored.length, 0)
  } finally { await close() }
})

test('POST with a valid signature but unparseable JSON is a 400', async () => {
  const { post, close } = await startApp()
  try {
    assert.equal((await post('{not json')).status, 400)
  } finally { await close() }
})

test('a signed delivery for a different Graph object is acknowledged with 200 but ignored', async () => {
  const { post, close, settle, store } = await startApp()
  try {
    const res = await post({ object: 'page', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.PAGE', type: 'text' }] } }] }] })
    assert.equal(res.status, 200)
    await settle()
    assert.equal(store.stored.length, 0)
  } finally { await close() }
})

test('POST with an empty body is never processed: 401 unsigned, 400 when signed over zero bytes', async () => {
  const { base, close, settle, store } = await startApp()
  try {
    const unsigned = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' } })
    assert.equal(unsigned.status, 401)
    // A genuine HMAC over the empty string passes the signature check and must
    // then fail as malformed JSON rather than slip through as "no events".
    const signed = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign('') } })
    assert.equal(signed.status, 400)
    await settle()
    assert.equal(store.stored.length, 0)
  } finally { await close() }
})

test('a correctly signed body is accepted whatever Content-Type it declares', async () => {
  const { post, close, settle, store } = await startApp()
  try {
    const res = await post(incomingMessage('wamid.CTYPE'), { headers: { 'content-type': 'text/plain' } })
    assert.equal(res.status, 200)
    await settle()
    assert.deepEqual(store.stored.map((e) => e.key), ['message:wamid.CTYPE'])
  } finally { await close() }
})

test('a redelivered event is acknowledged with 200 and processed only once', async () => {
  const { post, close, settle, store } = await startApp()
  try {
    assert.equal((await post(incomingMessage('wamid.DUP'))).status, 200)
    assert.equal((await post(incomingMessage('wamid.DUP'))).status, 200)
    assert.equal((await post(incomingMessage('wamid.DUP'))).status, 200)
    await settle()
    assert.equal(store.stored.length, 1)
  } finally { await close() }
})

test('the in-memory guard stops a redelivery before it reaches the store', async () => {
  // A store that always says "new" — if the router relied on it alone, the
  // second delivery would be stored twice.
  const calls = []
  const store = { stored: calls, async recordEvent(evt) { calls.push(evt); return true } }
  const { post, close, settle } = await startApp({ store })
  try {
    await post(incomingMessage('wamid.MEM'))
    await post(incomingMessage('wamid.MEM'))
    await settle()
    assert.equal(calls.length, 1)
  } finally { await close() }
})

test('delivery and read statuses for one message are distinct events, each stored once', async () => {
  const { post, close, settle, store } = await startApp()
  try {
    await post(statusUpdate('sent'))
    await post(statusUpdate('delivered'))
    await post(statusUpdate('delivered'))
    await post(statusUpdate('read'))
    await settle()
    assert.deepEqual(store.stored.map((e) => e.key), [
      'status:wamid.OUT1:sent', 'status:wamid.OUT1:delivered', 'status:wamid.OUT1:read',
    ])
  } finally { await close() }
})

test('a store failure never turns into a non-200 for Meta', async () => {
  const store = { async recordEvent() { throw new Error('db down') } }
  const { post, close, settle } = await startApp({ store })
  try {
    const res = await post(incomingMessage('wamid.ERR'))
    assert.equal(res.status, 200)
    await settle()
  } finally { await close() }
})

test('after a store failure a replay of the same event is stored, not dropped as a duplicate', async () => {
  let failures = 1
  const stored = []
  const store = {
    stored,
    async recordEvent(evt) {
      if (failures-- > 0) throw new Error('db down')
      stored.push(evt)
      return true
    },
  }
  const { post, close, settle } = await startApp({ store })
  try {
    await post(incomingMessage('wamid.RETRY'))
    await settle()
    assert.equal(stored.length, 0)
    await post(incomingMessage('wamid.RETRY'))
    await settle()
    assert.deepEqual(stored.map((e) => e.key), ['message:wamid.RETRY'])
  } finally { await close() }
})

test('the 200 is sent before the store finishes its work', async () => {
  let release
  const gate = new Promise((r) => { release = r })
  const store = { async recordEvent() { await gate; return true } }
  const { post, close } = await startApp({ store })
  try {
    const res = await Promise.race([
      post(incomingMessage('wamid.SLOW')),
      new Promise((_, rej) => setTimeout(() => rej(new Error('response waited on the store')), 1500)),
    ])
    assert.equal(res.status, 200)
  } finally { release(); await close() }
})

test('the billing hook runs once per new event and never for a redelivery', async () => {
  const seen = []
  const { post, close, settle } = await startApp({ onEvent: async (evt) => { seen.push(evt.key) } })
  try {
    await post(incomingMessage('wamid.HOOK'))
    await post(incomingMessage('wamid.HOOK'))
    await post(statusUpdate('delivered', 'wamid.OUT9'))
    await settle()
    assert.deepEqual(seen.sort(), ['message:wamid.HOOK', 'status:wamid.OUT9:delivered'])
  } finally { await close() }
})

test('a failing billing hook never loses the stored event or the 200', async () => {
  const { post, close, settle, store } = await startApp({ onEvent: async () => { throw new Error('db down') } })
  try {
    assert.equal((await post(incomingMessage('wamid.HOOKFAIL'))).status, 200)
    await settle()
    assert.equal(store.stored.length, 1)
  } finally { await close() }
})
