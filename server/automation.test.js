// Phase 1 automation (server/automation/) over a real Postgres, with the
// worker run exactly as index.js runs it. Nothing real is ever sent: the
// mailer behaves like Resend's idempotency, the text sender and the calendar
// are recorders, and web-push is a recorder. Synthetic people and 555-01xx
// numbers only.
//
// Own database: <TEST_DATABASE_URL's name>_automation (created if missing;
// must contain "test"; schema dropped, rebuilt and migrated twice). Run with
// TEST_DATABASE_URL=postgres://localhost/camulaw_phase1_test.
//
// The clock: last Monday, 10:30 AM in New Orleans. Relative to today rather
// than a fixed date, because a few queries look back from the database's own
// clock (leads of the last 90 days).
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import webpush from 'web-push'
import { CLASSIFIER_VERSION } from './integrations/ringcentral/callEvidence.js'
import { firmWall, firmInstant } from './reminders/dueTime.js'
import { resolveFlags } from './automation/flags.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_automation`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

const vapid = webpush.generateVAPIDKeys()
const PUSH_ENV = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:test@example.test' }
const ALL_ON = {
  AUTOMATION_ENABLED: 'true', LEAD_ACK_ENABLED: 'true', LEAD_ACK_EMAIL_ENABLED: 'true', LEAD_ACK_SMS_ENABLED: 'true', LEAD_FOLLOWUP_ENABLED: 'true',
  LEAD_STATUS_AUTOMATION_ENABLED: 'true', LEAD_SPAM_AUTOMATION_ENABLED: 'true', CONTACT_AUTO_MATCH_ENABLED: 'true', SLA_ESCALATION_ENABLED: 'true',
  RINGCENTRAL_SMS_ENABLED: 'true', RINGCENTRAL_SMS_INBOUND_ENABLED: 'true', MISSED_CALL_SMS_ENABLED: 'true', SCHEDULING_ENABLED: 'true',
}
// "Production" only inside this object: it is what lets a message leave.
const ENV = { NODE_ENV: 'production', ...ALL_ON, ...PUSH_ENV, PORTAL_URL: 'https://portal.example.test', ADMIN_EMAIL: 'office@example.test', RESEND_FROM_EMAIL: 'contact@example.test' }

// The clock.
const MIN = 60 * 1000
function lastMonday() {
  const w = firmWall(Date.now())
  let d = new Date(Date.UTC(w.year, w.month - 1, w.day))
  do { d = new Date(d.getTime() - 864e5) } while (d.getUTCDay() !== 1)
  return d
}
const MONDAY = lastMonday()
/** The instant the firm's clock reads h:mi on Monday + days. */
const at = (days, h, mi = 0) => { const d = new Date(MONDAY.getTime() + days * 864e5); return firmInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi) }
const T0 = at(0, 10, 30)

// Push: every send recorded.
const pushed = []
const transport = { async sendNotification(sub, payload) { pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 } } }

// Email: like Resend, a repeated idempotency key is not sent again.
const mail = { sent: [], calls: [], keys: new Map(), queue: [] }
const mailer = {
  async send(msg) {
    mail.calls.push(msg)
    const next = mail.queue.shift()
    if (next) return next
    if (mail.keys.has(msg.idempotencyKey)) return { ok: true, id: mail.keys.get(msg.idempotencyKey) }
    const id = `em_${mail.sent.length + 1}`
    mail.keys.set(msg.idempotencyKey, id)
    mail.sent.push(msg)
    return { ok: true, id }
  },
}

// Texts: a recorder with the provider's four functions.
const SENDER = '+15045550100'
const txt = { sent: [], calls: [], queue: [], cap: null, backoff: null, deliveries: new Map(), inbound: [] }
const sms = {
  capability: async () => txt.cap,
  backoffUntil: async () => txt.backoff,
  async send(m) {
    txt.calls.push(m)
    const next = txt.queue.shift()
    if (next) return next
    const id = String(9000 + txt.sent.length)
    txt.sent.push({ ...m, id })
    return { ok: true, id, status: 'Queued' }
  },
  delivery: async (id) => txt.deliveries.get(id) || { status: 'Sent', deliveryErrorCode: null },
  inbound: async () => txt.inbound,
}

// Calendar: whatever the test puts in `events` is "what changed".
const cal = { events: [], calls: 0 }
const calendar = {
  kind: 'google_calendar',
  capabilities: { detectBookings: true, createBooking: false, availability: false, cancel: false },
  describe: () => ({ kind: 'google_calendar', configured: true, problems: [] }),
  async listChanges() { cal.calls++; const events = cal.events; cal.events = []; return { events, nextSyncToken: `tok-${cal.calls}`, full: cal.calls === 1 } },
}

let server, base, db, A
const routeErrors = []
const u = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'automation-test-secret-0123456789abcdef'
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

  const rows = (await db.query(
    `INSERT INTO admin_users (email, password_hash, role, display_name) VALUES
       ('owner@example.test', 'x', 'admin', 'Walid'),
       ('desk@example.test', 'x', 'front_desk', 'Yoletty'),
       ('ciro@example.test', 'x', 'receptionist', 'Ciro'),
       ('para@example.test', 'x', 'billing_paralegal', 'Billing')
     RETURNING id, token_version, email`
  )).rows
  for (const r of rows) u[r.email.split('@')[0]] = { id: Number(r.id), cookie: `token=${jwt.sign({ id: r.id, email: r.email, tv: r.token_version }, process.env.JWT_SECRET)}` }
  for (const k of ['owner', 'desk', 'ciro']) {
    await db.query('INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
      [u[k].id, `https://fcm.googleapis.com/fcm/send/${k}-${crypto.randomBytes(6).toString('hex')}`, crypto.randomBytes(65).toString('base64url'), crypto.randomBytes(16).toString('base64url')])
  }

  A = {
    worker: await import('./automation/worker.js'),
    leads: await import('./automation/leads.js'),
    settings: await import('./automation/settings.js'),
    jobs: await import('./automation/jobs.js'),
    suppression: await import('./automation/suppression.js'),
    health: await import('./automation/health.js'),
    flags: await import('./automation/flags.js'),
    spam: await import('./automation/spam.js'),
    match: await import('./automation/contactMatch.js'),
  }
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('./app.js')
  const { activityRecorder } = await import('./activity/recorder.js')
  const submissions = (await import('./routes/submissions.js')).default
  const { createAutomationRouter } = await import('./routes/automation.js')
  const { createWorkQueueRouter } = await import('./routes/workQueue.js')
  const { createContactsRouter } = await import('./routes/contacts.js')
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  // The routes log through req.log (pino-http in the real app). Anything
  // logged as an error here is a bug, so it is kept for the test to see.
  app.use((req, _res, next) => { req.log = { info() {}, warn() {}, debug() {}, error: (o, msg) => routeErrors.push(`${msg}: ${o?.err?.message || JSON.stringify(o)}`) }; next() })
  app.use('/api', activityRecorder({ db: () => db }))
  app.use('/api/submissions', submissions)
  app.use('/api/automation', createAutomationRouter({ db, env: ENV }))
  app.use('/api/work-queue', createWorkQueueRouter({ db, now: () => clockNow }))
  app.use('/api/contacts', createContactsRouter({ db }))
  addFallbackHandlers(app)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  for (const k of Object.keys(ALL_ON)) delete process.env[k]
  server?.closeAllConnections?.()
  server?.close()
  await db?.end()
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

let clockNow = T0
beforeEach(async () => {
  if (SKIP) return
  // Every test starts from nothing: no leads, calls, jobs or messages.
  await db.query(`TRUNCATE submissions, rc_calls, rc_call_exclusions, rc_call_resolutions, rc_ignored_numbers, automation_jobs, automation_messages,
    automation_suppressions, automation_settings, automation_state, rc_sms_inbound, consultation_bookings, call_episode_escalations, contact_links,
    staff_activity, push_deliveries, account_notifications, missed_call_announcements RESTART IDENTITY CASCADE`)
  mail.sent.length = 0; mail.calls.length = 0; mail.keys.clear(); mail.queue.length = 0
  txt.sent.length = 0; txt.calls.length = 0; txt.queue.length = 0; txt.backoff = null; txt.deliveries.clear(); txt.inbound = []
  txt.cap = { available: true, sender: SENDER, reason: null, candidates: [SENDER] }
  cal.events = []; cal.calls = 0
  pushed.length = 0
  clockNow = T0
  for (const k of Object.keys(ALL_ON)) delete process.env[k]
  routeErrors.length = 0
})

// --- helpers -------------------------------------------------------------------------

