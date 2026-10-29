// Staff roles, capabilities and the shared WhatsApp inbox, over real HTTP and
// a real Postgres (docs/staff-accounts.md). Synthetic people and numbers.
//
// Uses its own database (<TEST_DATABASE_URL's name>_staff, created if
// missing) so it can run in parallel with the billing suites. The name must
// contain "test"; the schema is dropped and rebuilt.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_staff`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

let server, base, db, staffCli
const users = {}
const sent = []

// A sender that records calls; outcomes like the mock's (…0000 fails).
const fakeSender = (mode) => ({
  mode,
  describe: () => ({ mode }),
  sendTemplate: async () => { throw new Error('templates are not sent from the inbox') },
  sendText: async (req) => {
    sent.push({ mode, ...req })
    if (req.to.endsWith('0000')) return { ok: false, outcome: 'failed', error: { code: 131026, message: 'Simulated: not a WhatsApp user', retryable: false } }
    return { ok: true, providerMessageId: `wamid.TEST.${sent.length}`, simulated: mode !== 'meta' }
  },
})

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'staff-access-test-secret-0123456789abcdef'
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
  db = new pg.Pool({ connectionString: URL_ })

  // The database as it was before roles: the staff columns and tables did
  // not exist and the role constraint allowed only admin and staff.
  await db.query(`
    DROP TABLE wa_outbound_messages, wa_conversation_notes, wa_conversations;
    ALTER TABLE admin_users DROP COLUMN capability_grants, DROP COLUMN capability_revokes, DROP COLUMN display_name, DROP COLUMN disabled_at;
    ALTER TABLE lead_notes DROP COLUMN author_id;
    ALTER TABLE replies DROP COLUMN sent_by;
    ALTER TABLE admin_users DROP CONSTRAINT admin_users_role_chk;
    ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_chk CHECK (role IN ('admin', 'staff'));
  `)
  const hash = await bcrypt.hash('old-admin-password-1', 4)
  const legacy = await db.query(
    `INSERT INTO admin_users (email, password_hash, role, token_version) VALUES ('owner@example.test', $1, 'admin', 3), ('viewer@example.test', 'x', 'staff', 1) RETURNING id, token_version`,
    [hash]
  )
  users.owner = legacy.rows[0]
  users.viewer = legacy.rows[1]
  const lead = (await db.query(`INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0101', 'Hola') RETURNING id`)).rows[0]
  users.leadId = lead.id
  await db.query("INSERT INTO lead_notes (submission_id, body) VALUES ($1, 'Called, left a message')", [lead.id])
  // A session issued before token_version existed (no tv claim) and one
  // issued the usual way, both before the upgrade.
  users.ownerCookieNow = `token=${jwt.sign({ id: users.owner.id, email: 'owner@example.test', tv: 3 }, process.env.JWT_SECRET)}`
  users.viewerCookieOld = `token=${jwt.sign({ id: users.viewer.id, email: 'viewer@example.test' }, process.env.JWT_SECRET)}`

  migrate()
  migrate() // twice: every deploy runs it

  staffCli = await import('./scripts/staff.js')
  const quiet = () => {}
  await staffCli.run(db, 'create', { email: 'yoletty@example.test', name: 'Yoletty', role: 'front_desk' }, quiet)
  await staffCli.run(db, 'create', { email: 'paralegal@example.test', name: 'Paula', role: 'billing_paralegal' }, quiet)
  for (const [key, email] of [['front', 'yoletty@example.test'], ['para', 'paralegal@example.test']]) {
    users[key] = (await db.query('SELECT id, token_version FROM admin_users WHERE email = $1', [email])).rows[0]
  }
  users.frontCookie = `token=${jwt.sign({ id: users.front.id, email: 'x', tv: users.front.token_version }, process.env.JWT_SECRET)}`
  users.paraCookie = `token=${jwt.sign({ id: users.para.id, email: 'x', tv: users.para.token_version }, process.env.JWT_SECRET)}`

  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('./app.js')
  const { createBillingRouter } = await import('./routes/billing.js')
  const { createWhatsappInboxRouter } = await import('./routes/whatsappInbox.js')
  const submissions = (await import('./routes/submissions.js')).default
  const auth = (await import('./routes/auth.js')).default
  const app = express()
  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))
  app.use('/api/auth', auth)
  app.use('/api/submissions', submissions)
  app.use('/api/billing', createBillingRouter({ env: { MONDAY_PROVIDER: 'mock', WHATSAPP_PROVIDER: 'mock' } }))
  app.use('/api/whatsapp', createWhatsappInboxRouter({ env: { WHATSAPP_SENDING_ENABLED: 'true' }, whatsappProvider: fakeSender('mock') }))
  // As production is today: the real sender configured, sending switched off.
  app.use('/api/whatsapp-off', createWhatsappInboxRouter({ env: { WHATSAPP_PROVIDER: 'meta' }, whatsappProvider: fakeSender('meta') }))
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
  return { status: res.status, json, text }
}

