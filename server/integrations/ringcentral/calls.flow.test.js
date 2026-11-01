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
  accountForbidden: false, extensionForbidden: false, rateLimitOnce: false, unauthorizedOnce: false, delayMs: 0,
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
  rc.requests.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), auth: init.headers.Authorization })
  if (rc.delayMs) await new Promise((r) => setTimeout(r, rc.delayMs))
  if (!/^Bearer AT-\d+$/.test(init.headers.Authorization)) return reply(401, { errorCode: 'OAU-149' })
  if (rc.unauthorizedOnce) { rc.unauthorizedOnce = false; return reply(401, { errorCode: 'OAU-149', message: 'Invalid token' }) }
  if (rc.rateLimitOnce) { rc.rateLimitOnce = false; return reply(429, { errorCode: 'CMN-301', message: 'Request rate exceeded' }, { 'retry-after': '60' }) }
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
      { legs: [{ result: 'Accepted', to: { name: 'Yoletty', extensionNumber: '101' } }] }),
    rec('c2', '2026-10-30T16:00:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550123', name: 'METAIRIE LA' }),
    rec('c3', '2026-10-30T16:30:00Z', 'Outbound', 'Call connected', { phoneNumber: '+15045550123' }),
    rec('c4', '2026-10-30T17:00:00Z', 'Inbound', 'Voicemail', { phoneNumber: '+15045550177', name: 'NEW ORLEANS LA' }),
    rec('c5', '2026-10-30T18:00:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550199', name: 'JOSE GARCIA' }),
    rec('c6', '2026-10-30T18:30:00Z', 'Inbound', 'Accepted', { extensionNumber: '102', name: 'Paula' }),
    rec('c7', '2026-10-30T19:00:00Z', 'Inbound', 'Missed', { name: 'Anonymous' }),
    rec('c8', '2026-10-30T19:30:00Z', 'Inbound', 'Missed', { phoneNumber: '+15045550188', name: 'LUIS PRUEBA' }),
    { ...rec('fax1', '2026-10-30T20:00:00Z', 'Inbound', 'Received', { phoneNumber: '+15045550111' }), type: 'Fax' },
  ]

  clock = { t: new Date('2026-10-31T12:00:00Z') }
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('../../app.js')
  const { createCallsRouter } = await import('../../routes/calls.js')
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
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
    assert.deepEqual(maria.answeredBy, { name: 'Yoletty', extension: '101' })
    assert.equal(maria.durationSeconds, 125)

    const carmen = byId(calls, '2026-10-30T16:00:00Z')
    assert.equal(carmen.name, 'Carmen Ejemplo', 'a billing client’s name wins over a lead’s and the caller ID')
    assert.equal(carmen.nameSource, 'client')
    assert.equal(carmen.followUp.kind, 'called_back')
    assert.equal(new Date(carmen.followUp.at).toISOString(), '2026-10-30T16:30:00.000Z')

    const vm = byId(calls, '2026-10-30T17:00:00Z')
    assert.equal(vm.outcome, 'voicemail')
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

    assert.deepEqual(r.json.counts, { incoming: 6, answered: 1, missed: 4, voicemail: 1, outgoing: 1, not_returned: 4 })
    assert.deepEqual(calls.map((c) => c.startedAt), [...calls.map((c) => c.startedAt)].sort().reverse(), 'newest first')
  })

  await t.test('filters and search', async () => {
    assert.equal((await list('&outcome=missed')).json.calls.length, 4)
    assert.equal((await list('&outcome=not_returned')).json.calls.length, 4)
    assert.equal((await list('&outcome=outgoing')).json.calls.length, 1)
    assert.equal((await list('&outcome=answered')).json.calls.length, 1)
    assert.equal((await list(`&q=${encodeURIComponent('carmen')}`)).json.calls.length, 2, 'her missed call and the callback')
    assert.equal((await list(`&q=${encodeURIComponent('555-0101')}`)).json.calls.length, 1)
    assert.equal((await list(`&q=${encodeURIComponent('+1 (504) 555-0177')}`)).json.calls.length, 1)
    assert.equal((await list(`&q=${encodeURIComponent('yoletty')}`)).json.calls.length, 1, 'search covers who answered')
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
    rc.delayMs = 150
    const opts = { trigger: 'scheduled', deps: { fetchImpl: fakeFetch, now: () => clock.t }, sleep: async () => {}, pageDelayMs: 0 }
    const [a, b] = await Promise.all([syncCallLog(db, cfg, opts), syncCallLog(db, cfg, opts)])
    rc.delayMs = 0
    assert.deepEqual([a.status, b.status].sort(), ['busy', 'ok'])
  })

  await t.test('calls older than the retention period are deleted', async () => {
    await db.query(`INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, scope) VALUES ('ancient', 'inbound', '2025-01-01T00:00:00Z', 'missed', 'account')`)
    await sync()
    assert.equal((await db.query(`SELECT 1 FROM rc_calls WHERE rc_record_id = 'ancient'`)).rowCount, 0)
  })
})
