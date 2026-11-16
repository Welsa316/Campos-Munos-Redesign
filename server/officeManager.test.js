// The Office Manager role (server/auth/capabilities.js), end to end: the
// deploy that adds it, an administrator creating one on the Team tab, what
// the account can and cannot do through the real app's API, per-account
// overrides on top of it, and that every role and account that existed
// before keeps exactly what it had. Synthetic people and numbers.
//
// Uses its own database (<TEST_DATABASE_URL's name>_officemgr, created if
// missing). The name must contain "test"; the schema is dropped and rebuilt.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import pino from 'pino'
import jwt from 'jsonwebtoken'
import { ROLES, ADMIN_ONLY, resolveCapabilities } from './auth/capabilities.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_officemgr`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

// What each role resolved to before the Office Manager existed, copied from
// main at the time. Any change to an existing role fails here first.
const BEFORE = {
  admin: ['activity.view', 'billing.configure', 'billing.import', 'billing.reconcile', 'billing.reminders', 'billing.status', 'billing.sync', 'billing.view', 'calls.clear', 'calls.exclude', 'calls.place', 'calls.view', 'crm.export', 'crm.manage', 'crm.view', 'forms.test', 'integrations.manage', 'integrations.view', 'monday.configure', 'team.manage', 'whatsapp.contacts', 'whatsapp.manage', 'whatsapp.send', 'whatsapp.view'],
  staff: ['billing.status', 'billing.view', 'crm.export', 'crm.manage', 'crm.view'],
  front_desk: ['billing.status', 'calls.exclude', 'calls.place', 'calls.view', 'crm.export', 'crm.manage', 'crm.view', 'whatsapp.contacts', 'whatsapp.manage', 'whatsapp.send', 'whatsapp.view'],
  receptionist: ['calls.exclude', 'calls.place', 'calls.view', 'crm.view', 'whatsapp.manage', 'whatsapp.send', 'whatsapp.view'],
  billing_paralegal: ['billing.import', 'billing.reconcile', 'billing.reminders', 'billing.status', 'billing.sync', 'billing.view', 'whatsapp.contacts', 'whatsapp.manage', 'whatsapp.send', 'whatsapp.view'],
}
const OFFICE_MANAGER = ['calls.exclude', 'calls.place', 'calls.view', 'crm.manage', 'crm.view', 'whatsapp.manage', 'whatsapp.view']
const resolved = (role, grants, revokes) => [...resolveCapabilities({ role, grants, revokes })].sort()

test('every role that existed before resolves exactly as it did', () => {
  for (const [role, caps] of Object.entries(BEFORE)) assert.deepEqual(resolved(role), caps, role)
  assert.deepEqual(Object.keys(ROLES).sort(), [...Object.keys(BEFORE), 'office_manager'].sort(), 'one role added, none removed')
})

test('the Office Manager role is labelled and holds only the intake capabilities', () => {
  assert.equal(ROLES.office_manager.label, 'Office Manager')
  assert.deepEqual(resolved('office_manager'), OFFICE_MANAGER)
  const caps = resolveCapabilities({ role: 'office_manager' })
  for (const c of ['crm.export', 'whatsapp.send', 'whatsapp.contacts']) assert.ok(!caps.has(c), `${c} is withheld`)
  for (const c of caps) assert.ok(!c.startsWith('billing.'), `${c}: no billing`)
  for (const c of ADMIN_ONLY) assert.ok(!caps.has(c), `${c} is administrator-only`)
})

test('overrides apply on top of the Office Manager role; administrator-only grants never do', () => {
  assert.deepEqual(resolved('office_manager', ['whatsapp.send']), [...OFFICE_MANAGER, 'whatsapp.send'].sort())
  assert.deepEqual(resolved('office_manager', [], ['crm.manage']), OFFICE_MANAGER.filter((c) => c !== 'crm.manage'))
  assert.deepEqual(resolved('office_manager', [...ADMIN_ONLY, 'billing.view']), [...OFFICE_MANAGER, 'billing.view'].sort())
})

// --- Over HTTP, through the real app ------------------------------------------