async function http(method, path, body, as = u.desk) {
  const res = await fetch(base + path, { method, headers: { ...(as ? { Cookie: as.cookie } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  // The reply route's own email has no provider here (no RESEND_API_KEY in
  // tests); it reports that itself as emailFailed.
  assert.deepEqual(routeErrors.filter((e) => !e.startsWith('Resend email failed')), [], `${method} ${path} logged an error`)
  return { status: res.status, json, text }
}

let n = 0
/** A website lead written at `when`, with its automatic work queued as the form route would. */
async function newLead({ when = T0, email, phone, language = 'es', consent = true, message = 'Necesito ayuda con mi caso', first = 'Ana', start = true, env = {} } = {}) {
  n++
  const id = (await db.query(
    `INSERT INTO submissions (first_name, last_name, email, phone, message, language, sms_consent_at, created_at)
     VALUES ($1, 'Prueba', $2, $3, $4, $5, CASE WHEN $6::boolean THEN $7::timestamptz END, $7) RETURNING id`,
    [first, email || `ana${n}@example.test`, phone || `504-555-01${String(n % 100).padStart(2, '0')}`, message, language, consent, when]
  )).rows[0].id
  if (start) await A.leads.startLeadAutomation(db, id, { flags: resolveFlags({ ...ENV, ...env }, await A.flags.loadPaused(db)), settings: await A.settings.loadSettings(db), now: when })
  return Number(id)
}
const run = (when, env = {}, deps = {}) => {
  clockNow = when
  return A.worker.runAutomation(db, { env: { ...ENV, ...env }, mailer, staffMailer: mailer, sms, calendar, pushOptions: { env: PUSH_ENV, transport }, now: when, ...deps })
}
const lead = async (id) => (await db.query('SELECT * FROM submissions WHERE id = $1', [id])).rows[0]
const jobs = async (id, type = null) => (await db.query(
  "SELECT type, status, outcome, run_at, idempotency_key, attempts, payload FROM automation_jobs WHERE entity_type = 'lead' AND entity_id = $1 AND ($2::text IS NULL OR type = $2) ORDER BY run_at, id", [String(id), type]
)).rows
const callJobs = async (id, type) => (await db.query(
  "SELECT type, status, outcome, run_at, attempts FROM automation_jobs WHERE entity_type = 'call' AND entity_id = $1 AND type = $2 ORDER BY id", [String(id), type]
)).rows
const messages = async () => (await db.query('SELECT channel, purpose, status, template_key, language, to_key, error FROM automation_messages ORDER BY id')).rows
const events = async (action) => (await db.query("SELECT action, entity_id, outcome, details FROM staff_activity WHERE source = 'system' AND ($1::text IS NULL OR action = $1) ORDER BY id", [action])).rows
const clientMail = () => mail.sent.filter((m) => !/waiting/.test(m.subject))
const staffMail = () => mail.sent.filter((m) => /waiting/.test(m.subject))

let seq = 0
async function addCall({ when, direction = 'inbound', cls = 'not_answered', number, outcome, internal = false, seconds = 180 }) {
  const id = `au-${++seq}`
  const out = outcome || (direction === 'outbound' ? 'connected' : cls === 'answered' ? 'answered' : 'missed')
  const r = await db.query(
    `INSERT INTO rc_calls (rc_record_id, telephony_session_id, direction, started_at, outcome, counterpart_number, counterpart_key, scope,
            classification, classification_evidence, classifier_version, is_primary, is_internal, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, cm_phone_key($6), 'account', $7, $8, $9, TRUE, $10, $11) RETURNING id`,
    [id, `ts-${id}`, direction, when, out, number, direction === 'inbound' ? cls : null,
      direction === 'inbound' ? JSON.stringify({ offeredTo: [], notAnsweredBy: [] }) : null, CLASSIFIER_VERSION, internal, seconds]
  )
  return Number(r.rows[0].id)
}

// --- new-lead acknowledgment -------------------------------------------------------

test('one lead gets one acknowledgment, however many times the worker runs', { skip: SKIP }, async () => {
  const id = await newLead()
  await run(new Date(T0.getTime() + MIN))
  await run(new Date(T0.getTime() + 2 * MIN))
  await run(new Date(T0.getTime() + 3 * MIN))
  assert.equal(clientMail().length, 1, 'one email')
  assert.equal(clientMail()[0].to, 'ana1@example.test'.replace('1', String(n)))
  assert.equal(txt.sent.length, 1, 'one text')
  assert.equal(txt.sent[0].from, SENDER)
  const m = await messages()
  assert.deepEqual(m.map((x) => [x.channel, x.purpose, x.status]), [['email', 'lead_ack', 'sent'], ['sms', 'lead_ack', 'sent']])
  assert.equal((await events('automation.lead_ack_sent')).length, 2)
  // The acknowledgment alone never moves the funnel.
  assert.equal((await lead(id)).status, 'new')
})

test('the acknowledgment is what the template says, in the form’s language; bilingual when the language is not known', { skip: SKIP }, async () => {
  await newLead({ language: 'es', first: 'María' })
  await newLead({ language: 'en', first: 'John' })
  await newLead({ language: null, first: 'Sam' })
  await run(new Date(T0.getTime() + MIN))
  const [es, en, bi] = clientMail()
  assert.match(es.subject, /^Recibimos su mensaje — Campos Muños Law$/)
  assert.match(es.text, /^Hola María:/)
  assert.match(en.subject, /^We received your message — Campos Muños Law$/)
  assert.match(en.text, /^Hello John,/)
  assert.match(bi.subject, /Recibimos su mensaje \/ We received your message/)
  assert.match(bi.text, /Recibimos su mensaje[\s\S]*We received your message/)
  // Never legal advice, never a promise of representation.
  for (const m of [es, en, bi]) assert.match(m.text, /no crea una relación de abogado y cliente|does not create an attorney-client relationship/)
  // Sent from the firm, replies to the office; never the alerts address.
  assert.match(es.from, /contact@example\.test/)
  assert.equal(es.replyTo, 'office@example.test')
  assert.deepEqual((await messages()).filter((x) => x.channel === 'email').map((x) => x.language), ['es', 'en', 'bi'])
  // The texts: who they are from, and how to stop them.
  assert.match(txt.sent[0].text, /^Campos Muños Law: recibimos su mensaje[\s\S]*STOP/)
  assert.match(txt.sent[1].text, /^Campos Muños Law: we received your message[\s\S]*Reply STOP to opt out\.$/)
  // No booking link is offered until one is set.
  assert.doesNotMatch(es.text + txt.sent[0].text, /agendar|horario para su consulta/)
})

test('a booking link is offered only when scheduling is on and a link is set', { skip: SKIP }, async () => {
  await http('PUT', '/api/automation/settings/scheduling', { bookingUrl: 'https://calendar.app.google/abc123', calendarId: '', lookAheadDays: 90 }, u.owner)
  await newLead({ language: 'en' })
  await run(new Date(T0.getTime() + MIN))
  assert.match(clientMail()[0].text, /pick a time for your consultation yourself: https:\/\/calendar\.app\.google\/abc123/)
  assert.match(txt.sent[0].text, /To book a time: https:\/\/calendar\.app\.google\/abc123/)
  await newLead({ language: 'en' })
  await run(new Date(T0.getTime() + 2 * MIN), { SCHEDULING_ENABLED: 'false' })
  assert.doesNotMatch(clientMail()[1].text, /calendar\.app\.google/)
})

test('the same form sent twice is one lead and one acknowledgment', { skip: SKIP }, async () => {
  Object.assign(process.env, ALL_ON)
  const body = { firstName: 'Luis', lastName: 'Prueba', email: 'luis@example.test', phone: '504-555-0142', message: 'Hola, necesito una consulta', language: 'es', source: 'contact' }
  const a = await http('POST', '/api/submissions', body, null)
  const b = await http('POST', '/api/submissions', body, null)
  assert.equal(a.status, 201, a.text)
  assert.equal(b.json.id, a.json.id, 'the repeat is answered with the first')
  // The form route queues the work after it has answered.
  for (let i = 0; i < 50 && !(await jobs(a.json.id, 'lead_ack_email')).length; i++) await new Promise((r) => setTimeout(r, 20))
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM submissions')).rows[0].n, 1)
  assert.equal((await lead(a.json.id)).language, 'es', 'the website language is kept')
  assert.equal((await lead(a.json.id)).sms_consent_at, null, 'no consent unless the form sent it')
  await run(new Date(Date.now() + MIN))
  await run(new Date(Date.now() + 2 * MIN))
  assert.equal(clientMail().length, 1)
  assert.equal((await jobs(a.json.id, 'lead_ack_email')).length, 1)
  // No consent on the form: no text, and it says why.
  assert.equal(txt.calls.length, 0)
  assert.equal((await jobs(a.json.id, 'lead_ack_sms'))[0].outcome, 'no_sms_consent')
})

test('the same person writing again the same day is acknowledged once', { skip: SKIP }, async () => {
  await newLead({ email: 'twice@example.test', phone: '504-555-0171', message: 'Primera pregunta' })
  await run(new Date(T0.getTime() + MIN))
  await newLead({ email: 'twice@example.test', phone: '504-555-0171', message: 'Otra pregunta', when: new Date(T0.getTime() + 30 * MIN) })
  await run(new Date(T0.getTime() + 31 * MIN))
  assert.equal(clientMail().length, 1)
  assert.equal(txt.sent.length, 1)
})

test('switched off, nothing is queued and nothing is sent', { skip: SKIP }, async () => {
  const off = Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, 'false']))
  // Every switch off: the lead gets no jobs at all.
  const a = await newLead({ env: off })
  assert.deepEqual(await jobs(a), [])
  // Queued while on, switched off before it ran: skipped, with the reason.
  const b = await newLead()
  await run(new Date(T0.getTime() + MIN), { LEAD_ACK_ENABLED: 'false' })
  assert.equal(mail.calls.length, 0)
  assert.equal(txt.calls.length, 0)
  assert.deepEqual((await jobs(b)).filter((j) => j.type.startsWith('lead_ack')).map((j) => [j.status, j.outcome]), [['skipped', 'switched_off'], ['skipped', 'switched_off']])
  // The master switch off: the worker does nothing, whatever else is on.
  const c = await newLead()
  const r = await run(new Date(T0.getTime() + 2 * MIN), { AUTOMATION_ENABLED: 'false' })
  assert.equal(r.off, 'switched_off')
  assert.ok((await jobs(c)).every((j) => j.status === 'pending'))
  assert.equal(mail.calls.length, 0)
})

test('paused from the portal stops it without a deploy, and resuming starts it again', { skip: SKIP }, async () => {
  assert.equal((await http('PUT', '/api/automation/flags/lead_ack', { paused: true })).status, 403, 'administrators only')
  assert.equal((await http('PUT', '/api/automation/flags/lead_ack', { paused: true }, u.owner)).status, 200)
  const a = await newLead()
  assert.deepEqual((await jobs(a)).filter((j) => j.type.startsWith('lead_ack')), [], 'paused: no acknowledgment queued')
  await http('PUT', '/api/automation/flags/lead_ack', { paused: false }, u.owner)
  await newLead()
  await run(new Date(T0.getTime() + MIN))
  assert.equal(clientMail().length, 1)
})

test('outside production nothing is sent to anyone but the test recipients', { skip: SKIP }, async () => {
  await newLead({ email: 'real.client@example.test', phone: '504-555-0181' })
  await run(new Date(T0.getTime() + MIN), { NODE_ENV: 'development' })
  assert.equal(mail.calls.length, 0)
  assert.equal(txt.calls.length, 0)
  assert.deepEqual((await events('automation.message_skipped')).map((e) => e.details.reason), ['not_production', 'not_production'])
  // With a test list, only the addresses on it.
  await newLead({ email: 'tech@camulaw.com', phone: '504-555-0182' })
  await newLead({ email: 'someone.else@example.test', phone: '504-555-0183' })
  await run(new Date(T0.getTime() + 2 * MIN), { NODE_ENV: 'development', AUTOMATION_TEST_RECIPIENTS: 'tech@camulaw.com, +1 (504) 555-0182' })
  assert.deepEqual(mail.sent.map((m) => m.to), ['tech@camulaw.com'])
  assert.deepEqual(txt.sent.map((m) => m.to), ['+15045550182'])
})

test('archived, spam and unusable addresses get nothing', { skip: SKIP }, async () => {
  // Archived before the worker got to it.
  const archived = await newLead()
  await db.query('UPDATE submissions SET is_archived = TRUE WHERE id = $1', [archived])
  // A sender an administrator listed: archived by the rule, no jobs at all.
  await http('PUT', '/api/automation/settings/spam', { senders: ['sales@vendor.example'], domains: ['seo-agency.example'], phrases: ['boost your google ranking'] }, u.owner)
  const vendor = await newLead({ email: 'Sales@Vendor.example' })
  const domain = await newLead({ email: 'anyone@seo-agency.example' })
  // A phrase is only ever "possible": kept in the inbox, no messages.
  const maybe = await newLead({ message: 'We can BOOST your Google ranking this month' })
  // A phone number that cannot be texted; the email still goes.
  const badPhone = await newLead({ phone: '555-0100' })
  await run(new Date(T0.getTime() + MIN))

  assert.deepEqual((await jobs(archived)).filter((j) => j.type.startsWith('lead_ack')).map((j) => [j.status, j.outcome]), [['cancelled', 'archived'], ['cancelled', 'archived']])
  for (const id of [vendor, domain]) {
    const l = await lead(id)
    assert.equal(l.spam_state, 'spam')
    assert.equal(l.is_archived, true)
    // The status the front desk already uses for junk (shown as "Spam"), with why.
    assert.deepEqual([l.status, l.status_reason, l.status_auto], ['closed', 'vendor_rule', true])
    assert.deepEqual(await jobs(id), [], 'a listed sender gets no jobs')
  }
  const m = await lead(maybe)
  assert.equal(m.spam_state, 'possible')
  assert.equal(m.is_archived, false, 'a phrase never hides a lead')
  assert.equal(m.status, 'new', 'and never changes its status')
  assert.deepEqual((await jobs(maybe)).map((j) => j.type), ['lead_sla'], 'only the deadline for a person to look')
  assert.deepEqual(mail.sent.map((x) => x.to), [(await lead(badPhone)).email])
  assert.equal(txt.calls.length, 0)
  assert.equal((await jobs(badPhone, 'lead_ack_sms'))[0].outcome, 'invalid_address')
  // Every spam mark is in the activity log and can be undone.
  assert.deepEqual((await events('automation.lead_spam')).map((e) => e.details.state).sort(), ['possible', 'spam', 'spam'])
  const back = await http('POST', `/api/submissions/${vendor}/spam`, { state: 'cleared' })
  assert.equal(back.json.is_archived, false)
  assert.deepEqual([(await lead(vendor)).status, (await lead(vendor)).status_auto], ['new', false], 'Not spam: back in the inbox as New')
  assert.equal(await A.spam.applySpamRules(db, await lead(vendor), (await A.settings.loadSettings(db)).spam), null, 'a lead a person cleared is never marked again')
})

test('a public mail provider cannot be listed as a spam domain', { skip: SKIP }, async () => {
  const r = await http('PUT', '/api/automation/settings/spam', { senders: [], domains: ['gmail.com'], phrases: [] }, u.owner)
  assert.equal(r.status, 400)
  assert.match(r.json.error, /gmail\.com is a mail provider real clients use/)
})

test('a text needs the person’s agreement on the form unless the firm decides otherwise', { skip: SKIP }, async () => {
  const a = await newLead({ consent: false })
  await run(new Date(T0.getTime() + MIN))
  assert.equal(txt.calls.length, 0)
  assert.equal((await jobs(a, 'lead_ack_sms'))[0].outcome, 'no_sms_consent')
  assert.equal(clientMail().length, 1, 'the email does not need it')
  await http('PUT', '/api/automation/settings/ack', { smsRequiresFormConsent: false, smsOutsideHours: false, maxAgeHours: 24 }, u.owner)
  await newLead({ consent: false })
  await run(new Date(T0.getTime() + 2 * MIN))
  assert.equal(txt.sent.length, 1)
})

test('a text waits for the texting hours; the email does not', { skip: SKIP }, async () => {
  const night = at(0, 22, 15)
  const a = await newLead({ when: night })
  await run(new Date(night.getTime() + MIN))
  assert.equal(clientMail().length, 1)
  assert.equal(txt.calls.length, 0)
  const j = (await jobs(a, 'lead_ack_sms'))[0]
  assert.equal(j.status, 'pending')
  assert.equal(new Date(j.run_at).toISOString(), at(1, 10, 0).toISOString(), 'next texting hour: Tuesday 10:00')
  assert.equal(j.attempts, 0, 'waiting is not a failed attempt')
  await run(at(1, 10, 1))
  assert.equal(txt.sent.length, 1)
})

// --- once, across restarts and workers ---------------------------------------------

test('two workers at the same moment send each message once', { skip: SKIP }, async () => {
  for (let i = 0; i < 6; i++) await newLead()
  const when = new Date(T0.getTime() + MIN)
  await Promise.all([run(when), run(when), run(when)])
  assert.equal(clientMail().length, 6)
  assert.equal(txt.sent.length, 6)
  assert.equal(new Set(mail.calls.map((m) => m.idempotencyKey)).size, mail.calls.length, 'no key was sent twice')
  assert.equal(new Set(txt.sent.map((m) => m.to)).size, 6)
  // And each job was taken by exactly one of them: run once, none failed.
  const acks = (await db.query("SELECT status, attempts FROM automation_jobs WHERE type IN ('lead_ack_email', 'lead_ack_sms')")).rows
  assert.equal(acks.length, 12)
  assert.ok(acks.every((j) => j.status === 'done' && j.attempts === 1), JSON.stringify(acks))
  assert.equal(mail.calls.length, 6, 'the provider was asked once per email')
})

test('a restart in the middle of a send never sends twice', { skip: SKIP }, async () => {
  const a = await newLead()
  // As if the process died after writing the message rows and calling the
  // providers, before recording their answers: jobs 'running', rows 'sending'.
  for (const [type, channel] of [['lead_ack_email', 'email'], ['lead_ack_sms', 'sms']]) {
    const j = (await db.query("UPDATE automation_jobs SET status = 'running', attempts = 1, locked_at = $2 WHERE entity_id = $1 AND type = $3 RETURNING id, idempotency_key", [String(a), new Date(T0.getTime() - 20 * MIN), type])).rows[0]
    await db.query("INSERT INTO automation_messages (job_id, channel, purpose, entity_type, entity_id, to_key, idempotency_key, status) VALUES ($1, $2, 'lead_ack', 'lead', $3, 'x', $4, 'sending')", [j.id, channel, String(a), j.idempotency_key])
  }
  // Resend already has that key from the interrupted attempt.
  mail.keys.set(`cm-auto-lead-ack-email:${a}`, 'em_first')
  await run(new Date(T0.getTime() + MIN))
  await run(new Date(T0.getTime() + 2 * MIN))
  // Email: asked again with the SAME key, which the provider does not send twice.
  assert.equal(mail.sent.length, 0, 'nothing new was sent')
  assert.deepEqual(mail.calls.map((m) => m.idempotencyKey), [`cm-auto-lead-ack-email:${a}`])
  // Text: no such key exists, so it is never sent again; a person decides.
  assert.equal(txt.calls.length, 0, 'the text was not attempted again')
  const j = (await jobs(a, 'lead_ack_sms'))[0]
  assert.deepEqual([j.status, j.outcome], ['failed', 'unknown_delivery'])
  assert.equal((await messages()).find((m) => m.channel === 'sms').status, 'unknown')
  assert.equal((await messages()).find((m) => m.channel === 'email').status, 'sent')
})

test('a failing email is tried again later, a few times, then left for a person', { skip: SKIP }, async () => {
  const a = await newLead({ consent: false })
  mail.queue.push({ ok: false, error: 'rate_limit_exceeded', transient: true })
  await run(new Date(T0.getTime() + MIN))
  let j = (await jobs(a, 'lead_ack_email'))[0]
  assert.deepEqual([j.status, j.attempts], ['pending', 1])
  await run(new Date(T0.getTime() + 2 * MIN))
  assert.equal(mail.calls.length, 1, 'not retried in a tight loop')
  await run(new Date(T0.getTime() + 4 * MIN))
  assert.equal(clientMail().length, 1, 'sent on the retry')
  // One that can never work stops at once and is surfaced.
  const b = await newLead({ consent: false })
  mail.queue.push({ ok: false, error: 'validation_error: bad address', transient: false })
  await run(new Date(T0.getTime() + 5 * MIN))
  j = (await jobs(b, 'lead_ack_email'))[0]
  assert.deepEqual([j.status, j.outcome], ['failed', 'email_rejected'])
  const ex = await http('GET', '/api/automation/exceptions', undefined, u.owner)
  assert.deepEqual(ex.json.items.map((x) => [x.type, x.entityId, x.reason]), [['lead_ack_email', String(b), 'email_rejected']])
  assert.equal((await events('automation.job_failed')).length, 1)
  // The people who can act on it are told once.
  assert.ok(pushed.some((p) => p.payload.title === 'An automatic message was not sent'))
})

// --- follow-up sequence ---------------------------------------------------------------

test('follow-ups are queued one and three business days on, inside the texting hours', { skip: SKIP }, async () => {
  const a = await newLead()
  const f = await jobs(a, 'lead_followup')
  assert.deepEqual(f.map((j) => [j.payload.step, new Date(j.run_at).toISOString()]), [['followup_1', at(1, 10, 30).toISOString()], ['followup_2', at(3, 10, 30).toISOString()]])
  assert.equal(new Date((await jobs(a, 'lead_no_response'))[0].run_at).toISOString(), at(7, 10, 30).toISOString(), 'five business days: the next Monday')
  // Written on Friday evening: counted from Monday morning, not over the weekend.
  const b = await newLead({ when: at(4, 18, 5) })
  assert.equal(new Date((await jobs(b, 'lead_followup'))[0].run_at).toISOString(), at(8, 10, 0).toISOString(), 'Tuesday, at the first texting hour')
})

test('with no answer the whole sequence runs, then the lead becomes No response, with why', { skip: SKIP }, async () => {
  const a = await newLead()
  await run(new Date(T0.getTime() + MIN))
  await run(at(1, 10, 31))
  await run(at(3, 10, 31))
  assert.deepEqual(txt.sent.map((m) => m.text.split(':')[1].trim().slice(0, 22)), ['recibimos su mensaje. ', 'seguimos atentos a su ', 'este es nuestro último'])
  assert.equal((await lead(a)).status, 'new', 'still New while the sequence runs')
  await run(at(7, 10, 31))
  const l = await lead(a)
  assert.equal(l.status, 'no_response')
  assert.equal(l.status_reason, 'follow_up_sequence_completed')
  assert.equal(l.status_auto, true)
  assert.deepEqual((await events('automation.lead_status')).map((e) => [e.entity_id, e.details.to, e.details.reason]), [[String(a), 'no_response', 'follow_up_sequence_completed']])
  // A person can put it back.
  assert.equal((await http('PATCH', `/api/submissions/${a}/status`, { status: 'new' })).status, 200)
  const again = await lead(a)
  assert.deepEqual([again.status, again.status_auto, again.status_reason], ['new', false, 'set_by_staff'])
})

test('No response is never guessed: a sequence that did not go out changes nothing', { skip: SKIP }, async () => {
  const a = await newLead({ consent: false })
  for (const when of [new Date(T0.getTime() + MIN), at(1, 10, 31), at(3, 10, 31), at(7, 10, 31)]) await run(when)
  assert.equal(txt.calls.length, 0)
  assert.equal((await lead(a)).status, 'new')
  assert.equal((await jobs(a, 'lead_no_response'))[0].outcome, 'sequence_not_completed')
})

test('a connected callback stops the follow-ups and marks the lead Contacted', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '(504) 555-0111' })
  await run(new Date(T0.getTime() + MIN))
  await addCall({ when: at(0, 14, 0), direction: 'outbound', number: '+15045550111' })
  await run(at(1, 10, 31))
  await run(at(3, 10, 31))
  assert.equal(txt.sent.length, 1, 'only the acknowledgment')
  const l = await lead(a)
  assert.deepEqual([l.status, l.status_reason, l.status_auto], ['contacted', 'connected_callback', true])
  assert.deepEqual((await jobs(a, 'lead_followup')).map((j) => [j.status, j.outcome]), [['cancelled', 'connected_callback'], ['cancelled', 'connected_callback']])
  assert.equal((await events('automation.sequence_cancelled'))[0].details.reason, 'connected_callback')
  // A callback that did not connect proves nothing. Neither does one
  // RingCentral calls "connected" that lasted seconds: it reached voicemail.
  const b = await newLead({ phone: '(504) 555-0112' })
  const c = await newLead({ phone: '(504) 555-0119' })
  await addCall({ when: at(0, 14, 0), direction: 'outbound', number: '+15045550112', outcome: 'no_answer' })
  await addCall({ when: at(0, 14, 5), direction: 'outbound', number: '+15045550119', seconds: 20 })
  await run(at(1, 10, 32))
  assert.deepEqual([(await lead(b)).status, (await lead(c)).status], ['new', 'new'])
  assert.deepEqual((await jobs(c, 'lead_followup')).map((j) => j.status), ['done', 'pending'], 'the voicemail lead is still followed up')
})

