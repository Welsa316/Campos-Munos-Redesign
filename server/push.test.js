// Desktop notifications (server/push/, routes/push.js) over real HTTP and a
// real Postgres. The push service is never called: web-push's
// sendNotification is replaced by a recorder. Synthetic people only.
//
// Uses its own database (<TEST_DATABASE_URL's name>_push). The name must
// contain "test"; the schema is rebuilt, and migrated twice to prove the
// push schema can run on every deploy.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import pg from 'pg'
import pino from 'pino'
import webpush from 'web-push'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_push`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

// A fresh key pair per run: nothing real is ever configured here.
const vapid = webpush.generateVAPIDKeys()
const PUSH_ENV = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:test@example.test' }

// Records every send; an endpoint listed in `answers` fails with that status.
const sent = []
const answers = new Map()
const transport = {
  async sendNotification(sub, payload, options) {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options })
    const status = answers.get(sub.endpoint)
    if (status) throw Object.assign(new Error('Received unexpected response code'), { statusCode: status, body: 'push service says no' })
    return { statusCode: 201, body: '', headers: {} }
  },
}

// What the main test server logs, to check the levels it picks.
const logLines = []
const captureLog = () => pino({ level: 'debug' }, { write: (line) => { logLines.push(JSON.parse(line)) } })

let db, servers = [], base, bareBase, staffCli, sendPush, CALLBACK_REMINDER, portalPath
const pw = {}
const ids = {}

const b64 = (n, first) => { const b = crypto.randomBytes(n); if (first !== undefined) b[0] = first; return b.toString('base64url') }
const fakeSub = (host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/${crypto.randomBytes(12).toString('hex')}`,
  keys: { p256dh: b64(65, 4), auth: b64(16) },
})

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'push-test-secret-0123456789abcdef'
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
  migrate()
  migrate()
  db = new pg.Pool({ connectionString: URL_ })

  staffCli = await import('./scripts/staff.js')
  const keep = (who) => (line) => { const m = /^[A-Za-z0-9_-]{24}$/.exec(line.trim().split('\n').pop()); if (m) pw[who] = m[0] }
  await staffCli.run(db, 'create', { email: 'yoletty@example.test', name: 'Yoletty', role: 'front_desk' }, keep('a'))
  await staffCli.run(db, 'create', { email: 'ciro@example.test', name: 'Ciro', role: 'front_desk' }, keep('b'))
  await staffCli.run(db, 'create', { email: 'gone@example.test', name: 'Gone', role: 'front_desk' }, keep('c'))
  for (const [k, email] of [['a', 'yoletty@example.test'], ['b', 'ciro@example.test'], ['c', 'gone@example.test']]) {
    ids[k] = (await db.query('SELECT id FROM admin_users WHERE email = $1', [email])).rows[0].id
  }
  // A lead whose details must never reach a notification.
  await db.query("INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0101', 'Necesito ayuda con mi caso')")

  ;({ sendPush, CALLBACK_REMINDER, portalPath } = await import('./push/send.js'))
  const { createApp, addFallbackHandlers } = await import('./app.js')
  const listen = async (env, log = pino({ level: 'silent' })) => {
    const app = addFallbackHandlers(createApp({ env: { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET, ...env }, log, pushTransport: transport }))
    const server = app.listen(0)
    servers.push(server)
    await new Promise((r) => server.once('listening', r))
    return `http://127.0.0.1:${server.address().port}`
  }
  base = await listen(PUSH_ENV, captureLog())
  bareBase = await listen({})
})

