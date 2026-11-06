// The administrator's test channel (testChannel/, routes/testChannel.js) over
// real HTTP and a real Postgres: a test sent through the public form route
// with a test link lands in the test channel, never in the inbox, the lead
// counts or the CSV, and notifies only the administrator who sent it. Email
// goes to a fake Resend on localhost, never to Resend itself. Synthetic
// people only.
//
// Own database: <TEST_DATABASE_URL's name>_testchannel (created if missing;
// must contain "test"; schema dropped and rebuilt).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import pino from 'pino'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_testchannel`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
// Lets each request say which client IP it is (as the site proxy does), so
// the public form's hourly limit never trips across these tests.
const PROXY_SECRET = 'testchannel-proxy-secret-0123456789'

let server, base, db, resendServer, mintTestToken
const emails = []
const ids = {}
const cookies = {}
let ipCounter = 0

before(async () => {
  if (SKIP) return
  resendServer = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/emails') emails.push(JSON.parse(raw))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: `fake-${emails.length}` }))
    })
  })
  resendServer.listen(0)
  await new Promise((r) => resendServer.once('listening', r))
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${resendServer.address().port}`
  process.env.RESEND_API_KEY = 're_test_not_a_real_key'
  process.env.ADMIN_EMAIL = 'office@example.test'
  process.env.JWT_SECRET = 'testchannel-secret-0123456789abcdef0123'
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
  const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  migrate()
  migrate()
  db = new pg.Pool({ connectionString: URL_ })

  const staffCli = await import('./scripts/staff.js')
  for (const [k, email, role] of [['admin', 'dev@example.test', 'admin'], ['desk', 'desk@example.test', 'front_desk']]) {
    await staffCli.run(db, 'create', { email, name: k, role }, () => {})
    const me = (await db.query('SELECT id, token_version FROM admin_users WHERE email = $1', [email])).rows[0]
    ids[k] = me.id
    cookies[k] = `token=${jwt.sign({ id: me.id, email, tv: me.token_version }, process.env.JWT_SECRET)}`
  }

  ;({ mintTestToken } = await import('./testChannel/token.js'))
  const { createApp, addFallbackHandlers } = await import('./app.js')
  const env = { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET, SITE_PROXY_SECRET: PROXY_SECRET, PUBLIC_ORIGINS: 'https://www.site.example,https://site.example' }
  server = addFallbackHandlers(createApp({ env, log: pino({ level: 'silent' }) })).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  resendServer?.close()
  await db?.end()
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      'X-CM-Proxy-Secret': PROXY_SECRET,
      'X-CM-Client-IP': `198.51.100.${(ipCounter++ % 250) + 1}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}
