// End-to-end simulated reminder flow over the real HTTP API and Postgres,
// with the mock monday board and the mock WhatsApp sender. Synthetic data.
//
// Uses its own database (<TEST_DATABASE_URL's name>_reminders, created if
// missing) so it can run in parallel with billingFlow.test.js. Same safety
// rule: the name must contain "test".
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIX = join(__dirname, '..', 'fixtures', 'billing')
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_reminders`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

const PORTAL = 'http://portal.test'
// The scenario's clock, moved by the test.
let nowIso = '2026-11-27T16:00:00Z' // Friday 10:00 Central
const CLOCK = () => new Date(nowIso)

let server, base, adminCookie, staffCookie, db, mondayMock, wa, inbound

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'reminder-flow-test-secret-0123456789abcdef'
  process.env.NODE_ENV = 'test'
  const admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])).rowCount
  if (!exists) await admin.query(`CREATE DATABASE "${DB_NAME.replace(/"/g, '')}"`)
  await admin.end()
  const c = new pg.Client({ connectionString: URL_ })
  await c.connect()
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await c.end()
  process.env.DATABASE_URL = URL_
  execFileSync(process.execPath, [join(__dirname, '..', 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

  db = new pg.Pool({ connectionString: URL_ })
  const users = await db.query(
    `INSERT INTO admin_users (email, password_hash, role) VALUES ('admin@example.test', 'x', 'admin'), ('staff@example.test', 'x', 'staff') RETURNING id, token_version`
  )
  const cookie = (u) => `token=${jwt.sign({ id: u.id, email: 'x', tv: u.token_version }, process.env.JWT_SECRET)}`
  adminCookie = cookie(users.rows[0])
  staffCookie = cookie(users.rows[1])

  const { addFallbackHandlers } = await import('../app.js')
  const { createMockMondayProvider } = await import('./providers/monday/mock.js')
  const { createMockWhatsAppProvider } = await import('./providers/whatsapp/mock.js')
  inbound = await import('./whatsappInbound.js')
  const { createBillingRouter } = await import('../routes/billing.js')
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  mondayMock = createMockMondayProvider()
  wa = createMockWhatsAppProvider({
    // Receipts go through the same handler as Meta's webhook.
    onStatus: (st) => inbound.handleWhatsAppEvent(db, {
      kind: 'status', key: `status:${st.providerMessageId}:${st.status}`, messageId: st.providerMessageId,
      status: st.status, raw: { errors: st.errors }, timestamp: st.timestamp,
    }),
  })
  const app = express()
  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))
  app.use('/api/billing', createBillingRouter({ env: { MONDAY_PROVIDER: 'mock', WHATSAPP_PROVIDER: 'mock' }, mondayProvider: mondayMock, whatsappProvider: wa, now: CLOCK }))
  // The real provider, never enabled: proves the sending gate.
  const metaLike = { mode: 'meta', describe: () => ({}), sendTemplate: async () => { throw new Error('must not be called') } }
  app.use('/api/billing-meta', createBillingRouter({ env: { WHATSAPP_PROVIDER: 'meta' }, mondayProvider: mondayMock, whatsappProvider: metaLike, now: CLOCK }))
  // A provider whose delivery receipt reaches us before its send call even
  // returns (Meta can be that fast): the receipt must not be lost.
  let fastN = 0
  const fast = {
    mode: 'mock',
    describe: () => ({ mode: 'mock' }),
    async sendTemplate() {
      const id = `wamid.FAST.${++fastN}`
      await inbound.handleWhatsAppEvent(db, { kind: 'status', key: `status:${id}:delivered`, messageId: id, status: 'delivered', raw: {} })
      return { ok: true, providerMessageId: id, simulated: true }
    },
  }
  app.use('/api/billing-fast', createBillingRouter({ env: { WHATSAPP_PROVIDER: 'mock' }, mondayProvider: mondayMock, whatsappProvider: fast, now: CLOCK }))
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
  const { default: getPool } = await import('../db/pool.js')
  await getPool().end().catch(() => {})
})