after(async () => {
  if (SKIP) return
  for (const s of servers) { s.closeAllConnections?.(); s.close() }
  await db?.end()
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, { body, cookie, at = base } = {}) {
  const res = await fetch(at + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}
const signIn = async (email, password) => {
  const r = await call('POST', '/api/auth/login', { body: { email, password } })
  assert.equal(r.status, 200, r.text)
  return r.cookie
}
const subsOf = async (accountId) => (await db.query('SELECT * FROM push_subscriptions WHERE account_id = $1 ORDER BY id', [accountId])).rows

test('desktop notifications', { skip: SKIP }, async (t) => {
  const yoletty = await signIn('yoletty@example.test', pw.a)
  const ciro = await signIn('ciro@example.test', pw.b)

  await t.test('needs a signed-in account', async () => {
    assert.equal((await call('GET', '/api/push/config')).status, 401)
    assert.equal((await call('POST', '/api/push/subscriptions', { body: { subscription: fakeSub() } })).status, 401)
  })

  await t.test('without the VAPID keys nothing is accepted or sent, and nothing breaks', async () => {
    const cfg = await call('GET', '/api/push/config', { cookie: yoletty, at: bareBase })
    assert.equal(cfg.status, 200)
    assert.deepEqual(cfg.json, { configured: false, publicKey: null })
    const sub = fakeSub()
    const reg = await call('POST', '/api/push/subscriptions', { cookie: yoletty, at: bareBase, body: { subscription: sub } })
    assert.equal(reg.status, 503)
    assert.equal(reg.json.code, 'push_not_configured')
    assert.equal((await call('POST', '/api/push/test', { cookie: yoletty, at: bareBase, body: { endpoint: sub.endpoint } })).status, 503)
    const before = sent.length
    const r = await sendPush(db, { accountId: ids.a, eventKey: 'unconfigured:1', ...CALLBACK_REMINDER }, { env: {}, transport })
    assert.equal(r.status, 'not_configured')
    assert.equal(sent.length, before)
    // Half a configuration is no configuration.
    const half = await sendPush(db, { accountId: ids.a, eventKey: 'unconfigured:2', ...CALLBACK_REMINDER }, { env: { VAPID_PUBLIC_KEY: vapid.publicKey }, transport })
    assert.equal(half.status, 'not_configured')
    assert.equal(sent.length, before)
    // The rest of the API is unaffected.
    assert.equal((await call('GET', '/api/auth/verify', { cookie: yoletty, at: bareBase })).status, 200)
  })

  await t.test('the public key is offered once configured', async () => {
    const cfg = await call('GET', '/api/push/config', { cookie: yoletty })
    assert.deepEqual(cfg.json, { configured: true, publicKey: vapid.publicKey })
    assert.ok(!cfg.text.includes(vapid.privateKey))
  })

  const yolettySub = fakeSub()
  await t.test('a subscription belongs to whoever is signed in, whatever the body says', async () => {
    const r = await call('POST', '/api/push/subscriptions', { cookie: yoletty, body: { subscription: yolettySub, accountId: ids.b, account_id: ids.b } })
    assert.equal(r.status, 201, r.text)
    const rows = await subsOf(ids.a)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].endpoint, yolettySub.endpoint)
    assert.equal((await subsOf(ids.b)).length, 0)
    const st = await call('POST', '/api/push/subscriptions/status', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })
    assert.equal(st.json.enabled, true)
    assert.equal(st.json.configured, true)
  })

  await t.test('registering the same browser again updates it instead of adding a second', async () => {
    const newKeys = { ...yolettySub, keys: { p256dh: b64(65, 4), auth: b64(16) } }
    const r = await call('POST', '/api/push/subscriptions', { cookie: yoletty, body: { subscription: newKeys } })
    assert.equal(r.status, 200, r.text)
    const rows = await subsOf(ids.a)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].p256dh, newKeys.keys.p256dh)
    // A second computer is a second subscription.
    const laptop = fakeSub('wns2-par02p.notify.windows.com')
    assert.equal((await call('POST', '/api/push/subscriptions', { cookie: yoletty, body: { subscription: laptop } })).status, 201)
    assert.equal((await subsOf(ids.a)).length, 2)
    assert.equal((await call('DELETE', '/api/push/subscriptions', { cookie: yoletty, body: { endpoint: laptop.endpoint } })).json.removed, true)
  })

  await t.test('only push-service endpoints and well-formed keys are accepted', async () => {
    for (const bad of [
      { ...fakeSub(), endpoint: 'https://169.254.169.254/latest/meta-data' },
      { ...fakeSub(), endpoint: 'http://fcm.googleapis.com/fcm/send/x' },
      { ...fakeSub(), endpoint: 'https://fcm.googleapis.com.evil.example/x' },
      { ...fakeSub(), endpoint: 'https://user:pw@fcm.googleapis.com/x' },
      { ...fakeSub(), keys: { p256dh: 'short', auth: b64(16) } },
      { ...fakeSub(), keys: { p256dh: b64(65, 4) } },
      'not a subscription',
    ]) {
      const r = await call('POST', '/api/push/subscriptions', { cookie: ciro, body: { subscription: bad } })
      assert.equal(r.status, 400, JSON.stringify(bad))
    }
    assert.equal((await subsOf(ids.b)).length, 0)
  })

  await t.test('another account can neither read nor remove my subscription', async () => {
    const st = await call('POST', '/api/push/subscriptions/status', { cookie: ciro, body: { endpoint: yolettySub.endpoint } })
    assert.equal(st.status, 200)
    assert.equal(st.json.enabled, false)
    assert.equal(st.json.lastSuccessAt, null)
    const del = await call('DELETE', '/api/push/subscriptions', { cookie: ciro, body: { endpoint: yolettySub.endpoint } })
    assert.equal(del.json.removed, false)
    assert.equal((await subsOf(ids.a)).length, 1)
    // Nor send a test to it.
    assert.equal((await call('POST', '/api/push/test', { cookie: ciro, body: { endpoint: yolettySub.endpoint } })).status, 404)
  })

  await t.test('the same event is sent to the same computer once', async () => {
    const before = sent.length
    const first = await sendPush(db, { accountId: ids.a, eventKey: 'callback-reminder:41', ...CALLBACK_REMINDER, url: '/calls' }, { env: PUSH_ENV, transport })
    assert.equal(first.status, 'done')
    assert.deepEqual(first.devices.map((d) => d.outcome), ['sent'])
    const again = await sendPush(db, { accountId: ids.a, eventKey: 'callback-reminder:41', ...CALLBACK_REMINDER, url: '/calls' }, { env: PUSH_ENV, transport })
    assert.deepEqual(again.devices.map((d) => d.outcome), ['already_sent'])
    assert.equal(sent.length, before + 1)
    const rows = (await db.query("SELECT status, http_status FROM push_deliveries WHERE event_key = 'callback-reminder:41'")).rows
    assert.deepEqual(rows, [{ status: 'sent', http_status: 201 }])
    assert.ok((await subsOf(ids.a))[0].last_success_at)
  })

  await t.test('a failed send is recorded and may be tried again; a sent one may not', async () => {
    answers.set(yolettySub.endpoint, 500)
    const failed = await sendPush(db, { accountId: ids.a, eventKey: 'callback-reminder:42', ...CALLBACK_REMINDER }, { env: PUSH_ENV, transport })
    assert.deepEqual(failed.devices.map((d) => [d.outcome, d.httpStatus]), [['failed', 500]])
    const sub = (await subsOf(ids.a))[0]
    assert.equal(sub.failures, 1)
    assert.ok(sub.last_failure_at)
    answers.delete(yolettySub.endpoint)
    const retried = await sendPush(db, { accountId: ids.a, eventKey: 'callback-reminder:42', ...CALLBACK_REMINDER }, { env: PUSH_ENV, transport })
    assert.deepEqual(retried.devices.map((d) => d.outcome), ['sent'])
    assert.equal((await subsOf(ids.a))[0].failures, 0)
  })

  await t.test('a disabled account gets nothing', async () => {
    const gone = fakeSub()
    await db.query("INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)", [ids.c, gone.endpoint, gone.keys.p256dh, gone.keys.auth])
    await staffCli.run(db, 'disable', { email: 'gone@example.test' }, () => {})
    const before = sent.length
    const r = await sendPush(db, { accountId: ids.c, eventKey: 'callback-reminder:43', ...CALLBACK_REMINDER }, { env: PUSH_ENV, transport })
    assert.equal(r.status, 'account_disabled')
    assert.deepEqual(r.devices.map((d) => d.outcome), ['skipped'])
    assert.equal(sent.length, before)
    assert.deepEqual((await db.query("SELECT status FROM push_deliveries WHERE event_key = 'callback-reminder:43'")).rows, [{ status: 'skipped' }])
  })

  await t.test('a browser the push service reports gone (410) is removed', async () => {
    const old = fakeSub()
    await call('POST', '/api/push/subscriptions', { cookie: ciro, body: { subscription: old } })
    answers.set(old.endpoint, 410)
    const r = await sendPush(db, { accountId: ids.b, eventKey: 'callback-reminder:44', ...CALLBACK_REMINDER }, { env: PUSH_ENV, transport })
    assert.deepEqual(r.devices.map((d) => [d.outcome, d.httpStatus]), [['expired', 410]])
    assert.equal((await subsOf(ids.b)).length, 0)
    assert.deepEqual((await db.query("SELECT status, http_status, subscription_id FROM push_deliveries WHERE event_key = 'callback-reminder:44'")).rows,
      [{ status: 'expired', http_status: 410, subscription_id: null }])
    answers.delete(old.endpoint)
  })

  await t.test('a browser another account registered moves only when re-subscribed from it', async () => {
    const shared = fakeSub()
    await call('POST', '/api/push/subscriptions', { cookie: ciro, body: { subscription: shared } })
    assert.equal((await subsOf(ids.b)).length, 1)
    await call('POST', '/api/push/subscriptions', { cookie: yoletty, body: { subscription: shared } })
    assert.equal((await subsOf(ids.b)).length, 0)
    assert.ok((await subsOf(ids.a)).some((s) => s.endpoint === shared.endpoint))
    await call('DELETE', '/api/push/subscriptions', { cookie: yoletty, body: { endpoint: shared.endpoint } })
  })

  await t.test('notifications carry generic text and a portal path, never client details', async () => {
    sent.length = 0
    const test = await call('POST', '/api/push/test', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })
    assert.equal(test.status, 200, test.text)
    assert.equal(test.json.outcome, 'sent')
    await sendPush(db, { accountId: ids.a, eventKey: 'callback-reminder:45', ...CALLBACK_REMINDER, url: '/calls', tag: 'callback-reminder:45' }, { env: PUSH_ENV, transport })
    assert.equal(sent.length, 2)
    assert.deepEqual(sent[0].payload, { title: 'Test notification', body: 'Desktop notifications are working on this computer.', url: '/', tag: 'cm-test-notification' })
    assert.deepEqual(sent[1].payload, { title: 'Callback reminder', body: 'You have a scheduled follow-up ready to review.', url: '/calls', tag: 'callback-reminder:45' })
    for (const s of sent) {
      const text = JSON.stringify(s.payload)
      for (const secret of ['Ana', 'Prueba', '555', '0101', 'ana@example.test', 'caso', 'yoletty@example.test']) assert.ok(!text.includes(secret), `${secret} in ${text}`)
      assert.equal(s.options.vapidDetails.publicKey, vapid.publicKey)
    }
    // Where a click goes is always inside the portal.
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', ' /calls', 42]) assert.equal(portalPath(bad), '/', String(bad))
    assert.equal(portalPath('/calls?tab=missed'), '/calls?tab=missed')
  })

  await t.test('the test notification is rate-limited', async () => {
    // One was sent above; four more are allowed in the window, then 429.
    for (let i = 0; i < 4; i++) {
      const r = await call('POST', '/api/push/test', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })
      assert.equal(r.status, 200, r.text)
    }
    const limited = await call('POST', '/api/push/test', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })
    assert.equal(limited.status, 429)
    assert.equal(limited.json.code, 'too_many_tests')
    // Per account: Ciro's own limit is untouched.
    const own = fakeSub()
    await call('POST', '/api/push/subscriptions', { cookie: ciro, body: { subscription: own } })
    assert.equal((await call('POST', '/api/push/test', { cookie: ciro, body: { endpoint: own.endpoint } })).status, 200)
  })

  await t.test('turning it off removes only this computer', async () => {
    const del = await call('DELETE', '/api/push/subscriptions', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })
    assert.equal(del.json.removed, true)
    const st = await call('POST', '/api/push/subscriptions/status', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })
    assert.equal(st.json.enabled, false)
    assert.equal((await call('POST', '/api/push/test', { cookie: yoletty, body: { endpoint: yolettySub.endpoint } })).status, 429, 'still limited')
  })
})

