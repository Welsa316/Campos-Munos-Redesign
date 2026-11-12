// Test automation mode (testChannel/automation.js, routes/testChannel.js)
// over real HTTP and a real Postgres: an administrator rehearses the lead
// automation on a test form. What is proven here is mostly what does NOT
// happen: no lead, job, message, reminder, notification, activity row or
// status outside the test tables changes; the one real email goes only to
// the test's own address, marked as a test; text messages never go anywhere.
// Synthetic people only; email goes to a fake mailer.
//
// Own database: <TEST_DATABASE_URL's name>_testautomation (created if
// missing; must contain "test"; schema dropped and rebuilt).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
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
const DB_NAME = `${baseName}_testautomation`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const PROXY_SECRET = 'testautomation-proxy-secret-0123456789'

// "Production" only inside this object: it is what lets the one email leave.
const RUN_ENV = { NODE_ENV: 'production', TEST_AUTOMATION_ENABLED: 'true', RESEND_FROM_EMAIL: 'contact@firm.example', ADMIN_EMAIL: 'office@firm.example' }
const MIN = 60 * 1000

let server, base, db, A, mintTestToken, saveSection
const ids = {}
const cookies = {}
let ipCounter = 0

// The fake mailer: what would have gone to Resend.
const sent = []
let mailerAnswer = () => ({ ok: true, id: `fake-${sent.length}` })
const mailer = { async send(m) { sent.push(m); return mailerAnswer(m) } }

// The fake RingCentral: what would have been texted, and what it answers.
const texts = []
const FIRM_NUMBER = '+15045550100'
let smsAnswer = () => ({ ok: true, id: `text-${texts.length}`, status: 'Queued' })
let smsCapability = { available: true, sender: FIRM_NUMBER, reason: null }
let smsWait = null
const sms = { capability: async () => smsCapability, backoffUntil: async () => smsWait, send: async (m) => { texts.push(m); return smsAnswer(m) } }

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'testautomation-secret-0123456789abcdef'
  process.env.NODE_ENV = 'test'
  process.env.TEST_AUTOMATION_ENABLED = 'true'
  delete process.env.RESEND_API_KEY

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
  for (const [k, email, role] of [['admin', 'dev@firm.example', 'admin'], ['desk', 'desk@firm.example', 'front_desk']]) {
    await staffCli.run(db, 'create', { email, name: k, role }, () => {})
    const me = (await db.query('SELECT id, token_version FROM admin_users WHERE email = $1', [email])).rows[0]
    ids[k] = me.id
    cookies[k] = `token=${jwt.sign({ id: me.id, email, tv: me.token_version }, process.env.JWT_SECRET)}`
  }

  A = await import('./testChannel/automation.js')
  ;({ mintTestToken } = await import('./testChannel/token.js'))
  ;({ saveSection } = await import('./automation/settings.js'))
  const { createApp, addFallbackHandlers } = await import('./app.js')
  const env = { NODE_ENV: 'test', TEST_AUTOMATION_ENABLED: 'true', JWT_SECRET: process.env.JWT_SECRET, SITE_PROXY_SECRET: PROXY_SECRET, PUBLIC_ORIGINS: 'https://site.example' }
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
const asAdmin = (method, path, body) => call(method, path, { body, cookie: cookies.admin })
const count = async (table, where = 'TRUE') => (await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0].n
const settle = () => new Promise((r) => setTimeout(r, 250))

async function reset() {
  await db.query('TRUNCATE submissions, test_submissions, test_automation_events, test_automation_prefs, account_notifications, automation_settings, automation_suppressions RESTART IDENTITY CASCADE')
  sent.length = 0
  mailerAnswer = () => ({ ok: true, id: `fake-${sent.length}` })
  texts.length = 0
  smsAnswer = () => ({ ok: true, id: `text-${texts.length}`, status: 'Queued' })
  smsCapability = { available: true, sender: FIRM_NUMBER, reason: null }
  smsWait = null
}

// Real leads the tests must never touch.
async function seedLeads() {
  await db.query(
    `INSERT INTO submissions (first_name, last_name, email, phone, message, status)
     VALUES ('Ana', 'Cliente', 'ana.cliente@example.test', '504-555-0101', 'Consulta real', 'new'),
            ('Luis', 'Cliente', 'luis.cliente@example.test', '504-555-0102', 'Otra consulta', 'contacted')`
  )
}

/** A test form made in the portal, with its automation test started at `now`. */
async function start({ now = new Date(), email = 'tester@example.test', phone = '504-555-0177', language = 'es', smsConsent = true, timing = 'accelerated', sendEmail = true, sendSms = false, notifyMe = false, by = ids.admin, ...rest } = {}) {
  const testId = await A.createPortalTest(db, { firstName: 'Prueba', lastName: 'Uno', email, phone, language, smsConsent }, { sentBy: by })
  const r = await A.startTestRun(db, { testId, by, timing, sendEmail, sendSms, notifyMe, now, env: RUN_ENV, ...rest })
  return { testId, ...r }
}
const tick = (now, extra = {}) => A.runDueTestSteps(db, { now, mailer, sms, env: RUN_ENV, ...extra })
const steps = async (testId) => Object.fromEntries((await A.describeTestRun(db, testId)).steps.map((s) => [s.type, s.outcome ? `${s.state}:${s.outcome}` : s.state]))
const events = async (testId) => (await A.describeTestRun(db, testId)).events
const status = async (testId) => (await A.describeTestRun(db, testId)).leadStatus