test('the lead calling in and being answered counts the same', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504 555 0113' })
  await addCall({ when: at(0, 15, 0), direction: 'inbound', cls: 'answered', number: '+15045550113' })
  // A call from BEFORE they wrote in proves nothing about this inquiry.
  const b = await newLead({ phone: '504 555 0114' })
  await addCall({ when: at(-1, 15, 0), direction: 'inbound', cls: 'answered', number: '+15045550114' })
  await run(at(1, 10, 31))
  assert.deepEqual([(await lead(a)).status, (await lead(a)).status_reason], ['contacted', 'client_called_and_was_answered'])
  assert.equal((await lead(b)).status, 'new')
})

test('a call on a number two people share stops the texts but changes nobody’s status', { skip: SKIP }, async () => {
  const a = await newLead({ email: 'madre@example.test', phone: '504-555-0115' })
  const b = await newLead({ email: 'hijo@example.test', phone: '504-555-0115' })
  await addCall({ when: at(0, 14, 0), direction: 'outbound', number: '+15045550115' })
  await run(at(1, 10, 31))
  assert.equal(txt.sent.filter((m) => /seguimos atentos/.test(m.text)).length, 0, 'no follow-up to either')
  assert.deepEqual([(await lead(a)).status, (await lead(b)).status], ['new', 'new'])
})

