// The activity log and the Team tab, through the real app over HTTP and a
// real Postgres (docs/staff-accounts.md). Synthetic people only.
//
// Uses its own database (<TEST_DATABASE_URL's name>_activity) and its own
// process, so its sign-ins don't share the login limiter with
// staffAccess.test.js. The name must contain "test"; the schema is rebuilt.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import pino from 'pino'
import { ACTIONS } from './activity/actions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_activity`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

let server, base, db, staffCli
const pw = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'activity-test-secret-0123456789abcdef'
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
  execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  db = new pg.Pool({ connectionString: URL_ })

  staffCli = await import('./scripts/staff.js')
  const keep = (who) => (line) => { const m = /^[A-Za-z0-9_-]{24}$/.exec(line.trim().split('\n').pop()); if (m) pw[who] = m[0] }
  await staffCli.run(db, 'create', { email: 'dev@example.test', name: 'Dev', role: 'admin' }, keep('dev'))
  await staffCli.run(db, 'create', { email: 'yoletty@example.test', name: 'Yoletty', role: 'front_desk' }, keep('front'))
  await staffCli.run(db, 'create', { email: 'rita@example.test', name: 'Rita', role: 'receptionist' }, keep('recep'))
  await db.query("INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0101', 'Hola')")

  const { createApp, addFallbackHandlers } = await import('./app.js')
  const app = addFallbackHandlers(createApp({ env: { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET }, log: pino({ level: 'silent' }) }))
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  await db?.end()
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* csv or empty */ }
  return { status: res.status, json, text, cookie: res.headers.get('set-cookie')?.split(';')[0] }
}

const signIn = async (email, password) => {
  const r = await call('POST', '/api/auth/login', { body: { email, password } })
  assert.equal(r.status, 200, r.text)
  return r.cookie
}

// The log is written as each response finishes; wait for the rows.
async function logged(where, args = [], { atLeast = 1 } = {}) {
  let rows = []
  for (let i = 0; i < 80; i++) {
    rows = (await db.query(`SELECT * FROM staff_activity WHERE ${where} ORDER BY id`, args)).rows
    if (rows.length >= atLeast) return rows
    await new Promise((r) => setTimeout(r, 25))
  }
  return rows
}

test('every route that changes something has a name in the activity log', async () => {
  const { createBillingRouter } = await import('./routes/billing.js')
  const { createWhatsappInboxRouter } = await import('./routes/whatsappInbox.js')
  const { createCallsRouter } = await import('./routes/calls.js')
  const { createIntegrationsRouter } = await import('./routes/integrations.js')
  const { createTeamRouter } = await import('./routes/team.js')
  const submissions = (await import('./routes/submissions.js')).default
  const auth = (await import('./routes/auth.js')).default
  const { routePattern } = await import('./activity/recorder.js')
  const routesOf = (router, prefix) => router.stack.filter((l) => l.route).flatMap((l) =>
    Object.keys(l.route.methods).map((m) => [m.toUpperCase(), routePattern({ route: l.route, baseUrl: prefix })]))
  const all = [
    ...routesOf(createBillingRouter(), '/api/billing'),
    ...routesOf(createWhatsappInboxRouter(), '/api/whatsapp'),
    ...routesOf(createCallsRouter({ env: {} }), '/api/calls'),
    ...routesOf(createIntegrationsRouter({ env: {} }), '/api/integrations'),
    ...routesOf(createTeamRouter(), '/api/team'),
    ...routesOf(submissions, '/api/submissions'),
    ...routesOf(auth, '/api/auth'),
  ]
  // Anonymous: the website's own forms and Meta's webhook, never a staff action.
  const PUBLIC = new Set(['POST /api/submissions', 'POST /api/submissions/:id/chat-message', 'POST /api/billing/webhooks/whatsapp'])
  const writes = all.filter(([m, p]) => !['GET', 'HEAD'].includes(m) && !PUBLIC.has(`${m} ${p}`))
  assert.ok(writes.length > 40, `found ${writes.length}`)
  const missing = writes.filter(([m, p]) => !ACTIONS[`${m} ${p}`]).map((r) => r.join(' '))
  assert.deepEqual(missing, [], 'add these to server/activity/actions.js')
  // And nothing listed that no longer exists.
  const real = new Set(all.map((r) => r.join(' ')))
  assert.deepEqual(Object.keys(ACTIONS).filter((k) => !real.has(k)), [])
})

