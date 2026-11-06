// Call log import and the portal's list, over real HTTP and Postgres against a
// fake RingCentral. Synthetic people and 555-01xx numbers only.
//
// Own database: <TEST_DATABASE_URL's name>_calls (created if missing; must
// contain "test"; schema dropped and rebuilt).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_calls`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

const env = {
  NODE_ENV: 'test',
  RINGCENTRAL_CLIENT_ID: 'calls-client',
  RINGCENTRAL_CLIENT_SECRET: 'calls-secret-for-tests',
  RINGCENTRAL_SERVER_URL: 'https://platform.ringcentral.com',
  RINGCENTRAL_REDIRECT_URI: 'https://api.camulaw.com/api/integrations/ringcentral/callback',
}

let server, base, db, clock
const users = {}
const sleeps = []

const firm = { phoneNumber: '+15049106508', name: 'Campos Muños Law' }
const rec = (id, startTime, direction, result, other, extra = {}) => ({
  id, sessionId: `s-${id}`, telephonySessionId: `ts-${id}`, startTime, duration: result === 'Accepted' || result === 'Call connected' ? 125 : 0,
  type: 'Voice', direction, result, lastModifiedTime: startTime,
  from: direction === 'Inbound' ? other : { ...firm, name: 'Yoletty', extensionNumber: '101' },
  to: direction === 'Inbound' ? firm : other,
  legs: [], ...extra,
})

// Fake RingCentral: tokens plus a paginated call log (3 records a page).
const rc = {
  records: [], requests: [], issued: 0, refresh: new Set(),
  accountForbidden: false, extensionForbidden: false, rateLimitOnce: false, unauthorizedOnce: false, delayMs: 0, gate: null, onRequest: null,
  ringouts: new Map(), ringoutSeq: 0, ringoutForbidden: false, ringoutRequests: [],
  directoryRequests: [], directoryForbidden: false,
  // The live call-event subscription: what was asked for, and what RingCentral holds.
  subscriptions: new Map(), subscriptionRequests: [], subscriptionForbidden: false, subSeq: 0,
  extensions: [
    { id: 9101, extensionNumber: '101', name: 'Yoletty', type: 'User', status: 'Enabled' },
    { id: 9102, extensionNumber: '102', name: 'Ciro', type: 'User', status: 'Enabled' },
    { id: 9001, extensionNumber: '1', name: 'Main menu', type: 'IvrMenu', status: 'Enabled' },
  ],
}
async function fakeFetch(url, init) {
  const u = new URL(url)
  const reply = (status, json, headers = {}) => ({ status, text: async () => (json ? JSON.stringify(json) : ''), headers: { get: (h) => headers[h.toLowerCase()] ?? null } })
  if (u.pathname === '/restapi/oauth/token') {
    const body = Object.fromEntries(new URLSearchParams(init.body))
    if (body.grant_type === 'refresh_token' && !rc.refresh.delete(body.refresh_token)) return reply(400, { error: 'invalid_grant' })
    rc.issued++
    rc.refresh.add(`RT-${rc.issued}`)
    return reply(200, { access_token: `AT-${rc.issued}`, refresh_token: `RT-${rc.issued}`, expires_in: 3600, refresh_token_expires_in: 604800, owner_id: '1' })
  }
  // Subscriptions (live call events): create, read, renew, delete.
  const sub = /^\/restapi\/v1\.0\/subscription(?:\/([^/]+))?(\/renew)?$/.exec(u.pathname)
  if (sub) {
    const body = init.body ? JSON.parse(init.body) : null
    rc.subscriptionRequests.push({ method: init.method, id: sub[1] || null, renew: Boolean(sub[2]), body })
    if (!/^Bearer AT-\d+$/.test(init.headers.Authorization)) return reply(401, { errorCode: 'OAU-149' })
    if (rc.subscriptionForbidden) return reply(403, { errorCode: 'CMN-408', errors: [{ errorCode: 'CMN-408', permissionName: 'CallControl' }] })
    if (init.method === 'POST' && !sub[1]) {
      // RingCentral checks the address first: our receiver must echo the token.
      const check = await rc.validate?.(body.deliveryMode.address)
      if (rc.validate && !check) return reply(400, { errorCode: 'SUB-525', message: 'WebHook server response is invalid' })
      const id = `sub-${++rc.subSeq}`
      const s = { id, status: 'Active', eventFilters: body.eventFilters, expirationTime: new Date(clock.t.getTime() + body.expiresIn * 1000).toISOString(), token: body.deliveryMode.verificationToken }
      rc.subscriptions.set(id, s)
      return reply(200, { id: s.id, status: s.status, expirationTime: s.expirationTime, eventFilters: s.eventFilters })
    }
    const s = rc.subscriptions.get(sub[1])
    if (!s) return reply(404, { errorCode: 'SUB-100' })
    if (init.method === 'DELETE') { rc.subscriptions.delete(sub[1]); return reply(204) }
    if (sub[2]) s.expirationTime = new Date(clock.t.getTime() + 315360000 * 1000).toISOString()
    return reply(200, { id: s.id, status: s.status, expirationTime: s.expirationTime })
  }
  // The extension directory (who is a person): read once a day, kept apart
  // from the call log requests the other tests count.
  if (u.pathname === '/restapi/v1.0/account/~/extension') {
    rc.directoryRequests.push(Object.fromEntries(u.searchParams))
    if (!/^Bearer AT-\d+$/.test(init.headers.Authorization)) return reply(401, { errorCode: 'OAU-149' })
    if (rc.directoryForbidden) return reply(403, { errorCode: 'CMN-408', errors: [{ errorCode: 'CMN-408', permissionName: 'ReadAccounts' }] })
    return reply(200, { records: rc.extensions, navigation: {} })
  }
  rc.requests.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), auth: init.headers.Authorization })
  rc.onRequest?.()
  if (rc.gate) await rc.gate
  if (rc.delayMs) await new Promise((r) => setTimeout(r, rc.delayMs))
  if (!/^Bearer AT-\d+$/.test(init.headers.Authorization)) return reply(401, { errorCode: 'OAU-149' })
  if (rc.unauthorizedOnce) { rc.unauthorizedOnce = false; return reply(401, { errorCode: 'OAU-149', message: 'Invalid token' }) }
  if (rc.rateLimitOnce) { rc.rateLimitOnce = false; return reply(429, { errorCode: 'CMN-301', message: 'Request rate exceeded' }, { 'retry-after': '60' }) }
  // RingOut: POST places, GET reads status, DELETE cancels.
  const ro = /^\/restapi\/v1\.0\/account\/~\/extension\/~\/ring-out(?:\/([^/]+))?$/.exec(u.pathname)
  if (ro) {
    rc.ringoutRequests.push({ method: init.method, id: ro[1] || null, body: init.body ? JSON.parse(init.body) : null })
    if (rc.ringoutForbidden) return reply(403, { errorCode: 'CMN-408', errors: [{ errorCode: 'CMN-408', permissionName: 'RingOut' }] })
    if (init.method === 'POST') {
      const id = `ro-${++rc.ringoutSeq}`
      const status = { callStatus: 'InProgress', callerStatus: 'InProgress', calleeStatus: 'InProgress' }
      rc.ringouts.set(id, status)
      return reply(200, { id, uri: `.../ring-out/${id}`, status })
    }
    const status = rc.ringouts.get(ro[1])
    if (!status) return reply(404, { errorCode: 'CMN-102' })
    if (init.method === 'DELETE') { rc.ringouts.delete(ro[1]); return reply(204) }
    return reply(200, { id: ro[1], status })
  }
  const isAccount = u.pathname === '/restapi/v1.0/account/~/call-log'
  if (isAccount && rc.accountForbidden) return reply(403, { errorCode: 'CMN-408', errors: [{ errorCode: 'CMN-408', permissionName: 'ReadCompanyCallLog' }] })
  if (!isAccount && rc.extensionForbidden) return reply(403, { errorCode: 'CMN-408', errors: [{ errorCode: 'CMN-408', permissionName: 'ReadCallLog' }] })
  const from = new Date(u.searchParams.get('dateFrom')).getTime()
  const to = new Date(u.searchParams.get('dateTo')).getTime()
  const inRange = rc.records.filter((r) => { const t = new Date(r.startTime).getTime(); return t >= from && t <= to })
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
  const page = Number(u.searchParams.get('page')) || 1
  const size = 3
  const slice = inRange.slice((page - 1) * size, page * size)
  return reply(200, { records: slice, navigation: page * size < inRange.length ? { nextPage: { uri: 'next' } } : {}, paging: { page, perPage: size } })
}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'calls-test-secret-0123456789abcdef0123'
  process.env.NODE_ENV = 'test'
  const admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])).rowCount) await admin.query(`CREATE DATABASE "${DB_NAME}"`)
  await admin.end()
  const c = new pg.Client({ connectionString: URL_ })
  await c.connect()
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await c.end()
  process.env.DATABASE_URL = URL_
  const migrate = () => execFileSync(process.execPath, [join(__dirname, '..', '..', 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  migrate()
  migrate()
  db = new pg.Pool({ connectionString: URL_ })

  const rows = (await db.query(
    `INSERT INTO admin_users (email, password_hash, role) VALUES ('owner@example.test', 'x', 'admin'), ('desk@example.test', 'x', 'front_desk'), ('para@example.test', 'x', 'billing_paralegal')
     RETURNING id, token_version`
  )).rows
  const cookie = (u) => `token=${jwt.sign({ id: u.id, email: 'x', tv: u.token_version }, process.env.JWT_SECRET)}`
  ;[users.owner, users.desk, users.para] = rows.map((u) => ({ ...u, cookie: cookie(u) }))

  // The firm's own records the calls should be matched against.
  await db.query(`INSERT INTO submissions (first_name, last_name, email, phone, message, created_at) VALUES
    ('Maria', 'Lopez', 'maria@example.test', '(504) 555-0101', '', '2026-10-20T10:00:00Z'),
    ('Jose', 'Garcia', 'jose@example.test', '504-555-0199', '', '2026-10-21T10:00:00Z'),
    ('Rosa', 'Garcia', 'rosa@example.test', '504.555.0199', '', '2026-10-25T10:00:00Z')`)
  const client = (await db.query(`INSERT INTO billing_clients (display_name) VALUES ('Carmen Ejemplo') RETURNING id`)).rows[0]
  await db.query(`INSERT INTO billing_client_contacts (client_id, phone_e164) VALUES ($1, '+15045550123')`, [client.id])
  // Also a website lead with the same number: the client's name wins.
  await db.query(`INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Carmen', 'E.', 'c@example.test', '5045550123', '')`)

  rc.records = [
    rec('c1', '2026-10-30T15:00:00Z', 'Inbound', 'Accepted', { phoneNumber: '+15045550101', name: 'WIRELESS CALLER' },
      { legs: [{ startTime: '2026-10-30T15:00:02Z', legType: 'Accept', result: 'Accepted', reason: 'Accepted', to: { name: 'Yoletty', extensionNumber: '101', extensionId: '9101' } }] }),
    rec('c2', '2026-10-30T16:00:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550123', name: 'METAIRIE LA' }, {
      legs: [{ startTime: '2026-10-30T16:00:02Z', legType: 'Accept', result: 'Missed', reason: 'No Answer', to: { name: 'Yoletty', extensionNumber: '101', extensionId: '9101' } }],
    }),
    rec('c3', '2026-10-30T16:30:00Z', 'Outbound', 'Call connected', { phoneNumber: '+15045550123' }),
    rec('c4', '2026-10-30T17:00:00Z', 'Inbound', 'Voicemail', { phoneNumber: '+15045550177', name: 'NEW ORLEANS LA' }, {
      legs: [
        { startTime: '2026-10-30T17:00:00Z', legType: 'PstnToSip', result: 'Missed', master: true, to: firm },
        { startTime: '2026-10-30T17:00:05Z', legType: 'Accept', result: 'Missed', reason: 'No Answer', reasonDescription: 'Ring timeout', to: { name: 'Yoletty', extensionNumber: '101', extensionId: '9101' } },
        { startTime: '2026-10-30T17:00:30Z', legType: 'FindMe', result: 'No Answer', reason: 'Not Answered', to: { phoneNumber: '+15045559876' }, extension: { id: 9101, uri: 'https://platform.example/ext/9101' } },
        { startTime: '2026-10-30T17:00:50Z', legType: 'Unknown', result: 'Voicemail', to: { name: 'Ciro', extensionNumber: '102', extensionId: '9102' },
          message: { id: 'vm1', type: 'VoiceMail', uri: 'https://platform.example/vm1' } },
      ],
      recording: { id: 'rec1', contentUri: 'https://platform.example/rec1' },
    }),
    rec('c5', '2026-10-30T18:00:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550199', name: 'JOSE GARCIA' }),
    rec('c6', '2026-10-30T18:30:00Z', 'Inbound', 'Accepted', { extensionNumber: '102', name: 'Paula' }),
    rec('c7', '2026-10-30T19:00:00Z', 'Inbound', 'Missed', { name: 'Anonymous' }, { reason: 'Hang Up' }),
    rec('c8', '2026-10-30T19:30:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550188', name: 'LUIS PRUEBA' }, {
      legs: [{ startTime: '2026-10-30T19:30:03Z', legType: 'Accept', result: 'Missed', reason: 'No Answer', to: { name: 'Ciro', extensionNumber: '102', extensionId: '9102' } }],
    }),
    { ...rec('fax1', '2026-10-30T20:00:00Z', 'Inbound', 'Received', { phoneNumber: '+15045550111' }), type: 'Fax' },
  ]

  clock = { t: new Date('2026-10-31T12:00:00Z') }
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('../../app.js')
  const { createCallsRouter } = await import('../../routes/calls.js')
  const { createIntegrationsRouter } = await import('../../routes/integrations.js')
  const { createRingCentralWebhookRouter } = await import('../../routes/ringcentralWebhook.js')
  const app = express()
  app.use('/webhooks/ringcentral', createRingCentralWebhookRouter({ db }))
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/integrations', createIntegrationsRouter({ env, fetchImpl: fakeFetch, now: () => clock.t, db }))
  app.use('/api/calls', createCallsRouter({ env, fetchImpl: fakeFetch, now: () => clock.t, sleep: async (ms) => { sleeps.push(ms) }, pageDelayMs: 5 }))
  addFallbackHandlers(app)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  await db?.end()
  const { default: getPool } = await import('../../db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, { cookie = users.owner.cookie } = {}) {
  const res = await fetch(base + path, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, body: method !== 'GET' ? '{}' : undefined })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}