test('a new website lead notifies, once, the people who may read leads — with no client details', { skip: SKIP }, async () => {
  const { notifyNewLead } = await import('./push/leadAlerts.js')
  const make = async (email, role, extra = '') => (await db.query(
    `INSERT INTO admin_users (email, password_hash, role${extra ? ', capability_revokes' : ''}) VALUES ($1, 'x', $2${extra ? ', $3' : ''}) RETURNING id`,
    extra ? [email, role, extra] : [email, role]
  )).rows[0].id
  const desk = await make('desk-lead@example.test', 'receptionist')
  const para = await make('para-lead@example.test', 'billing_paralegal')
  const noLeads = await make('noleads@example.test', 'receptionist', '{crm.view}')
  const subs = {}
  for (const [k, id] of [['desk', desk], ['para', para], ['noLeads', noLeads]]) {
    const s = fakeSub()
    await db.query('INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)', [id, s.endpoint, s.keys.p256dh, s.keys.auth])
    subs[k] = s.endpoint
  }
  const lead = (await db.query(`INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Rosa', 'Martinez', 'rosa@example.test', '504-555-0177', 'Mi caso de asilo') RETURNING id`)).rows[0].id

  sent.length = 0
  await notifyNewLead(db, { submissionId: lead, source: 'contact' }, { env: PUSH_ENV, transport })
  const to = (endpoint) => sent.filter((s) => s.endpoint === endpoint)
  assert.equal(to(subs.desk).length, 1, 'the front desk is told')
  assert.equal(to(subs.para).length, 0, 'billing staff cannot read leads')
  assert.equal(to(subs.noLeads).length, 0, 'nor can an account with leads revoked')
  assert.equal(to(subs.desk)[0].options.TTL, 24 * 60 * 60, 'kept a day for a computer that is off')
  assert.deepEqual(to(subs.desk)[0].payload, {
    title: 'New form submission',
    body: 'Someone wrote in through the website. Open Messages to read it.',
    url: `/inbox?lead=${lead}`,
    tag: `cm-submission-${lead}`,
  })
  for (const secret of ['Rosa', 'Martinez', 'rosa@example.test', '0177', 'asilo']) assert.ok(!JSON.stringify(sent).includes(secret), secret)

  // The same lead again (a retry): nobody is told twice.
  await notifyNewLead(db, { submissionId: lead, source: 'contact' }, { env: PUSH_ENV, transport })
  assert.equal(to(subs.desk).length, 1)
})

