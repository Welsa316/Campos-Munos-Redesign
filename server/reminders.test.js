// Callback reminders (server/reminders/, routes/reminders.js) over real HTTP
// and a real Postgres: setting them, who may, and the worker that delivers
// them with no portal open. Nothing real is ever sent: the mailer is a fake
// that behaves like Resend's idempotency, and web-push is a recorder.
// Synthetic people and 555-01xx numbers only.
//
// Own database: <TEST_DATABASE_URL's name>_followups (created if missing;
// must contain "test"; schema dropped, rebuilt and migrated twice). Run with
// TEST_DATABASE_URL=postgres://localhost/camulaw_reminders_test.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import crypto from 'crypto'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import webpush from 'web-push'
import { CLASSIFIER_VERSION } from './integrations/ringcentral/callEvidence.js'
import { nextBusinessMorning, firmWall, firmInstant, parseDue } from './reminders/dueTime.js'
import { renderReminderEmail, emailAllowlist, createResendMailer, REMINDER_EMAIL } from './reminders/email.js'
import { backoffAfter, EMAIL_BACKOFF_MINUTES, MAX_EMAIL_ATTEMPTS } from './reminders/worker.js'
import { CALLBACK_REMINDER } from './push/send.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_followups`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

const vapid = webpush.generateVAPIDKeys()
const PUSH_ENV = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:test@example.test' }
const BASE_ENV = { ...PUSH_ENV, PORTAL_URL: 'https://portal.example.test' }

// Push: every send recorded; an endpoint in `failing` answers 500.
const pushed = []
const failing = new Set()
const transport = {
  async sendNotification(sub, payload) {
    pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
    if (failing.has(sub.endpoint)) throw Object.assign(new Error('Received unexpected response code'), { statusCode: 500, body: 'try later' })
    return { statusCode: 201 }
  },
}

// Email: like Resend, a repeated idempotency key is not sent again. `queue`
// holds answers for the next calls (a failure, or a thrown error).
const mail = { sent: [], calls: [], keys: new Map(), queue: [] }
const mailer = {
  async send(msg) {
    mail.calls.push(msg)
    const next = mail.queue.shift()
    if (next instanceof Error) throw next
    if (next && next !== 'sent-then-dropped') return next
    if (mail.keys.has(msg.idempotencyKey)) return { ok: true, id: mail.keys.get(msg.idempotencyKey) }
    const id = `em_${mail.sent.length + 1}`
    mail.keys.set(msg.idempotencyKey, id)
    mail.sent.push(msg)
    // Accepted by the provider, but the answer never arrived (a timeout).
    if (next === 'sent-then-dropped') throw new Error('socket hang up')
    return { ok: true, id }
  },
}

let server, base, db, worker
const u = {}
const clock = { t: new Date('2026-11-04T18:00:00Z') } // Wed Nov 4 2026, noon in New Orleans
const MIN = 60 * 1000

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'followups-test-secret-0123456789abcdef'
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
       ('para@example.test', 'x', 'billing_paralegal', 'Billing'),
       ('leads@example.test', 'x', 'staff', 'Leads only'),
       ('gone@example.test', 'x', 'front_desk', 'Gone'),
       ('not-an-email', 'x', 'front_desk', 'No mail'),
       ('tech@camulaw.com', 'x', 'front_desk', 'Tech')
     RETURNING id, token_version, email`
  )).rows
  await db.query("UPDATE admin_users SET disabled_at = NOW() WHERE email = 'gone@example.test'")
  for (const r of rows) {
    const key = r.email === 'not-an-email' ? 'nomail' : r.email.split('@')[0]
    u[key] = { id: Number(r.id), cookie: `token=${jwt.sign({ id: r.id, email: r.email, tv: r.token_version }, process.env.JWT_SECRET)}` }
  }
  // A computer with notifications on, for each person who gets reminders here.
  for (const k of ['desk', 'ciro', 'nomail', 'tech', 'owner']) {
    await db.query('INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
      [u[k].id, `https://fcm.googleapis.com/fcm/send/${k}-${crypto.randomBytes(6).toString('hex')}`, crypto.randomBytes(65).toString('base64url'), crypto.randomBytes(16).toString('base64url')])
  }

  worker = await import('./reminders/worker.js')
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('./app.js')
  const { createRemindersRouter } = await import('./routes/reminders.js')
  const { createCallsRouter } = await import('./routes/calls.js')
  const submissions = (await import('./routes/submissions.js')).default
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/reminders', createRemindersRouter({ db, now: () => clock.t }))
  app.use('/api/calls', createCallsRouter({ db, env: { NODE_ENV: 'test' }, now: () => clock.t }))
  app.use('/api/submissions', submissions)
  const { createWorkQueueRouter } = await import('./routes/workQueue.js')
  app.use('/api/work-queue', createWorkQueueRouter({ db, now: () => clock.t }))
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