const RANGE = `from=${encodeURIComponent('2026-10-30T00:00:00Z')}&to=${encodeURIComponent('2026-10-31T00:00:00Z')}`
async function send(method, path, body, { cookie = users.owner.cookie } = {}) {
  const res = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}
const list = (extra = '', who) => call('GET', `/api/calls?${RANGE}${extra}`, who ? { cookie: who.cookie } : {})
const sync = async () => { clock.t = new Date(clock.t.getTime() + 60 * 1000); return call('POST', '/api/calls/sync') }
const byId = (calls, startTime) => calls.find((c) => new Date(c.startedAt).toISOString() === new Date(startTime).toISOString())

async function connect() {
  const { loadRingCentralConfig } = await import('./config.js')
  const { startAuthorization, completeAuthorization } = await import('./service.js')
  const { loadAccount } = await import('../../auth/account.js')
  const cfg = loadRingCentralConfig(env)
  const s = await startAuthorization(db, cfg, { adminUserId: users.owner.id, now: clock.t })
  const state = new URL(s.authorizeUrl).searchParams.get('state')
  await completeAuthorization(db, cfg, { state, bindingNonce: s.bindingNonce, account: await loadAccount(db, users.owner.id), code: 'c' }, { fetchImpl: fakeFetch, now: () => clock.t })
}