test('the desktop app feed: every notification for an account, its own only, never replayed', { skip: SKIP }, async () => {
  const { feedFor } = await import('./push/feed.js')
  const make = async (email, role) => (await db.query(`INSERT INTO admin_users (email, password_hash, role) VALUES ($1, 'x', $2) RETURNING id`, [email, role])).rows[0].id
  const me = await make('feed-me@example.test', 'receptionist')
  const other = await make('feed-other@example.test', 'receptionist')
  const gone = await make('feed-gone@example.test', 'receptionist')
  await db.query('UPDATE admin_users SET disabled_at = NOW() WHERE id = $1', [gone])
  const start = await feedFor(db, { accountId: me })
  assert.deepEqual(start.items, [], 'starting up replays nothing')

  // Kept even with no browser notifications on, and with push not set up at all.
  const r = await sendPush(db, { accountId: me, eventKey: 'feed:1', ...CALLBACK_REMINDER, url: '/calls' }, { env: {}, transport })
  assert.equal(r.status, 'not_configured')
  await sendPush(db, { accountId: other, eventKey: 'feed:2', ...CALLBACK_REMINDER }, { env: {}, transport })
  await sendPush(db, { accountId: gone, eventKey: 'feed:3', ...CALLBACK_REMINDER }, { env: {}, transport })
  // The same event twice is one item.
  await sendPush(db, { accountId: me, eventKey: 'feed:1', ...CALLBACK_REMINDER, url: '/calls' }, { env: {}, transport })

  const page = await feedFor(db, { accountId: me, after: start.cursor })
  assert.deepEqual(page.items.map((i) => [i.title, i.url]), [['Callback reminder', '/calls']])
  assert.equal((await feedFor(db, { accountId: me, after: page.cursor })).items.length, 0, 'the cursor moves past what was read')
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM account_notifications WHERE account_id = $1', [gone])).rows[0].n, 0, 'a disabled account gets none')
})