async function call(method, path, { body, cookie = adminCookie, raw, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: PORTAL, ...(cookie ? { Cookie: cookie } : {}),
      ...(raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: raw ?? (body && method !== 'GET' ? JSON.stringify(body) : undefined),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json, text }
}

async function importCsv(csv, reportDate) {
  const up = await call('POST', '/api/billing/imports', { raw: Buffer.from(csv), headers: { 'X-Filename': 'r.csv' } })
  assert.equal(up.status, 201, up.text)
  const pv = await call('POST', `/api/billing/imports/${up.json.id}/preview`, { body: { reportType: 'invoice_summary', reportDate } })
  assert.equal(pv.json.ready, true, JSON.stringify(pv.json.fieldWarnings))
  const ap = await call('POST', `/api/billing/imports/${up.json.id}/approve`)
  assert.equal(ap.status, 200, ap.text)
  return ap.json
}

const clientId = async (eim) => Number((await db.query('SELECT id FROM billing_clients WHERE eimmigration_client_id = $1', [eim])).rows[0].id)
const reminders = async () => (await db.query('SELECT id, rule_key, state, cancel_reason, client_id, attempts FROM billing_reminders ORDER BY id')).rows.map((r) => ({ ...r, id: Number(r.id) }))
const enable = (key, days) => call('PUT', `/api/billing/reminders/rules/${key}`, { body: { enabled: true, ...(days != null ? { days } : {}) } })
const STATUS_MAP = { paid: 'Pagado', partial: 'Pago parcial', unpaid: 'Pendiente', overdue: 'Vencido', needs_review: 'Revisar', no_invoices: 'Sin facturas' }

test('reminder flow, end to end, with simulated WhatsApp', { skip: SKIP }, async (t) => {
  const summary = fs.readFileSync(join(FIX, 'invoice_summary.csv'), 'utf8')

  await t.test('setup: board, import, automatic links', async () => {
    const boardId = (await call('GET', '/api/billing/monday/boards')).json[0].id
    const cfg = await call('PUT', '/api/billing/monday/config', { body: { boardId, eimIdColumnId: 'eim_id', columnMap: { status: { columnId: 'estado_pago', labels: STATUS_MAP } } } })
    assert.equal(cfg.status, 200, cfg.text)
    await importCsv(summary, '2026-11-26')
    const linked = (await db.query('SELECT COUNT(*)::int AS n FROM billing_client_links')).rows[0].n
    assert.equal(linked, 4)
  })

  let c3
  await t.test('staff cannot touch reminders or consent', async () => {
    c3 = await clientId('EIM-C-0003')
    for (const [m, p] of [['POST', '/api/billing/reminders/evaluate'], ['POST', '/api/billing/reminders/approve'], ['POST', '/api/billing/reminders/dispatch'],
      ['PUT', `/api/billing/contacts/${c3}`], ['POST', `/api/billing/contacts/${c3}/opt-in`], ['PUT', '/api/billing/reminders/rules/due_in_3'], ['GET', '/api/billing/contacts']]) {
      assert.equal((await call(m, p, { cookie: staffCookie, body: {} })).status, 403, `${m} ${p}`)
    }
  })

  await t.test('rules start switched off: nothing is drafted', async () => {
    const r = await call('POST', '/api/billing/reminders/evaluate')
    assert.equal(r.json.created, 0)
  })

  await t.test('no number / no consent → no draft, with the reason', async () => {
    assert.equal((await enable('due_in_3')).status, 200)
    let r = await call('POST', '/api/billing/reminders/evaluate')
    assert.equal(r.json.created, 0)
    assert.ok(r.json.suppressed.some((s) => s.reason === 'no_contact'), JSON.stringify(r.json.suppressed))
    assert.equal((await call('PUT', `/api/billing/contacts/${c3}`, { body: { phone: '(504) 555-0103', language: 'es' } })).status, 200)
    r = await call('POST', '/api/billing/reminders/evaluate')
    assert.equal(r.json.created, 0)
    assert.ok(r.json.suppressed.some((s) => s.reason === 'no_opt_in'))
    assert.equal((await call('POST', `/api/billing/contacts/${c3}/opt-in`, { body: { source: '' } })).status, 400, 'consent needs a stated source')
  })

  await t.test('5–6. consent recorded → one draft, rendered in Spanish; re-evaluating never duplicates', async () => {
    assert.equal((await call('POST', `/api/billing/contacts/${c3}/opt-in`, { body: { source: 'signed intake form' } })).status, 200)
    const r = await call('POST', '/api/billing/reminders/evaluate')
    assert.equal(r.json.created, 1)
    assert.equal((await call('POST', '/api/billing/reminders/evaluate')).json.created, 0)
    const list = (await call('GET', '/api/billing/reminders?state=drafts')).json.reminders
    assert.equal(list.length, 1)
    assert.match(list[0].preview, /Hola Prueba, .*\$750\.00 con vencimiento el 30 de noviembre de 2026/)
    assert.match(list[0].to_phone, /0103$/)
    assert.ok(!list[0].to_phone.includes('504555'), 'number is masked in the queue')
  })

  await t.test('nothing is sent before approval', async () => {
    const d = await call('POST', '/api/billing/reminders/dispatch')
    assert.equal(d.json.sent, 0)
    assert.equal(wa.getSentLog().length, 0)
  })

  await t.test('approve → send → simulated delivery and read receipts', async () => {
    const [r] = await reminders()
    const ap = await call('POST', '/api/billing/reminders/approve', { body: { ids: [r.id] } })
    assert.deepEqual(ap.json.approved, [r.id])
    const d = await call('POST', '/api/billing/reminders/dispatch')
    assert.equal(d.json.sent, 1)
    const log = wa.getSentLog()
    assert.equal(log.length, 1)
    assert.equal(log[0].to, '15045550103')
    assert.equal(log[0].templateName, 'payment_due_soon')
    assert.equal(log[0].languageCode, 'es')
    assert.deepEqual(log[0].bodyParams, ['Prueba', '$750.00', '30 de noviembre de 2026'])
    await wa.flushReceipts()
    const after_ = (await reminders())[0]
    assert.equal(after_.state, 'read')
    const msg = (await db.query('SELECT status, simulated FROM billing_messages')).rows[0]
    assert.deepEqual(msg, { status: 'read', simulated: true })
  })

  await t.test('duplicate and out-of-order receipts change nothing', async () => {
    const m = (await db.query('SELECT provider_message_id FROM billing_messages')).rows[0]
    for (const status of ['delivered', 'sent', 'read']) {
      await inbound.handleWhatsAppEvent(db, { kind: 'status', key: `status:${m.provider_message_id}:${status}`, messageId: m.provider_message_id, status, raw: {} })
    }
    assert.equal((await reminders())[0].state, 'read')
    assert.equal((await call('POST', '/api/billing/reminders/dispatch')).json.sent, 0, 'never resent')
    assert.equal(wa.getSentLog().length, 1)
  })

  await t.test('8–9. a pending reminder is cancelled when a newer report shows the payment', async () => {
    nowIso = '2026-11-29T16:00:00Z' // Sunday: outside sending hours
    assert.equal((await enable('due_tomorrow')).status, 200)
    assert.equal((await call('POST', '/api/billing/reminders/evaluate')).json.created, 1)
    const pending = (await reminders()).find((r) => r.rule_key === 'due_tomorrow')
    await call('POST', '/api/billing/reminders/approve', { body: { ids: [pending.id] } })
    const d = await call('POST', '/api/billing/reminders/dispatch')
    assert.equal(d.json.skipped, 'outside_hours')
    // The client pays; the next export shows it.
    const paid = summary.replace('INV-1003,10/1/2026,11/30/2026,$750.00,$0.00,$750.00,Unpaid,,,,', 'INV-1003,10/1/2026,11/30/2026,$750.00,$750.00,$0.00,Paid,,,,11/28/2026')
    const ap = await importCsv(paid, '2026-11-29')
    assert.equal(ap.remindersCancelled, 1)
    const r = (await reminders()).find((x) => x.id === pending.id)
    assert.deepEqual([r.state, r.cancel_reason], ['cancelled', 'settled'])
    nowIso = '2026-11-30T16:00:00Z' // Monday, window open
    assert.equal((await call('POST', '/api/billing/reminders/dispatch')).json.sent, 0)
    assert.equal(wa.getSentLog().length, 1, '10. still exactly one message ever sent')
  })

  await t.test('a client who replies STOP is opted out and their pending reminders cancelled', async () => {
    const c2 = await clientId('EIM-C-0002')
    await call('PUT', `/api/billing/contacts/${c2}`, { body: { phone: '+1 504 555 0102', language: 'en' } })
    await call('POST', `/api/billing/contacts/${c2}/opt-in`, { body: { source: 'verbal at consultation' } })
    const inv = (await db.query("SELECT id FROM billing_invoices WHERE external_invoice_id = 'INV-1002'")).rows[0].id
    await db.query(`INSERT INTO billing_reminders (obligation_key, rule_key, invoice_id, client_id, action, state, to_phone, due_date)
                    VALUES ('INV-1002@2026-12-15', 'due_in_3', $1, $2, 'whatsapp', 'approved', '15045550102', '2026-12-15')`, [inv, c2])
    // A reply that merely contains the word is NOT an opt-out.
    await inbound.handleWhatsAppEvent(db, { kind: 'message', key: 'message:wamid.T1', from: '15045550102', raw: { text: { body: 'Alto el costo, no puedo pagar todo' } } })
    assert.equal((await db.query('SELECT opted_out_at FROM billing_client_contacts WHERE client_id = $1', [c2])).rows[0].opted_out_at, null)
    await inbound.handleWhatsAppEvent(db, { kind: 'message', key: 'message:wamid.T2', from: '15045550102', raw: { text: { body: 'BAJA' } } })
    const r = (await db.query("SELECT state, cancel_reason FROM billing_reminders WHERE obligation_key = 'INV-1002@2026-12-15'")).rows[0]
    assert.deepEqual(r, { state: 'cancelled', cancel_reason: 'opted_out' })
    const replies = (await call('GET', '/api/billing/responses')).json
    assert.equal(replies.length, 1, 'the real question waits for staff; the opt-out is recorded as handled')
    assert.match(replies[0].text, /no puedo pagar/)
  })

  await t.test('failures: definite → retry allowed; uncertain → never retried, staff confirm', async () => {
    const c4 = await clientId('EIM-C-0004')
    const inv = (await db.query("SELECT id FROM billing_invoices WHERE external_invoice_id = 'INV-1004'")).rows[0].id
    const seed = async (rule, phone) => {
      const key = 'INV-1004@2026-08-01'
      await call('PUT', `/api/billing/contacts/${c4}`, { body: { phone, language: 'es' } })
      await call('POST', `/api/billing/contacts/${c4}/opt-in`, { body: { source: 'intake form' } })
      return Number((await db.query(`INSERT INTO billing_reminders (obligation_key, rule_key, invoice_id, client_id, action, state, to_phone, due_date, template_key, language, params, approved_at)
        VALUES ($1, $6, $2, $3, 'whatsapp', 'approved', $4, '2026-08-01', 'payment_overdue', 'es', $5, NOW()) RETURNING id`,
      [key, inv, c4, phone, JSON.stringify({ metaName: 'payment_overdue', languageCode: 'es', bodyParams: ['Prueba', '$1,000.00', '1 de agosto de 2026'] }), rule])).rows[0].id)
    }
    const retryable = await seed('overdue_3', '15045551111')
    let d = await call('POST', '/api/billing/reminders/dispatch')
    assert.equal(d.json.failed, 1)
    assert.equal((await call('POST', `/api/billing/reminders/${retryable}/retry`)).status, 200)
    await db.query("UPDATE billing_reminders SET state = 'cancelled' WHERE id = $1", [retryable])

    const unknown = await seed('overdue_7', '15045552222')
    d = await call('POST', '/api/billing/reminders/dispatch')
    assert.equal(d.json.unknown, 1)
    const r = await call('POST', `/api/billing/reminders/${unknown}/retry`)
    assert.equal(r.status, 409, 'an unconfirmed send is never retried blindly')
    assert.equal((await call('POST', '/api/billing/reminders/dispatch')).json.sent, 0)
    assert.equal((await call('POST', `/api/billing/reminders/${unknown}/resolve`, { body: { delivered: false } })).status, 200)
    assert.equal((await call('POST', `/api/billing/reminders/${unknown}/retry`)).status, 200, 'after staff confirm it did not arrive')
  })

  await t.test('a receipt that arrives before the send call returns is applied, not lost', async () => {
    const c4 = await clientId('EIM-C-0004')
    const inv = (await db.query("SELECT id FROM billing_invoices WHERE external_invoice_id = 'INV-1004'")).rows[0].id
    await call('PUT', `/api/billing/contacts/${c4}`, { body: { phone: '+1 504 555 0104', language: 'es' } })
    await call('POST', `/api/billing/contacts/${c4}/opt-in`, { body: { source: 'intake form' } })
    const id = Number((await db.query(`INSERT INTO billing_reminders (obligation_key, rule_key, invoice_id, client_id, action, state, to_phone, due_date, template_key, language, params, approved_at)
      VALUES ('INV-1004@2026-08-01', 'followup_14', $1, $2, 'whatsapp', 'approved', '15045550104', '2026-08-01', 'payment_overdue', 'es', $3, NOW()) RETURNING id`,
    [inv, c4, JSON.stringify({ metaName: 'payment_overdue', languageCode: 'es', bodyParams: ['Prueba', '$1,000.00', '1 de agosto de 2026'] })])).rows[0].id)
    const d = await call('POST', '/api/billing-fast/reminders/dispatch')
    assert.equal(d.json.sent, 1, d.text)
    const r = (await db.query('SELECT state, delivered_at IS NOT NULL AS d FROM billing_reminders WHERE id = $1', [id])).rows[0]
    assert.deepEqual(r, { state: 'delivered', d: true })
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM billing_early_receipts')).rows[0].n, 0)
  })

  await t.test('the real provider never sends while WHATSAPP_SENDING_ENABLED is off', async () => {
    const d = await call('POST', '/api/billing-meta/reminders/dispatch')
    assert.equal(d.json.skipped, 'sending_disabled')
  })

  await t.test('changing a number clears consent', async () => {
    const c3b = await clientId('EIM-C-0003')
    await call('PUT', `/api/billing/contacts/${c3b}`, { body: { phone: '+1 504 555 0999', language: 'es' } })
    const k = (await db.query('SELECT opted_in_at FROM billing_client_contacts WHERE client_id = $1', [c3b])).rows[0]
    assert.equal(k.opted_in_at, null)
  })

  await t.test('audit trail covers consent, approval and sending without names or numbers', async () => {
    const rows = (await db.query('SELECT action, details FROM billing_audit_events')).rows
    const actions = new Set(rows.map((r) => r.action))
    for (const a of ['contact.opted_in', 'contact.opted_out', 'reminders.evaluated', 'reminders.approved', 'reminders.dispatched', 'reminders.auto_cancelled']) {
      assert.ok(actions.has(a), a)
    }
    const dump = JSON.stringify(rows)
    assert.ok(!/Prueba|504555|15045/.test(dump))
  })
})
