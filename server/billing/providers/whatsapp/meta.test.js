import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMetaWhatsAppProvider, validateRecipient, classifyGraphError, DEFAULT_GRAPH_API_VERSION } from './meta.js'

// Fake credentials only. Nothing here reaches the network: every request
// goes through the fetch stubs below.
const TOKEN = 'EAAGfakeTOKENvalue1234567890abcdef'
const PHONE_ID = '109876543210987'
const TO = '15045550101'

const REQUEST = { to: TO, templateName: 'payment_due_soon', languageCode: 'es', bodyParams: ['María', '$250.00', '15 de noviembre'], idempotencyKey: 'rem_42_attempt_1' }

function captureLog() {
  const lines = []
  const rec = (level) => (obj, msg) => lines.push({ level, obj, msg })
  return { lines, log: { info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') } }
}

function jsonFetch(status, body, calls = []) {
  const fn = async (url, init) => {
    calls.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  fn.calls = calls
  return fn
}

const make = (fetchImpl, extra = {}) => createMetaWhatsAppProvider({ accessToken: TOKEN, phoneNumberId: PHONE_ID, graphVersion: 'v26.0', fetchImpl, ...extra })

const graphError = (code, message, extra = {}) => ({
  error: { message, type: 'OAuthException', code, fbtrace_id: 'AzX1fakeTrace', ...extra },
})

test('default Graph version is the newest the changelog lists', () => {
  assert.equal(DEFAULT_GRAPH_API_VERSION, 'v26.0')
})

test('request shape: URL, headers and body', async () => {
  const f = jsonFetch(200, { messaging_product: 'whatsapp', contacts: [{ input: TO, wa_id: TO }], messages: [{ id: 'wamid.HBgLMTUwNDU1NTAxMDEVAgARGBI=' }] })
  const result = await make(f).sendTemplate(REQUEST)
  assert.equal(f.calls.length, 1)
  const { url, init } = f.calls[0]
  assert.equal(url, `https://graph.facebook.com/v26.0/${PHONE_ID}/messages`)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.ok(init.signal instanceof AbortSignal)
  assert.deepEqual(JSON.parse(init.body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: TO,
    type: 'template',
    template: {
      name: 'payment_due_soon',
      language: { code: 'es' },
      components: [{ type: 'body', parameters: [
        { type: 'text', text: 'María' }, { type: 'text', text: '$250.00' }, { type: 'text', text: '15 de noviembre' },
      ] }],
    },
  })
  assert.deepEqual(result, { ok: true, providerMessageId: 'wamid.HBgLMTUwNDU1NTAxMDEVAgARGBI=', simulated: false })
})

test('components are omitted when there are no body params', async () => {
  const f = jsonFetch(200, { messages: [{ id: 'wamid.X' }] })
  await make(f, { graphVersion: 'v25.0' }).sendTemplate({ ...REQUEST, bodyParams: [] })
  assert.equal(f.calls[0].url, `https://graph.facebook.com/v25.0/${PHONE_ID}/messages`)
  const body = JSON.parse(f.calls[0].init.body)
  assert.deepEqual(body.template, { name: 'payment_due_soon', language: { code: 'es' } })
  assert.equal('components' in body.template, false)
})

test('2xx without a message id is unknown, never ok', async () => {
  const r = await make(jsonFetch(200, { messaging_product: 'whatsapp' })).sendTemplate(REQUEST)
  assert.equal(r.ok, false)
  assert.equal(r.outcome, 'unknown')
  assert.equal(r.error.retryable, false)
})

// Each case: realistic Graph error body → expected outcome / retryable / category.
const ERROR_CASES = [
  // auth / permission
  { name: '190 expired token', status: 401, body: graphError(190, 'Error validating access token: Session has expired on Tuesday, 28-Oct-26 10:00:00 PDT.', { error_subcode: 463 }), outcome: 'failed', retryable: false, category: 'auth' },
  { name: '10 permission denied', status: 403, body: graphError(10, '(#10) Application does not have permission for this action'), outcome: 'failed', retryable: false, category: 'auth' },
  { name: '200 permission (200-range)', status: 403, body: graphError(200, '(#200) Permissions error'), outcome: 'failed', retryable: false, category: 'auth' },
  { name: '131005 access denied', status: 403, body: graphError(131005, '(#131005) Access denied', { error_data: { messaging_product: 'whatsapp', details: 'Permission is either not granted or has been removed.' } }), outcome: 'failed', retryable: false, category: 'auth' },
  { name: '131031 account locked', status: 400, body: graphError(131031, '(#131031) Business Account locked', { error_data: { messaging_product: 'whatsapp', details: 'The account has been locked.' } }), outcome: 'failed', retryable: false, category: 'account' },
  // recipient
  { name: '131026 not a WhatsApp user', status: 400, body: graphError(131026, '(#131026) Message undeliverable', { error_subcode: 2494010, error_data: { messaging_product: 'whatsapp', details: 'Message Undeliverable.' } }), outcome: 'failed', retryable: false, category: 'recipient' },
  { name: '131030 not in allowed list', status: 400, body: graphError(131030, '(#131030) Recipient phone number not in allowed list', { error_data: { messaging_product: 'whatsapp', details: 'Recipient phone number not in allowed list: Add recipient phone number to recipient list and try again.' } }), outcome: 'failed', retryable: false, category: 'recipient' },
  { name: '100 invalid recipient', status: 400, body: graphError(100, '(#100) Invalid parameter', { error_data: { messaging_product: 'whatsapp', details: "The parameter 'to' is not a valid phone number" } }), outcome: 'failed', retryable: false, category: 'recipient' },
  { name: '100 other parameter', status: 400, body: graphError(100, '(#100) Invalid parameter', { error_data: { messaging_product: 'whatsapp', details: 'Unexpected key "foo" on param "template".' } }), outcome: 'failed', retryable: false, category: 'invalid_request' },
  // template
  { name: '132000 param count mismatch', status: 400, body: graphError(132000, '(#132000) Number of parameters does not match the expected number of params', { error_data: { messaging_product: 'whatsapp', details: 'body: number of localizable_params (2) does not match the expected number of params (3)' } }), outcome: 'failed', retryable: false, category: 'template' },
  { name: '132001 template does not exist', status: 404, body: graphError(132001, '(#132001) Template name does not exist in the translation', { error_data: { messaging_product: 'whatsapp', details: 'template name (payment_due_soon) does not exist in es' } }), outcome: 'failed', retryable: false, category: 'template' },
  { name: '132005 hydrated text too long', status: 400, body: graphError(132005, '(#132005) Template Hydrated Text Too Long'), outcome: 'failed', retryable: false, category: 'template' },
  { name: '132007 format policy violated', status: 400, body: graphError(132007, '(#132007) Template Format Character Policy Violated'), outcome: 'failed', retryable: false, category: 'template' },
  { name: '132015 template paused', status: 400, body: graphError(132015, '(#132015) Template is Paused'), outcome: 'failed', retryable: false, category: 'template' },
  { name: '132016 template disabled', status: 400, body: graphError(132016, '(#132016) Template is Disabled'), outcome: 'failed', retryable: false, category: 'template' },
  // rate limits
  { name: '4 app rate limit', status: 400, body: graphError(4, '(#4) Application request limit reached', { is_transient: true }), outcome: 'failed', retryable: true, category: 'rate_limited' },
  { name: '80007 WABA rate limit', status: 400, body: graphError(80007, '(#80007) Rate limit issues'), outcome: 'failed', retryable: true, category: 'rate_limited' },
  { name: '130429 throughput', status: 429, body: graphError(130429, '(#130429) Rate limit hit', { error_data: { messaging_product: 'whatsapp', details: 'Cloud API message throughput has been reached.' } }), outcome: 'failed', retryable: true, category: 'rate_limited' },
  { name: '131048 spam rate limit', status: 400, body: graphError(131048, '(#131048) Spam rate limit hit'), outcome: 'failed', retryable: true, category: 'rate_limited' },
  { name: '131056 pair rate limit', status: 400, body: graphError(131056, '(#131056) (Business Account, Consumer Account) pair rate limit hit'), outcome: 'failed', retryable: true, category: 'rate_limited' },
  // 24-hour window
  { name: '131047 re-engagement', status: 400, body: graphError(131047, '(#131047) Re-engagement message', { error_data: { messaging_product: 'whatsapp', details: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.' } }), outcome: 'failed', retryable: false, category: 'window' },
  // 5xx that says the message was not sent
  { name: '503 + 131016 service unavailable', status: 503, body: graphError(131016, '(#131016) Service unavailable', { is_transient: true }), outcome: 'failed', retryable: true, category: 'temporarily_unavailable' },
  { name: '500 + 131000 failed to send', status: 500, body: graphError(131000, '(#131000) Something went wrong', { error_data: { messaging_product: 'whatsapp', details: 'Message failed to send because of an unknown error.' } }), outcome: 'failed', retryable: true, category: 'temporarily_unavailable' },
  // 5xx we cannot attribute → unknown
  { name: '500 + Graph code 1 (API unknown)', status: 500, body: graphError(1, 'An unknown error occurred', { is_transient: false }), outcome: 'unknown', retryable: false, category: 'server_error' },
  { name: '502 HTML body', status: 502, body: '<html><body>502 Bad Gateway</body></html>', outcome: 'unknown', retryable: false, category: 'unreadable_response' },
  { name: '500 empty body', status: 500, body: '', outcome: 'unknown', retryable: false, category: 'unreadable_response' },
  { name: '400 JSON without error object', status: 400, body: { oops: true }, outcome: 'unknown', retryable: false, category: 'unreadable_response' },
]

for (const c of ERROR_CASES) {
  test(`error mapping: ${c.name}`, async () => {
    const r = await make(jsonFetch(c.status, c.body)).sendTemplate(REQUEST)
    assert.equal(r.ok, false)
    assert.equal(r.simulated, false)
    assert.equal(r.outcome, c.outcome)
    assert.equal(r.error.retryable, c.retryable)
    assert.equal(r.error.category, c.category)
    assert.equal(r.error.httpStatus, c.status)
    if (typeof c.body === 'object' && c.body.error) {
      assert.equal(r.error.code, c.body.error.code)
      assert.equal(r.error.metaCode, c.body.error.code)
      assert.equal(r.error.fbtraceId, 'AzX1fakeTrace')
    }
    assert.equal(typeof r.error.message, 'string')
  })
}

test('classifier: unknown 4xx code is a definite, non-retryable rejection', () => {
  assert.deepEqual(classifyGraphError(400, { code: 135000 }), { outcome: 'failed', retryable: false, category: 'rejected' })
  assert.deepEqual(classifyGraphError(429, { code: 99999 }), { outcome: 'failed', retryable: true, category: 'rate_limited' })
  assert.equal(classifyGraphError(500, { code: 131026 }).outcome, 'unknown')
})

test('timeout after the request was sent → unknown, never retryable', async () => {
  let calls = 0
  const hang = (url, init) => new Promise((_, reject) => {
    calls++
    init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')))
  })
  const r = await make(hang, { timeoutMs: 20 }).sendTemplate(REQUEST)
  assert.equal(calls, 1)
  assert.equal(r.ok, false)
  assert.equal(r.outcome, 'unknown')
  assert.equal(r.error.code, 'timeout')
  assert.equal(r.error.retryable, false)
})

test('connection reset after sending → unknown', async () => {
  const reset = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) }) }
  const r = await make(reset).sendTemplate(REQUEST)
  assert.equal(r.outcome, 'unknown')
  assert.equal(r.error.retryable, false)
})

test('body read failing after a response arrived → unknown', async () => {
  const f = async () => ({ ok: true, status: 200, text: async () => { throw new TypeError('terminated', { cause: { code: 'UND_ERR_SOCKET' } }) } })
  const r = await make(f).sendTemplate(REQUEST)
  assert.equal(r.outcome, 'unknown')
})

test('connection refused / DNS failure before sending → failed, retryable', async () => {
  for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
    const refused = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ${code}`), { code }) }) }
    const r = await make(refused).sendTemplate(REQUEST)
    assert.equal(r.outcome, 'failed', code)
    assert.equal(r.error.retryable, true, code)
    assert.equal(r.error.code, 'network_error')
  }
})

test('the token never appears in results, errors or logs; phone numbers and text never in logs', async () => {
  const { lines, log } = captureLog()
  const echo = graphError(190, `Malformed access token ${TOKEN} for ${TO}`)
  const scenarios = [
    jsonFetch(200, { messages: [{ id: 'wamid.OK' }] }),
    jsonFetch(401, echo),
    jsonFetch(400, graphError(131026, '(#131026) Message undeliverable')),
    jsonFetch(502, `<html>upstream said Bearer ${TOKEN}</html>`),
    async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error(`connect ECONNREFUSED token=${TOKEN}`), { code: 'ECONNREFUSED' }) }) },
    async () => { throw new TypeError(`fetch failed ${TOKEN}`, { cause: { code: 'ECONNRESET' } }) },
  ]
  const results = []
  for (const f of scenarios) results.push(await make(f, { log }).sendTemplate(REQUEST))
  const provider = make(scenarios[0], { log })
  results.push(provider.describe())

  const everything = JSON.stringify({ results, lines })
  assert.ok(!everything.includes(TOKEN), 'token leaked')
  assert.ok(!everything.includes('EAAGfake'), 'token prefix leaked')
  // the echoed Graph message is still returned, scrubbed
  assert.match(results[1].error.message, /\[REDACTED\]/)
  assert.ok(!results[1].error.message.includes(TO))

  const logText = JSON.stringify(lines)
  assert.ok(lines.length >= scenarios.length)
  assert.ok(!logText.includes(TO), 'phone number in logs')
  for (const p of REQUEST.bodyParams) assert.ok(!logText.includes(p), 'message text in logs')
  assert.ok(lines.some((l) => l.obj.providerMessageId === 'wamid.OK'))
  assert.ok(lines.some((l) => l.obj.metaCode === 131026))
})

test('describe() has no secrets', () => {
  const d = make(jsonFetch(200, {})).describe()
  assert.deepEqual(d, { mode: 'meta', configured: true, graphVersion: 'v26.0', phoneNumberId: PHONE_ID })
  const unconfigured = createMetaWhatsAppProvider({ phoneNumberId: PHONE_ID, fetchImpl: jsonFetch(200, {}) }).describe()
  assert.equal(unconfigured.configured, false)
  assert.equal(unconfigured.graphVersion, DEFAULT_GRAPH_API_VERSION)
})

test('unconfigured provider refuses without a network call', async () => {
  const f = jsonFetch(200, {})
  const r = await createMetaWhatsAppProvider({ phoneNumberId: PHONE_ID, fetchImpl: f }).sendTemplate(REQUEST)
  assert.equal(r.outcome, 'failed')
  assert.equal(r.error.code, 'not_configured')
  assert.equal(f.calls.length, 0)
})

test('bad graph version or phone number id is a config error', () => {
  assert.throws(() => createMetaWhatsAppProvider({ accessToken: TOKEN, phoneNumberId: PHONE_ID, graphVersion: '26.0' }), { name: 'WhatsAppConfigError' })
  assert.throws(() => createMetaWhatsAppProvider({ accessToken: TOKEN, phoneNumberId: '123/../me' }), { name: 'WhatsAppConfigError' })
})

test('validateRecipient: E.164 digits without +, 8-15', () => {
  for (const ok of ['15045550101', '50212345678', '12345678', '123456789012345']) assert.equal(validateRecipient(ok), true, ok)
  for (const bad of ['+15045550101', '1504555010a', '1234567', '1234567890123456', '05045550101', '1 504 555 0101', '', null, 15045550101]) {
    assert.equal(validateRecipient(bad), false, String(bad))
  }
})

test('invalid recipient or request is refused locally, no network', async () => {
  const f = jsonFetch(200, { messages: [{ id: 'wamid.X' }] })
  const p = make(f)
  const cases = [
    [{ ...REQUEST, to: '+15045550101' }, 'invalid_recipient'],
    [{ ...REQUEST, templateName: 'Payment Due' }, 'invalid_request'],
    [{ ...REQUEST, languageCode: 'spanish' }, 'invalid_request'],
    [{ ...REQUEST, bodyParams: ['ok', ''] }, 'invalid_request'],
    [{ ...REQUEST, bodyParams: ['line\nbreak'] }, 'invalid_request'],
    [{ ...REQUEST, idempotencyKey: undefined }, 'invalid_request'],
  ]
  for (const [req, code] of cases) {
    const r = await p.sendTemplate(req)
    assert.equal(r.outcome, 'failed')
    assert.equal(r.error.code, code)
    assert.equal(r.error.retryable, false)
  }
  assert.equal(f.calls.length, 0)
})