let server, base, db, staffCli
const u = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'office-manager-test-secret-0123456789abcdef'
  process.env.NODE_ENV = 'test'
  delete process.env.RESEND_API_KEY // replies are stored; no email leaves the test
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

  // Production as it is today: the role constraint without office_manager,
  // and the firm's accounts, some with single-permission changes.
  await db.query(`ALTER TABLE admin_users DROP CONSTRAINT admin_users_role_chk;
    ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_chk CHECK (role IN ('admin', 'staff', 'front_desk', 'billing_paralegal', 'receptionist'))`)
  await assert.rejects(
    db.query("INSERT INTO admin_users (email, password_hash, role) VALUES ('early@example.test', 'x', 'office_manager')"),
    /admin_users_role_chk/, 'before the deploy the database refuses the role',
  )
  staffCli = await import('./scripts/staff.js')
  const pw = {}
  const keep = (who) => (line) => { const m = /^[A-Za-z0-9_-]{24}$/.exec(line.trim().split('\n').pop()); if (m) pw[who] = m[0] }
  await staffCli.run(db, 'create', { email: 'dev@example.test', name: 'Dev', role: 'admin' }, keep('dev'))
  await staffCli.run(db, 'create', { email: 'desk@example.test', name: 'Yoletty', role: 'front_desk' }, () => {})
  await staffCli.run(db, 'create', { email: 'recep@example.test', name: 'Rita', role: 'receptionist' }, () => {})
  await staffCli.run(db, 'create', { email: 'ciro@example.test', name: 'Ciro', role: 'receptionist' }, () => {})
  await staffCli.run(db, 'create', { email: 'para@example.test', name: 'Paula', role: 'billing_paralegal' }, () => {})
  await staffCli.run(db, 'create', { email: 'viewer@example.test', name: 'Viewer', role: 'staff' }, () => {})
  await staffCli.run(db, 'grant', { email: 'ciro@example.test', capability: 'crm.manage' }, () => {})
  await staffCli.run(db, 'revoke', { email: 'para@example.test', capability: 'billing.sync' }, () => {})
  u.pw = pw
  u.beforeDeploy = (await db.query('SELECT id, email, role, capability_grants, capability_revokes, token_version FROM admin_users ORDER BY id')).rows

  migrate() // the deploy

  const lead = await db.query("INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0101', 'Hola') RETURNING id")
  u.leadId = lead.rows[0].id
  u.callId = (await db.query(
    `INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key, is_primary)
     VALUES ('om-1', 'inbound', NOW() - INTERVAL '1 hour', 'other', 'not_answered', 99, 'account', '+15045550111', cm_phone_key('+15045550111'), TRUE) RETURNING id`,
  )).rows[0].id
  u.call2Id = (await db.query(
    `INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key, is_primary)
     VALUES ('om-2', 'inbound', NOW() - INTERVAL '2 hours', 'other', 'not_answered', 99, 'account', '+15045550112', cm_phone_key('+15045550112'), TRUE) RETURNING id`,
  )).rows[0].id
  const { recordEvent } = await import('./db/whatsappEvents.js')
  await recordEvent({
    key: 'message:wamid.OM.1', kind: 'message', messageId: 'wamid.OM.1', status: null, from: '15045550123', contactName: 'Cliente', recipient: null,
    messageType: 'text', phoneNumberId: null, displayPhoneNumber: null, wabaId: null, timestamp: new Date(Date.now() - 3600 * 1000), raw: { text: { body: 'Hola' } },
  })

  const { createApp, addFallbackHandlers } = await import('./app.js')
  const env = { NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET, WHATSAPP_PROVIDER: 'mock', WHATSAPP_SENDING_ENABLED: 'true' }
  server = addFallbackHandlers(createApp({ env, log: pino({ level: 'silent' }) })).listen(0)
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
  const res = await call('POST', '/api/auth/login', { body: { email, password } })
  assert.equal(res.status, 200, `${email} signs in`)
  return res.cookie
}
const capsOf = async (cookie) => (await call('GET', '/api/auth/verify', { cookie })).json.capabilities
const cookieFor = (row) => `token=${jwt.sign({ id: row.id, email: row.email, tv: row.token_version }, process.env.JWT_SECRET)}`