test('a text reply stops the follow-ups and asks for a person; STOP ends automatic texts for good', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504-555-0116' })
  const b = await newLead({ phone: '504-555-0117' })
  await run(new Date(T0.getTime() + MIN))
  txt.inbound = [
    { id: 'in-1', fromKey: '5045550116', text: 'Sí, gracias. ¿Pueden llamarme mañana?', at: at(0, 15, 0) },
    { id: 'in-2', fromKey: '5045550117', text: ' stop. ', at: at(0, 15, 5) },
  ]
  await run(at(1, 10, 31))
  await run(at(3, 10, 31))
  assert.equal(txt.sent.length, 2, 'the two acknowledgments and nothing after')
  // The reply: follow-ups cancelled, still New (nobody at the firm has spoken to them), shown as needing a person.
  assert.deepEqual((await jobs(a, 'lead_followup')).map((j) => j.outcome), ['client_replied_by_text', 'client_replied_by_text'])
  assert.equal((await lead(a)).status, 'new')
  const att = await http('GET', '/api/submissions/attention')
  assert.deepEqual(att.json.items.filter((i) => i.id === a).map((i) => i.reason), ['client_replied'])
  // The words are not kept: only that there was a reply.
  assert.deepEqual(Object.keys((await db.query('SELECT * FROM rc_sms_inbound LIMIT 1')).rows[0]).sort(), ['created_at', 'from_key', 'handled_at', 'handled_by', 'id', 'kind', 'rc_message_id', 'received_at', 'submission_id'])
  // STOP: on the list, and the follow-ups are refused because of it.
  assert.equal(await A.suppression.suppressionReason(db, { channel: 'sms', address: '+1 504 555 0117' }), 'opt_out')
  assert.deepEqual((await jobs(b, 'lead_followup')).map((j) => j.outcome), ['suppressed_opt_out', 'suppressed_opt_out'])
  assert.equal((await events('automation.opt_out')).length, 1)
  // Reading the same messages again changes nothing.
  await run(at(3, 10, 40))
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM rc_sms_inbound')).rows[0].n, 2)
  // START lifts an opt-out the person sent.
  txt.inbound = [{ id: 'in-3', fromKey: '5045550117', text: 'START', at: at(3, 11, 0) }]
  await run(at(3, 11, 5))
  assert.equal(await A.suppression.suppressionReason(db, { channel: 'sms', address: '5045550117' }), null)
  // A person marks the reply seen to, and it leaves the list.
  await http('POST', `/api/submissions/${a}/text-replies/handled`, {})
  assert.deepEqual((await http('GET', '/api/submissions/attention')).json.items.filter((i) => i.id === a && i.reason === 'client_replied'), [])
})

test('a reply can count as Contacted when the firm asks for that', { skip: SKIP }, async () => {
  await http('PUT', '/api/automation/settings/status', { contactedOnClientReply: true }, u.owner)
  const a = await newLead({ phone: '504-555-0118' })
  await run(new Date(T0.getTime() + MIN))
  txt.inbound = [{ id: 'in-9', fromKey: '5045550118', text: 'Hola', at: at(0, 15, 0) }]
  await run(at(1, 10, 31))
  assert.deepEqual([(await lead(a)).status, (await lead(a)).status_reason], ['contacted', 'client_replied_by_text'])
})

test('a booking on the calendar marks the lead Scheduled, shows on the lead and stops the follow-ups', { skip: SKIP }, async () => {
  const a = await newLead({ email: 'Booked.Client@example.test' })
  const other = await newLead({ email: 'someone@example.test' })
  await run(new Date(T0.getTime() + MIN))
  cal.events = [
    { id: 'ev-1', cancelled: false, startsAt: at(2, 15, 0), endsAt: at(2, 15, 30), guestEmails: ['booked.client@example.test'], updatedAt: at(0, 12, 0) },
    // An event with nobody we know: not kept at all.
    { id: 'ev-2', cancelled: false, startsAt: at(2, 16, 0), endsAt: at(2, 16, 30), guestEmails: ['stranger@example.test'], updatedAt: at(0, 12, 0) },
  ]
  await run(at(0, 12, 5))
  const l = await lead(a)
  assert.deepEqual([l.status, l.status_reason, l.status_auto], ['scheduled', 'consultation_booked', true])
  assert.equal((await lead(other)).status, 'new')
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM consultation_bookings')).rows[0].n, 1, 'only the matched event is kept')
  const detail = await http('GET', `/api/submissions/${a}`)
  assert.equal(detail.json.automation.bookings.length, 1)
  assert.equal(new Date(detail.json.automation.bookings[0].startsAt).toISOString(), at(2, 15, 0).toISOString())
  await run(at(1, 10, 31))
  // The other lead, still New, gets its follow-up; the booked one does not.
  assert.equal(txt.sent.filter((m) => /seguimos atentos/.test(m.text)).length, 1)
  assert.deepEqual((await jobs(a, 'lead_followup')).map((j) => j.outcome), ['consultation_booked', 'consultation_booked'])
  // Cancelled on the calendar: not un-scheduled by guesswork, but a person is asked to look.
  cal.events = [{ id: 'ev-1', cancelled: true, startsAt: null, endsAt: null, guestEmails: [], updatedAt: null }]
  await run(at(1, 11, 0))
  assert.equal((await lead(a)).status, 'scheduled')
  assert.deepEqual((await http('GET', '/api/submissions/attention')).json.items.filter((i) => i.id === a).map((i) => i.reason), ['booking_cancelled'])
})