test('the feed route serves only the signed-in account, and the test button adds one', { skip: SKIP }, async () => {
  const yoletty = await signIn('yoletty@example.test', pw.a)
  const ciro = await signIn('ciro@example.test', pw.b)
  assert.equal((await call('GET', '/api/notifications/feed')).status, 401)
  const first = await call('GET', '/api/notifications/feed', { cookie: yoletty })
  assert.equal(first.status, 200)
  assert.deepEqual(first.json.items, [])
  assert.equal((await call('POST', '/api/notifications/test', { cookie: yoletty, body: {} })).status, 201)
  const mine = await call('GET', `/api/notifications/feed?after=${first.json.cursor}`, { cookie: yoletty })
  assert.deepEqual(mine.json.items.map((i) => i.title), ['Test notification'])
  const theirs = await call('GET', `/api/notifications/feed?after=${first.json.cursor}`, { cookie: ciro })
  assert.ok(!theirs.json.items.some((i) => i.id === mine.json.items[0].id), 'not another account’s')
  // The app keeps one cursor per account, so the feed says whose it is.
  assert.equal(first.json.account, String(ids.a))
  assert.equal(mine.json.account, String(ids.a))
  assert.equal(theirs.json.account, String(ids.b))
})

test('feed polls that succeed log at debug; a signed-out poll still warns', { skip: SKIP }, async () => {
  const yoletty = await signIn('yoletty@example.test', pw.a)
  logLines.length = 0
  assert.equal((await call('GET', '/api/notifications/feed', { cookie: yoletty })).status, 200)
  assert.equal((await call('GET', '/api/notifications/feed?after=0')).status, 401)
  assert.equal((await call('GET', '/api/auth/verify', { cookie: yoletty })).status, 200)
  const levelOf = (status, url) => logLines.find((l) => l.res?.statusCode === status && l.req?.url.startsWith(url))?.level
  assert.equal(levelOf(200, '/api/notifications/feed'), 20, 'debug')
  assert.equal(levelOf(401, '/api/notifications/feed'), 40, 'warn')
  assert.equal(levelOf(200, '/api/auth/verify'), 30, 'other successes stay at info')
})