/** Every row of every table that is not a test table, as a fingerprint. */
async function everythingElse() {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'test\\_%' ORDER BY 1")).rows.map((r) => r.tablename)
  const out = {}
  for (const t of tables) {
    const r = (await db.query(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(md5(x::text), '' ORDER BY md5(x::text)), '')) AS sum FROM "${t}" x`)).rows[0]
    out[t] = `${r.n}:${r.sum}`
  }
  return out
}

// --- who may use it ---------------------------------------------------------------------

test('test automation is the administrator’s alone', { skip: SKIP }, async () => {
  await reset()
  const { testId } = await start()
  for (const [method, path, body] of [
    ['GET', '/api/test-channel/automation'],
    ['PUT', '/api/test-channel/automation/prefs', { autoStart: true, timing: 'accelerated' }],
    ['POST', '/api/test-channel/automation/tests', { firstName: 'X', email: 'x@example.test' }],
    ['POST', `/api/test-channel/${testId}/automation`, {}],
    ['POST', `/api/test-channel/${testId}/automation/actions`, { action: 'mark_closed' }],
  ]) {
    assert.equal((await call(method, path, { body })).status, 401, `${method} ${path} signed out`)
    assert.equal((await call(method, path, { body, cookie: cookies.desk })).status, 403, `${method} ${path} as front desk`)
  }
  assert.equal(await status(testId), 'new', 'the refused action changed nothing')
})

// --- the whole sequence, and that nothing else moves --------------------------------------

test('accelerated: acknowledgment at once, a follow-up at 1 and 2 minutes, escalation at 3 and 4, No response at 5', { skip: SKIP }, async () => {
  await reset()
  await seedLeads()
  const before_ = await everythingElse()
  const T0 = new Date('2026-11-14T03:00:00Z') // a Friday night: test timing ignores office and texting hours
  const { testId } = await start({ now: T0 })

  // At once: the email really goes, the text is only shown.
  await tick(T0)
  assert.deepEqual(await steps(testId), {
    ack_email: 'done:sent', ack_sms: 'done:simulated', 'followup:followup_1': 'pending', 'followup:followup_2': 'pending',
    escalation_1: 'pending', escalation_2: 'pending', no_response: 'pending',
  })
  // Not a second early.
  await tick(new Date(T0.getTime() + MIN - 1000))
  assert.equal((await steps(testId))['followup:followup_1'], 'pending')
  await tick(new Date(T0.getTime() + MIN))
  assert.equal((await steps(testId))['followup:followup_1'], 'done:simulated')
  assert.equal((await steps(testId))['followup:followup_2'], 'pending')
  await tick(new Date(T0.getTime() + 2 * MIN))
  assert.equal((await steps(testId))['followup:followup_2'], 'done:simulated')
  assert.equal((await steps(testId)).escalation_1, 'pending')
  await tick(new Date(T0.getTime() + 3 * MIN))
  assert.equal((await steps(testId)).escalation_1, 'done:level_1')
  assert.equal((await steps(testId)).escalation_2, 'pending')
  await tick(new Date(T0.getTime() + 4 * MIN))
  assert.equal((await steps(testId)).escalation_2, 'done:level_2')
  assert.equal(await status(testId), 'new')
  await tick(new Date(T0.getTime() + 5 * MIN))
  assert.equal((await steps(testId)).no_response, 'done:no_response')
  assert.equal(await status(testId), 'no_response')
  const run = await A.describeTestRun(db, testId)
  assert.ok(run.endedAt, 'the test is over')
  assert.equal(run.escalationLevel, 2)

  // What was sent and what was only shown, in order.
  assert.deepEqual(run.events.map((e) => [e.kind, e.step, e.channel]), [
    ['started', null, null],
    ['sent', 'ack_email', 'email'],
    ['simulated', 'ack_sms', 'sms'],
    ['simulated', 'followup:followup_1', 'sms'],
    ['simulated', 'followup:followup_2', 'sms'],
    ['simulated', 'escalation_1', null],
    ['simulated', 'escalation_2', null],
    ['status', null, null],
  ])
  assert.deepEqual(run.events.at(-1).detail, { from: 'new', to: 'no_response', reason: 'follow_up_sequence_completed', auto: true })
  const shownTexts = run.events.filter((e) => e.channel === 'sms')
  assert.ok(shownTexts.every((e) => e.recipient === '504-555-0177' && /STOP/.test(e.body) && e.detail.reason === 'texts_not_requested'))
  assert.match(shownTexts[1].body, /seguimos atentos/, 'the firm’s own follow-up wording, in the form’s language')
  assert.deepEqual(run.events.filter((e) => e.step?.startsWith('escalation')).map((e) => e.detail.notified), ['nobody', 'nobody'])

  // Texts were not asked for in this test: RingCentral was never called.
  assert.equal(texts.length, 0)

  // Exactly one email, to the test's own address, marked as a test.
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'tester@example.test')
  assert.match(sent[0].subject, /^\[TEST\] Recibimos su mensaje/)
  assert.ok(sent[0].html.includes('TEST MODE — NO PRODUCTION ACTIONS') && sent[0].text.startsWith('TEST MODE — NO PRODUCTION ACTIONS'))
  assert.match(sent[0].text, /Hola Prueba:/)
  assert.equal(sent[0].replyTo, 'dev@firm.example', 'a reply goes to the administrator, never to the office inbox')
  assert.notEqual(sent[0].replyTo, RUN_ENV.ADMIN_EMAIL)

  // And nothing outside the test tables moved: no lead, job, message,
  // notification, reminder, activity row or status.
  assert.deepEqual(await everythingElse(), before_)
  assert.deepEqual((await db.query('SELECT status FROM submissions ORDER BY id')).rows.map((r) => r.status), ['new', 'contacted'])
})

test('through the portal: start, watch, press the buttons; the staff activity log and the leads stay as they were', { skip: SKIP }, async () => {
  await reset()
  await seedLeads()
  const before_ = await everythingElse()

  const made = await asAdmin('POST', '/api/test-channel/automation/tests', { firstName: 'Marta', email: 'marta.test@example.test', phone: '504-555-0166', language: 'en', smsConsent: true, timing: 'accelerated', sendEmail: true })
  assert.equal(made.status, 201, made.text)
  const id = made.json.id
  await tick(new Date())
  const open = await asAdmin('GET', `/api/test-channel/${id}`)
  assert.equal(open.json.source, 'portal')
  assert.equal(open.json.automation.steps.find((s) => s.type === 'ack_email').outcome, 'sent')
  assert.match(sent[0].subject, /^\[TEST\] We received your message/, 'English, as the test asked')

  const overview = await asAdmin('GET', '/api/test-channel/automation')
  assert.equal(overview.json.banner, 'TEST MODE — NO PRODUCTION ACTIONS')
  assert.deepEqual(overview.json.pending.map((p) => [p.testId, p.pending, p.nextStep]), [[id, 5, 'followup:followup_1']])
  assert.deepEqual(overview.json.schedules.accelerated.map((s) => Math.round((new Date(s.dueAt) - new Date(overview.json.schedules.now)) / 1000)), [0, 0, 60, 120, 180, 240, 300])
  assert.ok(overview.json.history.some((e) => e.kind === 'sent' && e.testId === id && e.testName === 'Marta'))

  // "Run the next step now" instead of waiting a minute.
  assert.equal((await asAdmin('POST', `/api/test-channel/${id}/automation/actions`, { action: 'run_next' })).status, 200)
  await tick(new Date())
  assert.equal((await steps(id))['followup:followup_1'], 'done:simulated')
  // Booked: everything left stops, and the test's own status says Scheduled.
  const booked = await asAdmin('POST', `/api/test-channel/${id}/automation/actions`, { action: 'consultation_booked' })
  assert.equal(booked.json.automation.leadStatus, 'scheduled')
  assert.ok(booked.json.automation.steps.filter((s) => !s.type.startsWith('ack') && s.type !== 'followup:followup_1').every((s) => s.state === 'cancelled' && s.outcome === 'consultation_booked'))
  assert.equal((await asAdmin('POST', `/api/test-channel/${id}/automation/actions`, { action: 'nonsense' })).status, 400)
  assert.equal((await asAdmin('POST', `/api/test-channel/${id}/automation/actions`, { action: 'run_next' })).status, 409, 'nothing left to run')
  await tick(new Date(Date.now() + 10 * MIN))
  assert.equal(sent.length, 1)

  assert.deepEqual(await everythingElse(), before_, 'nothing outside the test tables moved')
  assert.equal(await count('staff_activity', "source = 'portal'"), 0, 'test actions are in the test history, not the staff activity log')
})

// --- the sequence stops when it should ---------------------------------------------------

test('a reply stops the follow-ups but not the escalation; a booking or a changed status stops everything', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')

  // Client replied (the firm's default: the status does not move on a reply).
  const a = await start({ now: T0, email: 'a@example.test' })
  await tick(T0)
  await A.testAction(db, { testId: a.testId, action: 'client_replied', by: ids.admin, now: T0, env: RUN_ENV })
  await tick(new Date(T0.getTime() + 10 * MIN))
  assert.deepEqual(await steps(a.testId), {
    ack_email: 'done:sent', ack_sms: 'done:simulated',
    'followup:followup_1': 'cancelled:client_replied_by_text', 'followup:followup_2': 'cancelled:client_replied_by_text', no_response: 'cancelled:client_replied_by_text',
    escalation_1: 'done:level_1', escalation_2: 'done:level_2',
  })
  assert.equal(await status(a.testId), 'new', 'a reply still needs a person')

  // With the firm's setting on, a reply also means Contacted, and then nothing is left.
  await saveSection(db, 'status', { contactedOnClientReply: true, connectedCallSeconds: 60 }, { actorId: ids.admin })
  const b = await start({ now: T0, email: 'b@example.test' })
  await tick(T0)
  await A.testAction(db, { testId: b.testId, action: 'client_replied', by: ids.admin, now: T0, env: RUN_ENV })
  await tick(new Date(T0.getTime() + 10 * MIN))
  assert.equal(await status(b.testId), 'contacted')
  assert.equal((await steps(b.testId)).escalation_1, 'cancelled:status_contacted')
  await db.query('TRUNCATE automation_settings')

  // Marked closed by a person.
  const c = await start({ now: T0, email: 'c@example.test' })
  await tick(new Date(T0.getTime() + MIN))
  await A.testAction(db, { testId: c.testId, action: 'mark_closed', by: ids.admin, now: new Date(T0.getTime() + MIN), env: RUN_ENV })
  await tick(new Date(T0.getTime() + 10 * MIN))
  const cs = await steps(c.testId)
  assert.equal(cs['followup:followup_1'], 'done:simulated')
  assert.deepEqual([cs['followup:followup_2'], cs.escalation_1, cs.escalation_2, cs.no_response], Array(4).fill('cancelled:status_closed'))
  assert.equal(await status(c.testId), 'closed')
  assert.ok((await A.describeTestRun(db, c.testId)).endedAt)
  const log = (await events(c.testId)).filter((e) => ['action', 'status', 'cancelled'].includes(e.kind))
  assert.deepEqual(log.map((e) => [e.kind, e.detail.action || e.detail.to || e.detail.reason, e.by]), [['action', 'mark_closed', 'admin'], ['status', 'closed', 'admin'], ['cancelled', 'status_closed', 'admin']])
})

test('every step looks at its test again right before acting', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  const { testId } = await start({ now: T0 })
  // The status changed behind the queue's back (no button, so nothing was cancelled).
  await db.query("UPDATE test_automation_runs SET lead_status = 'closed' WHERE test_submission_id = $1", [testId])
  await tick(new Date(T0.getTime() + 10 * MIN))
  assert.ok(Object.values(await steps(testId)).every((s) => s === 'cancelled:status_closed'), JSON.stringify(await steps(testId)))
  assert.equal(sent.length, 0, 'not even the acknowledgment')
})

test('without agreement to be texted, no text is shown as sent and the test never reaches No response', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  const { testId } = await start({ now: T0, smsConsent: false })
  await tick(new Date(T0.getTime() + 10 * MIN))
  assert.deepEqual(await steps(testId), {
    ack_email: 'done:sent', ack_sms: 'skipped:no_sms_consent', 'followup:followup_1': 'skipped:no_sms_consent', 'followup:followup_2': 'skipped:no_sms_consent',
    escalation_1: 'done:level_1', escalation_2: 'done:level_2', no_response: 'skipped:sequence_not_completed',
  })
  assert.equal(await status(testId), 'new')
  assert.equal((await events(testId)).filter((e) => e.channel === 'sms' && e.body).length, 0)
})

// --- where the one real email may go -------------------------------------------------------

test('the email is real only when asked for, configured, allowed here and not opted out', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  const reason = async (testId) => (await events(testId)).find((e) => e.step === 'ack_email')

  const off = await start({ now: T0, email: 'off@example.test', sendEmail: false })
  await tick(T0)
  assert.deepEqual([(await reason(off.testId)).kind, (await reason(off.testId)).detail.reason], ['simulated', 'email_not_requested'])
  assert.match((await reason(off.testId)).body, /Hola Prueba:/, 'still shown, word for word')

  const noMailer = await start({ now: T0, email: 'nomailer@example.test' })
  await A.runDueTestSteps(db, { now: T0, mailer: null, env: RUN_ENV })
  assert.equal((await reason(noMailer.testId)).detail.reason, 'email_not_configured')

  // A developer machine: not production, and the address is on no allowlist.
  const dev = await start({ now: T0, email: 'dev-box@example.test' })
  await A.runDueTestSteps(db, { now: T0, mailer, env: { TEST_AUTOMATION_ENABLED: 'true', REMINDER_EMAIL_ALLOWLIST: 'tech@firm.example' } })
  assert.equal((await reason(dev.testId)).detail.reason, 'not_production')

  // The firm's opt-out list is honoured even by a test.
  await db.query("INSERT INTO automation_suppressions (channel, address_key, reason, source) VALUES ('email', 'optout@example.test', 'opt_out', 'staff')")
  const out = await start({ now: T0, email: 'optout@example.test' })
  await tick(T0)
  assert.equal((await reason(out.testId)).detail.reason, 'opted_out')

  assert.equal(sent.length, 0)
})

test('an address a lead also has needs a person to confirm it; from the website it is held back', { skip: SKIP }, async () => {
  await reset()
  await seedLeads()
  // From the portal: refused, and no test form is left behind.
  const refused = await asAdmin('POST', '/api/test-channel/automation/tests', { firstName: 'Ana', email: 'Ana.Cliente@example.test', sendEmail: true })
  assert.equal(refused.status, 409)
  assert.equal(refused.json.code, 'address_on_a_lead')
  assert.equal(refused.json.leads, 1)
  assert.equal(await count('test_submissions'), 0)
  // Shown only: no confirmation needed, nothing can be sent.
  const shown = await asAdmin('POST', '/api/test-channel/automation/tests', { firstName: 'Ana', email: 'ana.cliente@example.test', sendEmail: false })
  assert.equal(shown.status, 201)
  await tick(new Date())
  assert.equal(sent.length, 0)

  // From the website, with tests set to start on their own: held back, not refused.
  await asAdmin('PUT', '/api/test-channel/automation/prefs', { autoStart: true, timing: 'accelerated', sendEmail: true, notifyMe: false })
  const me = (await db.query('SELECT id, token_version FROM admin_users WHERE id = $1', [ids.admin])).rows[0]
  const { token } = mintTestToken({ accountId: me.id, tokenVersion: me.token_version })
  const form = { firstName: 'Luis', lastName: 'Cliente', email: 'luis.cliente@example.test', phone: '504-555-0102', message: 'Prueba', consultationType: 'daca', location: 'MX', language: 'es', testToken: token }
  const viaSite = await call('POST', '/api/submissions', { body: form })
  assert.equal(viaSite.status, 201, viaSite.text)
  await settle()
  await tick(new Date())
  const held = await A.describeTestRun(db, viaSite.json.id)
  assert.equal(held.sendEmail, false)
  assert.equal(held.events[0].detail.emailHeld, 'address_on_a_lead')
  assert.equal(sent.length, 0, 'nothing went to an address that belongs to a lead')

  // Confirmed once by the administrator: sent, and remembered for next time.
  const ok = await asAdmin('POST', '/api/test-channel/automation/tests', { firstName: 'Luis', email: 'luis.cliente@example.test', sendEmail: true, confirmKnown: true })
  assert.equal(ok.status, 201, ok.text)
  await tick(new Date())
  assert.deepEqual(sent.map((m) => m.to), ['luis.cliente@example.test'])
  const again = await asAdmin('POST', '/api/test-channel/automation/tests', { firstName: 'Luis', email: 'luis.cliente@example.test', sendEmail: true })
  assert.equal(again.status, 201, 'no second question for the same address')
  assert.equal(await count('submissions'), 2, 'and still no lead was made or changed')
})

test('a failed or interrupted send is never tried again, and two runners never send twice', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')

  mailerAnswer = () => ({ ok: false, error: 'validation_error: bad address' })
  const failed = await start({ now: T0, email: 'fails@example.test' })
  await tick(T0)
  await tick(new Date(T0.getTime() + 30 * 1000))
  assert.equal((await steps(failed.testId)).ack_email, 'failed:send_failed')
  assert.equal(sent.length, 1, 'tried once')
  assert.equal((await events(failed.testId)).find((e) => e.kind === 'failed').detail.error, 'validation_error: bad address')

  // Cut off mid-send (the process died): marked failed, not sent again.
  mailerAnswer = () => ({ ok: true, id: 'x' })
  sent.length = 0
  const cut = await start({ now: T0, email: 'cut@example.test' })
  await db.query("UPDATE test_automation_steps s SET state = 'running', started_at = $2 FROM test_automation_runs r WHERE r.id = s.run_id AND r.test_submission_id = $1 AND s.type = 'ack_email'", [cut.testId, T0])
  await tick(new Date(T0.getTime() + 30 * 1000))
  assert.equal((await steps(cut.testId)).ack_email, 'running', 'given two minutes to finish')
  await tick(new Date(T0.getTime() + 3 * MIN))
  assert.equal((await steps(cut.testId)).ack_email, 'failed:interrupted')
  assert.equal(sent.filter((m) => m.to === 'cut@example.test').length, 0)

  // Two server instances at the same moment.
  sent.length = 0
  const both = await start({ now: T0, email: 'both@example.test' })
  await Promise.all([tick(T0), tick(T0), tick(T0)])
  assert.equal(sent.filter((m) => m.to === 'both@example.test').length, 1)
  assert.equal((await events(both.testId)).filter((e) => e.kind === 'sent').length, 1)
})

// --- the website, notifications, timing, reset ------------------------------------------------

test('a test form from the website starts its automation only when the administrator asked for that', { skip: SKIP }, async () => {
  await reset()
  const me = (await db.query('SELECT id, token_version FROM admin_users WHERE id = $1', [ids.admin])).rows[0]
  const { token } = mintTestToken({ accountId: me.id, tokenVersion: me.token_version })
  const form = (email) => ({ firstName: 'Rosa', lastName: 'Prueba', email, phone: '504-555-0123', message: 'Probando', consultationType: 'daca', location: 'MX', language: 'en', smsConsent: true, testToken: token })

  const quiet = await call('POST', '/api/submissions', { body: form('quiet@example.test') })
  await settle()
  assert.equal(await A.describeTestRun(db, quiet.json.id), null, 'off by default')

  assert.equal((await asAdmin('PUT', '/api/test-channel/automation/prefs', { autoStart: true, timing: 'accelerated', sendEmail: true, notifyMe: false })).status, 200)
  const loud = await call('POST', '/api/submissions', { body: form('loud@example.test') })
  await settle()
  await tick(new Date())
  const run = await A.describeTestRun(db, loud.json.id)
  assert.equal(run.timing, 'accelerated')
  assert.deepEqual(sent.map((m) => [m.to, /^\[TEST\] We received/.test(m.subject)]), [['loud@example.test', true]])
  assert.equal(run.events.find((e) => e.step === 'ack_sms').kind, 'simulated', 'the form’s own agreement to texts is used')
  assert.equal(await count('submissions'), 0, 'still not a lead')

  // Started by hand on the one that arrived quietly.
  const byHand = await asAdmin('POST', `/api/test-channel/${quiet.json.id}/automation`, { timing: 'accelerated', sendEmail: false })
  assert.equal(byHand.status, 201)
  assert.equal(byHand.json.created, true)
  assert.equal((await asAdmin('POST', `/api/test-channel/${quiet.json.id}/automation`, {})).json.created, false, 'one automation test per test form')
})

test('the escalation notice goes to nobody, or only to the administrator who asked for it', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  const silent = await start({ now: T0, email: 's@example.test' })
  const mine = await start({ now: T0, email: 'm@example.test', notifyMe: true })
  await tick(new Date(T0.getTime() + 4 * MIN))
  const notes = (await db.query('SELECT account_id, title, body, url FROM account_notifications ORDER BY id')).rows
  assert.deepEqual(notes.map((n) => n.account_id), [ids.admin, ids.admin], 'two levels, both to the administrator only')
  assert.ok(notes.every((n) => n.title.startsWith('TEST: ') && /no production actions/i.test(n.body) && n.url === `/test-channel?test=${mine.testId}`))
  assert.equal(await count('account_notifications', `account_id = ${ids.desk}`), 0, 'the front desk hears nothing')
  assert.deepEqual((await events(mine.testId)).filter((e) => e.step?.startsWith('escalation')).map((e) => e.detail.notified), ['starter_only', 'starter_only'])
  assert.deepEqual((await events(silent.testId)).filter((e) => e.step?.startsWith('escalation')).map((e) => e.detail.notified), ['nobody', 'nobody'])
})

test('production timing gives a test the times a lead would get, and never the accelerated ones', { skip: SKIP }, async () => {
  await reset()
  const { loadSettings } = await import('./automation/settings.js')
  const { leadSchedule } = await import('./automation/leads.js')
  const T0 = new Date('2026-11-12T16:00:00Z') // Thursday 10:00 in New Orleans
  const { testId } = await start({ now: T0, timing: 'production' })
  const plan = leadSchedule(T0, await loadSettings(db))
  const due = Object.fromEntries((await A.describeTestRun(db, testId)).steps.map((s) => [s.type, new Date(s.dueAt).toISOString()]))
  assert.equal(due['followup:followup_1'], plan.followups[0].at.toISOString())
  assert.equal(due['followup:followup_2'], plan.followups[1].at.toISOString())
  assert.equal(due.escalation_1, plan.slaDue.toISOString())
  assert.equal(due.no_response, plan.noResponseAt.toISOString())
  assert.equal(due['followup:followup_1'], '2026-11-13T16:00:00.000Z', 'one business day, not one minute')
  // Ten minutes on, only the acknowledgment has happened.
  await tick(new Date(T0.getTime() + 10 * MIN))
  assert.deepEqual(Object.values(await steps(testId)).filter((s) => s !== 'pending'), ['done:sent', 'done:simulated'])
})

test('reset removes every test, what was waiting and the history; nothing left can run', { skip: SKIP }, async () => {
  await reset()
  await seedLeads()
  const T0 = new Date()
  const a = await start({ now: T0, email: 'r1@example.test' })
  await start({ now: T0, email: 'r2@example.test' })
  await tick(T0)
  assert.equal(sent.length, 2)
  // Removing one leaves the other and says so in the history.
  assert.equal((await asAdmin('DELETE', `/api/test-channel/${a.testId}`)).status, 200)
  assert.equal(await count('test_automation_runs'), 1)
  assert.equal((await asAdmin('GET', '/api/test-channel/automation')).json.history[0].kind, 'reset')

  assert.equal((await asAdmin('DELETE', '/api/test-channel')).status, 200)
  for (const t of ['test_submissions', 'test_automation_runs', 'test_automation_steps']) assert.equal(await count(t), 0, t)
  const history = (await asAdmin('GET', '/api/test-channel/automation')).json.history
  assert.deepEqual(history.map((e) => [e.kind, e.detail.removed, e.detail.all, e.by]), [['reset', 1, true, 'admin']])
  assert.deepEqual(await tick(new Date(T0.getTime() + 30 * MIN)), [], 'the follow-ups that were waiting are gone')
  assert.equal(sent.length, 2)
  assert.equal(await count('submissions'), 2, 'leads are not test data')
})

test('switched off on a server, test mode starts nothing and runs nothing', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  const { testId } = await start({ now: T0 })
  // A developer machine pointed at the same database: not production, not asked for.
  assert.equal(A.testAutomationOn({}), false)
  assert.equal(A.testAutomationOn({ NODE_ENV: 'production' }), true)
  assert.equal(A.testAutomationOn({ NODE_ENV: 'production', TEST_AUTOMATION_ENABLED: 'false' }), false)
  assert.deepEqual(await A.runDueTestSteps(db, { now: new Date(T0.getTime() + 10 * MIN), mailer, env: {} }), [])
  assert.ok(Object.values(await steps(testId)).every((s) => s === 'pending'))
  assert.equal(sent.length, 0)
  await assert.rejects(() => A.startTestRun(db, { testId, env: { NODE_ENV: 'production', TEST_AUTOMATION_ENABLED: 'false' } }), (err) => err.code === 'test_automation_off' && err.status === 409)
  await assert.rejects(() => A.testAction(db, { testId, action: 'mark_closed', env: {} }), (err) => err.code === 'test_automation_off')
})

test('at most ten tests run at once', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  for (let i = 0; i < 10; i++) await start({ now: T0, email: `many${i}@example.test`, sendEmail: false })
  await assert.rejects(() => start({ now: T0, email: 'eleventh@example.test', sendEmail: false }), (err) => err.code === 'too_many_tests' && err.status === 429)
  // Once they finish, another may start.
  for (let i = 0; i < 4; i++) await tick(new Date(T0.getTime() + 10 * MIN))
  assert.equal((await start({ now: T0, email: 'twelfth@example.test', sendEmail: false })).created, true)
})

// --- real text messages, only when asked for ------------------------------------------------

test('ticked, the texts really go: to the test’s phone only, from the firm’s number, each marked [TEST]', { skip: SKIP }, async () => {
  await reset()
  await seedLeads()
  const before_ = await everythingElse()
  const T0 = new Date('2026-11-14T03:00:00Z')
  const { testId } = await start({ now: T0, phone: '(504) 555-0177', sendSms: true, sendEmail: false })
  await tick(T0)
  assert.equal(texts.length, 1, 'the acknowledgment text, at once')
  await tick(new Date(T0.getTime() + 2 * MIN))
  assert.deepEqual(texts.map((m) => [m.from, m.to, m.text.startsWith('[TEST] '), /STOP/.test(m.text)]), Array(3).fill([FIRM_NUMBER, '+15045550177', true, true]))
  assert.match(texts[0].text, /^\[TEST\] Campos Muños Law: recibimos su mensaje/)
  assert.match(texts[2].text, /último recordatorio/)
  assert.deepEqual(await steps(testId), {
    ack_email: 'done:simulated', ack_sms: 'done:sent', 'followup:followup_1': 'done:sent', 'followup:followup_2': 'done:sent',
    escalation_1: 'pending', escalation_2: 'pending', no_response: 'pending',
  })
  const log = (await events(testId)).filter((e) => e.channel === 'sms')
  assert.deepEqual(log.map((e) => [e.kind, e.recipient, e.detail.from, e.detail.providerId]), [
    ['sent', '(504) 555-0177', FIRM_NUMBER, 'text-1'], ['sent', '(504) 555-0177', FIRM_NUMBER, 'text-2'], ['sent', '(504) 555-0177', FIRM_NUMBER, 'text-3'],
  ])
  assert.equal(log[0].body, texts[0].text, 'the history shows exactly what was sent')
  // Three texts sent count as the sequence having run.
  await tick(new Date(T0.getTime() + 5 * MIN))
  assert.equal(await status(testId), 'no_response')
  assert.equal(texts.length, 3, 'three texts in a whole test, never more')
  assert.equal(sent.length, 0)
  // Still nothing outside the test tables: no message row, no job, no lead touched.
  assert.deepEqual(await everythingElse(), before_)
})

test('a real text needs agreement, a usable number, RingCentral, the live server, and no opt-out', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  const ack = async (testId) => (await events(testId)).find((e) => e.step === 'ack_sms')
  const why = async (testId) => { const e = await ack(testId); return [e.kind, e.detail.reason] }

  const noConsent = await start({ now: T0, email: 'a@example.test', sendSms: true, smsConsent: false })
  await tick(T0)
  assert.deepEqual(await why(noConsent.testId), ['skipped', 'no_sms_consent'])

  const abroad = await start({ now: T0, email: 'b@example.test', phone: '+44 20 7946 0958', sendSms: true })
  await tick(T0)
  assert.deepEqual(await why(abroad.testId), ['simulated', 'country_not_allowed'])

  // RingCentral is not set up on this server.
  const noRc = await start({ now: T0, email: 'c@example.test', sendSms: true })
  await A.runDueTestSteps(db, { now: T0, mailer, sms: null, env: RUN_ENV })
  assert.deepEqual(await why(noRc.testId), ['simulated', 'sms_not_configured'])

  // RingCentral says this connection cannot text.
  smsCapability = { available: false, sender: null, reason: 'no_sms_number' }
  const cannot = await start({ now: T0, email: 'd@example.test', sendSms: true })
  await tick(T0)
  assert.deepEqual(await why(cannot.testId), ['simulated', 'sms_unavailable'])
  assert.equal((await ack(cannot.testId)).detail.why, 'no_sms_number')
  smsCapability = { available: true, sender: FIRM_NUMBER, reason: null }

  // RingCentral asked the portal to slow down.
  smsWait = new Date(T0.getTime() + MIN)
  const slow = await start({ now: T0, email: 'e@example.test', sendSms: true })
  await tick(T0)
  assert.deepEqual(await why(slow.testId), ['simulated', 'ringcentral_asked_to_wait'])
  smsWait = null

  // A developer machine: only a number on its own test list.
  const dev = await start({ now: T0, email: 'f@example.test', phone: '504-555-0181', sendSms: true })
  await A.runDueTestSteps(db, { now: T0, mailer, sms, env: { TEST_AUTOMATION_ENABLED: 'true', AUTOMATION_TEST_RECIPIENTS: '504-555-0199' } })
  assert.deepEqual(await why(dev.testId), ['simulated', 'not_production'])

  // The firm's opt-out list.
  await db.query("INSERT INTO automation_suppressions (channel, address_key, reason, source) VALUES ('sms', '5045550182', 'opt_out', 'reply')")
  const out = await start({ now: T0, email: 'g@example.test', phone: '504-555-0182', sendSms: true })
  await tick(T0)
  assert.deepEqual(await why(out.testId), ['simulated', 'opted_out'])

  assert.equal(texts.length, 0, 'none of them reached RingCentral')

  // And the developer machine with the number on its list does send.
  const listed = await start({ now: T0, email: 'h@example.test', phone: '504-555-0199', sendSms: true })
  await A.runDueTestSteps(db, { now: T0, mailer, sms, env: { TEST_AUTOMATION_ENABLED: 'true', AUTOMATION_TEST_RECIPIENTS: '504-555-0199' } })
  assert.deepEqual(await why(listed.testId), ['sent', undefined])
  assert.deepEqual(texts.map((m) => m.to), ['+15045550199'])
})

test('a text RingCentral refused or never confirmed is not sent again', { skip: SKIP }, async () => {
  await reset()
  const T0 = new Date('2026-11-12T16:00:00Z')
  smsAnswer = () => ({ ok: false, outcome: 'unknown', code: 'timeout' })
  const maybe = await start({ now: T0, email: 'u@example.test', sendSms: true, sendEmail: false })
  await tick(T0)
  await tick(new Date(T0.getTime() + 30 * 1000))
  assert.equal((await steps(maybe.testId)).ack_sms, 'failed:unknown_delivery')
  assert.equal(texts.length, 1, 'it may have arrived: tried once')
  const e = (await events(maybe.testId)).find((x) => x.step === 'ack_sms')
  assert.deepEqual([e.kind, e.detail.reason, e.detail.error], ['failed', 'unknown_delivery', 'timeout'])

  smsAnswer = () => ({ ok: false, outcome: 'failed', code: 'SMS-RC-413' })
  texts.length = 0
  const refused = await start({ now: T0, email: 'r@example.test', phone: '504-555-0178', sendSms: true, sendEmail: false })
  await tick(T0)
  await tick(new Date(T0.getTime() + 30 * 1000))
  assert.equal((await steps(refused.testId)).ack_sms, 'failed:send_failed')
  assert.equal(texts.length, 1)
  // A sender that throws is treated as "may have gone", not as a crash.
  smsAnswer = () => { throw new Error('socket hang up') }
  const thrown = await start({ now: T0, email: 't@example.test', phone: '504-555-0179', sendSms: true, sendEmail: false })
  await tick(T0)
  assert.equal((await steps(thrown.testId)).ack_sms, 'failed:unknown_delivery')
})

test('a phone a lead or client already has needs a person to confirm it; from the website the texts are held back', { skip: SKIP }, async () => {
  await reset()
  await seedLeads()
  const body = (extra = {}) => ({ firstName: 'Ana', email: 'mine@example.test', phone: '+1 (504) 555-0101', smsConsent: true, sendEmail: false, sendSms: true, ...extra })
  const refused = await asAdmin('POST', '/api/test-channel/automation/tests', body())
  assert.equal(refused.status, 409)
  assert.deepEqual([refused.json.code, refused.json.leads, refused.json.phones], ['address_on_a_lead', 0, 1])
  assert.match(refused.json.error, /phone number/)
  assert.equal(await count('test_submissions'), 0)
  // A billing client's WhatsApp number counts too.
  const client = (await db.query("INSERT INTO billing_clients (display_name) VALUES ('Cliente Real') RETURNING id")).rows[0].id
  await db.query("INSERT INTO billing_client_contacts (client_id, phone_e164) VALUES ($1, '+15045550155')", [client])
  assert.equal((await asAdmin('POST', '/api/test-channel/automation/tests', body({ phone: '504-555-0155' }))).status, 409)

  // From the website, started on its own: held back, the rest of the test still runs.
  await asAdmin('PUT', '/api/test-channel/automation/prefs', { autoStart: true, timing: 'accelerated', sendEmail: false, sendSms: true, notifyMe: false })
  assert.equal((await asAdmin('GET', '/api/test-channel/automation')).json.prefs.sendSms, true)
  const me = (await db.query('SELECT id, token_version FROM admin_users WHERE id = $1', [ids.admin])).rows[0]
  const { token } = mintTestToken({ accountId: me.id, tokenVersion: me.token_version })
  const viaSite = await call('POST', '/api/submissions', { body: { firstName: 'Ana', lastName: 'Cliente', email: 'other@example.test', phone: '504-555-0101', message: 'Prueba', consultationType: 'daca', location: 'MX', language: 'es', smsConsent: true, testToken: token } })
  assert.equal(viaSite.status, 201, viaSite.text)
  await settle()
  await tick(new Date(Date.now() + 3 * MIN))
  const held = await A.describeTestRun(db, viaSite.json.id)
  assert.equal(held.sendSms, false)
  assert.equal(held.events[0].detail.smsHeld, 'address_on_a_lead')
  assert.equal(texts.length, 0, 'nothing was texted to a number that belongs to a lead')

  // Confirmed once: sent, and remembered.
  const ok = await asAdmin('POST', '/api/test-channel/automation/tests', body({ confirmKnown: true }))
  assert.equal(ok.status, 201, ok.text)
  await tick(new Date())
  assert.deepEqual(texts.map((m) => m.to), ['+15045550101'])
  assert.equal((await asAdmin('POST', '/api/test-channel/automation/tests', body({ email: 'mine2@example.test' }))).status, 201, 'no second question for the same number')
})

test('the website form’s own tick is what counts as agreeing to texts, for a test as for a lead', { skip: SKIP }, async () => {
  await reset()
  await asAdmin('PUT', '/api/test-channel/automation/prefs', { autoStart: true, timing: 'accelerated', sendEmail: false, sendSms: true, notifyMe: false })
  const me = (await db.query('SELECT id, token_version FROM admin_users WHERE id = $1', [ids.admin])).rows[0]
  const { token } = mintTestToken({ accountId: me.id, tokenVersion: me.token_version })
  const form = (extra) => ({ firstName: 'Rosa', lastName: 'Prueba', phone: '504-555-0123', message: 'Probando', consultationType: 'daca', location: 'MX', language: 'en', ...extra })

  // Ticked: stored with the test form, and the texts go to the form's phone.
  const ticked = await call('POST', '/api/submissions', { body: form({ email: 'yes@example.test', smsConsent: true, testToken: token }) })
  // Not ticked: no agreement. A value that is not a real tick is refused outright.
  const blank = await call('POST', '/api/submissions', { body: form({ email: 'no@example.test', phone: '504-555-0124', testToken: token }) })
  const odd = await call('POST', '/api/submissions', { body: form({ email: 'odd@example.test', phone: '504-555-0125', smsConsent: 'yes', testToken: token }) })
  assert.equal(odd.status, 400)
  assert.equal(await count('test_submissions', "email = 'odd@example.test'"), 0)
  await settle()
  await tick(new Date(Date.now() + 3 * MIN))
  const opened = async (r) => (await asAdmin('GET', `/api/test-channel/${r.json.id}`)).json
  assert.deepEqual([(await opened(ticked)).sms_consent, (await opened(blank)).sms_consent], [true, false])
  assert.equal((await opened(ticked)).language, 'en')
  assert.deepEqual([...new Set(texts.map((m) => m.to))], ['+15045550123'], 'only the form that was ticked is texted')
  assert.match(texts[0].text, /^\[TEST\] Campos Muños Law: we received your message/)
  assert.equal((await steps(blank.json.id)).ack_sms, 'skipped:no_sms_consent')

  // The same form without a test link is a lead, and its tick is recorded the same way.
  const lead = await call('POST', '/api/submissions', { body: form({ email: 'lead@example.test', phone: '504-555-0126', smsConsent: true }) })
  const leadNo = await call('POST', '/api/submissions', { body: form({ email: 'lead2@example.test', phone: '504-555-0127' }) })
  assert.equal(lead.status, 201, lead.text)
  const consent = async (r) => (await db.query('SELECT sms_consent_at FROM submissions WHERE id = $1', [r.json.id])).rows[0].sms_consent_at
  assert.ok(await consent(lead), 'when they agreed is kept on the lead')
  assert.equal(await consent(leadNo), null)
})