test('archiving, closing or stopping a lead by hand ends its automatic messages', { skip: SKIP }, async () => {
  const archived = await newLead()
  const closed = await newLead()
  const stopped = await newLead()
  const spam = await newLead()
  await run(new Date(T0.getTime() + MIN))
  const before_ = txt.sent.length
  assert.equal((await http('PATCH', `/api/submissions/${archived}/archive`, { archived: true })).status, 200)
  assert.equal((await http('PATCH', `/api/submissions/${closed}/status`, { status: 'closed' })).status, 200)
  assert.equal((await http('PATCH', `/api/submissions/${stopped}/automation`, { paused: true })).status, 200)
  assert.equal((await http('POST', `/api/submissions/${spam}/spam`, { state: 'spam' })).status, 200)
  for (const when of [at(1, 10, 31), at(3, 10, 31), at(7, 10, 31)]) await run(when)
  assert.equal(txt.sent.length, before_, 'nothing more to any of them')
  const why = async (id) => [...new Set((await jobs(id, 'lead_followup')).map((j) => `${j.status}:${j.outcome}`))]
  assert.deepEqual(await why(archived), ['cancelled:archived'])
  assert.deepEqual(await why(closed), ['cancelled:status_closed'])
  assert.deepEqual(await why(stopped), ['cancelled:stopped_by_staff'])
  assert.deepEqual(await why(spam), ['cancelled:spam'])
  // Stopping messages leaves the deadline for a person in place.
  assert.equal((await lead(stopped)).status, 'new')
  assert.ok((await jobs(stopped, 'lead_sla')).length >= 1)
})

test('follow-ups are text only: an email follow-up step is refused, with why', { skip: SKIP }, async () => {
  const r = await http('PUT', '/api/automation/settings/followup', { steps: [{ key: 'followup_1', afterBusinessDays: 1, channel: 'email', templateKey: 'lead_ack_email' }], noResponseAfterBusinessDays: 5 }, u.owner)
  assert.equal(r.status, 400)
  assert.match(r.json.error, /only be sent by text message: replies to an email follow-up cannot be seen/)
})

test('every step looks at the lead again right before acting, whatever else has or has not run', { skip: SKIP }, async () => {
  // Only the jobs, without the sweeps and without the portal's own
  // cancelling: as on an instance that did not get the sweep lock, with a
  // change made straight in the database.
  const { leadHandlers } = A.leads
  const settings = await A.settings.loadSettings(db)
  const { pollInboundSms } = await import('./automation/smsInbound.js')
  const onlyJobs = async (when) => {
    await pollInboundSms(db, sms, { now: when, force: true }) // replies were read a moment ago
    return A.jobs.runDueJobs(db, leadHandlers(), { now: when, ctx: { db, env: ENV, flags: resolveFlags(ENV), settings, mailer, staffMailer: mailer, sms, pushOptions: { env: PUSH_ENV, transport }, now: when, budget: { sms: 10 } } })
  }
  const contacted = await newLead()
  const stopped = await newLead()
  const called = await newLead({ phone: '504-555-0141' })
  const booked = await newLead({ email: 'booked.now@example.test' })
  const untouched = await newLead()
  await onlyJobs(new Date(T0.getTime() + MIN))
  assert.equal(txt.sent.length, 5, 'five acknowledgments')
  await db.query("UPDATE submissions SET status = 'contacted' WHERE id = $1", [contacted])
  await db.query('UPDATE submissions SET automation_paused = TRUE WHERE id = $1', [stopped])
  await addCall({ when: at(0, 11, 0), direction: 'outbound', number: '+15045550141' })
  await db.query("INSERT INTO consultation_bookings (provider, external_id, submission_id, starts_at, status) VALUES ('google_calendar', 'x1', $1, $2, 'booked')", [booked, at(2, 15, 0)])
  await onlyJobs(at(1, 10, 31))
  const first = async (id, type) => { const j = (await jobs(id, type))[0]; return `${j.status}:${j.outcome}` }
  assert.equal(await first(contacted, 'lead_followup'), 'cancelled:status_contacted')
  assert.equal(await first(stopped, 'lead_followup'), 'cancelled:stopped_by_staff')
  assert.equal(await first(called, 'lead_followup'), 'cancelled:connected_callback')
  assert.equal(await first(booked, 'lead_followup'), 'cancelled:consultation_booked')
  assert.equal(await first(untouched, 'lead_followup'), 'done:sent')
  assert.equal(txt.sent.length, 6, 'one follow-up, to the lead nothing happened to')
  // The deadline: no escalation for a lead a person reached or that booked.
  assert.equal(await first(called, 'lead_sla'), 'cancelled:client_reached')
  assert.equal(await first(booked, 'lead_sla'), 'cancelled:client_reached')
  assert.equal(await first(contacted, 'lead_sla'), 'cancelled:status_contacted')
  assert.equal(await first(untouched, 'lead_sla'), 'done:level_1')
  assert.deepEqual((await db.query('SELECT id FROM submissions WHERE escalation_level > 0 ORDER BY id')).rows.map((r) => r.id).sort(), [stopped, untouched].sort())
})

// --- status from evidence -------------------------------------------------------------

test('a reply from the portal marks the lead Contacted and ends the sequence', { skip: SKIP }, async () => {
  const a = await newLead()
  await run(new Date(T0.getTime() + MIN))
  assert.equal((await lead(a)).status, 'new', 'the automatic acknowledgment alone is not contact')
  const r = await http('POST', `/api/submissions/${a}/reply`, { body: 'Hola Ana, la llamamos mañana.' })
  assert.equal(r.status, 201, r.text)
  const l = await lead(a)
  assert.deepEqual([l.status, l.status_reason, l.status_auto], ['contacted', 'staff_replied', false])
  const rest = (await jobs(a)).filter((j) => ['lead_followup', 'lead_no_response', 'lead_sla'].includes(j.type))
  assert.equal(rest.length, 4)
  assert.ok(rest.every((j) => j.status === 'cancelled' && j.outcome === 'staff_replied'), JSON.stringify(rest))
  for (const when of [at(1, 10, 31), at(3, 10, 31)]) await run(when)
  assert.equal(txt.sent.length, 1)
})

test('nothing ever marks a lead Retained on its own', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504-555-0121', email: 'ret@example.test' })
  await addCall({ when: at(0, 14, 0), direction: 'outbound', number: '+15045550121' })
  cal.events = [{ id: 'ev-r', cancelled: false, startsAt: at(2, 15, 0), endsAt: at(2, 15, 30), guestEmails: ['ret@example.test'], updatedAt: at(0, 12, 0) }]
  for (const when of [new Date(T0.getTime() + MIN), at(1, 10, 31), at(3, 10, 31), at(7, 10, 31), at(14, 10, 31)]) await run(when)
  assert.equal((await lead(a)).status, 'scheduled')
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM submissions WHERE status IN ('retained', 'closed')")).rows[0].n, 0)
  assert.ok((await events('automation.lead_status')).every((e) => ['contacted', 'scheduled', 'no_response'].includes(e.details.to)))
})

test('with the status switch off, evidence still stops the texts but the status is left alone', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504-555-0122' })
  await addCall({ when: at(0, 14, 0), direction: 'outbound', number: '+15045550122' })
  await run(at(1, 10, 31), { LEAD_STATUS_AUTOMATION_ENABLED: 'false' })
  assert.equal((await lead(a)).status, 'new')
  assert.deepEqual((await jobs(a, 'lead_followup')).map((j) => j.status), ['cancelled', 'cancelled'])
})

// --- ownership and escalation -----------------------------------------------------------

test('a new lead nobody has contacted is escalated once per level, in office time', { skip: SKIP }, async () => {
  const a = await newLead({ consent: false })
  assert.equal(new Date((await lead(a)).sla_due_at).toISOString(), at(0, 12, 30).toISOString(), 'two office hours after it came in')
  await run(at(0, 12, 29))
  assert.equal((await lead(a)).escalation_level, 0)
  await run(at(0, 12, 31))
  await run(at(0, 12, 32))
  await run(at(0, 12, 40))
  assert.equal((await lead(a)).escalation_level, 1)
  // Everyone who can work leads is told once: here the administrator and the front desk.
  const firstLevel = pushed.filter((p) => p.payload.title === 'A website lead is waiting')
  assert.equal(firstLevel.length, 2)
  assert.equal(firstLevel[0].payload.url, `/inbox?lead=${a}`)
  // Nobody owns it: one email, to the office inbox. No name, no message.
  assert.deepEqual(staffMail().map((m) => [m.to, m.subject]), [['office@example.test', 'Campos Muños — A website lead is waiting']])
  assert.doesNotMatch(staffMail()[0].html, /Ana|Prueba|Necesito ayuda/)
  assert.equal((await events('automation.lead_escalated')).length, 1)
  assert.deepEqual((await http('GET', '/api/submissions/attention')).json.items.map((i) => [i.id, i.reason]), [[a, 'overdue']])
  // Second level six office hours later: Tuesday 10:31. In the portal only,
  // since no second-level address is set.
  await run(at(1, 10, 32))
  await run(at(1, 10, 33))
  assert.equal((await lead(a)).escalation_level, 2)
  assert.equal(pushed.filter((p) => p.payload.title === 'A website lead is still waiting').length, 2)
  assert.equal(staffMail().length, 1, 'nothing is emailed at the second level unless an address was set')
})

test('nobody is told at night: a deadline that passed while the office was closed waits for it to open', { skip: SKIP }, async () => {
  // As after the worker was off all afternoon: both deadlines are long past by 11 PM.
  const a = await newLead({ consent: false })
  const call = await addCall({ when: T0, number: '+15045550175' })
  await run(at(0, 23, 0), { MISSED_CALL_SMS_ENABLED: 'false' })
  await run(at(1, 3, 0), { MISSED_CALL_SMS_ENABLED: 'false' })
  assert.equal(pushed.length, 0)
  assert.equal(staffMail().length, 0)
  assert.equal((await lead(a)).escalation_level, 0)
  const waiting = [(await jobs(a, 'lead_sla'))[0], (await callJobs(call, 'call_sla'))[0]]
  assert.deepEqual(waiting.map((j) => [j.status, j.attempts, new Date(j.run_at).toISOString()]), [['pending', 0, at(1, 9, 0).toISOString()], ['pending', 0, at(1, 9, 0).toISOString()]])
  await run(at(1, 9, 1), { MISSED_CALL_SMS_ENABLED: 'false' })
  assert.equal((await lead(a)).escalation_level, 1)
  assert.ok(pushed.some((p) => p.payload.title === 'A website lead is waiting'))
  assert.ok(pushed.some((p) => p.payload.title === 'A caller is waiting for a call back'))
})