async function inbound(phone, text, { hoursAgo = 1, name = 'Cliente' } = {}) {
  const id = `wamid.IN.${phone}.${Math.random().toString(36).slice(2)}`
  await db.query(
    `INSERT INTO whatsapp_events (event_key, kind, wa_message_id, from_wa_id, contact_name, message_type, event_timestamp, payload)
     VALUES ($1, 'message', $2, $3, $4, 'text', NOW() - ($5 || ' hours')::interval, $6)`,
    [`message:${id}`, id, phone, name, String(hoursAgo), JSON.stringify({ text: { body: text } })]
  )
}

async function conversationFor(phone, cookie) {
  const list = await call('GET', '/api/whatsapp/conversations?view=open', { cookie })
  return list.json.find((c) => c.phone === phone)
}

test('staff roles and capabilities', { skip: SKIP }, async (t) => {
  await t.test('the upgrade keeps existing accounts, roles, sessions and notes', async () => {
    const rows = (await db.query('SELECT email, role, token_version FROM admin_users WHERE id = ANY($1) ORDER BY id', [[users.owner.id, users.viewer.id]])).rows
    assert.deepEqual(rows.map((r) => [r.email, r.role, r.token_version]), [['owner@example.test', 'admin', 3], ['viewer@example.test', 'staff', 1]])
    const owner = await call('GET', '/api/auth/verify', { cookie: users.ownerCookieNow })
    assert.equal(owner.status, 200, 'a session from before the upgrade still works')
    assert.equal(owner.json.role, 'admin')
    assert.ok(owner.json.capabilities.includes('billing.configure') && owner.json.capabilities.includes('whatsapp.send'), 'an admin can do everything')
    const viewer = await call('GET', '/api/auth/verify', { cookie: users.viewerCookieOld })
    assert.equal(viewer.status, 200, 'a token without a tv claim still counts as version 1')
    assert.deepEqual(viewer.json.capabilities, ['billing.status', 'billing.view', 'crm.export', 'crm.manage', 'crm.view'])
    const lead = await call('GET', `/api/submissions/${users.leadId}`, { cookie: users.viewerCookieOld })
    assert.equal(lead.json.notes[0].body, 'Called, left a message')
    assert.equal(lead.json.notes[0].author_name, null, 'notes from before have no author')
    const login = await call('POST', '/api/auth/login', { body: { email: 'owner@example.test', password: 'old-admin-password-1' } })
    assert.equal(login.status, 200, 'the old password still signs in')
  })

  await t.test('front desk: leads and WhatsApp, payment status read-only, nothing financial', async () => {
    const c = users.frontCookie
    const me = await call('GET', '/api/auth/verify', { cookie: c })
    assert.equal(me.json.name, 'Yoletty')
    assert.equal(me.json.role, 'front_desk')
    assert.equal((await call('GET', '/api/submissions', { cookie: c })).status, 200)
    assert.equal((await call('PATCH', `/api/submissions/${users.leadId}/status`, { cookie: c, body: { status: 'contacted' } })).status, 200)
    assert.equal((await call('GET', '/api/submissions/export/csv', { cookie: c })).status, 200)
    assert.equal((await call('GET', '/api/billing/invoices', { cookie: c })).status, 200, 'basic payment status')
    assert.equal((await call('GET', '/api/whatsapp/conversations', { cookie: c })).status, 200)
    for (const [m, p] of [
      ['GET', '/api/billing/overview'], ['GET', '/api/billing/invoices/1'], ['GET', '/api/billing/imports'],
      ['POST', '/api/billing/imports'], ['POST', '/api/billing/imports/1/approve'], ['GET', '/api/billing/matching'],
      ['POST', '/api/billing/monday/sync/preview'], ['PUT', '/api/billing/monday/config'], ['GET', '/api/billing/integrations'],
      ['GET', '/api/billing/reminders'], ['POST', '/api/billing/reminders/approve'], ['PUT', '/api/billing/reminders/settings'],
    ]) {
      assert.equal((await call(m, p, { cookie: c, body: {} })).status, 403, `${m} ${p}`)
    }
  })

  await t.test('billing paralegal: imports, sync, reminders, WhatsApp; leads read-only', async () => {
    const c = users.paraCookie
    for (const p of ['/api/billing/overview', '/api/billing/imports', '/api/billing/reminders', '/api/billing/integrations', '/api/submissions', `/api/submissions/${users.leadId}`, '/api/whatsapp/conversations']) {
      assert.equal((await call('GET', p, { cookie: c })).status, 200, p)
    }
    // Allowed actions reach the handler (which may then reject the body).
    for (const [m, p] of [['POST', '/api/billing/imports/999/approve'], ['POST', '/api/billing/monday/sync/preview'], ['POST', '/api/billing/reminders/approve'], ['POST', '/api/billing/matching/999']]) {
      assert.notEqual((await call(m, p, { cookie: c, body: { ids: [] } })).status, 403, `${m} ${p}`)
    }
    for (const [m, p, body] of [
      ['PATCH', `/api/submissions/${users.leadId}/status`, { status: 'closed' }],
      ['POST', `/api/submissions/${users.leadId}/notes`, { body: 'x' }],
      ['POST', `/api/submissions/${users.leadId}/reply`, { body: 'x' }],
      ['GET', '/api/submissions/export/csv'],
      ['PUT', '/api/billing/monday/config', {}], ['PUT', '/api/billing/reminders/settings', {}],
    ]) {
      assert.equal((await call(m, p, { cookie: c, body })).status, 403, `${m} ${p}`)
    }
  })

  await t.test('a capability granted or revoked takes effect on the next request', async () => {
    const quiet = () => {}
    assert.equal((await call('PUT', '/api/billing/reminders/settings', { cookie: users.paraCookie, body: {} })).status, 403)
    await staffCli.run(db, 'grant', { email: 'paralegal@example.test', capability: 'billing.configure' }, quiet)
    assert.notEqual((await call('PUT', '/api/billing/reminders/settings', { cookie: users.paraCookie, body: {} })).status, 403, 'now allowed')
    await staffCli.run(db, 'clear-overrides', { email: 'paralegal@example.test' }, quiet)
    assert.equal((await call('PUT', '/api/billing/reminders/settings', { cookie: users.paraCookie, body: {} })).status, 403)

    await staffCli.run(db, 'revoke', { email: 'yoletty@example.test', capability: 'crm.export' }, quiet)
    assert.equal((await call('GET', '/api/submissions/export/csv', { cookie: users.frontCookie })).status, 403)
    assert.equal((await call('GET', '/api/submissions', { cookie: users.frontCookie })).status, 200, 'only that one capability went')
    await staffCli.run(db, 'grant', { email: 'yoletty@example.test', capability: 'crm.export' }, quiet)
    assert.equal((await call('GET', '/api/submissions/export/csv', { cookie: users.frontCookie })).status, 200, 'a grant cancels the revoke')
    await assert.rejects(staffCli.run(db, 'grant', { email: 'yoletty@example.test', capability: 'billing.everything' }, quiet), /Unknown capability/)
  })

  await t.test('an account with no capabilities is refused by every staff route', async () => {
    const quiet = () => {}
    await staffCli.run(db, 'create', { email: 'nobody@example.test', role: 'staff' }, quiet)
    const nobody = (await db.query("SELECT id, token_version FROM admin_users WHERE email = 'nobody@example.test'")).rows[0]
    const { ALL_CAPABILITIES } = await import('./auth/capabilities.js')
    await db.query('UPDATE admin_users SET capability_revokes = $2 WHERE id = $1', [nobody.id, ALL_CAPABILITIES])
    const cookie = `token=${jwt.sign({ id: nobody.id, email: 'x', tv: nobody.token_version }, process.env.JWT_SECRET)}`

    const { createBillingRouter } = await import('./routes/billing.js')
    const { createWhatsappInboxRouter } = await import('./routes/whatsappInbox.js')
    const submissions = (await import('./routes/submissions.js')).default
    // Every route each router declares, so a route added later without a
    // capability fails here.
    const routesOf = (router, prefix) => router.stack.filter((l) => l.route).flatMap((l) =>
      Object.keys(l.route.methods).map((m) => [m.toUpperCase(), prefix + l.route.path.replace(/:[A-Za-z]+/g, '1')]))
    const PUBLIC = new Set(['POST /api/submissions/', 'POST /api/submissions/1/chat-message'])
    const all = [
      ...routesOf(createBillingRouter(), '/api/billing'),
      ...routesOf(createWhatsappInboxRouter(), '/api/whatsapp'),
      ...routesOf(submissions, '/api/submissions'),
    ].filter(([m, p]) => !PUBLIC.has(`${m} ${p}`))
    assert.ok(all.length > 50, `found ${all.length} routes`)
    for (const [m, p] of all) {
      assert.equal((await call(m, p, { cookie, body: {} })).status, 403, `${m} ${p}`)
    }
  })

  await t.test('disabling an account ends its sessions and stops sign-in', async () => {
    const quiet = () => {}
    const pw = 'nobody-password-123456'
    await db.query("UPDATE admin_users SET password_hash = $1 WHERE email = 'nobody@example.test'", [await bcrypt.hash(pw, 4)])
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.test', password: pw }) })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    assert.equal((await call('GET', '/api/auth/verify', { cookie })).status, 200)
    await staffCli.run(db, 'disable', { email: 'nobody@example.test' }, quiet)
    assert.equal((await call('GET', '/api/auth/verify', { cookie })).status, 401)
    assert.equal((await call('GET', '/api/whatsapp/assignees', { cookie })).status, 401)
    assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nobody@example.test', password: pw } })).status, 403)
    assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nobody@example.test', password: 'wrong-password-1' } })).status, 401, 'without the password, a disabled account looks like any failed login')
    await staffCli.run(db, 'enable', { email: 'nobody@example.test' }, quiet)
    assert.equal((await call('GET', '/api/auth/verify', { cookie })).status, 401, 'the session from before the disable stays ended')
    // Disabled straight in the database (no session bump): still refused.
    const fresh = (await db.query("SELECT id, token_version FROM admin_users WHERE email = 'nobody@example.test'")).rows[0]
    const freshCookie = `token=${jwt.sign({ id: fresh.id, email: 'x', tv: fresh.token_version }, process.env.JWT_SECRET)}`
    await db.query('UPDATE admin_users SET disabled_at = NOW() WHERE id = $1', [fresh.id])
    assert.equal((await call('GET', '/api/whatsapp/assignees', { cookie: freshCookie })).status, 401)
    assert.equal((await call('GET', '/api/auth/verify', { cookie: freshCookie })).status, 401)
    await db.query('UPDATE admin_users SET disabled_at = NULL WHERE id = $1', [fresh.id])
    // (A fresh sign-in is not repeated here: the login limiter allows five
    // attempts per address and this file uses all five.)
    const n = (await db.query("SELECT id, token_version FROM admin_users WHERE email = 'nobody@example.test'")).rows[0]
    assert.equal((await call('GET', '/api/auth/verify', { cookie: `token=${jwt.sign({ id: n.id, email: 'x', tv: n.token_version }, process.env.JWT_SECRET)}` })).status, 200, 'enabled again')
  })

  await t.test('the last administrator cannot be disabled', async () => {
    await db.query("UPDATE admin_users SET role = 'staff' WHERE role = 'admin' AND email <> 'owner@example.test'")
    await assert.rejects(staffCli.run(db, 'disable', { email: 'owner@example.test' }, () => {}), /last enabled administrator/)
  })

  await t.test('the script never takes a password as an argument; a generated one signs in', async () => {
    assert.throws(() => staffCli.parseArgs(['create', '--email', 'a@b.test', '--password', 'hunter2']), /not accepted on the command line/)
    const out = []
    await staffCli.run(db, 'reset-password', { email: 'paralegal@example.test' }, (l) => out.push(l))
    // The password is printed alone on its line: nothing to copy by mistake.
    const lines = out.join('\n').split('\n')
    const password = lines[lines.findIndex((l) => l.startsWith('Temporary password')) + 1]
    assert.match(password, /^[A-Za-z0-9_-]{24}$/)
    assert.equal((await call('GET', '/api/auth/verify', { cookie: users.paraCookie })).status, 401, 'a reset signs out open sessions')
    const login = await call('POST', '/api/auth/login', { body: { email: 'paralegal@example.test', password } })
    assert.equal(login.status, 200)
    assert.equal(login.json.role, 'billing_paralegal')
    const p = (await db.query("SELECT id, token_version FROM admin_users WHERE email = 'paralegal@example.test'")).rows[0]
    users.paraCookie = `token=${jwt.sign({ id: p.id, email: 'x', tv: p.token_version }, process.env.JWT_SECRET)}`
    const audit = (await db.query("SELECT action FROM billing_audit_events WHERE entity_type = 'admin_user' AND entity_id = $1 ORDER BY id", [String(p.id)])).rows.map((r) => r.action)
    assert.ok(audit.includes('staff.created') && audit.includes('staff.password_reset'), audit.join(','))
  })
})