test('RingCentral call log', { skip: SKIP }, async (t) => {
  await t.test('who can see calls: administrators and the front desk', async () => {
    assert.equal((await list('', users.para)).status, 403)
    assert.equal((await call('POST', '/api/calls/sync', { cookie: users.para.cookie })).status, 403)
    assert.equal((await call('GET', '/api/calls', { cookie: '' })).status, 401)
    const desk = await list('', users.desk)
    assert.equal(desk.status, 200)
    assert.equal(desk.json.canManageConnection, false)
    assert.equal((await list()).json.canManageConnection, true)
  })

  await t.test('before connecting: an empty list that says why, and a refresh that reports it', async () => {
    const r = await list()
    assert.equal(r.json.connection, 'not_connected')
    assert.deepEqual(r.json.calls, [])
    const s = await sync()
    assert.equal(s.json.result.status, 'error')
    assert.equal(s.json.result.code, 'not_connected')
    assert.equal((await list()).json.sync.lastErrorCode, 'not_connected')
  })

  await t.test('import: company log, paged, faxes skipped, pages spaced out', async () => {
    await connect()
    rc.requests = []
    sleeps.length = 0
    const s = await sync()
    assert.equal(s.json.result.status, 'ok', JSON.stringify(s.json))
    assert.equal(s.json.result.scope, 'account')
    assert.equal(s.json.result.new, 8, 'eight voice calls; the fax is skipped')
    assert.equal(rc.requests.length, 3, '9 records at 3 a page')
    assert.ok(rc.requests.every((r) => r.path === '/restapi/v1.0/account/~/call-log' && r.query.type === 'Voice' && r.query.view === 'Detailed'))
    assert.equal(sleeps.length, 2, 'a pause before each later page')
    assert.equal(s.json.sync.lastErrorCode, null)
    assert.ok(!/AT-\d|RT-\d|calls-secret/.test(s.text))
    // The first import reads 90 days once, to collect RingCentral's full records.
    assert.equal(new Date(rc.requests[0].query.dateFrom).getTime(), clock.t.getTime() - 90 * 24 * 60 * 60 * 1000)
    // Which extensions are people: read once, alongside.
    assert.equal(rc.directoryRequests.length, 1)
    assert.equal(s.json.result.directory, 'refreshed')
    assert.ok(s.json.sync.directoryRefreshedAt)
    // RingCentral's record is kept as sent, minus recordings, voicemail and other links.
    const raw = (await db.query(`SELECT rc_raw FROM rc_calls WHERE rc_record_id = 'c4'`)).rows[0].rc_raw
    assert.equal(raw.result, 'Voicemail')
    assert.equal(raw.legs[1].reasonDescription, 'Ring timeout')
    assert.deepEqual(raw.legs[2].extension, { id: 9101 })
    assert.deepEqual(raw.legs[3].message, { type: 'VoiceMail' })
    assert.equal(raw.recording, undefined)
    assert.ok(!JSON.stringify(raw).includes('platform.example'))
  })

  await t.test('the list: names from the firm’s records, readable outcomes, callbacks, counts', async () => {
    const r = await list()
    assert.equal(r.status, 200)
    const calls = r.json.calls
    assert.equal(calls.length, 7, 'the internal extension-to-extension call is left out')
    assert.ok(!/AT-\d|RT-\d/.test(r.text), 'no tokens in the response')

    const maria = byId(calls, '2026-10-30T15:00:00Z')
    assert.equal(maria.name, 'Maria Lopez')
    assert.equal(maria.nameSource, 'lead')
    assert.equal(maria.outcome, 'answered')
    assert.equal(maria.classification, 'answered')
    assert.deepEqual(maria.answeredBy, { kind: 'extension', extensionId: '9101', extension: '101', name: 'Yoletty' })
    assert.equal(maria.durationSeconds, 125)

    const carmen = byId(calls, '2026-10-30T16:00:00Z')
    assert.equal(carmen.name, 'Carmen Ejemplo', 'a billing client’s name wins over a lead’s and the caller ID')
    assert.equal(carmen.nameSource, 'client')
    assert.equal(carmen.followUp.kind, 'called_back')
    assert.equal(new Date(carmen.followUp.at).toISOString(), '2026-10-30T16:30:00.000Z')

    const vm = byId(calls, '2026-10-30T17:00:00Z')
    assert.equal(vm.outcome, 'voicemail')
    assert.equal(vm.classification, 'voicemail')
    assert.equal(vm.result, 'Voicemail', "RingCentral's own result is passed on unchanged")
    assert.deepEqual(vm.notAnsweredBy.map((p) => p.name), ['Yoletty'])
    assert.equal(vm.name, null, 'a city caller ID is not a name')
    assert.equal(vm.callerIdName, 'NEW ORLEANS LA')
    assert.equal(vm.callerLocation, 'New Orleans, LA')
    assert.equal(maria.callerLocation, null, 'WIRELESS CALLER is not a place')
    assert.equal(vm.followUp, null)

    const garcia = byId(calls, '2026-10-30T18:00:00Z')
    assert.equal(garcia.name, 'Rosa Garcia', 'the most recent of two leads sharing a number')
    assert.equal(garcia.lead.matches, 2)

    assert.equal(byId(calls, '2026-10-30T19:30:00Z').name, 'Luis Prueba', 'caller ID used when nothing else matches')
    assert.equal(byId(calls, '2026-10-30T19:00:00Z').number, null)

    // Read on evidence: c2 and c8 were offered to someone whose leg says No
    // Answer; c7's record says the caller hung up first; c4 has a voicemail
    // message; c5 says "Missed" but nothing documented backs it, so it is
    // not confirmed and never counted as missed. The withheld number (c7)
    // cannot be called back, so it is not 'not returned'; c2 was called back.
    assert.equal(byId(calls, '2026-10-30T18:00:00Z').classification, 'unknown')
    assert.deepEqual(byId(calls, '2026-10-30T18:00:00Z').systemOnly, ['the main line'], 'what the record does show: it reached the line, and no one was rung')
    assert.equal(byId(calls, '2026-10-30T15:00:00Z').systemOnly, null)
    assert.equal(byId(calls, '2026-10-30T19:00:00Z').classification, 'caller_hung_up')
    assert.deepEqual(r.json.counts, {
      incoming: 6, answered: 1, missed: 2, hung_up: 1, ended: 0, voicemail: 1, unconfirmed: 1, system: 0, outgoing: 1, not_returned: 2, excluded: 0, attention: 2, handled: 1,
    })
    assert.deepEqual(calls.map((c) => c.startedAt), [...calls.map((c) => c.startedAt)].sort().reverse(), 'newest first')
    // The page takes its vocabulary from here instead of keeping copies.
    assert.deepEqual(r.json.unansweredClasses, ['not_answered', 'caller_hung_up', 'ended_before_ringing', 'voicemail'])
    assert.ok(r.json.outcomeFilters.includes('unconfirmed') && r.json.outcomeFilters.includes('not_returned'))
  })

  await t.test('filters and search', async () => {
    assert.equal((await list('&outcome=missed')).json.calls.length, 2)
    assert.equal((await list('&outcome=not_returned')).json.calls.length, 2)
    assert.equal((await list('&outcome=unanswered')).json.calls.length, 4, 'not answered, hung up and voicemail; not the unconfirmed one')
    assert.equal((await list('&outcome=hung_up')).json.calls.length, 1)
    assert.equal((await list('&outcome=unconfirmed')).json.calls.length, 1)
    assert.equal((await list('&outcome=outgoing')).json.calls.length, 1)
    assert.equal((await list('&outcome=answered')).json.calls.length, 1)
    assert.equal((await list(`&q=${encodeURIComponent('carmen')}`)).json.calls.length, 2, 'her missed call and the callback')
    assert.equal((await list(`&q=${encodeURIComponent('555-0101')}`)).json.calls.length, 1)
    assert.equal((await list(`&q=${encodeURIComponent('+1 (504) 555-0177')}`)).json.calls.length, 1)
    assert.equal((await list(`&q=${encodeURIComponent('yoletty')}`)).json.calls.length, 3, 'search covers who answered (c1) and who a call was offered to (c2, c4)')
    assert.equal((await list(`&q=${encodeURIComponent('100%_')}`)).json.calls.length, 0, 'LIKE wildcards are literal')
    assert.equal((await call('GET', '/api/calls?from=2026-10-31&to=2026-10-30')).status, 400)
    assert.equal((await call('GET', '/api/calls?from=nope')).status, 400)
  })

  await t.test('refreshing again: overlapping window, no duplicates, updates applied; at most every 30 s', async () => {
    const before = (await db.query('SELECT COUNT(*)::int AS n FROM rc_calls')).rows[0].n
    const state = (await db.query('SELECT window_to FROM rc_call_sync_state')).rows[0]
    rc.records.find((r) => r.id === 'c1').duration = 300
    rc.requests = []
    const s = await sync()
    assert.equal(s.json.result.new, 0)
    assert.equal(new Date(rc.requests[0].query.dateFrom).getTime(), new Date(state.window_to).getTime() - 3 * 60 * 60 * 1000, 'starts 3 hours before the last run ended')
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM rc_calls')).rows[0].n, before)
    // The c1 call is older than the overlap, so its change is not re-read: widen the window to check updates.
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T12:00:00Z'`)
    await sync()
    assert.equal((await db.query(`SELECT duration_seconds FROM rc_calls WHERE rc_record_id = 'c1'`)).rows[0].duration_seconds, 300)
    rc.requests = []
    const quick = await call('POST', '/api/calls/sync')
    assert.equal(quick.json.result.status, 'skipped')
    assert.equal(rc.requests.length, 0)
  })

  await t.test('one call in detail: every step, what each reason means, who it was offered to', async () => {
    const vm = byId((await list()).json.calls, '2026-10-30T17:00:00Z')
    const ev = await call('GET', `/api/calls/${vm.id}/evidence`)
    assert.equal(ev.status, 200)
    assert.equal(ev.json.classification, 'voicemail')
    assert.deepEqual(ev.json.rcResults, ['Voicemail'])
    assert.equal(ev.json.records, 1)
    const legs = ev.json.steps.filter((x) => x.level === 'leg')
    assert.deepEqual(legs.map((x) => [x.legType, x.reason, x.to.kind, x.to.name ?? null]), [
      ['PstnToSip', null, 'line', 'Campos Muños Law'],
      ['Accept', 'No Answer', 'extension', 'Yoletty'],
      ['FindMe', 'Not Answered', 'external', null],
      ['Unknown', null, 'extension', 'Ciro'],
    ])
    assert.equal(legs[1].reasonMeaning, 'You did not answer the call', "RingCentral's documented meaning")
    assert.equal(legs[1].reasonDescription, 'Ring timeout')
    assert.equal(legs[2].to.numberEnd, '9876')
    // Ciro's box took the message; that does not show his phone was offered it.
    assert.deepEqual(ev.json.offeredTo.map((o) => [o.name, o.reason]), [['Yoletty', 'No Answer']])
    assert.ok(ev.json.facts.some((f) => f.code === 'voicemail_message'))
    assert.ok(!ev.text.includes('5559876'), 'a forwarded mobile number is never sent whole')
    assert.equal((await call('GET', '/api/calls/999999/evidence')).status, 404)
    assert.equal((await call('GET', `/api/calls/${vm.id}/evidence`, { cookie: users.para.cookie })).status, 403)
    const out = byId((await list()).json.calls, '2026-10-30T16:30:00Z')
    assert.equal((await call('GET', `/api/calls/${out.id}/evidence`)).json.classification, null, 'outgoing calls are not classified')
  })

  await t.test('by person: only calls a leg proves were offered to them, and what happened', async () => {
    const r = await list()
    assert.deepEqual(r.json.people.map((p) => [p.name, p.extension]), [['Ciro', '102'], ['Yoletty', '101']], 'people only, not the IVR menu')
    const y = await list('&person=9101')
    assert.deepEqual(y.json.calls.map((c) => new Date(c.startedAt).toISOString()).sort(),
      ['2026-10-30T15:00:00.000Z', '2026-10-30T16:00:00.000Z', '2026-10-30T17:00:00.000Z'])
    assert.equal(y.json.counts.person_answered, 1)
    assert.equal(y.json.counts.person_not_answered, 2)
    const c = await list('&person=9102')
    assert.deepEqual(c.json.calls.map((x) => new Date(x.startedAt).toISOString()), ['2026-10-30T19:30:00.000Z'], 'c4 went to his voicemail, not his phone')
    assert.equal(c.json.counts.person_not_answered, 1)
    assert.equal((await list('&person=nope')).json.calls.length, 7, 'an invalid id is ignored')
  })

  await t.test('a portal account linked to its extension: calls show the person’s portal name', async () => {
    // RingCentral can name an extension something else entirely ("Office CML").
    const ext = (await db.query(`SELECT name FROM rc_extensions WHERE id = '9101'`)).rows[0]
    assert.equal(ext.name, 'Yoletty')
    await db.query(`UPDATE rc_extensions SET name = 'Office CML' WHERE id = '9101'`)
    await db.query(`UPDATE admin_users SET display_name = 'Yoletty R.', rc_extension_id = '9101' WHERE email = 'desk@example.test'`)
    try {
      const l = await list()
      assert.equal(l.json.people.find((p) => p.extensionId === '9101').name, 'Yoletty R.')
      assert.equal(l.json.people.find((p) => p.extensionId === '9101').rcName, 'Office CML')
      const maria = byId(l.json.calls, '2026-10-30T15:00:00Z')
      assert.equal(maria.answeredBy.name, 'Yoletty R.')
      assert.equal(maria.answeredBy.rcName, 'Yoletty', 'RingCentral’s name as recorded on the call is kept beside it')
      const vm = byId(l.json.calls, '2026-10-30T17:00:00Z')
      const ev = await call('GET', `/api/calls/${vm.id}/evidence`)
      assert.equal(ev.json.offeredTo[0].name, 'Yoletty R.')
      assert.equal(ev.json.steps.find((x) => x.to.id === '9101').to.name, 'Yoletty R.')
      assert.equal((await list(`&q=${encodeURIComponent('Yoletty R')}`)).json.calls.length, 3, 'found by the portal name')
    } finally {
      await db.query(`UPDATE rc_extensions SET name = 'Yoletty' WHERE id = '9101'`)
      await db.query(`UPDATE admin_users SET display_name = NULL, rc_extension_id = NULL WHERE email = 'desk@example.test'`)
    }
  })

  await t.test('two records of one call count once, read together', async () => {
    rc.records.push(
      rec('d1', '2026-10-30T21:00:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550166' }, {
        telephonySessionId: 'ts-dup', sessionId: 's-dup',
        legs: [{ startTime: '2026-10-30T21:00:02Z', legType: 'Accept', reason: 'No Answer', to: { name: 'Yoletty', extensionNumber: '101', extensionId: '9101' } }],
      }),
      rec('d2', '2026-10-30T21:00:00Z', 'Inbound', 'Accepted', { phoneNumber: '+15045550166' }, {
        telephonySessionId: 'ts-dup', sessionId: 's-dup',
        legs: [{ startTime: '2026-10-30T21:00:09Z', legType: 'Accept', reason: 'Accepted', to: { name: 'Ciro', extensionNumber: '102', extensionId: '9102' } }],
      }),
    )
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T20:00:00Z'`)
    const before = (await list()).json.counts
    await sync()
    const l = await list()
    const dup = l.json.calls.filter((c) => new Date(c.startedAt).toISOString() === '2026-10-30T21:00:00.000Z')
    assert.equal(dup.length, 1, 'one row for the call')
    assert.equal(dup[0].classification, 'answered')
    assert.equal(dup[0].answeredBy.name, 'Ciro')
    assert.deepEqual(dup[0].notAnsweredBy, [], 'Ciro answered, so Yoletty is not charged with a miss')
    assert.equal(l.json.counts.incoming, before.incoming + 1)
    assert.equal(l.json.counts.missed, before.missed)
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM rc_calls WHERE call_key = 'ts-dup'`)).rows[0].n, 2, 'both records are kept')
    rc.records = rc.records.filter((r) => !['d1', 'd2'].includes(r.id))
    await db.query(`DELETE FROM rc_calls WHERE call_key = 'ts-dup'`)
  })

  await t.test('an incoming call whose session also holds an outgoing record still counts, read as incoming', async () => {
    rc.records.push(
      rec('m1', '2026-10-30T21:10:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550167' }, {
        telephonySessionId: 'ts-mixed', sessionId: 's-mixed',
        legs: [{ startTime: '2026-10-30T21:10:02Z', legType: 'Accept', reason: 'No Answer', to: { name: 'Yoletty', extensionNumber: '101', extensionId: '9101' } }],
      }),
      // A transfer out to a mobile, with more legs than the incoming record.
      rec('m2', '2026-10-30T21:10:00Z', 'Outbound', 'Call connected', { phoneNumber: '+15049998877' }, {
        telephonySessionId: 'ts-mixed', sessionId: 's-mixed',
        legs: [1, 2, 3].map((i) => ({ startTime: `2026-10-30T21:10:1${i}Z`, legType: 'SipToPstnMetered', reason: 'Accepted', to: { phoneNumber: '+15049998877' } })),
      }),
    )
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T20:00:00Z'`)
    const before = (await list()).json.counts
    await sync()
    const l = await list()
    const mixed = l.json.calls.filter((c) => new Date(c.startedAt).toISOString() === '2026-10-30T21:10:00.000Z')
    assert.equal(mixed.length, 1)
    assert.equal(mixed[0].direction, 'inbound')
    assert.equal(mixed[0].classification, 'not_answered')
    assert.equal(l.json.counts.missed, before.missed + 1)
    const ev = await call('GET', `/api/calls/${mixed[0].id}/evidence`)
    assert.ok(!ev.text.includes('9998877'), 'the transfer target is never sent whole')
    rc.records = rc.records.filter((r) => !['m1', 'm2'].includes(r.id))
    await db.query(`DELETE FROM rc_calls WHERE call_key = 'ts-mixed'`)
  })

  await t.test('"count it again" clears a mark made on another record of the same call', async () => {
    rc.records.push(rec('x1', '2026-10-30T21:20:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550168' }, {
      telephonySessionId: 'ts-x', sessionId: 's-x',
      legs: [{ startTime: '2026-10-30T21:20:02Z', legType: 'Accept', reason: 'No Answer', to: { name: 'Ciro', extensionNumber: '102', extensionId: '9102' } }],
    }))
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T20:00:00Z'`)
    await sync()
    const first = Number((await db.query(`SELECT id FROM rc_calls WHERE rc_record_id = 'x1'`)).rows[0].id)
    assert.equal((await send('POST', `/api/calls/${first}/exclusion`, { reason: 'spam' }, { cookie: users.desk.cookie })).status, 200)
    // A second record of the same call arrives, with more evidence, and becomes the call.
    rc.records.push(rec('x2', '2026-10-30T21:20:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550168' }, {
      telephonySessionId: 'ts-x', sessionId: 's-x',
      legs: [
        { startTime: '2026-10-30T21:20:02Z', legType: 'Accept', reason: 'No Answer', to: { name: 'Ciro', extensionNumber: '102', extensionId: '9102' } },
        { startTime: '2026-10-30T21:20:03Z', legType: 'Accept', reason: 'No Answer', to: { name: 'Yoletty', extensionNumber: '101', extensionId: '9101' } },
      ],
    }))
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T20:00:00Z'`)
    await sync()
    const shown = byId((await list()).json.calls, '2026-10-30T21:20:00Z')
    assert.notEqual(shown.id, first, 'the fuller record now stands for the call')
    assert.equal(shown.exclusion.reason, 'spam', 'the mark still applies')
    const back = await send('DELETE', `/api/calls/${shown.id}/exclusion`, undefined, { cookie: users.desk.cookie })
    assert.equal(back.json.removedCall, true)
    assert.equal(byId((await list()).json.calls, '2026-10-30T21:20:00Z').exclusion, null)
    rc.records = rc.records.filter((r) => !['x1', 'x2'].includes(r.id))
    await db.query(`DELETE FROM rc_calls WHERE call_key = 'ts-x'`)
  })

  await t.test('without the extension list nothing is confirmed as a person, and nothing is counted against anyone', async () => {
    rc.directoryForbidden = true
    await db.query(`DELETE FROM rc_extensions`)
    await db.query(`UPDATE rc_call_sync_state SET directory_refreshed_at = NULL`)
    const s = await sync()
    assert.equal(s.json.result.status, 'ok', 'the call import itself goes on')
    assert.equal(s.json.result.directory, 'error')
    assert.equal(s.json.sync.directoryErrorCode, 'missing_permission')
    const { classifyStored } = await import('./callLog.js')
    await classifyStored(db, { all: true })
    const l = await list()
    assert.equal(l.json.counts.answered, 0)
    assert.equal(l.json.counts.missed, 0)
    const maria = byId(l.json.calls, '2026-10-30T15:00:00Z')
    assert.equal(maria.classification, 'unknown')
    assert.ok(maria.gaps.includes('directory_unavailable'), 'and the call says why')
    assert.equal(byId(l.json.calls, '2026-10-30T19:00:00Z').classification, 'caller_hung_up', 'a hang-up needs no directory')
    rc.directoryForbidden = false
    await db.query(`UPDATE rc_call_sync_state SET directory_refreshed_at = NULL`)
    const back = await sync()
    assert.equal(back.json.result.directory, 'refreshed')
    assert.equal((await list()).json.counts.answered, 1, 'a changed directory re-reads every call')
  })

  await t.test('calls imported before their steps were kept are read again once, then the window is back to normal', async () => {
    await db.query(`UPDATE rc_calls SET legs = NULL`)
    await db.query(`UPDATE rc_call_sync_state SET legs_backfilled_at = NULL, window_to = $1`, [clock.t])
    rc.requests = []
    await sync()
    assert.equal(new Date(rc.requests[0].query.dateFrom).getTime(), clock.t.getTime() - 14 * 24 * 60 * 60 * 1000, 'the whole backfill period')
    assert.equal((await db.query(`SELECT jsonb_array_length(legs) AS n FROM rc_calls WHERE rc_record_id = 'c4'`)).rows[0].n, 4)
    clock.t = new Date(clock.t.getTime() + 60 * 1000)
    rc.requests = []
    const state = (await db.query('SELECT window_to, legs_backfilled_at FROM rc_call_sync_state')).rows[0]
    assert.ok(state.legs_backfilled_at)
    await sync()
    assert.equal(new Date(rc.requests[0].query.dateFrom).getTime(), new Date(state.window_to).getTime() - 3 * 60 * 60 * 1000, 'only once')
  })

  await t.test('re-reading named calls only (a live event) leaves other stale calls alone; the sweep, in batches, reads them all', async () => {
    const { classifyStored } = await import('./callLog.js')
    const { CLASSIFIER_VERSION } = await import('./callEvidence.js')
    const keys = ['ts-only-a', 'ts-only-b', 'ts-only-c', 'ts-only-d', 'ts-only-e']
    const raw = JSON.stringify({ type: 'Voice', direction: 'Inbound', result: 'Missed', legs: [] })
    // Two records of ts-only-c, so a batch boundary could split one call.
    await db.query(`INSERT INTO rc_calls (rc_record_id, telephony_session_id, direction, started_at, outcome, classification, classifier_version, scope, rc_raw)
      SELECT k || '-r' || n, k, 'inbound', '2026-10-29T15:00:00Z', 'missed', 'unknown', 1, CASE n WHEN 1 THEN 'account' ELSE 'extension' END, $2::jsonb
        FROM unnest($1::text[]) AS k, generate_series(1, 2) AS n WHERE n = 1 OR k = 'ts-only-c'`, [keys, raw])
    const versions = async () => Object.fromEntries((await db.query(
      `SELECT call_key, MIN(classifier_version) AS v, COUNT(*) FILTER (WHERE is_primary)::int AS primaries FROM rc_calls WHERE call_key = ANY($1) GROUP BY call_key`, [keys])).rows.map((r) => [r.call_key, [r.v, r.primaries]]))

    try {
      const r = await classifyStored(db, { keys: ['ts-only-a'], onlyKeys: true })
      assert.equal(r.calls, 1)
      const after = await versions()
      assert.deepEqual(after['ts-only-a'], [CLASSIFIER_VERSION, 1])
      for (const k of keys.slice(1)) assert.equal(after[k][0], 1, `${k} is still on the old rules`)

      assert.deepEqual(await classifyStored(db, { onlyKeys: true }), { calls: 0, rows: 0 }, 'no keys, nothing read')

      const sweep = await classifyStored(db, { batchSize: 2 })
      assert.equal(sweep.calls, 4)
      assert.equal(sweep.rows, 5)
      for (const [k, [v, primaries]] of Object.entries(await versions())) {
        assert.equal(v, CLASSIFIER_VERSION, k)
        assert.equal(primaries, 1, `${k} counts once`)
      }
    } finally {
      await db.query('DELETE FROM rc_calls WHERE call_key = ANY($1)', [keys])
    }
  })

  await t.test('a user without company access: falls back to their own calls and says so', async () => {
    rc.accountForbidden = true
    rc.requests = []
    const s = await sync()
    assert.equal(s.json.result.status, 'ok')
    assert.equal(s.json.result.scope, 'extension')
    assert.equal(s.json.sync.scope, 'extension')
    assert.deepEqual(rc.requests.map((r) => r.path), ['/restapi/v1.0/account/~/call-log', '/restapi/v1.0/account/~/extension/~/call-log'])
    rc.requests = []
    await sync()
    assert.deepEqual(rc.requests.map((r) => r.path), ['/restapi/v1.0/account/~/extension/~/call-log'], 'remembered for a day')
    // Rows already imported company-wide keep that scope.
    assert.equal((await db.query(`SELECT scope FROM rc_calls WHERE rc_record_id = 'c1'`)).rows[0].scope, 'account')
  })

  await t.test('no call log permission at all → missing_permission, nothing lost', async () => {
    rc.extensionForbidden = true
    const s = await sync()
    assert.equal(s.json.result.code, 'missing_permission')
    assert.equal((await list()).json.calls.length, 7, 'imported calls stay visible')
    rc.extensionForbidden = false
    rc.accountForbidden = false
    await db.query(`UPDATE rc_call_sync_state SET scope = 'account'`)
  })

  await t.test('rate limited: the run stops, the window does not move, the next run catches up', async () => {
    const before = (await db.query('SELECT window_to FROM rc_call_sync_state')).rows[0].window_to
    rc.rateLimitOnce = true
    const s = await sync()
    assert.equal(s.json.result.code, 'rate_limited')
    assert.equal((await db.query('SELECT window_to FROM rc_call_sync_state')).rows[0].window_to.getTime(), before.getTime())
    assert.equal((await sync()).json.result.status, 'ok')
  })

  await t.test('a token RingCentral stops accepting is refreshed once and the import continues', async () => {
    rc.unauthorizedOnce = true
    const issued = rc.issued
    const s = await sync()
    assert.equal(s.json.result.status, 'ok')
    assert.equal(rc.issued, issued + 1, 'one forced refresh')
  })

  await t.test('one import at a time', async () => {
    const { syncCallLog } = await import('./callLog.js')
    const { loadRingCentralConfig } = await import('./config.js')
    const cfg = loadRingCentralConfig(env)
    const opts = { trigger: 'scheduled', deps: { fetchImpl: fakeFetch, now: () => clock.t }, sleep: async () => {}, pageDelayMs: 0 }
    // Hold the first import inside RingCentral (so it holds the lock) until
    // the second has tried; no timing assumptions.
    let release
    rc.gate = new Promise((r) => { release = r })
    const inFlight = new Promise((r) => { rc.onRequest = r })
    const first = syncCallLog(db, cfg, opts)
    await inFlight
    const second = await syncCallLog(db, cfg, opts)
    rc.onRequest = null
    rc.gate = null
    release()
    assert.equal(second.status, 'busy')
    assert.equal((await first).status, 'ok')
  })

  await t.test('dashboard summary: unanswered calls in business hours (Mon–Fri 9–5 New Orleans), last 30 days', async () => {
    // Friday 6:30 pm and Saturday 10 am in New Orleans: outside business hours.
    await db.query(`INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key) VALUES
      ('after-hours', 'inbound', '2026-10-30T23:30:00Z', 'missed', 'not_answered', 1, 'account', '+15045550155', '5045550155'),
      ('weekend', 'inbound', '2026-10-31T15:00:00Z', 'voicemail', 'voicemail', 1, 'account', '+15045550156', '5045550156'),
      ('too-old', 'inbound', '2026-09-15T15:00:00Z', 'missed', 'not_answered', 1, 'account', '+15045550157', '5045550157')`)
    const s = await call('GET', '/api/calls/summary')
    assert.equal(s.status, 200)
    // c2 (returned), c4 voicemail, c7 (hung up, withheld), c8, all on a
    // Friday; c5 is not confirmed, so it is counted apart, never as missed.
    assert.equal(s.json.missed.total, 4)
    assert.equal(s.json.missed.voicemail, 1)
    assert.equal(s.json.missed.notReturned, 2, 'c4 and c8; c2 was called back and c7 has no number')
    assert.equal(s.json.missed.unconfirmed, 1)
    assert.equal(s.json.missed.businessHours.timeZone, 'America/Chicago')
    assert.equal(s.json.connection, 'connected')
    // The Calls page shows the same set when opened from the dashboard card.
    const listed = await call('GET', `/api/calls?from=${encodeURIComponent('2026-10-01T00:00:00Z')}&to=${encodeURIComponent('2026-11-01T00:00:00Z')}&outcome=unanswered&businessHours=1`)
    assert.equal(listed.json.calls.length, 4)
    assert.equal((await call('GET', '/api/calls/summary', { cookie: users.para.cookie })).status, 403)
    assert.equal((await call('GET', `/api/calls/summary?from=${encodeURIComponent('2026-10-30T20:00:00Z')}`)).json.missed.total, 0, 'a later start leaves them out')
    assert.equal((await call('GET', '/api/calls/summary?from=2020-01-01')).status, 400, 'at most about a month')
  })

  await t.test('missed calls that need no callback: marked by call or by number, out of every missed count, undoable', async () => {
    const idOf = async (rid) => Number((await db.query('SELECT id FROM rc_calls WHERE rc_record_id = $1', [rid])).rows[0].id)
    const mark = (rid, body, who = users.desk) => idOf(rid).then((id) => send('POST', `/api/calls/${id}/exclusion`, body, { cookie: who.cookie }))
    const unmark = (rid, who = users.desk) => idOf(rid).then((id) => send('DELETE', `/api/calls/${id}/exclusion`, undefined, { cookie: who.cookie }))
    const summary = async () => (await call('GET', '/api/calls/summary')).json.missed
    const base = (await list()).json.counts
    const baseSummary = await summary()
    assert.equal(base.excluded, 0)

    // c8: a machine reading out a verification code. This call only.
    const r = await mark('c8', { reason: 'verification', scope: 'call' })
    assert.equal(r.status, 200)
    let l = await list()
    assert.deepEqual(l.json.counts, { ...base, missed: base.missed - 1, not_returned: base.not_returned - 1, excluded: 1, attention: base.attention - 1 })
    const c8 = byId(l.json.calls, '2026-10-30T19:30:00Z')
    assert.equal(c8.exclusion.scope, 'call')
    assert.equal(c8.exclusion.reason, 'verification')
    assert.equal(c8.exclusion.by, 'desk@example.test')
    assert.equal(c8.outcome, 'missed', 'still shown as what it was')
    const ids = async (o) => (await list(`&outcome=${o}`)).json.calls.map((c) => c.id)
    assert.ok(!(await ids('missed')).includes(c8.id))
    assert.ok(!(await ids('not_returned')).includes(c8.id))
    assert.ok(!(await ids('unanswered')).includes(c8.id))
    assert.deepEqual(await ids('excluded'), [c8.id])
    assert.deepEqual(await summary(), { ...baseSummary, total: baseSummary.total - 1, notReturned: baseSummary.notReturned - 1 })

    // c4: someone from the firm testing the line from their mobile. Every call
    // from that number, including one that comes in later.
    assert.equal((await mark('c4', { reason: 'staff_test', scope: 'number', note: '  Ana testing the line  ' }, users.owner)).status, 200)
    await db.query(`INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key)
      VALUES ('later-test', 'inbound', '2026-10-30T20:15:00Z', 'missed', 'not_answered', 1, 'account', '+15045550177', '5045550177')`)
    l = await list()
    assert.deepEqual(l.json.counts, { ...base, incoming: base.incoming + 1, voicemail: base.voicemail - 1, missed: base.missed - 1, not_returned: base.not_returned - 2, excluded: 3, attention: base.attention - 2 })
    const later = byId(l.json.calls, '2026-10-30T20:15:00Z')
    assert.deepEqual({ ...later.exclusion, at: undefined }, { scope: 'number', reason: 'staff_test', note: 'Ana testing the line', by: 'owner@example.test', at: undefined })
    assert.equal(byId(l.json.calls, '2026-10-30T15:00:00Z').exclusion, null, 'an answered call is never shown as excluded')

    // Marking again replaces the reason; still one mark.
    assert.equal((await mark('c8', { reason: 'spam' })).status, 200)
    assert.equal(byId((await list()).json.calls, '2026-10-30T19:30:00Z').exclusion.reason, 'spam')
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM rc_call_exclusions')).rows[0].n, 1)

    // What cannot be marked.
    assert.equal((await mark('c8', { reason: 'nope' })).json.code, 'invalid_reason')
    assert.equal((await mark('c8', { reason: 'other', note: '   ' })).json.code, 'note_required')
    assert.equal((await mark('c8', { reason: 'spam', scope: 'everyone' })).json.code, 'invalid_scope')
    const answered = await mark('c1', { reason: 'spam' })
    assert.equal(answered.status, 409)
    assert.equal(answered.json.code, 'not_unanswered')
    assert.equal((await mark('c3', { reason: 'spam' })).status, 409, 'an outgoing call')
    const withheld = await mark('c7', { reason: 'spam', scope: 'number' })
    assert.equal(withheld.status, 409)
    assert.equal(withheld.json.code, 'no_number')
    assert.equal((await send('POST', '/api/calls/999999/exclusion', { reason: 'spam' }, { cookie: users.desk.cookie })).status, 404)

    // Who may mark: calls.exclude. Seeing calls is not enough.
    assert.equal((await mark('c5', { reason: 'spam' }, users.para)).status, 403)
    const viewer = (await db.query(
      `INSERT INTO admin_users (email, password_hash, role, capability_revokes) VALUES ('viewer@example.test', 'x', 'front_desk', '{calls.exclude}') RETURNING id, token_version`
    )).rows[0]
    const viewerCookie = `token=${jwt.sign({ id: viewer.id, email: 'x', tv: viewer.token_version }, process.env.JWT_SECRET)}`
    assert.equal((await list('', { cookie: viewerCookie })).status, 200)
    assert.equal((await mark('c5', { reason: 'spam' }, { cookie: viewerCookie })).status, 403)
    assert.equal((await unmark('c8', { cookie: viewerCookie })).status, 403)
    assert.equal((await send('POST', `/api/calls/${await idOf('c5')}/exclusion`, { reason: 'spam' }, { cookie: '' })).status, 401)

    // Count them again: the number rule goes with it, the later call counts again.
    const back = await unmark('later-test')
    assert.deepEqual(back.json, { callId: await idOf('later-test'), removedCall: false, removedNumber: true })
    assert.equal((await unmark('c8')).json.removedCall, true)
    await db.query(`DELETE FROM rc_calls WHERE rc_record_id = 'later-test'`)
    assert.deepEqual((await list()).json.counts, base)
    assert.deepEqual(await summary(), baseSummary)
  })

  await t.test('a number marked as someone from the firm is not a website lead, on any call from it', async () => {
    const idOf = async (rid) => Number((await db.query('SELECT id FROM rc_calls WHERE rc_record_id = $1', [rid])).rows[0].id)
    const mark = (rid, body) => idOf(rid).then((id) => send('POST', `/api/calls/${id}/exclusion`, body, { cookie: users.desk.cookie }))
    const unmark = (rid) => idOf(rid).then((id) => send('DELETE', `/api/calls/${id}/exclusion`, undefined, { cookie: users.desk.cookie }))
    // A colleague's mobile that is also on two contact-form messages (c5).
    await db.query(`INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, scope, counterpart_number, counterpart_key)
      VALUES ('firm-answered', 'inbound', '2026-10-30T20:30:00Z', 'answered', 'account', '+15045550199', '5045550199')`)
    const garcia = async () => {
      const l = (await list()).json.calls
      return [byId(l, '2026-10-30T18:00:00Z'), byId(l, '2026-10-30T20:30:00Z')]
    }
    for (const c of await garcia()) {
      assert.equal(c.fromFirm, false)
      assert.equal(c.lead.matches, 2)
    }

    // Spam for the number: still the website lead it was.
    assert.equal((await mark('c5', { reason: 'spam', scope: 'number' })).status, 200)
    for (const c of await garcia()) assert.equal(c.lead.matches, 2, 'only "someone from the firm" says who the caller is')

    assert.equal((await mark('c5', { reason: 'staff_test', scope: 'number' })).status, 200)
    for (const c of await garcia()) {
      assert.equal(c.fromFirm, true, 'the answered call too, which was never marked itself')
      assert.equal(c.lead, null)
      assert.equal(c.name, 'Rosa Garcia', 'the name stays')
    }
    assert.equal(byId((await list()).json.calls, '2026-10-30T15:00:00Z').lead.name, 'Maria Lopez', 'other numbers are untouched')

    // Marking one call alone says nothing about the number.
    await unmark('c5')
    assert.equal((await mark('c5', { reason: 'staff_test', scope: 'call' })).status, 200)
    for (const c of await garcia()) assert.equal(c.fromFirm, false)

    await unmark('c5')
    await db.query(`DELETE FROM rc_calls WHERE rc_record_id = 'firm-answered'`)
  })

  await t.test('calls older than the retention period are deleted', async () => {
    await db.query(`INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, scope) VALUES ('ancient', 'inbound', '2025-01-01T00:00:00Z', 'missed', 'account')`)
    await sync()
    assert.equal((await db.query(`SELECT 1 FROM rc_calls WHERE rc_record_id = 'ancient'`)).rowCount, 0)
  })

  await t.test('live call events: register, handshake, only our deliveries, and the evidence shows on the call', async () => {
    const crypto = await import('crypto')
    const hook = async (headers, body) => {
      const r = await fetch(base + '/webhooks/ringcentral', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) })
      return { status: r.status, headers: r.headers, text: await r.text() }
    }
    // RingCentral's address check: the token echoed, a 200, JSON, nothing in the body.
    const v = await hook({ 'Validation-Token': 'abc-123' })
    assert.equal(v.status, 200)
    assert.equal(v.headers.get('validation-token'), 'abc-123')
    assert.match(v.headers.get('content-type'), /application\/json/)
    assert.equal(v.text, '')
    // Nothing registered yet: no delivery is accepted.
    assert.equal((await hook({ 'Verification-Token': 'guess' }, { uuid: 'u0', body: {} })).status, 401)

    // Only an administrator registers.
    assert.equal((await send('POST', '/api/integrations/ringcentral/events', {}, { cookie: users.desk.cookie })).status, 403)
    // RingCentral validates the address while the subscription is created.
    rc.validate = async (address) => {
      assert.equal(address, 'https://api.camulaw.com/webhooks/ringcentral')
      return (await hook({ 'Validation-Token': 'tok-1' })).headers.get('validation-token') === 'tok-1'
    }
    const reg = await send('POST', '/api/integrations/ringcentral/events', {})
    assert.equal(reg.status, 200, reg.text)
    assert.equal(reg.json.registered, true)
    assert.equal(reg.json.status, 'Active')
    assert.equal(reg.json.address, 'https://api.camulaw.com/webhooks/ringcentral')
    const asked = rc.subscriptionRequests.at(-1).body
    assert.deepEqual(asked.eventFilters, ['/restapi/v1.0/account/~/telephony/sessions'])
    assert.equal(asked.deliveryMode.transportType, 'WebHook')
    assert.equal(asked.expiresIn, 315360000)
    const token = asked.deliveryMode.verificationToken
    assert.ok(token.length >= 24)
    assert.ok(!reg.text.includes(token), 'the token never comes back to the portal')
    const stored = (await db.query(`SELECT token_digest, subscription_id FROM rc_event_subscription`)).rows[0]
    assert.equal(stored.token_digest, crypto.createHash('sha256').update(token).digest('hex'), 'only its digest is kept')

    // An after-hours call that got only the greeting, and its live events.
    const tsid = 'ts-greeting'
    const party = (id, extensionId, direction, code, seq, sec, extra = {}) => ({
      uuid: `n-${id}-${seq}`, event: '/restapi/v1.0/account/1/telephony/sessions', subscriptionId: stored.subscription_id,
      body: { sequence: seq, telephonySessionId: tsid, sessionId: 's-greeting', eventTime: new Date(Date.parse('2026-10-30T22:30:00Z') + sec * 1000).toISOString(),
        parties: [{ id, extensionId, direction, status: { code }, to: { phoneNumber: '+15049106508', name: 'Campos Muños Law' }, from: { phoneNumber: '+15045550170' }, ...extra }] },
    })
    const deliveries = [
      party('p-co', null, 'Outbound', 'Setup', 1, 0), party('p-co', null, 'Outbound', 'Answered', 2, 0),
      party('p-ivr', '9001', 'Inbound', 'Answered', 3, 1), party('p-ivr', '9001', 'Inbound', 'Disconnected', 4, 6), party('p-co', null, 'Outbound', 'Disconnected', 5, 6),
    ]
    assert.equal((await hook({ 'Verification-Token': 'wrong' }, deliveries[0])).status, 401)
    assert.equal((await hook({ 'Verification-Token': token }, { ...deliveries[0], subscriptionId: 'someone-else' })).status, 401)
    for (const d of deliveries) assert.equal((await hook({ 'Verification-Token': token }, d)).status, 200)
    assert.equal((await hook({ 'Verification-Token': token }, deliveries[0])).status, 200, 'a repeat delivery is accepted')
    assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM rc_telephony_events WHERE telephony_session_id = $1`, [tsid])).rows[0].n, 5, 'and stored once')

    rc.records.push(rec('g1', '2026-10-30T22:30:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550170' }, {
      telephonySessionId: tsid, sessionId: 's-greeting', duration: 6,
      legs: [{ startTime: '2026-10-30T22:30:00Z', legType: 'Accept', result: 'Missed', master: true, to: firm }],
    }))
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T20:00:00Z'`)
    await sync()
    const l = await list()
    const g = byId(l.json.calls, '2026-10-30T22:30:00Z')
    assert.equal(g.classification, 'ended_before_ringing')
    assert.equal(l.json.counts.ended, 1)
    const ev = await call('GET', `/api/calls/${g.id}/evidence`)
    assert.equal(ev.json.live.events, 5)
    assert.equal(ev.json.live.complete, true)
    assert.deepEqual(ev.json.live.parties.map((p) => p.states.map((x) => x.code)), [['Setup', 'Answered', 'Disconnected'], ['Answered', 'Disconnected']])
    assert.ok(!ev.text.includes('5550170'), 'no caller number in the live timeline')

    // A hang-up imported first; its live events arrive later and the call is read again.
    const t2 = 'ts-late'
    rc.records.push(rec('h1', '2026-10-30T22:40:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550171' }, { telephonySessionId: t2, sessionId: 's-late', reason: 'Hang Up', duration: 3 }))
    await db.query(`UPDATE rc_call_sync_state SET window_to = '2026-10-30T20:00:00Z'`)
    await sync()
    const before = byId((await list()).json.calls, '2026-10-30T22:40:00Z')
    assert.equal(before.classification, 'caller_hung_up')
    assert.equal(before.stage, null)
    // Another call left on older rules: a live event about t2 must not read it.
    await db.query(`UPDATE rc_calls SET classifier_version = 1 WHERE call_key = 'ts-greeting'`)
    for (const [i, code] of ['Setup', 'Disconnected'].entries()) {
      const d = party('p-q', '9001', 'Inbound', code, i + 1, i * 3)
      d.uuid = `late-${i}`; d.body.telephonySessionId = t2
      assert.equal((await hook({ 'Verification-Token': token }, d)).status, 200)
    }
    let after
    for (let i = 0; i < 40 && after?.stage !== 'before_ringing'; i++) {
      await new Promise((r) => setTimeout(r, 25))
      after = byId((await list()).json.calls, '2026-10-30T22:40:00Z')
    }
    assert.equal(after.stage, 'before_ringing', 'read again when its events arrived')
    assert.deepEqual((await db.query(`SELECT DISTINCT classifier_version AS v FROM rc_calls WHERE call_key = 'ts-greeting'`)).rows, [{ v: 1 }], 'only the call the event was about')

    // Daily check: renewed a month before it would expire.
    rc.subscriptions.get(stored.subscription_id).expirationTime = new Date(clock.t.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const chk = await send('POST', '/api/integrations/ringcentral/events/check', {})
    assert.equal(chk.status, 200)
    assert.ok(rc.subscriptionRequests.some((r) => r.renew), 'renewed')
    assert.ok(new Date(chk.json.expiresAt) > new Date(clock.t.getTime() + 365 * 24 * 60 * 60 * 1000))

    // Removed: deleted in RingCentral, and deliveries are refused again.
    const rm = await send('DELETE', '/api/integrations/ringcentral/events', undefined)
    assert.equal(rm.status, 200)
    assert.equal(rm.json.registered, false)
    assert.equal(rc.subscriptions.size, 0)
    assert.equal((await hook({ 'Verification-Token': token }, deliveries[0])).status, 401)

    // Without the Call Control permission, the administrator is told what to fix.
    rc.subscriptionForbidden = true
    const denied = await send('POST', '/api/integrations/ringcentral/events', {})
    rc.subscriptionForbidden = false
    assert.equal(denied.status, 409)
    assert.equal(denied.json.code, 'missing_permission')
    assert.match(denied.json.error, /Call Control/)
    assert.equal((await call('GET', '/api/integrations/ringcentral/events')).json.registered, false)

    rc.validate = null
    rc.records = rc.records.filter((r) => !['g1', 'h1'].includes(r.id))
    await db.query(`DELETE FROM rc_calls WHERE call_key IN ('ts-greeting', 'ts-late')`)
  })

  await t.test('needs attention: open calls nobody has dealt with, grouped; handled and reopened; counters', async () => {
    const att = async () => (await list('&outcome=attention&kpis=1')).json
    let a = await att()
    // c4 voicemail and c8 not answered, both with numbers. Not c2 (called back
    // and connected), c5 (not confirmed), c7 (withheld number), c1 (answered).
    assert.deepEqual(a.calls.map((c) => new Date(c.startedAt).toISOString()).sort(),
      ['2026-10-30T17:00:00.000Z', '2026-10-30T19:30:00.000Z'])
    assert.ok(a.calls.every((c) => c.needsAttention))
    assert.equal(a.counts.attention, 2)
    // The test clock is the next day: both are waiting since before today.
    assert.deepEqual([...new Set(a.calls.map((c) => c.attentionGroup))], ['waiting'])
    assert.equal(a.kpis.needsAttention, 2)
    assert.equal(byId((await list()).json.calls, '2026-10-30T16:00:00Z').connectedFollowUp.kind, 'called_back')

    // A callback attempt that did not connect keeps the call open ("try again").
    await db.query(`INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key)
      VALUES ('try-1', 'outbound', '2026-10-30T19:45:00Z', 'no_answer', NULL, 1, 'account', '+15045550188', '5045550188')`)
    a = await att()
    const c8 = a.calls.find((c) => new Date(c.startedAt).toISOString() === '2026-10-30T19:30:00.000Z')
    assert.ok(c8, 'still needs attention')
    assert.equal(new Date(c8.attemptAt).toISOString(), '2026-10-30T19:45:00.000Z')

    // Marked handled: it leaves Needs attention, keeps its classification, and counts as handled today.
    const stampBefore = (await call('GET', '/api/calls/changes')).json.stamp
    assert.equal((await send('POST', `/api/calls/${c8.id}/handled`, { note: 'Called from my mobile' }, { cookie: users.para.cookie })).status, 403)
    const h = await send('POST', `/api/calls/${c8.id}/handled`, { note: '  Called from my mobile ' }, { cookie: users.desk.cookie })
    assert.equal(h.status, 200, h.text)
    a = await att()
    assert.equal(a.calls.length, 1)
    assert.equal(a.kpis.needsAttention, 1)
    assert.equal(a.kpis.handledToday, 1)
    const all = byId((await list()).json.calls, '2026-10-30T19:30:00Z')
    assert.equal(all.classification, 'not_answered', 'the classification is untouched')
    assert.deepEqual(all.notAnsweredBy.map((p) => p.name), ['Ciro'], 'and so is who it is attributed to')
    assert.equal(all.handled.note, 'Called from my mobile')
    assert.equal(all.handled.by, 'desk')
    assert.notEqual((await call('GET', '/api/calls/changes')).json.stamp, stampBefore, 'the change check moves')
    // Handled lists what was dealt with: c8 marked handled, and c2 closed by a connected callback.
    const dealt = async () => (await list('&outcome=handled')).json
    const times = (r) => r.calls.map((c) => new Date(c.startedAt).toISOString()).sort()
    let d = await dealt()
    assert.deepEqual(times(d), ['2026-10-30T16:00:00.000Z', '2026-10-30T19:30:00.000Z'])
    assert.equal(d.counts.handled, 2)
    // An answered call cannot be marked handled.
    const answered = byId((await list()).json.calls, '2026-10-30T15:00:00Z')
    assert.equal((await send('POST', `/api/calls/${answered.id}/handled`, {}, { cookie: users.desk.cookie })).status, 409)

    // Reopened: back in Needs attention.
    assert.equal((await send('DELETE', `/api/calls/${c8.id}/handled`, undefined, { cookie: users.desk.cookie })).json.removed, true)
    assert.equal((await att()).calls.length, 2)
    d = await dealt()
    assert.deepEqual(times(d), ['2026-10-30T16:00:00.000Z'], 'a reopened call leaves Handled')
    // Marked as needing no callback: not counted as handled, even though it was called back.
    const c2 = d.calls[0].id
    assert.equal((await send('POST', `/api/calls/${c2}/exclusion`, { reason: 'spam' }, { cookie: users.desk.cookie })).status, 200)
    assert.deepEqual(times(await dealt()), [])
    assert.equal((await send('DELETE', `/api/calls/${c2}/exclusion`, undefined, { cookie: users.desk.cookie })).status, 200)
    await db.query(`DELETE FROM rc_calls WHERE rc_record_id = 'try-1'`)

    // Marked handled is dealt with: no longer counted, listed or shown on
    // Home as not called back; reopened, it is again.
    const c4 = (await att()).calls.find((c) => new Date(c.startedAt).toISOString() === '2026-10-30T17:00:00.000Z')
    const notReturned = async () => ({
      count: (await list()).json.counts.not_returned,
      listed: (await list('&outcome=not_returned')).json.calls.some((c) => c.id === c4.id),
      home: (await call('GET', `/api/calls/summary?from=${encodeURIComponent('2026-10-30T00:00:00Z')}`)).json.missed.notReturned,
    })
    const nrBefore = await notReturned()
    assert.equal(nrBefore.listed, true, 'open and not called back')
    assert.equal((await send('POST', `/api/calls/${c4.id}/handled`, {}, { cookie: users.desk.cookie })).status, 200)
    assert.deepEqual(await notReturned(), { count: nrBefore.count - 1, listed: false, home: nrBefore.home - 1 })
    assert.equal((await send('DELETE', `/api/calls/${c4.id}/handled`, undefined, { cookie: users.desk.cookie })).status, 200)
    assert.deepEqual(await notReturned(), nrBefore)
  })

  await t.test('clear the list: administrators only; every open call handled in one batch; not counted as handled today; undone as one', async () => {
    const att = async () => (await list('&outcome=attention&kpis=1')).json
    const before = await att()
    assert.equal(before.calls.length, 2)
    const handledToday = before.kpis.handledToday
    const missedBefore = (await list()).json.counts.missed
    const desk = { cookie: users.desk.cookie }
    // The front desk may mark one call handled, not clear the list.
    assert.equal((await call('GET', '/api/calls/handled/bulk', desk)).status, 403)
    assert.equal((await send('POST', '/api/calls/handled/bulk', { note: 'x' }, desk)).status, 403)
    // A reason is required.
    assert.equal((await send('POST', '/api/calls/handled/bulk', { note: '  ' })).status, 400)
    // A cutoff before both calls clears nothing; the preview says so.
    assert.equal((await call('GET', `/api/calls/handled/bulk?before=${encodeURIComponent('2026-10-30T16:59:00Z')}`)).json.count, 0)
    // Only calls received before the cutoff: c4 (17:00) but not c8 (19:30).
    assert.equal((await call('GET', `/api/calls/handled/bulk?before=${encodeURIComponent('2026-10-30T18:00:00Z')}`)).json.count, 1)
    assert.equal((await call('GET', '/api/calls/handled/bulk')).json.count, 2)

    // c4 dealt with on its own first: the clear takes only c8, and undoing
    // the clear leaves c4's own mark alone.
    const c4 = before.calls.find((c) => new Date(c.startedAt).toISOString() === '2026-10-30T17:00:00.000Z')
    assert.equal((await send('POST', `/api/calls/${c4.id}/handled`, { note: 'Called back from my mobile' }, desk)).status, 200)
    const handledBefore = (await att()).kpis.handledToday
    assert.equal(handledBefore, handledToday + 1)

    const out = await send('POST', '/api/calls/handled/bulk', { note: 'Missed before voicemail routing was set up' })
    assert.equal(out.status, 200, out.text)
    assert.equal(out.json.cleared, 1)
    let a = await att()
    assert.equal(a.calls.length, 0)
    assert.equal(a.kpis.needsAttention, 0)
    assert.equal(a.kpis.handledToday, handledBefore, 'a bulk clear is not handled today')
    const cleared = (await list('&outcome=handled')).json.calls.filter((c) => c.handled?.bulk)
    assert.equal(cleared.length, 1)
    assert.equal(cleared[0].handled.note, 'Missed before voicemail routing was set up')
    const c8 = byId((await list()).json.calls, '2026-10-30T19:30:00Z')
    assert.equal(c8.classification, 'not_answered', 'the classification is untouched')
    assert.deepEqual(c8.notAnsweredBy.map((p) => p.name), ['Ciro'], 'and so is who it is attributed to')
    assert.equal((await list()).json.counts.missed, missedBefore, 'the missed counts are untouched')

    // Undone as one: c8 is open again; c4 stays handled by its own mark.
    assert.equal((await send('DELETE', `/api/calls/handled/bulk/${out.json.batch}`, undefined, desk)).status, 403)
    assert.equal((await send('DELETE', `/api/calls/handled/bulk/${out.json.batch}`)).json.removed, 1)
    a = await att()
    assert.deepEqual(a.calls.map((c) => new Date(c.startedAt).toISOString()), ['2026-10-30T19:30:00.000Z'])
    assert.equal((await send('DELETE', `/api/calls/${c4.id}/handled`, undefined, desk)).json.removed, true)
    assert.equal((await att()).calls.length, 2)
  })

  await t.test('RingOut: who may call, saving "ring me at", refusing numbers that must never be dialled', async () => {
    assert.equal((await call('GET', '/api/calls/ringout/me', { cookie: users.para.cookie })).status, 403)
    assert.equal((await call('POST', '/api/calls/ringout', { cookie: users.para.cookie })).status, 403)
    const desk = { cookie: users.desk.cookie }
    const none = await call('GET', '/api/calls/ringout/me', desk)
    assert.equal(none.json.phone, null)
    assert.equal(none.json.connection, 'connected')
    const noPhone = await send('POST', '/api/calls/ringout', { to: '(504) 555-0101' }, desk)
    assert.equal(noPhone.status, 409)
    assert.equal(noPhone.json.code, 'no_phone')
    assert.equal((await send('PUT', '/api/calls/ringout/me', { phone: '911' }, desk)).status, 400)
    const saved = await send('PUT', '/api/calls/ringout/me', { phone: '(504) 555-0100' }, desk)
    assert.equal(saved.json.phone, '+15045550100')
    for (const bad of ['911', '1-900-555-0199', '555-0101', '(504) 555-0100']) {
      const r = await send('POST', '/api/calls/ringout', { to: bad }, desk)
      assert.equal(r.status, 400, bad)
    }
    assert.equal(rc.ringoutRequests.length, 0, 'nothing refused reached RingCentral')
  })

  await t.test('RingOut: rings my phone, then the client; progress; only my own calls; cancel', async () => {
    const desk = { cookie: users.desk.cookie }
    const placed = await send('POST', '/api/calls/ringout', { to: '(504) 555-0101' }, desk)
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.json.phase, 'ringing_you')
    assert.equal(placed.json.to, '+15045550101')
    const sent = rc.ringoutRequests.at(-1)
    assert.deepEqual(sent.body, { from: { phoneNumber: '+15045550100' }, to: { phoneNumber: '+15045550101' }, playPrompt: false })
    const id = placed.json.id
    const status = () => call('GET', `/api/calls/ringout/${id}`, desk)
    const rcId = [...rc.ringouts.keys()].at(-1)
    rc.ringouts.set(rcId, { callStatus: 'InProgress', callerStatus: 'Success', calleeStatus: 'InProgress' })
    assert.equal((await status()).json.phase, 'calling_client')
    rc.ringouts.set(rcId, { callStatus: 'Success', callerStatus: 'Success', calleeStatus: 'Success' })
    assert.equal((await status()).json.phase, 'connected')
    rc.ringouts.delete(rcId) // RingCentral forgets it after the call
    assert.equal((await status()).json.phase, 'finished')
    assert.equal((await call('GET', `/api/calls/ringout/${id}`)).status, 404, "another person cannot follow someone else's call")

    const second = await send('POST', '/api/calls/ringout', { to: '+1 504 555 0123' }, desk)
    const cancelled = await send('DELETE', `/api/calls/ringout/${second.json.id}`, undefined, desk)
    assert.equal(cancelled.json.phase, 'cancelled')
    assert.equal(rc.ringoutRequests.at(-1).method, 'DELETE')

    const third = await send('POST', '/api/calls/ringout', { to: '(504) 555-0177' }, desk)
    rc.ringouts.set([...rc.ringouts.keys()].at(-1), { callStatus: 'InProgress', callerStatus: 'Success', calleeStatus: 'Busy' })
    assert.deepEqual((await call('GET', `/api/calls/ringout/${third.json.id}`, desk)).json, { id: third.json.id, to: '+15045550177', phase: 'failed', who: 'client', reason: 'Busy' })

    const audits = JSON.stringify((await db.query("SELECT action, details FROM billing_audit_events WHERE entity_type = 'ringout'")).rows)
    assert.match(audits, /calls\.ringout_placed/)
    assert.ok(!audits.includes('5045550101'), 'the audit trail keeps only the last 4 digits')
  })

  await t.test('RingOut: without the RingOut permission the person is told what to fix', async () => {
    rc.ringoutForbidden = true
    const r = await send('POST', '/api/calls/ringout', { to: '(504) 555-0101' }, { cookie: users.desk.cookie })
    rc.ringoutForbidden = false
    assert.equal(r.status, 409)
    assert.equal(r.json.code, 'missing_permission')
    assert.match(r.json.error, /RingOut permission/)
  })
})