test('the second level is emailed only when an address was set for it', { skip: SKIP }, async () => {
  await http('PUT', '/api/automation/settings/sla', { newLeadMinutes: 120, newLeadSecondMinutes: 360, missedCallMinutes: 120, missedCallSecondMinutes: 360, secondLevelEmail: 'manager@example.test' }, u.owner)
  await newLead({ consent: false })
  await run(at(0, 12, 31))
  await run(at(1, 10, 32))
  assert.deepEqual(staffMail().map((m) => m.to), ['office@example.test', 'manager@example.test'])
})

test('an owned lead is escalated to its owner', { skip: SKIP }, async () => {
  await http('PUT', '/api/automation/settings/ownership', { defaultLeadOwnerId: u.desk.id }, u.owner)
  const a = await newLead({ consent: false })
  assert.equal((await lead(a)).owner_id, u.desk.id)
  await run(at(0, 12, 31))
  assert.equal(pushed.filter((p) => p.payload.title === 'A website lead is waiting').length, 1, 'only the owner')
  assert.deepEqual(staffMail().map((m) => m.to), ['desk@example.test'])
  // Someone who cannot open leads cannot be made the owner.
  assert.equal((await http('PUT', `/api/submissions/${a}/owner`, { ownerId: u.para.id })).status, 400)
  assert.equal((await http('PUT', `/api/submissions/${a}/owner`, { ownerId: null })).json.ownerId, null)
})

test('a lead someone dealt with in time is never escalated', { skip: SKIP }, async () => {
  const replied = await newLead({ consent: false })
  const called = await newLead({ consent: false, phone: '504-555-0131' })
  await http('POST', `/api/submissions/${replied}/reply`, { body: 'Con gusto le ayudamos.' })
  await addCall({ when: at(0, 11, 0), direction: 'outbound', number: '+15045550131' })
  await run(at(0, 12, 31))
  await run(at(1, 10, 32))
  assert.equal(pushed.length, 0)
  assert.equal(staffMail().length, 0)
  assert.deepEqual([(await lead(replied)).escalation_level, (await lead(called)).escalation_level], [0, 0])
  assert.deepEqual((await http('GET', '/api/submissions/attention')).json.items, [])
})

test('Home shows the leads that need a person, without repeating one', { skip: SKIP }, async () => {
  const a = await newLead({ consent: false })
  await run(at(0, 12, 31))
  clockNow = at(0, 12, 35)
  const q = await http('GET', '/api/work-queue')
  assert.deepEqual(q.json.items.map((i) => [i.kind, i.reason || null, i.path]), [['lead_attention', 'overdue', `/inbox?lead=${a}`]], 'once, not also as a new lead')
  assert.equal((await http('GET', '/api/work-queue', undefined, u.para)).status, 403)
})

// --- missed-call text-back -------------------------------------------------------------

test('a caller the firm missed is texted once, however often they ring', { skip: SKIP }, async () => {
  const first = await addCall({ when: T0, number: '+15045550150' })
  await run(new Date(T0.getTime() + 1 * MIN))
  assert.equal(txt.calls.length, 0, 'not before RingCentral’s record has settled')
  await addCall({ when: new Date(T0.getTime() + 2 * MIN), number: '+15045550150' })
  await addCall({ when: new Date(T0.getTime() + 6 * MIN), number: '+15045550150', cls: 'voicemail' })
  await run(new Date(T0.getTime() + 4 * MIN))
  await run(new Date(T0.getTime() + 8 * MIN))
  await run(new Date(T0.getTime() + 20 * MIN))
  assert.equal(txt.sent.length, 1)
  assert.equal(txt.sent[0].to, '+15045550150')
  assert.match(txt.sent[0].text, /lamentamos no haber contestado su llamada[\s\S]*Sorry we missed your call[\s\S]*STOP/)
  assert.deepEqual((await callJobs(first, 'missed_call_sms')).map((j) => [j.status, j.outcome]), [['done', 'sent']])
  assert.deepEqual((await events('automation.missed_call_sms_sent')).map((e) => e.entity_id), [String(first)])
})

test('what is not a missed caller is never texted', { skip: SKIP }, async () => {
  await addCall({ when: T0, number: '+15045550151', cls: 'answered' })
  await addCall({ when: T0, number: '+15045550152', direction: 'outbound' })
  await addCall({ when: T0, number: '+15045550153', internal: true })
  await addCall({ when: T0, number: null }) // withheld
  await addCall({ when: T0, number: '+15045550154', cls: 'system' })
  await addCall({ when: T0, number: '+15045550155', cls: 'unknown' }) // no recorded outcome: the quiet review group
  const spam = await addCall({ when: T0, number: '+15045550156' })
  await db.query("INSERT INTO rc_call_exclusions (call_id, reason) VALUES ($1, 'spam')", [spam])
  await addCall({ when: T0, number: '+15045550157' })
  await db.query("INSERT INTO rc_ignored_numbers (counterpart_key, number, reason) VALUES ('5045550157', '+15045550157', 'staff_test')")
  const handled = await addCall({ when: T0, number: '+15045550158' })
  await db.query('INSERT INTO rc_call_resolutions (call_key) SELECT call_key FROM rc_calls WHERE id = $1', [handled])
  await run(new Date(T0.getTime() + 5 * MIN))
  await run(new Date(T0.getTime() + 10 * MIN))
  assert.equal(txt.calls.length, 0)
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM automation_jobs WHERE type = 'missed_call_sms'")).rows[0].n, 0, 'none of them was even queued')
})

test('a caller reached before the text goes out is not texted', { skip: SKIP }, async () => {
  const a = await addCall({ when: T0, number: '+15045550160' })
  await run(new Date(T0.getTime() + 1 * MIN))
  await addCall({ when: new Date(T0.getTime() + 2 * MIN), direction: 'outbound', number: '+15045550160' })
  await run(new Date(T0.getTime() + 5 * MIN))
  assert.equal(txt.calls.length, 0)
  assert.deepEqual((await callJobs(a, 'missed_call_sms')).map((j) => [j.status, j.outcome]), [['cancelled', 'resolved']])
  // Marked as needing no callback in the meantime: the same.
  const b = await addCall({ when: new Date(T0.getTime() + 10 * MIN), number: '+15045550161' })
  await run(new Date(T0.getTime() + 11 * MIN))
  await db.query("INSERT INTO rc_call_exclusions (call_id, reason) VALUES ($1, 'verification')", [b])
  await run(new Date(T0.getTime() + 15 * MIN))
  assert.equal(txt.calls.length, 0)
})

test('one automatic text per number in a week, and none to a number that opted out', { skip: SKIP }, async () => {
  await addCall({ when: T0, number: '+15045550162' })
  await run(new Date(T0.getTime() + 5 * MIN))
  assert.equal(txt.sent.length, 1)
  // Called back, then missed again two days later: a new episode, inside the week.
  await addCall({ when: at(0, 14, 0), direction: 'outbound', number: '+15045550162' })
  const again = await addCall({ when: at(2, 11, 0), number: '+15045550162' })
  await run(at(2, 11, 5))
  assert.equal(txt.sent.length, 1)
  assert.deepEqual((await callJobs(again, 'missed_call_sms')).map((j) => j.outcome), ['cooldown'])
  // Eight days on it may be texted again.
  await addCall({ when: at(2, 14, 0), direction: 'outbound', number: '+15045550162' })
  await addCall({ when: at(8, 11, 0), number: '+15045550162' })
  await run(at(8, 11, 5))
  assert.equal(txt.sent.length, 2)
  // Opted out (here: of the WhatsApp payment reminders, for the same phone).
  const c = (await db.query("INSERT INTO billing_clients (eimmigration_client_id, display_name) VALUES ('EIM-X', 'X') RETURNING id")).rows[0].id
  await db.query("INSERT INTO billing_client_contacts (client_id, phone_e164, opted_out_at) VALUES ($1, '15045550163', NOW())", [c])
  const out = await addCall({ when: at(8, 12, 0), number: '+15045550163' })
  await run(at(8, 12, 5))
  assert.equal(txt.sent.length, 2)
  assert.deepEqual((await callJobs(out, 'missed_call_sms')).map((j) => j.outcome), ['suppressed_whatsapp_opt_out'])
  await db.query('DELETE FROM billing_clients WHERE id = $1', [c])
})

test('a call missed at night is texted in the morning, if nobody has dealt with it by then', { skip: SKIP }, async () => {
  const a = await addCall({ when: at(0, 21, 0), number: '+15045550164' })
  const b = await addCall({ when: at(0, 21, 10), number: '+15045550165' })
  await run(at(0, 21, 15))
  assert.equal(txt.calls.length, 0, 'not at night')
  await addCall({ when: at(1, 9, 5), direction: 'outbound', number: '+15045550165' })
  await run(at(1, 10, 1))
  assert.deepEqual(txt.sent.map((m) => m.to), ['+15045550164'])
  assert.deepEqual((await callJobs(b, 'missed_call_sms')).map((j) => j.outcome), ['resolved'])
  assert.equal((await callJobs(a, 'missed_call_sms'))[0].outcome, 'sent')
})

test('RingCentral asking us to slow down delays the text; an uncertain send is never repeated', { skip: SKIP }, async () => {
  const a = await addCall({ when: T0, number: '+15045550166' })
  txt.queue.push({ ok: false, outcome: 'failed', code: 'CMN-301', retryable: true, retryAfterMs: 2 * MIN })
  await run(new Date(T0.getTime() + 5 * MIN))
  let j = (await callJobs(a, 'missed_call_sms'))[0]
  assert.deepEqual([j.status, j.attempts], ['pending', 0], 'put back without burning an attempt')
  await run(new Date(T0.getTime() + 6 * MIN))
  assert.equal(txt.calls.length, 1, 'not hammered while waiting')
  await run(new Date(T0.getTime() + 8 * MIN))
  assert.equal(txt.sent.length, 1)
  // A timeout: it may have gone. Failed for a person, never sent again.
  const b = await addCall({ when: new Date(T0.getTime() + 30 * MIN), number: '+15045550167' })
  txt.queue.push({ ok: false, outcome: 'unknown', code: 'network_error' })
  await run(new Date(T0.getTime() + 35 * MIN))
  for (const m of [40, 60, 120, 600]) await run(new Date(T0.getTime() + m * MIN))
  assert.equal(txt.calls.filter((c) => c.to === '+15045550167').length, 1)
  j = (await callJobs(b, 'missed_call_sms'))[0]
  assert.deepEqual([j.status, j.outcome], ['failed', 'unknown_delivery'])
  // A failing text never stops anything else: the next caller is still texted.
  await addCall({ when: at(0, 13, 0), number: '+15045550168' })
  await run(at(0, 13, 5))
  assert.equal(txt.sent.filter((m) => m.to === '+15045550168').length, 1)
})

