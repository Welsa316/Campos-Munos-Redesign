// RingCentral OAuth pieces without a database: config, encryption, the HTTP
// calls (against a fake fetch) and log redaction.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadRingCentralConfig, EXPECTED_PRODUCTION_REDIRECT_URI } from './config.js'
import { buildAuthorizeUrl, exchangeCode, refreshTokens, revokeToken, RingCentralOAuthError, createPkcePair } from './oauth.js'
import { createSecretBox, parseKey, deriveKey, digestsEqual, sha256Hex, SecretBoxError } from '../secretBox.js'
import { redactUrlSecrets } from '../../utils/redactUrl.js'
import crypto from 'crypto'

const ENV = {
  NODE_ENV: 'production',
  RINGCENTRAL_CLIENT_ID: 'client-id-123',
  RINGCENTRAL_CLIENT_SECRET: 'client-secret-very-secret',
  RINGCENTRAL_SERVER_URL: 'https://platform.ringcentral.com',
  RINGCENTRAL_REDIRECT_URI: 'https://api.camulaw.com/api/integrations/ringcentral/callback',
}

test('config: the four Railway variables are enough; the key is derived from the client secret', () => {
  const c = loadRingCentralConfig(ENV)
  assert.equal(c.configured, true, c.problems.join('; '))
  assert.equal(c.redirectUri, EXPECTED_PRODUCTION_REDIRECT_URI)
  assert.equal(c.adminAppUrl, 'https://admin.camulaw.com')
  assert.equal(c.keySource, 'derived_from_client_secret')
  assert.equal(c.encryptionKey.length, 32)
  assert.equal(c.environment, 'production')
  assert.equal(loadRingCentralConfig({ ...ENV, RINGCENTRAL_SERVER_URL: 'https://platform.devtest.ringcentral.com/' }).environment, 'sandbox')
})

test('config: missing or unsafe values are refused by name, never echoed', () => {
  const none = loadRingCentralConfig({ NODE_ENV: 'production' })
  assert.equal(none.configured, false)
  for (const v of ['RINGCENTRAL_CLIENT_ID', 'RINGCENTRAL_CLIENT_SECRET', 'RINGCENTRAL_REDIRECT_URI']) {
    assert.ok(none.problems.some((p) => p.includes(v)), v)
  }
  // The client secret goes to this host: only RingCentral's are accepted.
  const evil = loadRingCentralConfig({ ...ENV, RINGCENTRAL_SERVER_URL: 'https://attacker.example' })
  assert.equal(evil.configured, false)
  assert.ok(!evil.problems.join(' ').includes('client-secret'))
  assert.equal(loadRingCentralConfig({ ...ENV, RINGCENTRAL_REDIRECT_URI: 'http://api.camulaw.com/api/integrations/ringcentral/callback' }).configured, false)
  assert.equal(loadRingCentralConfig({ ...ENV, RINGCENTRAL_REDIRECT_URI: 'https://api.camulaw.com/other' }).configured, false)
  assert.equal(loadRingCentralConfig({ ...ENV, RINGCENTRAL_TOKEN_ENCRYPTION_KEY: 'too-short' }).configured, false)
  const dedicated = loadRingCentralConfig({ ...ENV, RINGCENTRAL_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) })
  assert.equal(dedicated.keySource, 'dedicated')
})

test('secret box: round trip, context binding, tamper and key-change detection', () => {
  const key = crypto.randomBytes(32)
  const box = createSecretBox(key)
  const sealed = box.seal('token-value', 'ringcentral:refresh_token')
  assert.ok(!sealed.includes('token-value'))
  assert.equal(box.open(sealed, 'ringcentral:refresh_token'), 'token-value')
  assert.notEqual(box.seal('token-value', 'x'), box.seal('token-value', 'x'), 'random IV per value')
  assert.throws(() => box.open(sealed, 'ringcentral:access_token'), (e) => e instanceof SecretBoxError && e.code === 'decrypt_failed')
  const parts = sealed.split('.')
  parts[4] = Buffer.from('tampered').toString('base64url')
  assert.throws(() => box.open(parts.join('.'), 'ringcentral:refresh_token'), SecretBoxError)
  const other = createSecretBox(crypto.randomBytes(32))
  assert.throws(() => other.open(sealed, 'ringcentral:refresh_token'), (e) => e.code === 'key_changed')
  assert.equal(parseKey('ab'.repeat(32)).length, 32)
  assert.equal(parseKey(crypto.randomBytes(32).toString('base64')).length, 32)
  assert.equal(parseKey('nope'), null)
  assert.deepEqual(deriveKey('s', 'i'), deriveKey('s', 'i'))
  assert.notDeepEqual(deriveKey('s', 'i'), deriveKey('t', 'i'))
  assert.ok(digestsEqual(sha256Hex('a'), sha256Hex('a')))
  assert.ok(!digestsEqual(sha256Hex('a'), sha256Hex('b')))
  assert.ok(!digestsEqual(sha256Hex('a'), 'short'))
})