test('Office Manager over the API', { skip: SKIP }, async (t) => {
  await t.test('the deploy keeps every existing account, role and override, and their access', async () => {
    const after = (await db.query('SELECT id, email, role, capability_grants, capability_revokes, token_version FROM admin_users ORDER BY id')).rows
    assert.deepEqual(after, u.beforeDeploy)
    const expected = {
      'dev@example.test': BEFORE.admin,
      'desk@example.test': BEFORE.front_desk,
      'recep@example.test': BEFORE.receptionist,
      'ciro@example.test': [...BEFORE.receptionist, 'crm.manage'].sort(),
      'para@example.test': BEFORE.billing_paralegal.filter((c) => c !== 'billing.sync'),
      'viewer@example.test': BEFORE.staff,
    }
    for (const row of after) {
      const verify = await call('GET', '/api/auth/verify', { cookie: cookieFor(row) })
      assert.equal(verify.status, 200, `${row.email}'s session survives the deploy`)
      assert.deepEqual(verify.json.capabilities, expected[row.email], row.email)
    }
  })

  await t.test('an administrator sees the role on the Team tab and creates an Office Manager', async () => {
    u.dev = await signIn('dev@example.test', u.pw.dev)
    const team = await call('GET', '/api/team', { cookie: u.dev })
    const role = team.json.roles.find((r) => r.key === 'office_manager')
    assert.equal(role?.label, 'Office Manager')
    assert.deepEqual([...role.capabilities].sort(), OFFICE_MANAGER)

    const made = await call('POST', '/api/team', { cookie: u.dev, body: { email: 'om@example.test', name: 'Olga', role: 'office_manager' } })
    assert.equal(made.status, 201, made.text)
    assert.equal(made.json.account.role, 'office_manager')
    assert.equal(made.json.account.roleLabel, 'Office Manager')
    assert.deepEqual(made.json.account.capabilities, OFFICE_MANAGER)
    u.omId = made.json.account.id
    u.om = await signIn('om@example.test', made.json.password)
    const me = await call('GET', '/api/auth/verify', { cookie: u.om })
    assert.equal(me.json.role, 'office_manager')
    assert.deepEqual(me.json.capabilities, OFFICE_MANAGER)

    // An existing person can be moved to it, and back, from the Team tab.
    const recep = u.beforeDeploy.find((r) => r.email === 'recep@example.test')
    assert.equal((await call('PUT', `/api/team/${recep.id}/role`, { cookie: u.dev, body: { role: 'office_manager' } })).json.role, 'office_manager')
    assert.equal((await call('PUT', `/api/team/${recep.id}/role`, { cookie: u.dev, body: { role: 'receptionist' } })).json.role, 'receptionist')
    assert.deepEqual(await capsOf(cookieFor(recep)), BEFORE.receptionist)
  })

  await t.test('website leads: read, reply, status, read/archived and notes work', async () => {
    const id = u.leadId
    assert.equal((await call('GET', '/api/submissions', { cookie: u.om })).status, 200)
    assert.equal((await call('GET', `/api/submissions/${id}`, { cookie: u.om })).status, 200)
    assert.equal((await call('PATCH', `/api/submissions/${id}/read`, { cookie: u.om, body: { read: true } })).status, 200)
    const note = await call('POST', `/api/submissions/${id}/notes`, { cookie: u.om, body: { body: 'Llamó, dejó mensaje' } })
    assert.equal(note.status, 201, note.text)
    const status = await call('PATCH', `/api/submissions/${id}/status`, { cookie: u.om, body: { status: 'contacted' } })
    assert.equal(status.status, 200, status.text)
    const reply = await call('POST', `/api/submissions/${id}/reply`, { cookie: u.om, body: { body: 'Hola Ana, gracias por escribir.' } })
    assert.ok([200, 201].includes(reply.status), reply.text)
    assert.equal((await call('PATCH', `/api/submissions/${id}/archive`, { cookie: u.om, body: { archived: true } })).status, 200)
    const lead = (await call('GET', `/api/submissions/${id}`, { cookie: u.om })).json
    assert.equal(lead.is_archived, true)
    assert.equal(lead.status, 'contacted')
    assert.ok(lead.notes.some((n) => n.body === 'Llamó, dejó mensaje'), 'the note is on the lead')
    assert.ok(lead.replies.some((r) => r.body.includes('gracias por escribir')), 'the reply is on the lead')
    await call('PATCH', `/api/submissions/${id}/archive`, { cookie: u.om, body: { archived: false } })
  })

  await t.test('WhatsApp: read, assign and reassign, notes, close and reopen work', async () => {
    const list = await call('GET', '/api/whatsapp/conversations?view=open', { cookie: u.om })
    assert.equal(list.status, 200)
    const conv = list.json.find((c) => c.phone === '15045550123')
    assert.ok(conv, 'the conversation is listed')
    u.convId = conv.id
    assert.equal((await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: u.om })).status, 200)
    const people = await call('GET', '/api/whatsapp/assignees', { cookie: u.om })
    assert.equal(people.status, 200)
    const desk = u.beforeDeploy.find((r) => r.email === 'desk@example.test')
    assert.equal((await call('PUT', `/api/whatsapp/conversations/${conv.id}/assignee`, { cookie: u.om, body: { accountId: desk.id } })).status, 200)
    assert.equal((await call('PUT', `/api/whatsapp/conversations/${conv.id}/assignee`, { cookie: u.om, body: { accountId: u.omId } })).status, 200)
    assert.equal((await call('POST', `/api/whatsapp/conversations/${conv.id}/notes`, { cookie: u.om, body: { body: 'Revisar mañana' } })).status, 201)
    assert.equal((await call('PUT', `/api/whatsapp/conversations/${conv.id}/status`, { cookie: u.om, body: { status: 'closed' } })).status, 200)
    assert.equal((await call('PUT', `/api/whatsapp/conversations/${conv.id}/status`, { cookie: u.om, body: { status: 'open' } })).status, 200)
    const row = (await db.query('SELECT status, assigned_to FROM wa_conversations WHERE id = $1', [conv.id])).rows[0]
    assert.deepEqual(row, { status: 'open', assigned_to: u.omId })
    const detail = (await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: u.om })).json
    assert.equal(detail.billing ?? null, null, 'no payment status beside the conversation')
  })

  await t.test('calls: the log, refresh, RingOut and marking missed calls handled work', async () => {
    const calls = await call('GET', '/api/calls', { cookie: u.om })
    assert.equal(calls.status, 200)
    assert.ok(calls.json.calls.some((c) => c.id === Number(u.callId)), 'the missed call is listed')
    assert.equal((await call('GET', '/api/calls/summary', { cookie: u.om })).status, 200)
    // RingCentral is not set up in the test: past the permission check, the
    // server says so instead of refusing the account.
    assert.equal((await call('POST', '/api/calls/sync', { cookie: u.om })).json.code, 'not_configured')
    assert.equal((await call('GET', '/api/calls/ringout/me', { cookie: u.om })).status, 200)
    assert.equal((await call('POST', `/api/calls/${u.callId}/handled`, { cookie: u.om, body: { note: 'Called back from my mobile' } })).status, 200)
    assert.equal((await call('POST', `/api/calls/${u.call2Id}/exclusion`, { cookie: u.om, body: { reason: 'spam' } })).status, 200)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM rc_call_resolutions WHERE created_by = $1', [u.omId])).rows[0].n, 1)
    assert.equal((await call('DELETE', `/api/calls/${u.callId}/handled`, { cookie: u.om })).status, 200, 'and undo it')
  })

  await t.test('everything outside the role is refused by the API itself', async () => {
    const refused = [
      ['GET', '/api/submissions/export/csv'],
      // A complete, valid send: only the permission check stands in its way.
      ['POST', `/api/whatsapp/conversations/${u.convId}/messages`, { body: 'Hola', clientKey: '9b2c1d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e' }],
      ['GET', '/api/billing/contacts'],
      ['PUT', '/api/billing/contacts/1', { phone: '+15045550100' }],
      ['POST', '/api/billing/contacts/1/opt-in'],
      ['POST', '/api/billing/contacts/1/opt-out'],
      ['GET', '/api/billing/consent'],
      ['PUT', '/api/billing/consent', { mode: 'all' }],
      ['GET', '/api/billing/overview'],
      ['GET', '/api/billing/invoices'],
      ['GET', '/api/billing/imports'],
      ['GET', '/api/billing/reminders'],
      ['POST', '/api/billing/reminders/evaluate'],
      ['GET', '/api/billing/monday'],
      ['PUT', '/api/billing/monday/config', {}],
      ['GET', '/api/billing/integrations'],
      ['GET', '/api/integrations/ringcentral/status'],
      ['POST', '/api/integrations/ringcentral/connect'],
      ['GET', '/api/automation/health'],
      ['PUT', '/api/automation/flags/sms', { enabled: true }],
      ['GET', '/api/team'],
      ['POST', '/api/team', { email: 'x@example.test', name: 'X', role: 'admin' }],
      ['POST', `/api/team/${u.omId}/reset-password`],
      ['GET', '/api/activity'],
      ['GET', '/api/test-channel/forms'],
      ['GET', '/api/calls/handled/bulk'],
      ['POST', '/api/calls/handled/bulk', {}],
    ]
    for (const [method, path, body] of refused) {
      const res = await call(method, path, { cookie: u.om, body })
      assert.equal(res.status, 403, `${method} ${path} → ${res.status} ${res.text.slice(0, 120)}`)
    }
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wa_outbound_messages')).rows[0].n, 0, 'nothing was sent on WhatsApp')
  })

  await t.test('an Office Manager cannot raise their own access', async () => {
    for (const [path, body] of [
      [`/api/team/${u.omId}/role`, { role: 'admin' }],
      [`/api/team/${u.omId}/capabilities/team.manage`, { state: 'grant' }],
      [`/api/team/${u.omId}/capabilities/whatsapp.send`, { state: 'grant' }],
      [`/api/team/${u.omId}/capabilities/crm.export`, { state: 'grant' }],
    ]) assert.equal((await call('PUT', path, { cookie: u.om, body })).status, 403, path)
    assert.equal((await call('POST', `/api/team/${u.omId}/clear-overrides`, { cookie: u.om })).status, 403)
    const row = (await db.query('SELECT role, capability_grants, capability_revokes FROM admin_users WHERE id = $1', [u.omId])).rows[0]
    assert.deepEqual(row, { role: 'office_manager', capability_grants: [], capability_revokes: [] })
    assert.deepEqual(await capsOf(u.om), OFFICE_MANAGER)
  })

  await t.test('per-account overrides work on an Office Manager, and administrator-only ones are refused', async () => {
    const set = (cap, state) => call('PUT', `/api/team/${u.omId}/capabilities/${cap}`, { cookie: u.dev, body: { state } })
    assert.equal((await set('whatsapp.send', 'grant')).status, 200)
    const sent = await call('POST', `/api/whatsapp/conversations/${u.convId}/messages`, { cookie: u.om, body: { body: 'Hola, le llamamos hoy.', clientKey: '3f0e6c1a-2b4d-4c8e-9a7f-1d2e3f4a5b6c' } })
    assert.notEqual(sent.status, 403, 'a granted capability applies on the next request')

    assert.equal((await set('crm.manage', 'revoke')).status, 200)
    assert.equal((await call('PATCH', `/api/submissions/${u.leadId}/status`, { cookie: u.om, body: { status: 'new' } })).status, 403)
    assert.equal((await call('GET', `/api/submissions/${u.leadId}`, { cookie: u.om })).status, 200, 'reading is untouched')

    const admin = await set('team.manage', 'grant')
    assert.ok(admin.status >= 400 && admin.status < 500, `team.manage cannot be granted to one account (${admin.status})`)
    // Written straight into the database, it still grants nothing.
    await db.query("UPDATE admin_users SET capability_grants = array_append(capability_grants, 'team.manage') WHERE id = $1", [u.omId])
    assert.equal((await call('GET', '/api/team', { cookie: u.om })).status, 403)

    assert.equal((await call('POST', `/api/team/${u.omId}/clear-overrides`, { cookie: u.dev })).status, 200)
    assert.deepEqual(await capsOf(u.om), OFFICE_MANAGER, 'back to exactly the role')
  })

  await t.test('staff.js assigns the role from the command line', async () => {
    await staffCli.run(db, 'set-role', { email: 'viewer@example.test', role: 'office_manager' }, () => {})
    const row = (await db.query("SELECT id, email, role, token_version FROM admin_users WHERE email = 'viewer@example.test'")).rows[0]
    assert.equal(row.role, 'office_manager')
    assert.deepEqual(await capsOf(cookieFor(row)), OFFICE_MANAGER)
    await staffCli.run(db, 'set-role', { email: 'viewer@example.test', role: 'staff' }, () => {})
    assert.deepEqual(await capsOf(cookieFor(row)), BEFORE.staff)
  })
})