test('texts cannot be sent: nothing goes out, it is retried, then surfaced', { skip: SKIP }, async () => {
  txt.cap = { available: false, sender: null, reason: 'no_sms_number', candidates: [] }
  const a = await addCall({ when: T0, number: '+15045550169' })
  for (const m of [5, 8, 20, 60, 200, 400]) await run(new Date(T0.getTime() + m * MIN))
  assert.equal(txt.calls.length, 0)
  const j = (await callJobs(a, 'missed_call_sms'))[0]
  assert.deepEqual([j.status, j.outcome], ['failed', 'sms_unavailable'])
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM automation_messages')).rows[0].n, 0)
})

test('a text RingCentral accepted but could not deliver is recorded, and an opt-out it reports is kept', { skip: SKIP }, async () => {
  const a = await addCall({ when: T0, number: '+15045550170' })
  await run(new Date(T0.getTime() + 5 * MIN))
  txt.deliveries.set(txt.sent[0].id, { status: 'SendingFailed', deliveryErrorCode: 'SMS-RC-413' })
  await run(new Date(T0.getTime() + 16 * MIN))
  assert.deepEqual((await messages()).map((m) => [m.status, m.error]), [['failed', 'SMS-RC-413']])
  assert.equal(await A.suppression.suppressionReason(db, { channel: 'sms', address: '+15045550170' }), 'opt_out')
  assert.deepEqual((await callJobs(a, 'missed_call_sms')).map((j) => [j.status, j.outcome]), [['failed', 'not_delivered']])
})

test('a caller nobody has called back is escalated to the people who work the phones', { skip: SKIP }, async () => {
  const a = await addCall({ when: T0, number: '+15045550172' })
  const b = await addCall({ when: T0, number: '+15045550173' })
  await run(new Date(T0.getTime() + 5 * MIN), { MISSED_CALL_SMS_ENABLED: 'false' })
  await addCall({ when: at(0, 11, 0), direction: 'outbound', number: '+15045550173' })
  await run(at(0, 12, 31), { MISSED_CALL_SMS_ENABLED: 'false' })
  await run(at(0, 12, 33), { MISSED_CALL_SMS_ENABLED: 'false' })
  const told = pushed.filter((p) => p.payload.title === 'A caller is waiting for a call back')
  assert.equal(told.length, 3, 'administrator, front desk and receptionist, once each')
  assert.ok(told.every((p) => p.payload.url === `/calls?call=${a}`))
  assert.deepEqual((await callJobs(b, 'call_sla')).map((j) => [j.status, j.outcome]), [['cancelled', 'resolved']])
  assert.equal(txt.calls.length, 0, 'the text-back switch was off')
})

// --- contact matching ---------------------------------------------------------------

test('a caller is confirmed as a lead only when the number and the email both agree', { skip: SKIP }, async () => {
  // Wrote in twice with the same number and address, and called.
  const a1 = await newLead({ email: 'Same@example.test', phone: '504-555-0190', start: false })
  const a2 = await newLead({ email: 'same@example.test', phone: '(504) 555-0190', start: false, message: 'otra vez' })
  await addCall({ when: T0, number: '+15045550190' })
  // One lead on a number: phone only, stays for a person.
  const b = await newLead({ email: 'solo@example.test', phone: '504-555-0191', start: false })
  await addCall({ when: T0, number: '+15045550191' })
  // Two different people on one number: never confirmed.
  const c1 = await newLead({ email: 'uno@example.test', phone: '504-555-0192', start: false })
  const c2 = await newLead({ email: 'dos@example.test', phone: '504-555-0192', start: false })
  await addCall({ when: T0, number: '+15045550192' })
  // A person already said "someone else": left exactly as decided.
  const d1 = await newLead({ email: 'd@example.test', phone: '504-555-0193', start: false })
  const d2 = await newLead({ email: 'd@example.test', phone: '504-555-0193', start: false, message: 'dos' })
  await addCall({ when: T0, number: '+15045550193' })
  await db.query("INSERT INTO contact_links (phone_key, submission_id, state, decided_by) VALUES ('5045550193', $1, 'rejected', $2)", [d1, u.desk.id])

  assert.equal(await A.match.autoConfirmMatches(db), 3)
  const links = (await db.query('SELECT submission_id, state, decided_auto, evidence, decided_by FROM contact_links ORDER BY submission_id')).rows
  assert.deepEqual(links.map((l) => [l.submission_id, l.state, l.decided_auto]), [[a1, 'confirmed', true], [a2, 'confirmed', true], [d1, 'rejected', false], [d2, 'confirmed', true]])
  assert.ok(links.filter((l) => l.decided_auto).every((l) => l.evidence === 'phone_and_email_seen_twice' && l.decided_by === null))
  assert.ok(![b, c1, c2].some((id) => links.find((l) => l.submission_id === id)))
  assert.equal(await A.match.autoConfirmMatches(db), 0, 'running again decides nothing new')
  // Undone like any other decision, and it then stays undone.
  const call = (await db.query("SELECT id FROM rc_calls WHERE counterpart_key = '5045550190'")).rows[0].id
  assert.equal((await http('PUT', '/api/contacts/matches', { callId: call, lead: a1, state: 'rejected' })).status, 200)
  assert.equal(await A.match.autoConfirmMatches(db), 0)
  assert.equal((await db.query('SELECT state FROM contact_links WHERE submission_id = $1', [a1])).rows[0].state, 'rejected')
})

// --- the administrator's view ----------------------------------------------------------

test('health says what is on, what ran and what failed, without anyone’s details', { skip: SKIP }, async () => {
  assert.equal((await http('GET', '/api/automation/health')).status, 403)
  await newLead({ email: 'health@example.test', phone: '504-555-0195' })
  await run(new Date(T0.getTime() + MIN))
  const h = (await http('GET', '/api/automation/health', undefined, u.owner)).json
  assert.equal(h.flags.find((f) => f.key === 'lead_ack').on, true)
  assert.equal(h.flags.find((f) => f.key === 'billing_auto_reminders').on, false)
  assert.equal(h.flags.find((f) => f.key === 'billing_auto_reminders').why, 'switched_off')
  assert.equal(h.leadAck.done7d, 2)
  assert.equal(h.leadFollowup.pending, 3)
  assert.deepEqual(h.messages.map((m) => [m.purpose, m.channel, m.sent7d]).sort(), [['lead_ack', 'email', 1], ['lead_ack', 'sms', 1]])
  assert.ok(h.worker.lastSuccessAt)
  const text = JSON.stringify(h)
  assert.doesNotMatch(text, /health@example\.test|5045550195|Prueba/)
  assert.ok(!text.includes(vapid.privateKey) && !text.includes(process.env.JWT_SECRET), 'names of variables, never their values')
  // What the system did is in the activity log, as the system.
  const who = (await db.query("SELECT DISTINCT actor_email, source, actor_id FROM staff_activity WHERE action LIKE 'automation.%' AND source = 'system'")).rows
  assert.deepEqual(who, [{ actor_email: 'system', source: 'system', actor_id: null }])
})

test('a missed form request is picked up by the worker', { skip: SKIP }, async () => {
  // Written a moment ago; the request died before its work was queued.
  const id = (await db.query("INSERT INTO submissions (first_name, last_name, email, phone, message, language) VALUES ('Eva', 'Prueba', 'eva@example.test', '504-555-0196', 'hola', 'es') RETURNING id")).rows[0].id
  assert.deepEqual(await jobs(id), [])
  await run(new Date(Date.now() + 1000))
  assert.ok((await lead(id)).automation_started_at)
  assert.equal(clientMail().length, 1)
  // A lead from before the automation was switched on is left alone: turning
  // it on must not reach back and acknowledge this morning's leads.
  const old = (await db.query("INSERT INTO submissions (first_name, last_name, email, phone, message, created_at) VALUES ('Old', 'Lead', 'old@example.test', '504-555-0197', 'hola', NOW() - INTERVAL '3 hours') RETURNING id")).rows[0].id
  await run(new Date(Date.now() + 2000))
  assert.equal((await lead(old)).automation_started_at, null)
  assert.equal(clientMail().length, 1)
})

test('one part failing does not stop the others', { skip: SKIP }, async () => {
  await newLead({ consent: false })
  const broken = { ...calendar, listChanges: async () => { throw Object.assign(new Error('boom'), { code: 'forbidden' }) } }
  const brokenSms = { ...sms, inbound: async () => { throw Object.assign(new Error('nope'), { code: 'CMN-408' }) } }
  const r = await run(new Date(T0.getTime() + MIN), {}, { calendar: broken, sms: brokenSms })
  assert.equal(r.sweeps.calendar.error, 'forbidden')
  assert.equal(r.sweeps.sms_inbound.error, 'CMN-408')
  assert.equal(clientMail().length, 1, 'the acknowledgment still went')
  const h = (await http('GET', '/api/automation/health', undefined, u.owner)).json
  assert.equal(h.scheduling.lastError, 'forbidden')
  assert.equal(h.sms.inbound.lastError, 'CMN-408')
})

// --- found by an independent review of this code --------------------------------------