test('authorize URL carries client id, the registered redirect URI and state; never the secret', () => {
  const c = loadRingCentralConfig(ENV)
  const u = new URL(buildAuthorizeUrl(c, { state: 'S'.repeat(43) }))
  assert.equal(u.origin + u.pathname, 'https://platform.ringcentral.com/restapi/oauth/authorize')
  assert.equal(u.searchParams.get('response_type'), 'code')
  assert.equal(u.searchParams.get('client_id'), 'client-id-123')
  assert.equal(u.searchParams.get('redirect_uri'), 'https://api.camulaw.com/api/integrations/ringcentral/callback')
  assert.equal(u.searchParams.get('state'), 'S'.repeat(43))
  assert.ok(!u.toString().includes('client-secret'))
  assert.equal(u.searchParams.get('code_challenge'), null)
  const { verifier, challenge } = createPkcePair()
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'))
  const p = new URL(buildAuthorizeUrl(c, { state: 'x', codeChallenge: challenge }))
  assert.equal(p.searchParams.get('code_challenge_method'), 'S256')
})

function fakeFetch(responder) {
  const calls = []
  const fn = async (url, init) => {
    const body = Object.fromEntries(new URLSearchParams(init.body))
    calls.push({ url, init, body })
    const { status = 200, json } = responder({ url, body, init })
    return { status, text: async () => (json === undefined ? '' : JSON.stringify(json)), headers: { get: () => null } }
  }
  fn.calls = calls
  return fn
}

test('code exchange: Basic auth, form body with the redirect URI, tokens normalised', async () => {
  const c = loadRingCentralConfig(ENV)
  const fetchImpl = fakeFetch(() => ({ json: { access_token: 'AT', refresh_token: 'RT', token_type: 'bearer', expires_in: 3600, refresh_token_expires_in: 604800, scope: 'ReadCallLog', owner_id: 42, endpoint_id: 'ep' } }))
  const now = new Date('2026-11-01T00:00:00Z')
  const t = await exchangeCode(c, { code: 'the-code' }, { fetchImpl, now: () => now })
  const call = fetchImpl.calls[0]
  assert.equal(call.url, 'https://platform.ringcentral.com/restapi/oauth/token')
  assert.equal(call.init.headers.Authorization, `Basic ${Buffer.from('client-id-123:client-secret-very-secret').toString('base64')}`)
  assert.equal(call.init.headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.deepEqual(call.body, { grant_type: 'authorization_code', code: 'the-code', redirect_uri: c.redirectUri })
  assert.equal(t.accessToken, 'AT')
  assert.equal(t.refreshToken, 'RT')
  assert.equal(t.ownerId, '42')
  assert.equal(t.accessTokenExpiresAt.toISOString(), '2026-11-01T01:00:00.000Z')
  assert.equal(t.refreshTokenExpiresAt.toISOString(), '2026-11-08T00:00:00.000Z')
})

test('refresh and revoke; errors keep only the provider code, never tokens or descriptions', async () => {
  const c = loadRingCentralConfig(ENV)
  const ok = fakeFetch(({ body }) => (body.grant_type === 'refresh_token'
    ? { json: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, refresh_token_expires_in: 604800 } }
    : { status: 200 }))
  const t = await refreshTokens(c, { refreshToken: 'RT1' }, { fetchImpl: ok })
  assert.equal(t.refreshToken, 'RT2')
  assert.deepEqual(ok.calls[0].body, { grant_type: 'refresh_token', refresh_token: 'RT1' })
  await revokeToken(c, { token: 'RT2' }, { fetchImpl: ok })
  assert.equal(ok.calls[1].url, 'https://platform.ringcentral.com/restapi/oauth/revoke')

  const bad = fakeFetch(() => ({ status: 400, json: { error: 'invalid_grant', error_description: 'Token RT1 is invalid' } }))
  await assert.rejects(refreshTokens(c, { refreshToken: 'RT1' }, { fetchImpl: bad }), (e) => {
    assert.ok(e instanceof RingCentralOAuthError)
    assert.equal(e.code, 'invalid_grant')
    assert.equal(e.retryable, false)
    assert.ok(!e.message.includes('RT1'))
    return true
  })
  const busy = fakeFetch(() => ({ status: 503 }))
  await assert.rejects(refreshTokens(c, { refreshToken: 'x' }, { fetchImpl: busy }), (e) => e.retryable === true && e.code === 'http_503')
  const down = async () => { throw new Error('ECONNRESET with secret client-secret-very-secret') }
  await assert.rejects(refreshTokens(c, { refreshToken: 'x' }, { fetchImpl: down }), (e) => e.code === 'network_error' && !e.message.includes('secret'))
  const empty = fakeFetch(() => ({ json: { access_token: 'only' } }))
  await assert.rejects(exchangeCode(c, { code: 'c' }, { fetchImpl: empty }), (e) => e.code === 'invalid_token_response')
})

test('request logs never carry the authorization code or state', () => {
  const url = '/api/integrations/ringcentral/callback?code=SECRETCODE&state=SECRETSTATE&error_description=x'
  const out = redactUrlSecrets(url)
  assert.ok(!out.includes('SECRETCODE'))
  assert.ok(!out.includes('SECRETSTATE'))
  assert.match(out, /code=%5BREDACTED%5D/)
  assert.equal(redactUrlSecrets('/api/submissions?state=new'), '/api/submissions?state=new')
  assert.ok(!redactUrlSecrets('/webhooks/whatsapp?hub.verify_token=abc').includes('abc'))
})
