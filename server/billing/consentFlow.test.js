// WhatsApp numbers from the eImmigration report, and the firm-wide consent
// policy (consent taken on intake forms and payment plan agreements), over
// the real HTTP API and Postgres with the mock monday board. Synthetic data.
//
// Uses its own database (<TEST_DATABASE_URL's name>_consent, created if
// missing) so it can run in parallel with the other flow tests. Same safety
// rule: the name must contain "test".
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_consent`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

const PORTAL = 'http://portal.test'
const CLOCK = () => new Date('2026-11-27T16:00:00Z') // Friday 10:00 Central

let server, base, adminCookie, staffCookie, db

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'consent-flow-test-secret-0123456789abcdef'
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
  const { createBillingRouter } = await import('../routes/billing.js')
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const app = express()
  app.use(cookieParser())
  app.use(express.json({ limit: '100kb' }))
  app.use('/api/billing', createBillingRouter({
    env: { MONDAY_PROVIDER: 'mock', WHATSAPP_PROVIDER: 'mock' },
    mondayProvider: createMockMondayProvider(), whatsappProvider: createMockWhatsAppProvider(), now: CLOCK,
  }))
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

/** Upload, preview and approve; returns the preview's phone counts. */
async function importCsv(csv, reportDate) {
  const up = await call('POST', '/api/billing/imports', { raw: Buffer.from(csv), headers: { 'X-Filename': 'r.csv' } })
  assert.equal(up.status, 201, up.text)
  const pv = await call('POST', `/api/billing/imports/${up.json.id}/preview`, { body: { reportType: 'invoice_summary', reportDate } })
  assert.equal(pv.json.ready, true, JSON.stringify(pv.json.fieldWarnings))
  const ap = await call('POST', `/api/billing/imports/${up.json.id}/approve`)
  assert.equal(ap.status, 200, ap.text)
  return { phones: pv.json.stats.phones, applied: ap.json.applied }
}

const HEAD = 'Client ID,Client Name,Invoice #,Due Date,Total,Amount Paid,Balance Due,Phone\n'
const row = (id, name, inv, phone) => `${id},${name},${inv},11/30/2026,$1000.00,$0.00,$1000.00,${phone}\n`
const contactOf = async (eim) => (await db.query(
  `SELECT k.* FROM billing_client_contacts k JOIN billing_clients c ON c.id = k.client_id WHERE c.eimmigration_client_id = $1`, [eim]
)).rows[0] || null
const clientId = async (eim) => Number((await db.query('SELECT id FROM billing_clients WHERE eimmigration_client_id = $1', [eim])).rows[0].id)
const remindersOf = async (eim) => (await db.query(
  `SELECT r.state, r.cancel_reason, r.consent_basis, r.to_phone, i.external_invoice_id FROM billing_reminders r
     JOIN billing_clients c ON c.id = r.client_id JOIN billing_invoices i ON i.id = r.invoice_id
    WHERE c.eimmigration_client_id = $1 ORDER BY r.id`, [eim]
)).rows
const evaluate = async () => (await call('POST', '/api/billing/reminders/evaluate')).json
const reasonCount = (r, reason) => r.suppressed.find((s) => s.reason === reason)?.count || 0

test('numbers from the report and firm-wide consent', { skip: SKIP }, async (t) => {
  await t.test('setup: monday board linked by eImmigration ID, one rule on', async () => {
    const boards = await call('GET', '/api/billing/monday/boards')
    assert.equal(boards.status, 200, boards.text)
    const boardId = boards.json[0].id
    const cfg = await call('PUT', '/api/billing/monday/config', {
      body: { boardId, eimIdColumnId: 'eim_id', columnMap: { status: { columnId: 'estado_pago', labels: { paid: 'PAID' } } } },
    })
    assert.equal(cfg.status, 200, cfg.text)
    // The rules are seeded the first time the reminder setup is read.
    assert.equal((await call('GET', '/api/billing/reminders/config')).json.consent.firmPolicy, false, 'the policy starts off')
    assert.equal((await call('PUT', '/api/billing/reminders/rules/due_in_3', { body: { enabled: true } })).status, 200)
  })

  await t.test('the first import saves the numbers it can read and leaves out the rest', async () => {
    const { phones, applied } = await importCsv(HEAD
      + row('EIM-C-0001', 'Ana Ficticia Núñez', 'INV-1', '(504) 555-0101')
      + row('EIM-C-0002', 'Bruno Inventado Ríos', 'INV-2', '+52 33 1234 5678')
      + row('EIM-C-0003', 'Carmen Ejemplo Peña', 'INV-3', '555-0103')
      + row('EIM-C-0004', 'Elena Simulada Gómez', 'INV-4', '(504) 555-0104'), '2026-11-26')
    assert.deepEqual(phones, { new: 3, changed: 0, same: 0, kept: 0, conflict: 0, invalid: 1 })
    assert.equal(applied.phones, 3)
    assert.deepEqual([(await contactOf('EIM-C-0001'))?.phone_e164, (await contactOf('EIM-C-0001'))?.phone_source], ['15045550101', 'import'])
    assert.equal((await contactOf('EIM-C-0002'))?.phone_e164, '523312345678')
    assert.equal(await contactOf('EIM-C-0003'), null, 'an unreadable number is never guessed')
    assert.equal((await contactOf('EIM-C-0001')).opted_in_at, null, 'an imported number carries no recorded opt-in')
  })

  await t.test('with the policy off, a number alone is not consent', async () => {
    const r = await evaluate()
    assert.equal(r.created, 0)
    assert.equal(reasonCount(r, 'no_opt_in'), 3)
  })

  await t.test('only an administrator can change the policy, and it needs a stated basis', async () => {
    assert.equal((await call('PUT', '/api/billing/consent', { cookie: staffCookie, body: { firmPolicy: true, basis: 'x intake' } })).status, 403)
    assert.equal((await call('PUT', '/api/billing/consent', { body: { firmPolicy: true, basis: '' } })).status, 400)
    const on = await call('PUT', '/api/billing/consent', { body: { firmPolicy: true, basis: 'Signed intake form or payment plan agreement' } })
    assert.equal(on.status, 200, on.text)
    assert.equal(on.json.firmPolicy, true)
    assert.equal((await call('GET', '/api/billing/reminders/config')).json.consent.firmPolicy, true)
  })

  await t.test('with the policy on, every client with a number gets a draft, and its consent basis is kept', async () => {
    const r = await evaluate()
    assert.equal(r.created, 3)
    assert.equal(reasonCount(r, 'no_contact'), 1, 'still nothing for the client without a number')
    const [ana] = await remindersOf('EIM-C-0001')
    assert.equal(ana.state, 'draft')
    assert.equal(ana.consent_basis, 'Firm policy: Signed intake form or payment plan agreement')
  })

  await t.test('an opt-out still wins over the policy', async () => {
    const c2 = await clientId('EIM-C-0002')
    assert.equal((await call('POST', `/api/billing/contacts/${c2}/opt-out`, {})).status, 200)
    assert.deepEqual((await remindersOf('EIM-C-0002')).map((r) => [r.state, r.cancel_reason]), [['cancelled', 'opted_out']])
    assert.equal(reasonCount(await evaluate(), 'opted_out'), 1)
  })

  await t.test('a later import never replaces a number staff saved, and replaces its own', async () => {
    const c4 = await clientId('EIM-C-0004')
    const saved = await call('PUT', `/api/billing/contacts/${c4}`, { body: { phone: '+1 504 555 0144', language: 'es' } })
    assert.equal(saved.status, 200, saved.text)
    assert.equal((await contactOf('EIM-C-0004')).phone_source, 'staff')

    const { phones, applied } = await importCsv(HEAD
      + row('EIM-C-0001', 'Ana Ficticia Núñez', 'INV-1', '(504) 555-0199')
      + row('EIM-C-0001', 'Ana Ficticia Núñez', 'INV-5', '(504) 555-0199')
      + row('EIM-C-0002', 'Bruno Inventado Ríos', 'INV-2', '+52 33 1234 5678')
      + row('EIM-C-0003', 'Carmen Ejemplo Peña', 'INV-3', '555-0103')
      + row('EIM-C-0004', 'Elena Simulada Gómez', 'INV-4', '(504) 555-0104'), '2026-11-27')
    assert.deepEqual(phones, { new: 0, changed: 1, same: 1, kept: 1, conflict: 0, invalid: 1 })
    assert.equal(applied.phones, 1)
    assert.equal((await contactOf('EIM-C-0004')).phone_e164, '15045550144', "staff's number stays")
    assert.equal((await contactOf('EIM-C-0001')).phone_e164, '15045550199')
    assert.deepEqual((await remindersOf('EIM-C-0001')).map((r) => [r.external_invoice_id, r.state, r.cancel_reason]), [['INV-1', 'cancelled', 'number_changed']],
      'a draft for the old number is cancelled')
  })

  await t.test('switching the policy off cancels the drafts resting on it', async () => {
    assert.equal((await evaluate()).created, 1, 'the new invoice for the new number')
    const [draft] = (await remindersOf('EIM-C-0001')).filter((r) => r.state === 'draft')
    assert.equal(draft.external_invoice_id, 'INV-5')
    assert.match(draft.to_phone, /0199$/)
    const off = await call('PUT', '/api/billing/consent', { body: { firmPolicy: false, basis: 'Signed intake form or payment plan agreement' } })
    assert.equal(off.status, 200, off.text)
    assert.deepEqual((await remindersOf('EIM-C-0001')).filter((r) => r.external_invoice_id === 'INV-5').map((r) => [r.state, r.cancel_reason]), [['cancelled', 'opted_out']])
  })
  await t.test('rows that disagree on a number save none of them', async () => {
    const { phones } = await importCsv(HEAD
      + row('EIM-C-0003', 'Carmen Ejemplo Peña', 'INV-3', '(504) 555-0131')
      + row('EIM-C-0003', 'Carmen Ejemplo Peña', 'INV-6', '(504) 555-0132'), '2026-11-27')
    assert.equal(phones.conflict, 1)
    assert.equal(await contactOf('EIM-C-0003'), null)
  })

})