test('a new missed caller is announced once, to people who can see Calls — not for repeat calls or old ones', { skip: SKIP }, async () => {
  const { notifyNewMissedCallers } = await import('./push/missedCallAlerts.js')
  const make = async (email, role) => (await db.query(`INSERT INTO admin_users (email, password_hash, role) VALUES ($1, 'x', $2) RETURNING id`, [email, role])).rows[0].id
  const desk = await make('missed-desk@example.test', 'receptionist')
  const para = await make('missed-para@example.test', 'billing_paralegal')
  const now = new Date('2026-11-06T16:00:00Z')
  const calls = async (rec, minutesAgo, number) => (await db.query(
    `INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key, is_primary)
     VALUES ($1, 'inbound', $2, 'other', 'not_answered', 99, 'account', $3, cm_phone_key($3), TRUE) RETURNING id`,
    [rec, new Date(now.getTime() - minutesAgo * 60000), number]
  )).rows[0].id
  const fresh = await calls('mc-1', 20, '+15045550301')
  await calls('mc-old', 300, '+15045550302')
  const feed = async (id) => (await db.query(`SELECT event_key, title, body, url FROM account_notifications WHERE account_id = $1 AND event_key LIKE 'missed-call:%' ORDER BY id`, [id])).rows

  sent.length = 0
  const announced = await notifyNewMissedCallers(db, { now }, { env: PUSH_ENV, transport })
  assert.deepEqual(announced, [Number(fresh)], 'only the caller from the last two hours')
  assert.deepEqual(await feed(desk), [{ event_key: `missed-call:${fresh}`, title: 'New missed call', body: 'Someone is waiting for a call back. Open Calls to see who.', url: '/calls' }])
  assert.deepEqual(await feed(para), [], 'billing staff cannot see Calls')
  for (const s of sent) assert.ok(!JSON.stringify(s.payload).includes('0301'), 'no number in the notification')

  // The same person calls again: their open callback is not news.
  await calls('mc-2', 5, '+15045550301')
  await notifyNewMissedCallers(db, { now }, { env: PUSH_ENV, transport })
  assert.equal((await feed(desk)).length, 1)
})