test('shared WhatsApp inbox', { skip: SKIP }, async (t) => {
  const PHONE = '5215512345678'

  await t.test('both roles see the same conversation; legacy staff do not see WhatsApp', async () => {
    await inbound(PHONE, 'Hola, ¿ya llegó mi pago?', { name: 'María' })
    const front = await conversationFor(PHONE, users.frontCookie)
    const para = await conversationFor(PHONE, users.paraCookie)
    assert.ok(front && para)
    assert.equal(front.id, para.id)
    assert.equal(front.needsReply, true)
    assert.equal(front.preview, 'Hola, ¿ya llegó mi pago?')
    assert.equal((await call('GET', '/api/whatsapp/conversations', { cookie: users.viewerCookieOld })).status, 403)
  })

  await t.test('nothing is sent while sending is switched off', async () => {
    const conv = await conversationFor(PHONE, users.frontCookie)
    const before = sent.length
    const r = await call('POST', `/api/whatsapp-off/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body: { body: 'Hola María', clientKey: 'off-0000001' } })
    assert.equal(r.status, 409)
    assert.equal(r.json.code, 'sending_disabled')
    assert.equal(sent.length, before, 'the provider was never called')
    const detail = await call('GET', `/api/whatsapp-off/conversations/${conv.id}`, { cookie: users.frontCookie })
    assert.equal(detail.json.reply.allowed, false)
    assert.equal(detail.json.reply.code, 'sending_disabled')
  })

  await t.test('a reply records who sent it, claims the conversation, and is not sent twice', async () => {
    const conv = await conversationFor(PHONE, users.frontCookie)
    const body = { body: 'Hola María, sí, lo recibimos ayer.', clientKey: 'reply-0000001' }
    const r = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body })
    assert.equal(r.status, 201, r.text)
    assert.equal(r.json.message.by, 'Yoletty')
    const again = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body })
    assert.equal(again.status, 200)
    assert.equal(again.json.duplicate, true)
    assert.equal(sent.filter((s) => s.body === body.body).length, 1, 'one send for a double click')

    const seenByParalegal = await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: users.paraCookie })
    const out = seenByParalegal.json.messages.filter((m) => m.direction === 'out')
    assert.deepEqual(out.map((m) => [m.by, m.body, m.status]), [['Yoletty', body.body, 'sent']])
    assert.equal(seenByParalegal.json.assignee.name, 'Yoletty', 'answering an unassigned conversation claims it')
    const row = (await db.query('SELECT sent_by FROM wa_outbound_messages WHERE body = $1', [body.body])).rows[0]
    assert.equal(row.sent_by, users.front.id)
  })

  await t.test('internal notes and reassignment are shared and attributed', async () => {
    const conv = await conversationFor(PHONE, users.paraCookie)
    const note = await call('POST', `/api/whatsapp/conversations/${conv.id}/notes`, { cookie: users.paraCookie, body: { body: 'Payment matched to INV-1001.' } })
    assert.equal(note.status, 201)
    const assign = await call('PUT', `/api/whatsapp/conversations/${conv.id}/assignee`, { cookie: users.frontCookie, body: { accountId: users.para.id } })
    assert.equal(assign.status, 200)
    const detail = await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: users.frontCookie })
    assert.deepEqual(detail.json.notes.map((n) => [n.author, n.body]), [['Paula', 'Payment matched to INV-1001.']])
    assert.equal(detail.json.assignee.id, users.para.id)
    const mine = await call('GET', '/api/whatsapp/conversations?view=mine', { cookie: users.paraCookie })
    assert.ok(mine.json.some((c) => c.id === conv.id))
    const assignees = (await call('GET', '/api/whatsapp/assignees', { cookie: users.frontCookie })).json.map((a) => a.name)
    assert.ok(assignees.includes('Yoletty') && assignees.includes('Paula') && !assignees.includes('viewer'), assignees.join(','))
    const bad = await call('PUT', `/api/whatsapp/conversations/${conv.id}/assignee`, { cookie: users.frontCookie, body: { accountId: users.viewer.id } })
    assert.equal(bad.status, 400, 'cannot assign to someone who cannot read WhatsApp')
    const audit = (await db.query("SELECT actor_id, action FROM billing_audit_events WHERE entity_type = 'conversation' AND entity_id = $1 ORDER BY id", [String(conv.id)])).rows
    assert.deepEqual(audit.map((a) => [a.actor_id, a.action]), [[users.front.id, 'whatsapp.reply'], [users.para.id, 'whatsapp.note'], [users.front.id, 'whatsapp.assigned']])
  })

  await t.test('no free text more than 24 hours after the client last wrote', async () => {
    const phone = '15045550199'
    await inbound(phone, 'Gracias', { hoursAgo: 25 })
    const conv = await conversationFor(phone, users.frontCookie)
    const r = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body: { body: 'Hola', clientKey: 'late-0000001' } })
    assert.equal(r.status, 409)
    assert.equal(r.json.code, 'window_closed')
    await inbound(phone, 'Una pregunta más', { hoursAgo: 0 })
    const ok = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body: { body: 'Dígame', clientKey: 'late-0000002' } })
    assert.equal(ok.status, 201, 'writing again reopens the window')
  })

  await t.test('no reply to a client who opted out after they last wrote', async () => {
    const phone = '15045550177'
    await inbound(phone, 'STOP', { hoursAgo: 0 })
    const conv = await conversationFor(phone, users.frontCookie)
    const r = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body: { body: 'Hola', clientKey: 'stop-0000001' } })
    assert.equal(r.status, 409)
    assert.equal(r.json.code, 'opted_out')

    const phone2 = '15045550166'
    const client = (await db.query("INSERT INTO billing_clients (eimmigration_client_id, display_name) VALUES ('EIM-T-1', 'Rosa Prueba') RETURNING id")).rows[0]
    await inbound(phone2, '¿Cuánto debo?', { hoursAgo: 2 })
    await db.query(`INSERT INTO billing_client_contacts (client_id, phone_e164, opted_in_at, opted_out_at) VALUES ($1, $2, NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 hour')`, [client.id, phone2])
    const conv2 = await conversationFor(phone2, users.frontCookie)
    assert.equal(conv2.name, 'Rosa Prueba', 'linked to the billing client by number')
    const r2 = await call('POST', `/api/whatsapp/conversations/${conv2.id}/messages`, { cookie: users.frontCookie, body: { body: 'Hola', clientKey: 'stop-0000002' } })
    assert.equal(r2.json.code, 'opted_out')
  })

  await t.test('a Mexican number saved without the mobile 1 still links, and its opt-out still stops replies', async () => {
    const client = (await db.query("INSERT INTO billing_clients (eimmigration_client_id, display_name) VALUES ('EIM-T-MX', 'Lucía Prueba') RETURNING id")).rows[0]
    // Staff saved +52 33 1234 5678; Meta reports the sender as 5213312345678.
    await inbound('5213312345678', 'Hola, ¿me pueden llamar?', { hoursAgo: 3 })
    await db.query(`INSERT INTO billing_client_contacts (client_id, phone_e164, opted_in_at, opted_out_at) VALUES ($1, '523312345678', NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 hour')`, [client.id])
    const conv = await conversationFor('5213312345678', users.frontCookie)
    assert.equal(conv.name, 'Lucía Prueba')
    const detail = await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: users.frontCookie })
    assert.deepEqual(detail.json.clients.map((c) => [c.name, c.optedOut]), [['Lucía Prueba', true]])
    const r = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.frontCookie, body: { body: 'Hola', clientKey: 'mx-00000001' } })
    assert.equal(r.status, 409)
    assert.equal(r.json.code, 'opted_out')
  })

  await t.test('payment status beside a conversation only for billing.status', async () => {
    const conv = await conversationFor('15045550166', users.frontCookie)
    const withStatus = await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: users.frontCookie })
    assert.ok(Array.isArray(withStatus.json.invoices))
    await staffCli.run(db, 'revoke', { email: 'yoletty@example.test', capability: 'billing.status' }, () => {})
    const without = await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: users.frontCookie })
    assert.equal(without.json.invoices, null)
    const contacts = await call('GET', '/api/billing/contacts', { cookie: users.frontCookie })
    assert.ok(contacts.json.length && contacts.json.every((k) => k.owed === null), 'no amounts owed either')
    await staffCli.run(db, 'clear-overrides', { email: 'yoletty@example.test' }, () => {})
  })

  await t.test('a failed send is recorded as failed and does not claim the conversation', async () => {
    const phone = '15045550000'
    await inbound(phone, 'Hola', { hoursAgo: 0 })
    const conv = await conversationFor(phone, users.paraCookie)
    const r = await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { cookie: users.paraCookie, body: { body: 'Hola', clientKey: 'fail-0000001' } })
    assert.equal(r.status, 201)
    assert.equal(r.json.message.status, 'failed')
    const detail = await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: users.paraCookie })
    assert.equal(detail.json.assignee, null)
  })
})