async function send(method, path, body, as = u.desk) {
  const res = await fetch(base + path, { method, headers: { Cookie: as.cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}

let seq = 0
async function addCall({ at, direction = 'inbound', cls = 'not_answered', number, outcome }) {
  const id = `fu-${++seq}`
  const out = outcome || (direction === 'outbound' ? 'connected' : cls === 'answered' ? 'answered' : 'missed')
  const r = await db.query(
    `INSERT INTO rc_calls (rc_record_id, telephony_session_id, direction, started_at, outcome, counterpart_number, counterpart_key, scope,
            classification, classification_evidence, classifier_version, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, cm_phone_key($6), 'account', $7, $8, $9, TRUE) RETURNING id`,
    [id, `ts-${id}`, direction, at, out, number, direction === 'inbound' ? cls : null,
      direction === 'inbound' ? JSON.stringify({ offeredTo: [], notAnsweredBy: [] }) : null, CLASSIFIER_VERSION]
  )
  return Number(r.rows[0].id)
}
let numberSeq = 10
const newNumber = () => `+1504555${String(100 + numberSeq++).padStart(4, '0')}`
const newLead = async () => (await db.query(
  "INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0199', 'Necesito ayuda con mi caso') RETURNING id"
)).rows[0].id

const run = (env = {}, at = clock.t) => worker.runReminderWorker(db, { now: at, mailer, env: { ...BASE_ENV, ...env }, pushOptions: { env: PUSH_ENV, transport } })
const reminderRow = async (id) => (await db.query('SELECT * FROM follow_up_reminders WHERE id = $1', [id])).rows[0]
const deliveries = async (id) => (await db.query('SELECT * FROM reminder_deliveries WHERE reminder_id = $1 ORDER BY cycle, kind, channel, attempt', [id])).rows
const later = (mins) => new Date(clock.t.getTime() + mins * MIN)
async function make(body, as = u.desk) {
  const r = await send('POST', '/api/reminders', body, as)
  assert.equal(r.status, 201, r.text)
  return r.json.reminder
}
const resetSends = () => { pushed.length = 0; mail.sent.length = 0; mail.calls.length = 0; mail.queue.length = 0 }
// Everything currently open is closed, so each test only sees its own reminders.
const closeAll = () => db.query("UPDATE follow_up_reminders SET status = 'cancelled', cancelled_at = NOW() WHERE status IN ('open', 'due')")

test('tomorrow morning is 9:00 AM New Orleans time on the next business day, across daylight-saving changes', () => {
  const nine = (now, iso) => {
    const at = nextBusinessMorning(new Date(now))
    assert.equal(at.toISOString(), iso, `from ${now}`)
    const w = firmWall(at)
    assert.equal(`${w.hour}:${w.minute}`, '9:0')
  }
  nine('2026-11-04T18:00:00Z', '2026-11-05T15:00:00.000Z') // Wed noon CST → Thu 9:00 CST
  nine('2026-10-29T17:00:00Z', '2026-10-30T14:00:00.000Z') // Thu → Fri 9:00 CDT
  // Fri Oct 30 (CDT) → Mon Nov 2 (CST): the weekend contains the Nov 1 fall-back.
  nine('2026-10-30T17:00:00Z', '2026-11-02T15:00:00.000Z')
  nine('2026-10-31T20:00:00Z', '2026-11-02T15:00:00.000Z') // Saturday → Monday
  // Fri Mar 6 (CST) → Mon Mar 9 (CDT): across the Mar 8 spring-forward.
  nine('2026-03-06T18:00:00Z', '2026-03-09T14:00:00.000Z')
  nine('2026-03-07T23:30:00Z', '2026-03-09T14:00:00.000Z') // Sat 5:30 PM → Monday
  // 11:30 PM Thursday local is already Friday in UTC: still Friday morning.
  nine('2026-11-06T05:30:00Z', '2026-11-06T15:00:00.000Z')
  // Before 9 AM on a weekday, "tomorrow" is still tomorrow.
  nine('2026-11-04T12:00:00Z', '2026-11-05T15:00:00.000Z')
  // A wall-clock time just after the spring-forward, on the day itself.
  assert.equal(firmInstant(2026, 3, 8, 3, 30).toISOString(), '2026-03-08T08:30:00.000Z')
  assert.equal(firmInstant(2026, 11, 1, 9, 0).toISOString(), '2026-11-01T15:00:00.000Z')
})

test('due times: future only (a minute of skew), at most a year out, presets worked out on the server', () => {
  const now = new Date('2026-11-04T18:00:00Z')
  assert.equal(parseDue('in_30', now).at.toISOString(), '2026-11-04T18:30:00.000Z')
  assert.equal(parseDue('in_60', now).at.toISOString(), '2026-11-04T19:00:00.000Z')
  assert.equal(parseDue('tomorrow_morning', now).at.toISOString(), '2026-11-05T15:00:00.000Z')
  assert.ok(parseDue('2026-11-04T17:59:30Z', now).at, '30 seconds behind is clock skew, accepted')
  assert.match(parseDue('2026-11-04T17:58:00Z', now).error, /future/)
  assert.ok(parseDue('2027-11-04T18:00:00Z', now).at)
  assert.match(parseDue('2027-11-07T18:00:00Z', now).error, /year/)
  assert.ok(parseDue('2026-11-05', now).error, 'a date without a time or zone is refused')
  assert.ok(parseDue('next tuesday', now).error)
})

test('the email: generic text and a link into the portal, nothing about the client', () => {
  const m = renderReminderEmail({ path: '/calls?call=42', env: { PORTAL_URL: 'https://admin.camulaw.com/' } })
  assert.equal(m.subject, 'Campos Muños — Callback reminder')
  assert.match(m.html, /You have a scheduled follow-up that is now due\. Open the Campos Muños portal to review the contact and complete the follow-up\./)
  assert.match(m.html, /href="https:\/\/admin\.camulaw\.com\/calls\?call=42"[^>]*>Open follow-up</)
  assert.equal(m.link, 'https://admin.camulaw.com/calls?call=42')
  assert.equal(renderReminderEmail({ path: '/inbox?lead=7', env: { ADMIN_ORIGINS: 'https://a.example, https://b.example' } }).link, 'https://a.example/inbox?lead=7')
  assert.equal(emailAllowlist({}), null)
  assert.deepEqual([...emailAllowlist({ REMINDER_EMAIL_ALLOWLIST: ' Tech@camulaw.com , ' })], ['tech@camulaw.com'])
  assert.throws(() => createResendMailer({ apiKey: 're_x', env: { NODE_ENV: 'test' } }), /test/)
})

test('email retries back off 1, 5, 15, 60 minutes, five attempts in all', () => {
  assert.deepEqual(EMAIL_BACKOFF_MINUTES, [1, 5, 15, 60])
  assert.equal(MAX_EMAIL_ATTEMPTS, 5)
  assert.deepEqual([1, 2, 3, 4, 5].map(backoffAfter), [1, 5, 15, 60, null])
})

test('callback reminders', { skip: SKIP }, async (t) => {
  const maria = newNumber()
  const mariaCalls = [await addCall({ at: '2026-11-04T15:00:00Z', number: maria }), await addCall({ at: '2026-11-04T16:00:00Z', number: maria })]
  const episode = mariaCalls[0]
  const lead = await newLead()

  await t.test('set on a caller: assigned to the person who set it by default; a second one for them is refused with the first', async () => {
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'tomorrow_morning', note: 'Ask about the interview date' })
    assert.equal(r.assignee.id, u.desk.id)
    assert.equal(r.status, 'open')
    assert.equal(new Date(r.dueAt).toISOString(), '2026-11-05T15:00:00.000Z')
    assert.equal(r.target.path, `/calls?call=${episode}`)
    const dup = await send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt: 'in_60' })
    assert.equal(dup.status, 409)
    assert.equal(dup.json.code, 'duplicate')
    assert.equal(dup.json.reminder.id, r.id)
    // The same caller's later call is the same person waiting: still a duplicate.
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'call', id: mariaCalls[1] }, dueAt: 'in_60' })).json.code, 'duplicate')
    const another = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_60', allowDuplicate: true })
    assert.notEqual(another.id, r.id)
    // For someone else it is not a duplicate.
    const forCiro = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_60', assignee: u.ciro.id })
    assert.equal(forCiro.assignee.id, u.ciro.id)
    const listed = await send('GET', `/api/reminders?call=${episode}`)
    assert.equal(listed.json.reminders.length, 3)
    assert.equal((await send('GET', '/api/reminders/mine', undefined, u.ciro)).json.reminders.length, 1)
    await closeAll()
  })

  await t.test('only someone who works calls can set one on a caller, and only for someone who can see calls', async () => {
    const para = await send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt: 'in_60' }, u.para)
    assert.equal(para.status, 403)
    assert.equal((await send('GET', '/api/reminders?kind=call', undefined, u.para)).status, 403)
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt: 'in_60' }, u.leads)).status, 403)
    const toPara = await send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt: 'in_60', assignee: u.para.id })
    assert.equal(toPara.status, 400)
    assert.equal(toPara.json.code, 'invalid_assignee')
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt: 'in_60', assignee: u.gone.id })).json.code, 'invalid_assignee')
    const names = (await send('GET', '/api/reminders/assignees?kind=call')).json.accounts.map((a) => a.name)
    assert.ok(names.includes('Yoletty') && names.includes('Ciro'))
    assert.ok(!names.includes('Billing') && !names.includes('Gone') && !names.includes('Leads only'))
    assert.equal((await send('GET', '/api/reminders/assignees?kind=call', undefined, u.para)).status, 403)
    // Leads: crm.view with crm.manage (staff) or calls.exclude (receptionist); not billing.
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'submission', id: lead }, dueAt: 'in_60' }, u.leads)).status, 201)
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'submission', id: lead }, dueAt: 'in_60' }, u.ciro)).status, 201)
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'submission', id: lead }, dueAt: 'in_60' }, u.para)).status, 403)
    assert.equal((await send('GET', `/api/reminders?lead=${lead}`, undefined, u.para)).status, 403)
    // A lead reminder can go to someone who reads leads but not calls.
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'submission', id: lead }, dueAt: 'in_60', assignee: u.leads.id, allowDuplicate: true })).status, 201)
    // Someone who cannot see calls never gets call reminders in their list.
    const mine = await send('GET', '/api/reminders/mine', undefined, u.leads)
    assert.ok(mine.json.reminders.every((r) => r.target.kind === 'submission'))
    // Someone who loses Calls stops seeing their call reminders.
    await make({ target: { kind: 'call', id: episode }, dueAt: 'in_60', assignee: u.ciro.id })
    assert.equal((await send('GET', '/api/reminders/mine', undefined, u.ciro)).json.reminders.filter((r) => r.target.kind === 'call').length, 1)
    await db.query("UPDATE admin_users SET capability_revokes = '{calls.view}' WHERE id = $1", [u.ciro.id])
    try {
      const after = await send('GET', '/api/reminders/mine', undefined, u.ciro)
      assert.equal(after.status, 200)
      assert.equal(after.json.reminders.filter((r) => r.target.kind === 'call').length, 0)
    } finally {
      await db.query("UPDATE admin_users SET capability_revokes = '{}' WHERE id = $1", [u.ciro.id])
    }
    await closeAll()
  })

  await t.test('checked on the server: time, note length, a caller who no longer needs a call', async () => {
    const at = (dueAt) => send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt })
    assert.equal((await at(new Date(clock.t.getTime() - 5 * MIN).toISOString())).status, 400)
    assert.equal((await at(new Date(clock.t.getTime() + 400 * 864e5).toISOString())).status, 400)
    assert.equal((await at(undefined)).status, 400)
    const long = await send('POST', '/api/reminders', { target: { kind: 'call', id: episode }, dueAt: 'in_60', note: 'x'.repeat(501) })
    assert.equal(long.json.code, 'note_too_long')
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'call', id: 999999 }, dueAt: 'in_60' })).status, 404)
    const answered = await addCall({ at: '2026-11-04T16:30:00Z', number: newNumber(), cls: 'answered' })
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'call', id: answered }, dueAt: 'in_60' })).status, 409)
  })

  await t.test('two people changing one reminder: the second is told, with what it is now', async () => {
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_60' })
    const first = await send('PATCH', `/api/reminders/${r.id}`, { version: r.version, note: 'Call after 2' })
    assert.equal(first.status, 200, first.text)
    assert.equal(first.json.reminder.version, r.version + 1)
    const second = await send('PATCH', `/api/reminders/${r.id}`, { version: r.version, dueAt: 'tomorrow_morning' }, u.ciro)
    assert.equal(second.status, 409)
    assert.equal(second.json.code, 'conflict')
    assert.equal(second.json.reminder.note, 'Call after 2')
    assert.equal((await send('PATCH', `/api/reminders/${r.id}`, { note: 'no version' })).status, 400)
    assert.equal((await send('PATCH', `/api/reminders/${r.id}`, { version: first.json.reminder.version, assignee: u.para.id })).json.code, 'invalid_assignee')
    assert.equal((await send('PATCH', `/api/reminders/${r.id}`, { version: first.json.reminder.version, note: 'x' }, u.para)).status, 403)
    const done = await send('POST', `/api/reminders/${r.id}/complete`, {})
    assert.equal(done.json.reminder.status, 'done')
    assert.equal(done.json.reminder.completedBy.id, u.desk.id)
    assert.equal((await send('PATCH', `/api/reminders/${r.id}`, { version: done.json.reminder.version, note: 'late' })).json.code, 'closed')
  })

  await t.test('a due reminder is emailed and pushed once with no portal open, even with two workers at once', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30', note: 'Private: about her U visa' })
    // Not yet due: nothing.
    await run({}, later(29))
    assert.equal(mail.sent.length + pushed.length, 0)
    const [a, b] = await Promise.all([run({}, later(31)), run({}, later(31))])
    assert.equal(a.claimed.length + b.claimed.length, 1, 'claimed by one worker')
    assert.equal(mail.sent.length, 1)
    assert.equal(mail.calls.length, 1, 'the provider was asked once')
    assert.equal(pushed.length, 1)
    const email = mail.sent[0]
    assert.equal(email.to, 'desk@example.test')
    assert.equal(email.subject, REMINDER_EMAIL.subject)
    assert.ok(email.html.includes(`https://portal.example.test/calls?call=${episode}`))
    for (const secret of ['Maria', 'U visa', 'Private', '0110', '555']) assert.ok(!email.html.includes(secret) && !email.text.includes(secret), `email mentions ${secret}`)
    assert.deepEqual(pushed[0].payload, { title: CALLBACK_REMINDER.title, body: CALLBACK_REMINDER.body, url: `/calls?call=${episode}`, tag: `callback-reminder:${r.id}` })
    const row = await reminderRow(r.id)
    assert.equal(row.status, 'due')
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM push_deliveries WHERE event_key = $1", [`callback-reminder:${r.id}`])).rows[0].n, 1)
    // Later runs send nothing more.
    await run({}, later(40))
    await run({}, later(90))
    assert.equal(mail.sent.length, 1)
    assert.equal(pushed.length, 1)
    const shown = (await send('GET', '/api/reminders/mine')).json.reminders.find((x) => x.id === r.id)
    assert.equal(shown.status, 'due')
    assert.equal(shown.delivery.email.status, 'sent')
    assert.equal(shown.delivery.push.status, 'sent')
    // Snoozed: it comes round again as a new delivery, once.
    const snoozed = await send('POST', `/api/reminders/${r.id}/snooze`, { minutes: 30 })
    assert.equal(snoozed.json.reminder.status, 'open')
    clock.t = later(90)
    await run({}, later(121))
    assert.equal(mail.sent.length, 2)
    assert.equal(pushed.length, 2)
    assert.equal(pushed[1].payload.tag, `callback-reminder:${r.id}`)
    await send('POST', `/api/reminders/${r.id}/complete`, {})
  })

  await t.test('a restart in the middle neither loses nor repeats a reminder', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30' })
    // The process dies right after claiming: the deliveries are waiting in the database.
    await worker.claimDue(db, { now: later(31) })
    assert.equal((await reminderRow(r.id)).status, 'due')
    assert.deepEqual((await deliveries(r.id)).map((d) => d.status), ['pending', 'pending'])
    assert.equal(mail.sent.length + pushed.length, 0)
    await run({}, later(32))
    assert.equal(mail.sent.length, 1)
    assert.equal(pushed.length, 1)
    // And one that died mid-send (left 'sending'): tried again after ten
    // minutes with the same idempotency key, so the provider sends it once.
    const r2 = await make({ target: { kind: 'call', id: mariaCalls[1] }, dueAt: 'in_30', assignee: u.ciro.id })
    await worker.claimDue(db, { now: later(31) })
    await mailer.send({ to: 'ciro@example.test', subject: 'x', html: 'x', text: 'x', idempotencyKey: `cm-reminder-${r2.id}-1-due` })
    await db.query("UPDATE reminder_deliveries SET status = 'sending', attempted_at = $2 WHERE reminder_id = $1 AND channel = 'email'", [r2.id, later(31)])
    await run({}, later(35))
    assert.equal((await deliveries(r2.id)).find((d) => d.channel === 'email').status, 'sending', 'not yet: it may still be in flight')
    await run({}, later(45))
    const email = (await deliveries(r2.id)).find((d) => d.channel === 'email')
    assert.equal(email.status, 'sent')
    assert.equal(mail.sent.filter((m) => m.idempotencyKey === `cm-reminder-${r2.id}-1-due`).length, 1)

    // Sent, but the answer was lost: the retry carries the same key, so it is not sent twice.
    resetSends()
    const r3 = await make({ target: { kind: 'call', id: mariaCalls[1] }, dueAt: 'in_30', assignee: u.owner.id })
    mail.queue.push('sent-then-dropped')
    await run({}, later(31))
    assert.deepEqual((await deliveries(r3.id)).filter((d) => d.channel === 'email').map((d) => d.status), ['failed', 'pending'])
    await run({}, later(33))
    assert.deepEqual((await deliveries(r3.id)).filter((d) => d.channel === 'email').map((d) => d.status), ['failed', 'sent'])
    assert.equal(mail.calls.length, 2)
    assert.equal(mail.sent.length, 1)
    await closeAll()
  })

  await t.test('many reminders due at once, four workers racing: each is emailed and pushed exactly once', async () => {
    resetSends()
    const ids = []
    for (let i = 0; i < 12; i++) ids.push((await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30', assignee: [u.desk, u.owner, u.tech][i % 3].id, allowDuplicate: true })).id)
    // A slow provider, so the workers overlap while sending.
    const slow = { send: async (m) => { await new Promise((r) => setTimeout(r, 5)); return mailer.send(m) } }
    const go = () => worker.runReminderWorker(db, { now: later(31), mailer: slow, env: BASE_ENV, pushOptions: { env: PUSH_ENV, transport } })
    await Promise.all([go(), go(), go(), go()])
    assert.equal(mail.calls.length, 12)
    assert.equal(new Set(mail.sent.map((m) => m.idempotencyKey)).size, 12)
    assert.equal(pushed.length, 12)
    for (const id of ids) assert.deepEqual((await deliveries(id)).map((d) => d.status), ['sent', 'sent'])
    await closeAll()
  })

  await t.test('a follow-up dealt with before it is due is closed and nothing is sent', async () => {
    resetSends()
    const n = newNumber()
    const call = await addCall({ at: '2026-11-04T17:00:00Z', number: n })
    const r = await make({ target: { kind: 'call', id: call }, dueAt: 'in_30' })
    // A callback that connected, imported from RingCentral (no portal action).
    await addCall({ at: '2026-11-04T17:40:00Z', number: n, direction: 'outbound', outcome: 'connected' })
    const out = await run({}, later(31))
    assert.ok(out.resolved.includes(r.id))
    const row = await reminderRow(r.id)
    assert.equal(row.status, 'done')
    assert.equal(row.completion_reason, 'resolved')
    assert.equal(row.completed_by, null)
    assert.equal(mail.sent.length + pushed.length, 0)

    // Resolved between being claimed and being delivered: the re-check catches it.
    const n2 = newNumber()
    const call2 = await addCall({ at: '2026-11-04T17:05:00Z', number: n2 })
    const r2 = await make({ target: { kind: 'call', id: call2 }, dueAt: 'in_30' })
    await worker.claimDue(db, { now: later(31) })
    await db.query("INSERT INTO rc_call_resolutions (call_key, note, created_by) SELECT call_key, 'sorted on WhatsApp', $2 FROM rc_calls WHERE id = $1", [call2, u.desk.id])
    await worker.deliverPending(db, { now: later(31), mailer, env: BASE_ENV, pushOptions: { env: PUSH_ENV, transport } })
    assert.equal((await reminderRow(r2.id)).completion_reason, 'resolved')
    assert.deepEqual((await deliveries(r2.id)).map((d) => d.status), ['cancelled', 'cancelled'])
    assert.equal(mail.sent.length + pushed.length, 0)

    // The caller's calls were marked handled and they called again later:
    // that is a new episode, and the old reminder is still closed.
    const n5 = newNumber()
    const old = await addCall({ at: '2026-11-04T14:00:00Z', number: n5 })
    const r5 = await make({ target: { kind: 'call', id: old }, dueAt: 'in_30' })
    await db.query("INSERT INTO rc_call_resolutions (call_key, created_by) SELECT call_key, $2 FROM rc_calls WHERE id = $1", [old, u.desk.id])
    await addCall({ at: '2026-11-04T17:50:00Z', number: n5 })
    await run({}, later(31))
    assert.equal((await reminderRow(r5.id)).completion_reason, 'resolved')
    assert.equal(mail.sent.length + pushed.length, 0)

    // Marked handled in the portal: closed at once.
    const n3 = newNumber()
    const calls3 = [await addCall({ at: '2026-11-04T16:10:00Z', number: n3 }), await addCall({ at: '2026-11-04T16:20:00Z', number: n3 })]
    const r3 = await make({ target: { kind: 'call', id: calls3[0] }, dueAt: 'tomorrow_morning' })
    assert.equal((await send('POST', '/api/calls/episodes/handled', { callIds: calls3 })).status, 200)
    const after3 = (await send('GET', `/api/reminders?call=${calls3[0]}`)).json.reminders
    assert.equal(after3.length, 0)
    assert.equal((await reminderRow(r3.id)).completion_reason, 'resolved')

    // A lead archived: closed at once.
    const l = await newLead()
    const r4 = await make({ target: { kind: 'submission', id: l }, dueAt: 'in_60' })
    assert.equal((await send('PATCH', `/api/submissions/${l}/archive`, { archived: true })).status, 200)
    assert.equal((await reminderRow(r4.id)).completion_reason, 'resolved')
    // One already marked handled can't get a new one.
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'call', id: calls3[0] }, dueAt: 'in_60' })).json.code, 'resolved')
    assert.equal((await send('POST', '/api/reminders', { target: { kind: 'submission', id: l }, dueAt: 'in_60' })).json.code, 'resolved')
  })

  await t.test('a disabled account gets no email and no notification; a bad address is recorded, not tried', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30', assignee: u.ciro.id })
    const bad = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30', assignee: u.nomail.id })
    await db.query('UPDATE admin_users SET disabled_at = NOW() WHERE id = $1', [u.ciro.id])
    try {
      await run({}, later(31))
      assert.deepEqual((await deliveries(r.id)).map((d) => d.status), ['skipped_disabled', 'skipped_disabled'])
      const d = await deliveries(bad.id)
      assert.equal(d.find((x) => x.channel === 'email').status, 'skipped_no_email')
      assert.equal(d.find((x) => x.channel === 'push').status, 'sent', 'the notification still goes')
      assert.equal(mail.calls.length, 0)
      assert.equal(pushed.length, 1)
      assert.ok(!pushed.some((p) => p.endpoint.includes('/ciro-')))
    } finally {
      await db.query('UPDATE admin_users SET disabled_at = NULL WHERE id = $1', [u.ciro.id])
      await closeAll()
    }
  })

  await t.test('email and notification failures are recorded apart; email retries with backoff and then stays failed', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30' })
    const deskEndpoint = (await db.query('SELECT endpoint FROM push_subscriptions WHERE account_id = $1', [u.desk.id])).rows[0].endpoint
    failing.add(deskEndpoint)
    try {
      const busy = { ok: false, error: 'rate_limit_exceeded: slow down', transient: true }
      mail.queue.push(busy)
      const t0 = later(31)
      await run({}, t0)
      let d = await deliveries(r.id)
      assert.equal(d.find((x) => x.channel === 'push').status, 'failed')
      const e1 = d.filter((x) => x.channel === 'email')
      assert.deepEqual(e1.map((x) => [x.attempt, x.status]), [[1, 'failed'], [2, 'pending']])
      assert.equal(new Date(e1[1].next_attempt_at) - t0, 1 * MIN)
      // Each retry fails too: 5, 15, 60 minutes apart, then no more.
      let at = t0
      for (const wait of [1, 5, 15, 60]) {
        at = new Date(at.getTime() + wait * MIN)
        await run({}, new Date(at.getTime() - 1000))
        assert.equal(mail.calls.length, [1, 5, 15, 60].indexOf(wait) + 1, `not before ${wait} minutes`)
        mail.queue.push(busy)
        await run({}, at)
      }
      d = (await deliveries(r.id)).filter((x) => x.channel === 'email')
      assert.equal(d.length, 5)
      assert.ok(d.every((x) => x.status === 'failed'))
      assert.match(d[4].error, /gave up/)
      assert.deepEqual(d.slice(1).map((x, i) => (new Date(x.next_attempt_at) - new Date(d[i].attempted_at)) / MIN), [1, 5, 15, 60])
      await run({}, new Date(at.getTime() + 24 * 60 * MIN))
      assert.equal(mail.calls.length, 5)
      assert.equal(mail.sent.length, 0)
      const shown = (await send('GET', '/api/reminders/mine')).json.reminders.find((x) => x.id === r.id)
      assert.equal(shown.delivery.email.status, 'failed')
      assert.equal(shown.delivery.email.attempts, 5)
      assert.equal(shown.delivery.push.status, 'failed')
      // A rejection that will not change (an unverified domain) is not retried.
      resetSends()
      const r2 = await make({ target: { kind: 'call', id: mariaCalls[1] }, dueAt: 'in_30', assignee: u.owner.id })
      mail.queue.push({ ok: false, error: 'validation_error: domain not verified', transient: false })
      await run({}, later(31))
      await run({}, later(200))
      assert.deepEqual((await deliveries(r2.id)).filter((x) => x.channel === 'email').map((x) => x.status), ['failed'])
      assert.equal((await deliveries(r2.id)).find((x) => x.channel === 'push').status, 'sent')
    } finally {
      failing.delete(deskEndpoint)
      await closeAll()
    }
  })

  await t.test('REMINDER_EMAIL_ALLOWLIST: only those addresses are emailed; the rest are recorded as skipped', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30' })
    const ok = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30', assignee: u.tech.id })
    await run({ REMINDER_EMAIL_ALLOWLIST: 'tech@camulaw.com' }, later(31))
    assert.equal((await deliveries(r.id)).find((d) => d.channel === 'email').status, 'skipped_allowlist')
    assert.equal((await deliveries(ok.id)).find((d) => d.channel === 'email').status, 'sent')
    assert.deepEqual(mail.sent.map((m) => m.to), ['tech@camulaw.com'])
    await closeAll()
  })

  await t.test('without a mailer (email not configured) nothing is emailed and it says so', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30' })
    await worker.runReminderWorker(db, { now: later(31), mailer: null, env: BASE_ENV, pushOptions: { env: PUSH_ENV, transport } })
    assert.equal((await deliveries(r.id)).find((d) => d.channel === 'email').status, 'not_configured')
    assert.equal(mail.calls.length, 0)
    await closeAll()
  })

  await t.test('one overdue email when REMINDER_OVERDUE_EMAIL_MINUTES is set, none when it is not', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30' })
    await run({}, later(31))
    await run({}, later(31 + 120))
    assert.equal(mail.sent.length, 1, 'off by default')
    await run({ REMINDER_OVERDUE_EMAIL_MINUTES: '60' }, later(31 + 120))
    await run({ REMINDER_OVERDUE_EMAIL_MINUTES: '60' }, later(31 + 180))
    assert.deepEqual(mail.sent.map((m) => m.subject), [REMINDER_EMAIL.subject, REMINDER_EMAIL.overdueSubject])
    assert.equal(pushed.length, 1, 'no second notification')
    assert.equal((await reminderRow(r.id)).status, 'due')
    await closeAll()
  })

  await t.test('My follow-ups: my reminders by urgency, then new website leads, only what I may open', async () => {
    await closeAll()
    await db.query('UPDATE submissions SET is_read = TRUE')
    const n = newNumber()
    const caller = await addCall({ at: new Date(clock.t.getTime() - 60 * MIN).toISOString(), number: n })
    const at = (mins) => new Date(clock.t.getTime() + mins * MIN).toISOString()
    const mk = async (body, as = u.desk) => (await make({ allowDuplicate: true, ...body }, as)).id
    const later = await mk({ target: { kind: 'call', id: caller }, dueAt: at(26 * 60) })
    const today = await mk({ target: { kind: 'call', id: caller }, dueAt: at(120) })
    const overdue = await mk({ target: { kind: 'call', id: caller }, dueAt: at(5) })
    const dueNow = await mk({ target: { kind: 'call', id: caller }, dueAt: at(5) })
    await db.query("UPDATE follow_up_reminders SET due_at = $2, status = 'due' WHERE id = $1", [overdue, at(-30)])
    await db.query("UPDATE follow_up_reminders SET due_at = $2, status = 'due' WHERE id = $1", [dueNow, at(-1)])
    // Someone else's reminder is not mine.
    await mk({ target: { kind: 'call', id: caller }, dueAt: at(10), assignee: u.ciro.id })
    const fresh = await newLead()
    const archived = await newLead()
    await db.query('UPDATE submissions SET is_archived = TRUE WHERE id = $1', [archived])
    const contacted = await newLead()
    await db.query("UPDATE submissions SET status = 'contacted' WHERE id = $1", [contacted])
    // A lead I already have a reminder on is listed once, as the reminder.
    const mine = await newLead()
    const leadReminder = await mk({ target: { kind: 'submission', id: mine }, dueAt: at(3 * 24 * 60) })

    const q = await send('GET', '/api/work-queue')
    assert.equal(q.status, 200, q.text)
    assert.deepEqual(q.json.items.map((i) => [i.kind, i.group, i.reminderId ?? i.path]), [
      ['callback', 'overdue', overdue],
      ['callback', 'due', dueNow],
      ['callback', 'today', today],
      ['new_lead', 'lead', `/inbox?lead=${fresh}`],
      ['callback', 'later', later],
    ])
    assert.equal(q.json.hasMore, true, 'the lead reminder is the sixth')
    assert.equal(q.json.items[0].path, `/calls?call=${caller}`)
    assert.equal(q.json.items[0].number, n)
    assert.ok(!JSON.stringify(q.json).includes('Necesito'), 'no message text')
    // Done: it leaves the list, and the next one moves up.
    await send('POST', `/api/reminders/${overdue}/complete`, {})
    const q2 = (await send('GET', '/api/work-queue')).json
    assert.equal(q2.items[0].reminderId, dueNow)
    assert.equal(q2.items[4].reminderId, leadReminder)
    assert.equal(q2.hasMore, false)

    // Billing staff: neither calls nor leads.
    assert.equal((await send('GET', '/api/work-queue', undefined, u.para)).status, 403)
    // Leads only: no callers, even with a reminder on one.
    await db.query("UPDATE follow_up_reminders SET assigned_to = $1 WHERE id = $2", [u.leads.id, today])
    const leadsOnly = (await send('GET', '/api/work-queue', undefined, u.leads)).json
    assert.ok(leadsOnly.items.length > 0)
    assert.ok(leadsOnly.items.every((i) => i.kind !== 'callback'))
    assert.deepEqual(leadsOnly.sections, { calls: false, leads: true })
    // Calls only (crm.view taken away): no leads.
    await db.query("UPDATE admin_users SET capability_revokes = '{crm.view}' WHERE id = $1", [u.desk.id])
    try {
      const callsOnly = (await send('GET', '/api/work-queue')).json
      assert.ok(callsOnly.items.every((i) => i.kind === 'callback'))
      assert.deepEqual(callsOnly.sections, { calls: true, leads: false })
    } finally {
      await db.query("UPDATE admin_users SET capability_revokes = '{}' WHERE id = $1", [u.desk.id])
      await closeAll()
    }
  })

  await t.test('cancelled before it is due: never delivered', async () => {
    resetSends()
    const r = await make({ target: { kind: 'call', id: episode }, dueAt: 'in_30' })
    assert.equal((await send('POST', `/api/reminders/${r.id}/cancel`, { version: r.version })).json.reminder.status, 'cancelled')
    await run({}, later(60))
    assert.equal(mail.sent.length + pushed.length, 0)
    assert.equal((await deliveries(r.id)).length, 0)
  })
})