const publicPost = (path, body) => call('POST', path, { body })
const inquiry = (extra = {}) => ({ firstName: 'Rosa', lastName: 'Prueba', email: 'rosa@example.test', phone: '504-555-0123', message: 'Probando el formulario', consultationType: 'daca', location: 'MX', ...extra })
const settle = () => new Promise((r) => setTimeout(r, 200))
const count = async (table) => (await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n
const notificationsFor = async (accountId) => (await db.query('SELECT event_key, url FROM account_notifications WHERE account_id = $1 ORDER BY id', [accountId])).rows
const link = async () => {
  const r = await call('POST', '/api/test-channel/link', { cookie: cookies.admin })
  assert.equal(r.status, 200, r.text)
  return decodeURIComponent(r.json.contactUrl.split('#cm-test=')[1])
}
const reset = async () => {
  await db.query('TRUNCATE submissions, test_submissions, account_notifications RESTART IDENTITY CASCADE')
}

test('only the administrator can get a test link, and the token rides in the fragment', { skip: SKIP }, async () => {
  assert.equal((await call('POST', '/api/test-channel/link')).status, 401)
  assert.equal((await call('POST', '/api/test-channel/link', { cookie: cookies.desk })).status, 403)
  assert.equal((await call('GET', '/api/test-channel', { cookie: cookies.desk })).status, 403)
  assert.equal((await call('DELETE', '/api/test-channel', { cookie: cookies.desk })).status, 403)
  const r = await call('POST', '/api/test-channel/link', { cookie: cookies.admin })
  assert.equal(r.status, 200)
  assert.match(r.json.contactUrl, /^https:\/\/site\.example\/consulta#cm-test=t1\./, 'the bare domain, the token after #')
  assert.match(r.json.siteUrl, /^https:\/\/site\.example\/#cm-test=t1\./)
  const left = new Date(r.json.expiresAt).getTime() - Date.now()
  assert.ok(left > 55 * 60 * 1000 && left <= 60 * 60 * 1000, 'good for an hour')
})

test('a test form goes to the test channel only: no lead, no unread, no CSV row, no email, no staff notification', { skip: SKIP }, async () => {
  await reset()
  const emailsBefore = emails.length
  const token = await link()
  const sent = await publicPost('/api/submissions', inquiry({ testToken: token }))
  assert.equal(sent.status, 201, sent.text)
  assert.equal(sent.json.test, true)
  await settle()

  assert.equal(await count('submissions'), 0, 'not a lead')
  assert.equal(await count('test_submissions'), 1)
  const stored = (await db.query('SELECT * FROM test_submissions')).rows[0]
  assert.equal(stored.id, sent.json.id)
  assert.equal(stored.sent_by, ids.admin)
  assert.equal(stored.consultation_type, 'daca')

  const unread = await call('GET', '/api/submissions/unread-count', { cookie: cookies.admin })
  assert.equal(unread.json.count, 0)
  const inbox = await call('GET', '/api/submissions?withTotal=1', { cookie: cookies.admin })
  assert.equal(inbox.json.total, 0)
  const csv = await call('GET', '/api/submissions/export/csv', { cookie: cookies.admin })
  assert.equal(csv.text.trim().split('\n').length, 1, 'header only')

  assert.equal(emails.length, emailsBefore, 'the office is not emailed')
  assert.deepEqual(await notificationsFor(ids.desk), [], 'staff are not notified')
  assert.deepEqual(await notificationsFor(ids.admin), [{ event_key: `test-lead:${sent.json.id}`, url: `/test-channel?test=${sent.json.id}` }],
    'the administrator alone, pointed at the test channel')

  // The same form without the link is an ordinary lead, emailed and announced.
  const real = await publicPost('/api/submissions', inquiry({ email: 'otra@example.test' }))
  assert.equal(real.status, 201)
  await settle()
  assert.equal(await count('submissions'), 1)
  assert.equal(emails.length, emailsBefore + 1)
  assert.equal((await notificationsFor(ids.desk)).length, 1)
})

test('a test goes through the same validation and spam trap as a lead', { skip: SKIP }, async () => {
  await reset()
  const token = await link()
  const bad = await publicPost('/api/submissions', inquiry({ testToken: token, email: 'not-an-email', phone: 'abc' }))
  assert.equal(bad.status, 400)
  assert.ok(bad.json.errors?.length || bad.json.error, bad.text)
  const unknownType = await publicPost('/api/submissions', inquiry({ testToken: token, consultationType: 'pizza' }))
  assert.equal(unknownType.status, 400)
  const trapped = await publicPost('/api/submissions', inquiry({ testToken: token, website: 'http://spam.example' }))
  assert.equal(trapped.status, 201, 'looks sent, as for a bot')
  assert.equal(await count('test_submissions'), 0)
  assert.equal(await count('submissions'), 0)
  // HTML is stripped the same way.
  const html = await publicPost('/api/submissions', inquiry({ testToken: token, message: '<b>Hola</b> <script>x</script>mundo' }))
  assert.equal(html.status, 201)
  assert.doesNotMatch((await db.query('SELECT message FROM test_submissions')).rows[0].message, /<|>/)
})

test('a link that does not check out is refused and stored nowhere, not even as a lead', { skip: SKIP }, async () => {
  await reset()
  const emailsBefore = emails.length
  const good = await link()
  const secret = process.env.JWT_SECRET
  const parts = good.split('.')
  const forged = [...parts.slice(0, 4), parts[4].slice(0, -1) + (parts[4].endsWith('A') ? 'B' : 'A')].join('.')
  const expired = mintTestToken({ accountId: ids.admin, tokenVersion: 1 }, { secret, now: Date.now() - 61 * 60 * 1000 }).token
  const otherSecret = mintTestToken({ accountId: ids.admin, tokenVersion: 1 }, { secret: 'someone-elses-secret-0123456789abcdef' }).token
  // Signed correctly, but for an account that may not send tests.
  const deskVersion = (await db.query('SELECT token_version FROM admin_users WHERE id = $1', [ids.desk])).rows[0].token_version
  const forDesk = mintTestToken({ accountId: ids.desk, tokenVersion: deskVersion }, { secret }).token
  for (const [name, testToken] of [['forged', forged], ['expired', expired], ['wrong key', otherSecret], ['not an admin', forDesk], ['junk', 'hello']]) {
    const r = await publicPost('/api/submissions', inquiry({ testToken, email: `${name.replace(/\W/g, '')}@example.test` }))
    assert.equal(r.status, 400, name)
    assert.equal(r.json.code, 'test_link_invalid', name)
  }
  await settle()
  assert.equal(await count('test_submissions'), 0)
  assert.equal(await count('submissions'), 0)
  assert.equal(emails.length, emailsBefore)
})

test('a test link dies with a password change or revoked access', { skip: SKIP }, async () => {
  await reset()
  const token = await link()
  await db.query('UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1', [ids.admin])
  assert.equal((await publicPost('/api/submissions', inquiry({ testToken: token }))).json?.code, 'test_link_invalid', 'signed out everywhere')
  // Back to a working session and link, then access revoked.
  const me = (await db.query('SELECT email, token_version FROM admin_users WHERE id = $1', [ids.admin])).rows[0]
  cookies.admin = `token=${jwt.sign({ id: ids.admin, email: me.email, tv: me.token_version }, process.env.JWT_SECRET)}`
  const fresh = await link()
  await db.query('UPDATE admin_users SET disabled_at = NOW() WHERE id = $1', [ids.admin])
  assert.equal((await publicPost('/api/submissions', inquiry({ testToken: fresh }))).json?.code, 'test_link_invalid', 'disabled')
  await db.query('UPDATE admin_users SET disabled_at = NULL WHERE id = $1', [ids.admin])
  assert.equal((await publicPost('/api/submissions', inquiry({ testToken: fresh }))).status, 201)
  assert.equal(await count('submissions'), 0)
})

test('a test chat keeps its follow-ups in the test channel, and test and lead ids never cross', { skip: SKIP }, async () => {
  await reset()
  const emailsBefore = emails.length
  const token = await link()
  const start = await publicPost('/api/submissions', inquiry({ testToken: token, source: 'chat', message: 'Hola, es una prueba' }))
  assert.equal(start.status, 201)
  assert.ok(start.json.chat_token)
  const id = start.json.id
  const follow = await publicPost(`/api/submissions/${id}/chat-message`, { body: 'Segundo mensaje', chatToken: start.json.chat_token, testToken: token })
  assert.equal(follow.status, 201, follow.text)
  const wrong = start.json.chat_token.slice(0, -1) + (start.json.chat_token.endsWith('A') ? 'B' : 'A')
  assert.equal((await publicPost(`/api/submissions/${id}/chat-message`, { body: 'x', chatToken: wrong, testToken: token })).status, 403)
  // Without the link the same id is looked up among leads, where it is not.
  assert.equal((await publicPost(`/api/submissions/${id}/chat-message`, { body: 'x', chatToken: start.json.chat_token })).status, 404)
  // A real chat with the same id is not reachable through the test path.
  const realChat = await publicPost('/api/submissions', inquiry({ source: 'chat', email: 'real@example.test', message: 'Chat de verdad' }))
  assert.equal(realChat.json.id, id, 'both tables start at 1')
  assert.equal((await publicPost(`/api/submissions/${id}/chat-message`, { body: 'x', chatToken: realChat.json.chat_token, testToken: token })).status, 403)
  await settle()
  assert.equal(await count('chat_messages'), 0)
  assert.deepEqual((await db.query('SELECT body FROM test_chat_messages')).rows.map((r) => r.body), ['Segundo mensaje'])
  assert.equal(emails.length, emailsBefore + 1, 'only the real chat emailed the office')

  const detail = await call('GET', `/api/test-channel/${id}`, { cookie: cookies.admin })
  assert.equal(detail.status, 200)
  assert.equal(detail.json.source, 'chat')
  assert.deepEqual(detail.json.chat_messages.map((m) => m.body), ['Segundo mensaje'])
})

test('a test sent twice within minutes is stored and announced once', { skip: SKIP }, async () => {
  await reset()
  const token = await link()
  const a = await publicPost('/api/submissions', inquiry({ testToken: token }))
  const b = await publicPost('/api/submissions', inquiry({ testToken: token }))
  assert.equal(b.json.id, a.json.id)
  await settle()
  assert.equal(await count('test_submissions'), 1)
  assert.equal((await notificationsFor(ids.admin)).length, 1)
})

test('the administrator lists, opens, removes and clears test forms', { skip: SKIP }, async () => {
  await reset()
  const token = await link()
  const one = await publicPost('/api/submissions', inquiry({ testToken: token, message: 'uno' }))
  const two = await publicPost('/api/submissions', inquiry({ testToken: token, message: 'dos' }))
  const list = await call('GET', '/api/test-channel', { cookie: cookies.admin })
  assert.equal(list.status, 200)
  assert.deepEqual(list.json.items.map((i) => i.id), [two.json.id, one.json.id], 'newest first')
  assert.equal(list.json.items[0].sent_by_name, 'admin')
  assert.equal(list.json.items[0].chat_token, undefined, 'the chat token is never listed')
  assert.equal((await call('GET', '/api/test-channel/999999', { cookie: cookies.admin })).status, 404)
  assert.equal((await call('GET', '/api/test-channel/abc', { cookie: cookies.admin })).status, 400)

  assert.equal((await call('DELETE', `/api/test-channel/${one.json.id}`, { cookie: cookies.admin })).status, 200)
  assert.equal((await call('DELETE', `/api/test-channel/${one.json.id}`, { cookie: cookies.admin })).status, 404)
  assert.equal(await count('test_submissions'), 1)
  const cleared = await call('DELETE', '/api/test-channel', { cookie: cookies.admin })
  assert.deepEqual(cleared.json, { ok: true, removed: 1 })
  assert.equal(await count('test_submissions'), 0)
  const logged = (await db.query("SELECT action, details FROM staff_activity WHERE action LIKE 'test_channel.%' ORDER BY id")).rows
  assert.deepEqual(logged.map((r) => r.action).slice(-2), ['test_channel.removed', 'test_channel.cleared'])
  assert.equal(logged.at(-1).details.count, 1)
})
