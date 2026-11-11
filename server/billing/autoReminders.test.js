// Payment reminders that go out without a person approving each one: the
// "send automatically" mode of a rule (reminderService.autoApprove), driven
// the way the scheduler drives it — evaluate, auto-approve, dispatch — over a
// real Postgres with the simulated WhatsApp sender. Synthetic data.
//
// Own database: <TEST_DATABASE_URL's name>_autoreminders (must contain "test").
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_autoreminders`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

// Friday 27 November 2026, 10:00 in New Orleans: inside the sending hours.
const FRIDAY_10AM = new Date('2026-11-27T16:00:00Z')
const FRIDAY_NIGHT = new Date('2026-11-28T03:00:00Z')
const MONDAY_10AM = new Date('2026-11-30T16:00:00Z')
const ON = { BILLING_AUTO_REMINDERS_ENABLED: 'true', WHATSAPP_SENDING_ENABLED: 'true', WHATSAPP_PROVIDER: 'mock' }

let db, S, wa, inbound, adminId

before(async () => {
  if (SKIP) return
  process.env.NODE_ENV = 'test'
  const admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])).rowCount) await admin.query(`CREATE DATABASE "${DB_NAME}"`)
  await admin.end()
  const c = new pg.Client({ connectionString: URL_ })
  await c.connect()
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await c.end()
  execFileSync(process.execPath, [join(__dirname, '..', 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  db = new pg.Pool({ connectionString: URL_ })
  adminId = (await db.query("INSERT INTO admin_users (email, password_hash, role) VALUES ('admin@example.test', 'x', 'admin') RETURNING id")).rows[0].id
  S = await import('./reminderService.js')
  inbound = await import('./whatsappInbound.js')
})

after(async () => { if (!SKIP) await db?.end() })

beforeEach(async () => {
  if (SKIP) return
  await db.query('TRUNCATE billing_clients, billing_invoices, billing_reminders, billing_messages, billing_audit_events, billing_early_receipts, automation_settings, staff_activity RESTART IDENTITY CASCADE')
  await db.query('UPDATE billing_reminder_rules SET enabled = FALSE, auto_approve = FALSE')
  await db.query('UPDATE billing_message_templates SET meta_approved = FALSE')
  const { createMockWhatsAppProvider } = await import('./providers/whatsapp/mock.js')
  wa = createMockWhatsAppProvider({
    onStatus: (st) => inbound.handleWhatsAppEvent(db, { kind: 'status', key: `status:${st.providerMessageId}:${st.status}`, messageId: st.providerMessageId, status: st.status, raw: { errors: st.errors }, timestamp: st.timestamp }),
  })
})

// --- helpers -------------------------------------------------------------------------

let n = 0
/** A linked client with a WhatsApp number and consent, and one open invoice. */
async function client({ phone = null, optedOut = false, invoice = {} } = {}) {
  n++
  const id = Number((await db.query('INSERT INTO billing_clients (eimmigration_client_id, display_name) VALUES ($1, $2) RETURNING id', [`EIM-${n}`, `Ana Prueba ${n}`])).rows[0].id)
  await db.query("INSERT INTO billing_client_links (client_id, system, external_id, method) VALUES ($1, 'monday', $2, 'manual')", [id, `item-${n}`])
  await db.query(
    `INSERT INTO billing_client_contacts (client_id, phone_e164, first_name, language, opted_in_at, opt_in_source, opted_out_at)
     VALUES ($1, $2, 'Ana', 'es', '2026-11-01', 'signed intake form', $3)`,
    [id, phone || `150455502${String(n).padStart(2, '0')}`, optedOut ? '2026-11-20' : null]
  )
  const inv = { due: '2026-11-30', total: 75000, balance: 75000, status: 'unpaid', plan: null, installmentDate: null, installment: null, ...invoice }
  await db.query(
    `INSERT INTO billing_invoices (external_invoice_id, client_id, client_name, due_date, total_cents, paid_cents, balance_cents, balance_source, status,
        payment_plan_text, next_installment_date, next_installment_cents, last_report_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'authoritative', $8, $9, $10, $11, '2026-11-26')`,
    [`INV-${n}`, id, `Ana Prueba ${n}`, inv.due, inv.total, inv.total - inv.balance, inv.balance, inv.status, inv.plan, inv.installmentDate, inv.installment]
  )
  return { id, invoice: `INV-${n}` }
}
/** The firm marks a rule (and its template) as approved to send on its own. */
async function automatic(key = 'due_in_3') {
  await db.query('UPDATE billing_message_templates SET meta_approved = TRUE')
  await S.saveRule(db, key, { enabled: true, autoApprove: true }, { actorId: adminId })
}
/** One pass of the scheduler: drafts, automatic approval, sending. */
async function tick(now = FRIDAY_10AM, env = ON) {
  const ev = await S.evaluate(db, { now })
  const auto = await S.autoApprove(db, { env, now })
  const sent = await S.dispatch(db, wa, { now, env })
  await wa.flushReceipts()
  return { ev, auto, sent }
}
const reminders = async () => (await db.query('SELECT id, rule_key, state, cancel_reason, approved_by, auto_approved, preview, attempts, due_date::text AS due FROM billing_reminders ORDER BY id')).rows

// --- tests --------------------------------------------------------------------------

test('a rule marked "send automatically" approves and sends its reminders with nobody looking', { skip: SKIP }, async () => {
  await client()
  await automatic()
  const r = await tick()
  assert.equal(r.ev.created, 1)
  assert.equal(r.auto.approved, 1)
  assert.equal(r.sent.sent, 1)
  const [row] = await reminders()
  assert.ok(['sent', 'delivered', 'read'].includes(row.state), row.state)
  assert.equal(row.auto_approved, true)
  assert.equal(row.approved_by, null, 'nobody is recorded as having approved it')
  assert.equal(wa.getSentLog().length, 1)
  // It is in both trails: billing's own, and the activity log as the system.
  assert.equal((await db.query("SELECT details FROM billing_audit_events WHERE action = 'reminders.auto_approved'")).rows[0].details.approved, 1)
  assert.deepEqual((await db.query("SELECT action, actor_email, source FROM staff_activity WHERE source = 'system'")).rows, [{ action: 'automation.reminders_auto_approved', actor_email: 'system', source: 'system' }])
  // Running again sends nothing more: one reminder per payment and stage.
  const again = await tick()
  assert.deepEqual([again.ev.created, again.auto.approved, again.sent.sent || 0], [0, 0, 0])
  assert.equal(wa.getSentLog().length, 1)
})

test('deploying the code sends nothing: off unless the switch is exactly true', { skip: SKIP }, async () => {
  await client()
  await automatic()
  for (const env of [{ WHATSAPP_SENDING_ENABLED: 'true' }, { ...ON, BILLING_AUTO_REMINDERS_ENABLED: 'yes' }, { ...ON, BILLING_AUTO_REMINDERS_ENABLED: '1' }]) {
    const r = await tick(FRIDAY_10AM, env)
    assert.deepEqual([r.auto.approved, r.auto.skipped], [0, 'switched_off'])
  }
  assert.deepEqual((await reminders()).map((x) => [x.state, x.auto_approved]), [['draft', false]], 'the draft waits for a person')
  assert.equal(wa.getSentLog().length, 0)
})

test('only the rules the firm marked: an enabled rule that is not marked still waits for a person', { skip: SKIP }, async () => {
  await client()
  await db.query('UPDATE billing_message_templates SET meta_approved = TRUE')
  await S.saveRule(db, 'due_in_3', { enabled: true }, { actorId: adminId })
  const r = await tick()
  assert.deepEqual([r.ev.created, r.auto.approved], [1, 0])
  assert.equal((await reminders())[0].state, 'draft')
  assert.equal(wa.getSentLog().length, 0)
  // A person can still approve it, as before.
  await S.approveReminders(db, [(await reminders())[0].id], { actorId: adminId, now: FRIDAY_10AM })
  await S.dispatch(db, wa, { now: FRIDAY_10AM, env: ON })
  const [row] = await reminders()
  assert.equal(row.auto_approved, false)
  assert.equal(Number(row.approved_by), Number(adminId))
  assert.equal(wa.getSentLog().length, 1)
})

test('paused in the portal: nothing is approved until it is resumed', { skip: SKIP }, async () => {
  const { setPaused } = await import('../automation/flags.js')
  await client()
  await automatic()
  await setPaused(db, 'billing_auto_reminders', true, { actorId: adminId })
  assert.equal((await tick()).auto.approved, 0)
  assert.equal(wa.getSentLog().length, 0)
  await setPaused(db, 'billing_auto_reminders', false, { actorId: adminId })
  assert.equal((await tick()).auto.approved, 1)
})

test('a rule can only be marked when its message can be sent at all', { skip: SKIP }, async () => {
  await assert.rejects(S.saveRule(db, 'due_in_3', { enabled: true, autoApprove: true }, { actorId: adminId }), /Mark the template as approved in WhatsApp Manager/)
  await assert.rejects(S.saveRule(db, 'followup_14', { autoApprove: true }, { actorId: adminId }), /a task for a person; it cannot be sent automatically/)
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM billing_reminder_rules WHERE auto_approve')).rows[0].n, 0)
  // A template that later loses its approval: its drafts wait again.
  await client()
  await automatic()
  await db.query('UPDATE billing_message_templates SET meta_approved = FALSE')
  assert.equal((await tick()).auto.approved, 0)
  assert.equal((await reminders())[0].state, 'draft')
})

test('approved at night, sent in the morning: the sending hours still apply', { skip: SKIP }, async () => {
  await client()
  await automatic()
  const night = await tick(FRIDAY_NIGHT)
  assert.equal(night.auto.approved, 1)
  assert.equal(night.sent.skipped, 'outside_hours')
  assert.equal(wa.getSentLog().length, 0)
  assert.equal((await reminders())[0].state, 'approved')
  const morning = await tick(MONDAY_10AM)
  assert.equal(morning.sent.sent, 1)
})

test('a payment that arrives first cancels the reminder, before or after it was approved', { skip: SKIP }, async () => {
  // Paid before the scheduler looked again: the draft is cancelled, never approved.
  const a = await client()
  await db.query("UPDATE billing_reminder_rules SET enabled = TRUE WHERE key = 'due_in_3'")
  await S.evaluate(db, { now: FRIDAY_10AM })
  await db.query("UPDATE billing_invoices SET status = 'paid', balance_cents = 0, paid_cents = total_cents WHERE external_invoice_id = $1", [a.invoice])
  await automatic()
  // The approval step looks for itself, without relying on the drafting step before it.
  assert.deepEqual(await S.autoApprove(db, { env: ON, now: FRIDAY_10AM }), { approved: 0, withdrawn: 0 })
  assert.deepEqual((await reminders()).map((x) => [x.state, x.cancel_reason, x.auto_approved]), [['cancelled', 'settled', false]])
  await tick()
  // Paid between the automatic approval (at night) and the sending hours.
  const b = await client()
  await tick(FRIDAY_NIGHT)
  assert.deepEqual((await reminders()).map((x) => x.state), ['cancelled', 'approved'])
  await db.query("UPDATE billing_invoices SET status = 'paid', balance_cents = 0, paid_cents = total_cents WHERE external_invoice_id = $1", [b.invoice])
  await tick(MONDAY_10AM)
  assert.deepEqual((await reminders()).map((x) => [x.state, x.cancel_reason]), [['cancelled', 'settled'], ['cancelled', 'settled']])
  assert.equal(wa.getSentLog().length, 0)
})

test('a due date that moved cancels the reminder about the old date', { skip: SKIP }, async () => {
  const a = await client()
  await automatic()
  await tick(FRIDAY_NIGHT)
  assert.equal((await reminders())[0].state, 'approved')
  await db.query("UPDATE billing_invoices SET due_date = '2026-12-15' WHERE external_invoice_id = $1", [a.invoice])
  await tick(MONDAY_10AM)
  assert.deepEqual((await reminders()).map((x) => [x.state, x.cancel_reason, x.due]), [['cancelled', 'due_date_changed', '2026-11-30']])
  assert.equal(wa.getSentLog().length, 0, 'nothing went out about a date that no longer holds')
  // When the new date comes round (and a fresh report still shows it owed)
  // it is a new obligation with its own reminder.
  await db.query("UPDATE billing_invoices SET last_report_date = '2026-12-11' WHERE external_invoice_id = $1", [a.invoice])
  const later = await tick(new Date('2026-12-12T16:00:00Z'))
  assert.equal(later.ev.created, 1)
  assert.equal(wa.getSentLog().length, 0, 'Saturday: approved, waiting for Monday')
  await tick(new Date('2026-12-14T16:00:00Z'))
  assert.equal(wa.getSentLog().length, 1)
  assert.match(wa.getSentLog()[0].bodyParams[2], /15 de diciembre de 2026/)
})

test('an opt-out, a review flag or a voided invoice means no automatic reminder', { skip: SKIP }, async () => {
  await client({ optedOut: true })
  await client({ invoice: { status: 'needs_review' } })
  await client({ invoice: { status: 'void' } })
  const fine = await client()
  await automatic()
  const r = await tick()
  assert.equal(r.ev.created, 1, 'only the one that qualifies is even drafted')
  assert.equal(wa.getSentLog().length, 1)
  assert.equal(wa.getSentLog()[0].to, (await db.query('SELECT phone_e164 FROM billing_client_contacts WHERE client_id = $1', [fine.id])).rows[0].phone_e164)
  // Opting out after it was approved, before the sending hours: cancelled.
  const late = await client()
  await tick(FRIDAY_NIGHT)
  await S.recordOptOut(db, late.id, { source: 'client asked by phone' }, { actorId: adminId })
  await tick(MONDAY_10AM)
  const last = (await reminders()).pop()
  assert.deepEqual([last.state, last.cancel_reason], ['cancelled', 'opted_out'])
  assert.equal(wa.getSentLog().length, 1)
})

test('on a payment plan the reminder quotes the next installment, never the whole balance; with no amount, nothing is sent', { skip: SKIP }, async () => {
  await client({ invoice: { due: '2027-06-30', plan: '$150 monthly', installmentDate: '2026-11-30', installment: 15000 } })
  await client({ invoice: { due: '2027-06-30', plan: '$150 monthly', installmentDate: '2026-11-30', installment: null } })
  await automatic()
  const r = await tick()
  assert.equal(r.ev.created, 1)
  assert.ok(r.ev.suppressed.some((s) => s.reason === 'no_installment_amount'), 'an amount is never invented')
  const [row] = await reminders()
  assert.match(row.preview, /\$150\.00 con vencimiento el 30 de noviembre de 2026/)
  assert.doesNotMatch(row.preview, /750/)
  assert.deepEqual(wa.getSentLog().map((m) => m.bodyParams[1]), ['$150.00'])
})

test('a send whose delivery is unknown is never sent again on its own', { skip: SKIP }, async () => {
  await client({ phone: '15045552222' }) // the simulator answers "unknown" for …2222
  await automatic()
  const first = await tick()
  assert.equal(first.sent.unknown, 1)
  for (const now of [new Date('2026-11-27T17:00:00Z'), new Date('2026-11-27T20:00:00Z'), MONDAY_10AM]) await tick(now)
  const [row] = await reminders()
  assert.deepEqual([row.state, row.attempts], ['unknown', 1])
  assert.equal(wa.getSentLog().length, 1, 'one attempt, however many times the scheduler runs')
  // It waits in the exception queue for a person, who alone can resolve it.
  await assert.rejects(S.retryReminder(db, row.id, { actorId: adminId }), /must be checked in WhatsApp first/)
  await S.resolveUnknown(db, row.id, { delivered: true, actorId: adminId })
  assert.equal((await reminders())[0].state, 'sent')
})

test('a definite failure is not retried on its own either: it waits for a person', { skip: SKIP }, async () => {
  await client({ phone: '15045551111' }) // the simulator answers "rate limited" for …1111
  await automatic()
  await tick()
  await tick(new Date('2026-11-27T17:00:00Z'))
  await tick(MONDAY_10AM)
  const [row] = await reminders()
  assert.deepEqual([row.state, row.attempts], ['failed', 1])
})

test('the scheduler itself runs the same three steps', { skip: SKIP }, async () => {
  const { startReminderScheduler } = await import('./scheduler.js')
  // Due three days from the real today, so the real clock's tick drafts it.
  const d = new Date(Date.now() + 3 * 864e5)
  const due = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const a = await client({ invoice: { due } })
  await db.query('UPDATE billing_invoices SET last_report_date = $2 WHERE external_invoice_id = $1', [a.invoice, today])
  await automatic()
  const off = startReminderScheduler({ pool: db, env: { ...ON }, log: null })
  assert.equal(off.tick, undefined, 'without BILLING_SCHEDULER_ENABLED it does not start')
  const sched = startReminderScheduler({ pool: db, env: { ...ON, BILLING_SCHEDULER_ENABLED: 'true' }, log: null })
  try {
    await sched.tick()
  } finally {
    sched.stop()
  }
  const [row] = await reminders()
  assert.equal(row.auto_approved, true)
  assert.ok(['approved', 'sent', 'delivered', 'read'].includes(row.state), `${row.state} (approved outside the sending hours, sent inside them)`)
  const state = (await db.query("SELECT last_success_at, details FROM automation_state WHERE key = 'payment_reminders'")).rows[0]
  assert.ok(state.last_success_at)
  assert.equal(state.details.autoApproved, 1)
})

test('pausing stops what was already approved for Monday, not only what would be approved next', { skip: SKIP }, async () => {
  const { setPaused } = await import('../automation/flags.js')
  await client()
  await client()
  await automatic()
  await tick(FRIDAY_NIGHT)
  assert.deepEqual((await reminders()).map((x) => [x.state, x.auto_approved]), [['approved', true], ['approved', true]])
  // One of them a person then approved themselves: that one is theirs.
  const [mine] = await reminders()
  await db.query("UPDATE billing_reminders SET state = 'draft', auto_approved = FALSE, approved_at = NULL WHERE id = $1", [mine.id])
  await S.approveReminders(db, [mine.id], { actorId: adminId, now: FRIDAY_NIGHT })
  // Saturday: an administrator pauses automatic reminders.
  await setPaused(db, 'billing_auto_reminders', true, { actorId: adminId })
  // Monday morning, the scheduler; and someone pressing "send now" comes to the same thing.
  const sent = await S.dispatch(db, wa, { now: MONDAY_10AM, env: ON })
  await wa.flushReceipts()
  assert.equal(sent.sent, 1, 'only the one a person approved')
  const after = await reminders()
  assert.ok(['sent', 'delivered', 'read'].includes(after[0].state))
  assert.deepEqual([after[1].state, after[1].auto_approved], ['draft', false], 'back to a draft for a person to decide')
  assert.equal(wa.getSentLog().length, 1)
  // Unmarking the rule does the same; switching the flag off too.
  await setPaused(db, 'billing_auto_reminders', false, { actorId: adminId })
  await tick(FRIDAY_NIGHT)
  assert.equal((await reminders())[1].state, 'approved')
  await S.saveRule(db, 'due_in_3', { autoApprove: false }, { actorId: adminId })
  assert.equal((await S.autoApprove(db, { env: ON, now: FRIDAY_NIGHT })).withdrawn, 1)
  assert.equal((await reminders())[1].state, 'draft')
})

test('marking a rule does not approve the drafts a person had left unapproved', { skip: SKIP }, async () => {
  await client()
  await db.query('UPDATE billing_message_templates SET meta_approved = TRUE')
  await S.saveRule(db, 'due_in_3', { enabled: true }, { actorId: adminId })
  await S.evaluate(db, { now: FRIDAY_10AM })
  // The draft exists and was left alone; now the rule is marked and switched on.
  await new Promise((r) => setTimeout(r, 20))
  await S.saveRule(db, 'due_in_3', { autoApprove: true }, { actorId: adminId })
  const r = await tick()
  assert.equal(r.auto.approved, 0)
  assert.deepEqual((await reminders()).map((x) => x.state), ['draft'])
  assert.equal(wa.getSentLog().length, 0)
  // A draft made after the rule was marked is approved.
  await client()
  assert.equal((await tick()).auto.approved, 1)
})