test('someone who writes in twice is followed up once, not once per message', { skip: SKIP }, async () => {
  // The chat, then the form an hour later: two leads, one person, one phone.
  const first = await newLead({ email: 'dos@example.test', phone: '504-555-0201', message: 'Hola, tengo una pregunta' })
  const second = await newLead({ email: 'dos@example.test', phone: '(504) 555-0201', message: 'Les escribí por el chat también', when: at(0, 11, 30) })
  assert.equal((await jobs(first, 'lead_followup')).length, 2)
  assert.deepEqual(await jobs(second, 'lead_followup'), [], 'no second sequence for the same person')
  for (const when of [at(0, 11, 31), at(1, 10, 31), at(1, 11, 31), at(3, 10, 31), at(3, 11, 31)]) await run(when)
  assert.deepEqual(txt.sent.map((m) => m.text.split(':')[1].trim().slice(0, 12)), ['recibimos su', 'seguimos ate', 'este es nues'], 'one acknowledgment, two follow-ups')
  // Even if a second sequence did exist (queued before the first lead had one),
  // the send itself refuses a follow-up to someone followed up on another lead this week.
  const third = await newLead({ email: 'tres@example.test', phone: '504-555-0202', when: at(7, 10, 30) })
  await run(at(7, 10, 31))
  assert.equal((await jobs(third, 'lead_followup')).length, 2)
  const fourth = await newLead({ email: 'tres@example.test', phone: '504-555-0202', message: 'otra', start: false, when: at(7, 10, 40) })
  await db.query(`INSERT INTO automation_jobs (type, idempotency_key, entity_type, entity_id, run_at, payload) VALUES ('lead_followup', $1, 'lead', $2, $3, $4)`,
    [`lead-followup:${fourth}:followup_1`, String(fourth), at(8, 10, 30), JSON.stringify({ step: 'followup_1', dueAt: at(8, 10, 30).toISOString() })])
  await db.query('UPDATE submissions SET automation_started_at = NOW() WHERE id = $1', [fourth])
  const before_ = txt.sent.length
  await run(at(8, 10, 31))
  assert.equal(txt.sent.filter((m) => m.to === '+15045550202').length, 2, 'the acknowledgment and one follow-up, to the first lead only')
  assert.equal(txt.sent.length, before_ + 1)
  assert.equal((await jobs(fourth, 'lead_followup'))[0].outcome, 'followed_up_on_another_lead')
})

test('two workers and two leads from one person: still one acknowledgment', { skip: SKIP }, async () => {
  for (let i = 0; i < 4; i++) await newLead({ email: 'same.person@example.test', phone: '504-555-0203', message: `mensaje ${i}` })
  const when = new Date(T0.getTime() + MIN)
  await Promise.all([run(when), run(when), run(when)])
  assert.equal(clientMail().length, 1)
  assert.equal(txt.sent.length, 1)
})

test('the check for "already told this person" and the send are one step, even across workers', { skip: SKIP }, async () => {
  const a = await newLead({ email: 'locked@example.test', consent: false })
  // Another worker is in the middle of that step for the same person: it
  // holds the per-recipient lock.
  const other = await db.connect()
  try {
    await other.query('BEGIN')
    await other.query("SELECT pg_advisory_xact_lock(hashtext('cm_auto_msg:' || 'lead_ack' || ':' || 'email' || ':' || 'locked@example.test'))")
    const running = run(new Date(T0.getTime() + MIN))
    await new Promise((r) => setTimeout(r, 400))
    assert.equal(mail.calls.length, 0, 'this worker waits its turn instead of checking alongside')
    // The other worker records its message for this person, then finishes.
    await other.query("INSERT INTO automation_messages (channel, purpose, entity_type, entity_id, to_key, idempotency_key, status, created_at) VALUES ('email', 'lead_ack', 'lead', '999', 'locked@example.test', 'lead-ack-email:999', 'sent', $1)", [T0])
    await other.query('COMMIT')
    await running
  } finally {
    await other.query('ROLLBACK').catch(() => {})
    other.release()
  }
  assert.equal(mail.calls.length, 0, 'and then sees the other one, and does not send a second')
  assert.equal((await jobs(a, 'lead_ack_email'))[0].outcome, 'recently_acknowledged')
})

test('"Yes" is an answer: it stops the follow-ups like any other reply', { skip: SKIP }, async () => {
  const yes = await newLead({ phone: '504-555-0204' })
  const help = await newLead({ phone: '504-555-0205' })
  await run(new Date(T0.getTime() + MIN))
  txt.inbound = [{ id: 'y-1', fromKey: '5045550204', text: 'Yes', at: at(0, 15, 0) }, { id: 'y-2', fromKey: '5045550205', text: 'HELP', at: at(0, 15, 1) }]
  for (const when of [at(1, 10, 31), at(3, 10, 31), at(7, 10, 31)]) await run(when)
  assert.equal(txt.sent.length, 2, 'the two acknowledgments only')
  for (const id of [yes, help]) {
    assert.deepEqual((await jobs(id, 'lead_followup')).map((j) => j.outcome), ['client_replied_by_text', 'client_replied_by_text'])
    assert.equal((await lead(id)).status, 'new', 'not No response: they answered')
  }
  assert.deepEqual((await http('GET', '/api/submissions/attention')).json.items.map((i) => i.reason), ['client_replied', 'client_replied'])
})

test('nothing is texted while replies cannot be read', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504-555-0206' })
  const call = await addCall({ when: T0, number: '+15045550207' })
  const deaf = { ...sms, inbound: async () => { throw Object.assign(new Error('no'), { code: 'CMN-408' }) } }
  // Reading replies has never worked: no acknowledgment text, no missed-call text. The email still goes.
  for (const m of [1, 5, 9]) await run(new Date(T0.getTime() + m * MIN), {}, { sms: deaf })
  assert.equal(txt.calls.length, 0)
  assert.equal(clientMail().length, 1)
  assert.deepEqual([(await jobs(a, 'lead_ack_sms'))[0].status, (await callJobs(call, 'missed_call_sms'))[0].status], ['pending', 'pending'], 'waiting, not failed')
  // It works again: they go.
  await run(new Date(T0.getTime() + 30 * MIN))
  assert.deepEqual(txt.sent.map((m) => m.to).sort(), ['+15045550206', '+15045550207'])
  // It stops working for days: the follow-up waits, then its moment has passed.
  for (const when of [at(1, 10, 31), at(1, 14, 0), at(2, 10, 31), at(3, 10, 31), at(4, 10, 45)]) await run(when, {}, { sms: deaf })
  assert.equal(txt.sent.length, 2, 'no follow-up went out blind')
  assert.deepEqual((await jobs(a, 'lead_followup')).map((j) => [j.status, j.outcome])[0], ['skipped', 'too_late'])
  // With the switch for reading replies off, the text switches are off too.
  const b = await newLead({ phone: '504-555-0208', env: { RINGCENTRAL_SMS_INBOUND_ENABLED: 'false' } })
  assert.deepEqual((await jobs(b)).map((j) => j.type).sort(), ['lead_ack_email', 'lead_sla'])
})

test('after the worker was off for days, follow-ups do not arrive back to back', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504-555-0209' })
  await run(new Date(T0.getTime() + MIN))
  // Off from Monday evening until Thursday noon: follow-up 1 (Tuesday) and 2 (Thursday) are both due.
  await run(at(3, 12, 0))
  assert.equal(txt.sent.length, 2, 'the acknowledgment and ONE follow-up')
  const [, second] = await jobs(a, 'lead_followup')
  assert.equal(second.status, 'pending')
  assert.equal(new Date(second.run_at).toISOString(), at(4, 10, 0).toISOString(), 'twenty hours on, at the next texting hour')
  await run(at(4, 10, 1))
  assert.equal(txt.sent.length, 3)
  assert.equal((await lead(a)).status, 'new', 'not marked No response in the same breath')
})

test('"stop automatic messages" on a lead also covers a text to that phone after a missed call', { skip: SKIP }, async () => {
  const stopped = await newLead({ phone: '504-555-0210' })
  await newLead({ phone: '504-555-0211', email: 'sales@vendor.example' })
  await http('PATCH', `/api/submissions/${stopped}/automation`, { paused: true })
  await db.query("UPDATE submissions SET spam_state = 'spam', status = 'closed', is_archived = TRUE WHERE phone = '504-555-0211'")
  await run(new Date(T0.getTime() + MIN))
  const before_ = txt.sent.length
  const c1 = await addCall({ when: at(0, 11, 0), number: '+15045550210' })
  const c2 = await addCall({ when: at(0, 11, 0), number: '+15045550211' })
  await run(at(0, 11, 5))
  assert.equal(txt.sent.length, before_)
  assert.deepEqual([(await callJobs(c1, 'missed_call_sms'))[0].outcome, (await callJobs(c2, 'missed_call_sms'))[0].outcome], ['stopped_by_staff', 'spam'])
})

test('not being able to read a delivery receipt is not shown as a failed message', { skip: SKIP }, async () => {
  const a = await newLead({ phone: '504-555-0212' })
  await run(new Date(T0.getTime() + MIN))
  const blind = { ...sms, delivery: async () => null }
  for (const m of [12, 15, 30, 60, 200]) await run(new Date(T0.getTime() + m * MIN), {}, { sms: blind })
  const check = (await db.query("SELECT status, outcome FROM automation_jobs WHERE type = 'sms_delivery_check'")).rows
  assert.deepEqual(check, [{ status: 'skipped', outcome: 'record_unavailable' }])
  assert.deepEqual((await http('GET', '/api/automation/exceptions', undefined, u.owner)).json.items, [])
  assert.deepEqual((await http('GET', `/api/submissions/${a}`)).json.automation.failed, [])
  assert.equal((await messages()).find((m) => m.channel === 'sms').status, 'sent')
})

test('an escalation that could not tell anyone is tried again, not counted as done', { skip: SKIP }, async () => {
  const a = await newLead({ consent: false })
  // The notification step fails outright once (as a database error would).
  const real = db.query.bind(db)
  let failNext = true
  db.query = (sql, ...rest) => {
    if (failNext && typeof sql === 'string' && /FROM admin_users\s+WHERE disabled_at IS NULL/.test(sql)) { failNext = false; return Promise.reject(Object.assign(new Error('connection lost'), { code: '57P01' })) }
    return real(sql, ...rest)
  }
  try {
    await run(at(0, 12, 31))
  } finally {
    db.query = real
  }
  assert.equal(failNext, false, 'the failure was exercised')
  assert.equal(pushed.length, 0)
  assert.equal((await lead(a)).escalation_level, 0, 'the level was given back')
  assert.equal((await jobs(a, 'lead_sla'))[0].status, 'pending')
  await run(at(0, 12, 40))
  assert.equal((await lead(a)).escalation_level, 1)
  assert.equal(pushed.filter((p) => p.payload.title === 'A website lead is waiting').length, 2)
})