test('activity log and team management', { skip: SKIP }, async (t) => {
  const dev = await signIn('dev@example.test', pw.dev)
  const front = await signIn('yoletty@example.test', pw.front)

  await t.test('sign-ins are logged, including a wrong password, with no password stored', async () => {
    assert.equal((await call('POST', '/api/auth/login', { body: { email: 'rita@example.test', password: 'not-her-password' } })).status, 401)
    const ok = await logged("action = 'auth.sign_in' AND actor_email = 'yoletty@example.test'")
    assert.equal(ok[0].outcome, 'ok')
    assert.equal(ok[0].actor_role, 'front_desk')
    const bad = await logged("action = 'auth.sign_in' AND outcome <> 'ok'")
    assert.equal(bad.length, 1)
    assert.equal(bad[0].actor_id, null, 'a wrong password names no account')
    assert.equal(bad[0].details.email, 'rita@example.test')
    assert.ok(!JSON.stringify(bad).includes('not-her-password'))
  })

  await t.test('a change is logged with who, what, which record and when; reads are not', async () => {
    const before = Date.now()
    const lead = (await db.query('SELECT id FROM submissions LIMIT 1')).rows[0].id
    assert.equal((await call('GET', '/api/submissions', { cookie: front })).status, 200)
    assert.equal((await call('PATCH', `/api/submissions/${lead}/status`, { cookie: front, body: { status: 'closed' } })).status, 200)
    assert.equal((await call('POST', `/api/submissions/${lead}/notes`, { cookie: front, body: { body: 'Private: called her mother' } })).status, 201)
    const rows = await logged("actor_email = 'yoletty@example.test' AND action LIKE 'lead.%'", [], { atLeast: 2 })
    assert.deepEqual(rows.map((r) => [r.action, r.entity_type, r.entity_id]), [['lead.status', 'lead', String(lead)], ['lead.note_added', 'lead', String(lead)]])
    assert.equal(rows[0].details.status, 'closed')
    assert.ok(rows[0].created_at.getTime() >= before - 1000, 'timestamped')
    assert.ok(!JSON.stringify(rows).includes('called her mother'), 'note text stays out of the log')
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM staff_activity WHERE method = 'GET' AND action <> 'lead.exported'")).rows[0].n, 0)
  })

  await t.test('a refused attempt is logged as denied', async () => {
    assert.equal((await call('PUT', '/api/billing/monday/config', { cookie: front, body: {} })).status, 403)
    const r = await logged("actor_email = 'yoletty@example.test' AND action = 'monday.mapping_saved'")
    assert.equal(r[0].outcome, 'denied')
  })

  await t.test('only an administrator reads the log or manages the team', async () => {
    assert.equal((await call('GET', '/api/activity', { cookie: front })).status, 403)
    assert.equal((await call('GET', '/api/team', { cookie: front })).status, 403)
    const page = await call('GET', '/api/activity', { cookie: dev })
    assert.equal(page.status, 200)
    const first = page.json.items[0]
    assert.ok(first.at && first.label && first.actor?.email, JSON.stringify(first))
    assert.ok(page.json.people.some((p) => p.email === 'rita@example.test'))
    // Filters: one person, problems only, and text.
    const yol = (await db.query("SELECT id FROM admin_users WHERE email = 'yoletty@example.test'")).rows[0].id
    const mine = await call('GET', `/api/activity?actor=${yol}`, { cookie: dev })
    assert.ok(mine.json.items.length && mine.json.items.every((i) => i.actor.id === yol))
    const problems = await call('GET', '/api/activity?outcome=problems', { cookie: dev })
    assert.ok(problems.json.items.length && problems.json.items.every((i) => i.outcome !== 'ok'))
    const search = await call('GET', '/api/activity?q=status', { cookie: dev })
    assert.ok(search.json.items.some((i) => i.action === 'lead.status'))
    // A paging cursor too long for the database is ignored, not a 500.
    assert.equal((await call('GET', '/api/activity?before=99999999999999999999', { cookie: dev })).status, 200)
  })

  await t.test('team: create, change role, revoke and restore access, reset a password', async () => {
    const created = await call('POST', '/api/team', { cookie: dev, body: { email: 'Para@Example.test', name: 'Paula', role: 'billing_paralegal' } })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.json.account.email, 'para@example.test')
    assert.match(created.json.password, /^[A-Za-z0-9_-]{24}$/, 'a one-time password to hand over')
    const id = created.json.account.id
    const para = await signIn('para@example.test', created.json.password)

    const role = await call('PUT', `/api/team/${id}/role`, { cookie: dev, body: { role: 'front_desk' } })
    assert.equal(role.json.role, 'front_desk')
    assert.equal((await call('GET', '/api/submissions', { cookie: para })).status, 200, 'the new role applies on the next request')

    assert.equal((await call('POST', `/api/team/${id}/disable`, { cookie: dev })).status, 200)
    assert.equal((await call('GET', '/api/auth/verify', { cookie: para })).status, 401, 'revoking access ends their session')
    const list = await call('GET', '/api/team', { cookie: dev })
    assert.equal(list.json.accounts.find((a) => a.id === id).disabled, true)
    assert.ok(!list.text.includes('password_hash'))
    assert.equal((await call('POST', `/api/team/${id}/enable`, { cookie: dev })).status, 200)

    const reset = await call('POST', `/api/team/${id}/reset-password`, { cookie: dev })
    assert.match(reset.json.password, /^[A-Za-z0-9_-]{24}$/)

    const log = await logged("source = 'portal' AND path LIKE '/api/team%' AND outcome = 'ok' AND entity_id = $1", [String(id)], { atLeast: 4 })
    assert.deepEqual(log.map((r) => r.action), ['team.role', 'team.disabled', 'team.enabled', 'team.password_reset'])
    assert.ok(log.every((r) => r.actor_email === 'dev@example.test' && r.details.account === 'para@example.test'))
    assert.equal(log[0].details.role, 'front_desk')
    assert.equal(log[0].details.from, 'billing_paralegal')
    assert.ok(!JSON.stringify(log).includes(reset.json.password))
  })

  await t.test('team: link an account to the RingCentral extension that is this person', async () => {
    await db.query(`INSERT INTO rc_extensions (id, extension_number, name, type, status) VALUES
      ('9101', '101', 'Office CML', 'User', 'Enabled'), ('9001', '1', 'CML', 'Department', 'Enabled') ON CONFLICT (id) DO NOTHING`)
    await db.query(`INSERT INTO rc_call_sync_state (key, directory_refreshed_at) VALUES ('ringcentral', NOW())
      ON CONFLICT (key) DO UPDATE SET directory_refreshed_at = NOW()`)
    const list = await call('GET', '/api/team', { cookie: dev })
    assert.deepEqual(list.json.extensions, [{ id: '9101', number: '101', name: 'Office CML' }], 'people only, not the queue')
    const yoletty = list.json.accounts.find((a) => a.email === 'yoletty@example.test')
    const linked = await call('PUT', `/api/team/${yoletty.id}/extension`, { cookie: dev, body: { extensionId: '9101' } })
    assert.equal(linked.status, 200, linked.text)
    assert.equal(linked.json.rcExtensionId, '9101')
    // One account per extension.
    const other = list.json.accounts.find((a) => a.email === 'dev@example.test')
    const taken = await call('PUT', `/api/team/${other.id}/extension`, { cookie: dev, body: { extensionId: '9101' } })
    assert.equal(taken.status, 409)
    assert.match(taken.json.error, /already linked to yoletty@example.test/)
    assert.equal((await call('PUT', `/api/team/${other.id}/extension`, { cookie: dev, body: { extensionId: '424242' } })).status, 404)
    assert.equal((await call('PUT', `/api/team/${other.id}/extension`, { cookie: dev, body: { extensionId: 'x; DROP' } })).status, 400)
    assert.equal((await call('PUT', `/api/team/${yoletty.id}/extension`, { cookie: front, body: { extensionId: null } })).status, 403)
    const log = await logged("source = 'portal' AND action = 'team.extension' AND outcome = 'ok'", [], { atLeast: 1 })
    assert.equal(log[0].details.extensionId, '9101')
    const unlinked = await call('PUT', `/api/team/${yoletty.id}/extension`, { cookie: dev, body: { extensionId: null } })
    assert.equal(unlinked.json.rcExtensionId, null)
  })

  await t.test('admin-only permissions cannot be handed to anyone else', async () => {
    const rita = (await db.query("SELECT id FROM admin_users WHERE email = 'rita@example.test'")).rows[0].id
    for (const cap of ['team.manage', 'activity.view', 'monday.configure', 'integrations.view', 'integrations.manage']) {
      const r = await call('PUT', `/api/team/${rita}/capabilities/${cap}`, { cookie: dev, body: { state: 'grant' } })
      assert.equal(r.status, 400, cap)
      await assert.rejects(staffCli.run(db, 'grant', { email: 'rita@example.test', capability: cap }, () => {}), /admin role only/)
    }
    // Even written straight into the database, such a grant gives nothing.
    await db.query("UPDATE admin_users SET capability_grants = '{team.manage,activity.view}' WHERE id = $1", [rita])
    const ritaCookie = await signIn('rita@example.test', pw.recep)
    assert.equal((await call('GET', '/api/team', { cookie: ritaCookie })).status, 403)
    assert.equal((await call('GET', '/api/activity', { cookie: ritaCookie })).status, 403)
    await db.query("UPDATE admin_users SET capability_grants = '{}' WHERE id = $1", [rita])
    // An ordinary permission can be granted from the Team tab.
    const g = await call('PUT', `/api/team/${rita}/capabilities/crm.export`, { cookie: dev, body: { state: 'grant' } })
    assert.ok(g.json.capabilities.includes('crm.export'))
    const d = await call('PUT', `/api/team/${rita}/capabilities/crm.export`, { cookie: dev, body: { state: 'default' } })
    assert.ok(!d.json.capabilities.includes('crm.export'))
  })

  await t.test('an administrator cannot lock themselves out from the portal', async () => {
    const me = (await db.query("SELECT id FROM admin_users WHERE email = 'dev@example.test'")).rows[0].id
    for (const [m, p, body] of [['PUT', `/api/team/${me}/role`, { role: 'front_desk' }], ['POST', `/api/team/${me}/disable`], ['POST', `/api/team/${me}/sign-out`]]) {
      assert.equal((await call(m, p, { cookie: dev, body })).status, 409, `${m} ${p}`)
    }
    assert.equal((await db.query('SELECT role, disabled_at FROM admin_users WHERE id = $1', [me])).rows[0].role, 'admin')
  })

  await t.test('changes made with scripts/staff.js are logged as from the command line', async () => {
    await staffCli.run(db, 'set-role', { email: 'rita@example.test', role: 'front_desk' }, () => {})
    const r = await logged("source = 'cli' AND action = 'team.role' AND details->>'account' = 'rita@example.test'")
    assert.equal(r.length, 1)
    assert.match(r[0].actor_email, /command line/)
    const page = await call('GET', '/api/activity?actor=cli', { cookie: dev })
    assert.ok(page.json.items.length && page.json.items.every((i) => i.source === 'cli'))
  })

  await t.test('signing out is logged against the account', async () => {
    assert.equal((await call('POST', '/api/auth/logout', { cookie: front })).status, 200)
    const r = await logged("action = 'auth.sign_out'")
    assert.equal(r[0].actor_email, 'yoletty@example.test')
  })
})

test('rows older than 400 days are purged; newer ones stay', { skip: SKIP }, async () => {
  const { purgeActivity } = await import('./activity/recorder.js')
  const now = new Date('2026-06-01T12:00:00Z')
  const day = 24 * 60 * 60 * 1000
  const insert = (label, ageDays) => db.query(
    "INSERT INTO staff_activity (action, label, outcome, created_at) VALUES ('purge.check', $1, 'ok', $2)",
    [label, new Date(now.getTime() - ageDays * day)])
  await insert('old', 401)
  await insert('older', 900)
  await insert('kept', 399)
  await insert('recent', 1)
  assert.equal(await purgeActivity(db, now), 2)
  const left = (await db.query("SELECT label FROM staff_activity WHERE action = 'purge.check' ORDER BY label")).rows.map((r) => r.label)
  assert.deepEqual(left, ['kept', 'recent'])
})
