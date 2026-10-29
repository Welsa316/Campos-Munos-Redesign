// End-to-end simulated billing flow over the real HTTP API and a real
// Postgres, with the mock monday.com board. Synthetic data only.
//
// Runs only when TEST_DATABASE_URL points at a database whose name contains
// "test"; the schema is dropped and rebuilt. Never point it at real data:
//   TEST_DATABASE_URL=postgresql://localhost:5432/camulaw_billing_test npm test
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
const URL_ = process.env.TEST_DATABASE_URL || ''
const dbName = (() => { try { return new URL(URL_).pathname.slice(1) } catch { return '' } })()
const SKIP = !URL_ ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(dbName) ? 'TEST_DATABASE_URL must name a *test* database' : false)

const PORTAL = 'http://portal.test'
let server, base, adminCookie, staffCookie, db, mock

before(async () => {
  if (SKIP) return
  process.env.DATABASE_URL = URL_
  process.env.JWT_SECRET = 'billing-flow-test-secret-0123456789abcdef'
  process.env.NODE_ENV = 'test'

  const admin = new pg.Client({ connectionString: URL_ })
  await admin.connect()
  await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await admin.end()
  execFileSync(process.execPath, [join(__dirname, '..', 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

  db = new pg.Pool({ connectionString: URL_ })
  const users = await db.query(
    `INSERT INTO admin_users (email, password_hash, role) VALUES ('admin@example.test', 'x', 'admin'), ('staff@example.test', 'x', 'staff') RETURNING id, token_version, role`
  )
  const cookie = (u) => `token=${jwt.sign({ id: u.id, email: 'x', tv: u.token_version }, process.env.JWT_SECRET)}`
  adminCookie = cookie(users.rows[0])
  staffCookie = cookie(users.rows[1])

  const { addFallbackHandlers } = await import('../app.js')
  const { createMockMondayProvider } = await import('./providers/monday/mock.js')
  const { createBillingRouter } = await import('../routes/billing.js')
  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  // The billing router alone, with a mock board the test can inspect. The
  // cross-origin rules around it are covered by splitDeployment.test.js.
  mock = createMockMondayProvider()
  const testApp = express()
  testApp.use(cookieParser())
  testApp.use(express.json({ limit: '100kb' }))
  testApp.use('/api/billing', createBillingRouter({ env: { MONDAY_PROVIDER: 'mock' }, mondayProvider: mock }))
  addFallbackHandlers(testApp)
  server = testApp.listen(0)
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
      Origin: PORTAL,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* csv */ }
  return { status: res.status, json, text }
}

const upload = (buffer, name) => call('POST', '/api/billing/imports', { raw: buffer, headers: { 'X-Filename': name } })

async function importFile(buffer, name, { reportType, reportDate, expectApply = true } = {}) {
  const up = await upload(buffer, name)
  assert.equal(up.status, 201, up.text)
  const pv = await call('POST', `/api/billing/imports/${up.json.id}/preview`, { body: { reportType, reportDate } })
  assert.equal(pv.status, 200, pv.text)
  assert.equal(pv.json.ready, true, JSON.stringify(pv.json.fieldWarnings))
  let applied = null
  if (expectApply) {
    const ap = await call('POST', `/api/billing/imports/${up.json.id}/approve`)
    assert.equal(ap.status, 200, ap.text)
    applied = ap.json
  }
  return { jobId: up.json.id, upload: up.json, preview: pv.json, applied }
}

const invoiceStatus = async (id) => (await db.query('SELECT status, balance_cents, total_cents FROM billing_invoices WHERE external_invoice_id = $1', [id])).rows[0]
const STATUS_MAP = { paid: 'Pagado', partial: 'Pago parcial', unpaid: 'Pendiente', overdue: 'Vencido', needs_review: 'Revisar', no_invoices: 'Sin facturas' }

test('the full simulated flow', { skip: SKIP }, async (t) => {
  const summaryCsv = fs.readFileSync(join(FIX, 'invoice_summary.csv'))

  await t.test('authorization: no session → 401; staff can read but not approve or configure', async () => {
    assert.equal((await call('GET', '/api/billing/overview', { cookie: null })).status, 401)
    assert.equal((await call('GET', '/api/billing/overview', { cookie: staffCookie })).status, 200)
    assert.equal((await upload(summaryCsv, 'x.csv').then(() => call('POST', '/api/billing/imports', { cookie: staffCookie, raw: summaryCsv }))).status, 403)
    assert.equal((await call('PUT', '/api/billing/monday/config', { cookie: staffCookie, body: {} })).status, 403)
    // Clean up the job the admin upload above created.
    await db.query("UPDATE billing_import_jobs SET status = 'cancelled'")
  })

  await t.test('configure the (mock) monday board before importing', async () => {
    const boards = (await call('GET', '/api/billing/monday/boards')).json
    const boardId = boards[0].id
    const res = await call('PUT', '/api/billing/monday/config', {
      body: {
        boardId,
        eimIdColumnId: 'eim_id',
        columnMap: {
          status: { columnId: 'estado_pago', labels: STATUS_MAP },
          outstanding: { columnId: 'saldo' },
          lastPaymentDate: { columnId: 'ultimo_pago' },
          nextDueDate: { columnId: 'proximo_venc' },
          lastSync: { columnId: 'ultima_sync' },
        },
      },
    })
    assert.equal(res.status, 200, res.text)
  })

  let first
  await t.test('1. import a synthetic invoice summary: preview stages, nothing is written yet', async () => {
    const up = await upload(summaryCsv, 'invoice_summary.csv')
    assert.equal(up.status, 201, up.text)
    const pv = await call('POST', `/api/billing/imports/${up.json.id}/preview`, { body: { reportType: 'invoice_summary', reportDate: '2026-10-29' } })
    assert.equal(pv.status, 200, pv.text)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM billing_invoices')).rows[0].n, 0, 'preview writes nothing')
    const c = pv.json.stats.counts
    assert.equal(c.invoice_insert, 13)
    assert.equal(c.invoice_skip, 1, 'the balance-mismatch row is skipped, not imported')
    const ap = await call('POST', `/api/billing/imports/${up.json.id}/approve`)
    assert.equal(ap.status, 200, ap.text)
    first = ap.json
    assert.equal(first.applied.invoices, 13)
  })

  await t.test('statuses come out exactly as the rules say', async () => {
    const expect = {
      'INV-1001': 'paid', 'INV-1002': 'partial', 'INV-1003': 'unpaid', 'INV-1004': 'overdue', 'INV-1005': 'void',
      'INV-1006': 'partial', // on a plan, next installment 11/15 is still ahead
      'INV-1008': 'unpaid', 'INV-1009': 'overdue', 'INV-1012': 'partial', 'INV-1014': 'overdue',
    }
    for (const [id, status] of Object.entries(expect)) assert.equal((await invoiceStatus(id)).status, status, id)
    assert.equal(await invoiceStatus('INV-1013'), undefined, 'mismatched row never stored')
    assert.equal((await invoiceStatus('INV-1009')).balance_cents, '74975')
  })

  await t.test('2. matching: eImmigration ID on the item links automatically; names never do', async () => {
    const links = (await db.query("SELECT c.eimmigration_client_id AS eim, l.external_id, l.method FROM billing_client_links l JOIN billing_clients c ON c.id = l.client_id ORDER BY 1")).rows
    assert.deepEqual(links.map((l) => [l.eim, l.external_id, l.method]), [
      ['EIM-C-0001', '1001', 'external_id'], ['EIM-C-0002', '1002', 'external_id'],
      ['EIM-C-0003', '1003', 'external_id'], ['EIM-C-0004', '1006', 'external_id'],
    ])
    const m = (await call('GET', '/api/billing/matching')).json
    const cinco = m.clients.find((c) => c.eimmigrationClientId === 'EIM-C-0005')
    assert.equal(cinco.status, 'ambiguous', 'exact name, still only a candidate')
    assert.equal(cinco.candidates[0].itemId, '1013')
    const anas = m.clients.filter((c) => c.name === 'Ana Ejemplo')
    assert.equal(anas.length, 2)
    for (const a of anas) {
      assert.equal(a.status, 'ambiguous')
      assert.deepEqual(a.candidates.map((x) => x.itemId).sort(), ['1014', '1015'], 'both same-name items offered, neither chosen')
    }
  })

  await t.test('3. staff approve a match; the mapping persists', async () => {
    const m = (await call('GET', '/api/billing/matching')).json
    const cinco = m.clients.find((c) => c.eimmigrationClientId === 'EIM-C-0005')
    assert.equal((await call('POST', `/api/billing/matching/${cinco.clientId}`, { cookie: staffCookie, body: { mondayItemId: '1013' } })).status, 403)
    const r = await call('POST', `/api/billing/matching/${cinco.clientId}`, { body: { mondayItemId: '1013' } })
    assert.equal(r.status, 201, r.text)
    const taken = await call('POST', `/api/billing/matching/${cinco.clientId}`, { body: { mondayItemId: '1001' } })
    assert.equal(taken.status, 409, 'an item linked to another client cannot be reused')
  })

  let syncJob
  await t.test('4. sync preview proposes only real differences, on mapped columns only', async () => {
    const pv = await call('POST', '/api/billing/monday/sync/preview')
    assert.equal(pv.status, 200, pv.text)
    syncJob = pv.json
    assert.equal(syncJob.providerMode, 'mock')
    const byItem = Object.fromEntries(syncJob.proposed.map((p) => [p.itemId, p]))
    // Client 0004 (item 1006): overdue, $1,000.00 owed.
    const c4 = byItem['1006'].changes
    assert.equal(c4.find((c) => c.columnId === 'estado_pago').to, 'Vencido')
    assert.equal(c4.find((c) => c.columnId === 'saldo').to, '1000.00')
    // Client 0001 (item 1001) is already "Pagado" with 0: status/balance not re-written.
    assert.ok(!byItem['1001'].changes.some((c) => c.columnId === 'estado_pago' || c.columnId === 'saldo'))
    const touched = new Set(syncJob.proposed.flatMap((p) => p.changes.map((c) => c.columnId)))
    for (const col of touched) assert.ok(['estado_pago', 'saldo', 'ultimo_pago', 'proximo_venc', 'ultima_sync'].includes(col), col)
  })

  await t.test('5. apply writes through the mock provider; a second sync changes nothing', async () => {
    assert.equal((await call('POST', `/api/billing/monday/sync/${syncJob.jobId}/apply`, { cookie: staffCookie })).status, 403)
    mock.clearWriteLog()
    const ap = await call('POST', `/api/billing/monday/sync/${syncJob.jobId}/apply`)
    assert.equal(ap.status, 200, ap.text)
    assert.equal(ap.json.failed, 0)
    assert.ok(ap.json.written > 0)
    // The mock logs one entry per column written.
    const log = mock.getWriteLog()
    assert.equal(new Set(log.map((w) => w.itemId)).size, ap.json.written)
    assert.equal(log.length, syncJob.proposed.reduce((n, p) => n + p.changes.length, 0), 'exactly the previewed changes')
    for (const w of log) {
      assert.ok(['estado_pago', 'saldo', 'ultimo_pago', 'proximo_venc', 'ultima_sync'].includes(w.columnId), `unrelated column ${w.columnId} written`)
    }
    const again = await call('POST', `/api/billing/monday/sync/${syncJob.jobId}/apply`)
    assert.equal(again.status, 409, 'the same job cannot be applied twice')
    const pv2 = await call('POST', '/api/billing/monday/sync/preview')
    assert.equal(pv2.json.proposed.filter((p) => p.changes.length).length, 0, 'idempotent: nothing left to write')
  })

  await t.test('6. re-importing the same file is a no-op', async () => {
    const before = (await db.query('SELECT COUNT(*)::int AS n FROM billing_invoice_revisions')).rows[0].n
    const r = await importFile(summaryCsv, 'invoice_summary.csv', { reportType: 'invoice_summary', reportDate: '2026-10-29' })
    assert.ok(r.upload.duplicateOf, 'flagged as already applied')
    assert.equal(r.preview.stats.counts.invoice_unchanged, 13)
    assert.equal(r.preview.stats.counts.invoice_insert + r.preview.stats.counts.invoice_update, 0)
    assert.equal(r.applied.applied.invoices, 0)
    const after_ = (await db.query('SELECT COUNT(*)::int AS n FROM billing_invoice_revisions')).rows[0].n
    assert.equal(after_, before, 'no new history rows')
  })

  await t.test('7. an outstanding-only export does not mark missing invoices paid', async () => {
    const r = await importFile(fs.readFileSync(join(FIX, 'outstanding_only.csv')), 'outstanding_only.csv', { reportType: 'outstanding_only', reportDate: '2026-10-30' })
    assert.equal(r.preview.stats.counts.absent, 0)
    assert.equal(r.preview.stats.counts.invoice_update, 0, 'balances unchanged → nothing to update, totals kept')
    assert.equal((await invoiceStatus('INV-1002')).total_cents, '200000', 'total survives a report without totals')
    assert.equal((await invoiceStatus('INV-1009')).status, 'overdue', 'not listed, untouched')
    assert.equal((await invoiceStatus('INV-1012')).status, 'partial', 'not listed, untouched')
    const flagged = (await db.query('SELECT COUNT(*)::int AS n FROM billing_invoices WHERE not_in_latest_report')).rows[0].n
    assert.equal(flagged, 0)
  })

  await t.test('8. a newer full report showing a payment updates the invoice and monday', async () => {
    const newer = summaryCsv.toString()
      .replace('INV-1004,6/1/2026,8/1/2026,"$1,200.00",$200.00,"$1,000.00",Overdue,,,,6/15/2026',
        'INV-1004,6/1/2026,8/1/2026,"$1,200.00","$1,200.00",$0.00,Paid,,,,10/30/2026')
      // INV-1014 dropped from this export: must be flagged, never marked paid.
      .split('\n').filter((l) => !l.includes('INV-1014')).join('\n')
    const r = await importFile(Buffer.from(newer), 'invoice_summary_1031.csv', { reportType: 'invoice_summary', reportDate: '2026-10-31' })
    assert.equal(r.preview.stats.counts.invoice_update, 1)
    assert.equal(r.preview.stats.counts.absent, 1)
    assert.equal((await invoiceStatus('INV-1004')).status, 'paid')
    const absent = (await db.query("SELECT status, not_in_latest_report FROM billing_invoices WHERE external_invoice_id = 'INV-1014'")).rows[0]
    assert.deepEqual(absent, { status: 'overdue', not_in_latest_report: true }, 'absent ≠ paid')

    const pv = await call('POST', '/api/billing/monday/sync/preview')
    const item = pv.json.proposed.find((p) => p.itemId === '1006')
    assert.equal(item.changes.find((c) => c.columnId === 'estado_pago').to, 'Pagado')
    assert.equal(item.changes.find((c) => c.columnId === 'saldo').to, '0.00')
    const ap = await call('POST', `/api/billing/monday/sync/${pv.json.jobId}/apply`)
    assert.equal(ap.status, 200)
    const rev = (await db.query("SELECT COUNT(*)::int AS n FROM billing_invoice_revisions r JOIN billing_invoices i ON i.id = r.invoice_id WHERE i.external_invoice_id = 'INV-1004'")).rows[0].n
    assert.equal(rev, 2, 'history kept: original insert + correction')
  })

  await t.test('9. an older report cannot roll newer data back', async () => {
    const r = await importFile(summaryCsv, 'old.csv', { reportType: 'invoice_summary', reportDate: '2026-10-01' })
    assert.equal(r.preview.stats.counts.invoice_stale, 13)
    assert.equal((await invoiceStatus('INV-1004')).status, 'paid')
  })

  await t.test('10. approving a preview made before another import was applied is refused', async () => {
    const changed = summaryCsv.toString().replace('INV-1003,10/1/2026,11/30/2026,$750.00,$0.00,$750.00,Unpaid', 'INV-1003,10/1/2026,11/30/2026,$750.00,$100.00,$650.00,Partial')
    const a = await importFile(Buffer.from(changed), 'a.csv', { reportType: 'invoice_summary', reportDate: '2026-11-01', expectApply: false })
    const changed2 = changed.replace('$100.00,$650.00,Partial', '$200.00,$550.00,Partial')
    await importFile(Buffer.from(changed2), 'b.csv', { reportType: 'invoice_summary', reportDate: '2026-11-01' })
    const ap = await call('POST', `/api/billing/imports/${a.jobId}/approve`)
    assert.equal(ap.status, 409)
    assert.match(ap.json.error, /Preview it again/)
    assert.equal((await invoiceStatus('INV-1003')).balance_cents, '55000', 'the later import stands')
  })

  await t.test('exceptions CSV lists skipped rows and client-match problems', async () => {
    const jobs = (await call('GET', '/api/billing/imports')).json
    const firstJob = jobs.find((j) => j.status === 'applied' && j.filename === 'invoice_summary.csv')
    const csv = await call('GET', `/api/billing/imports/${firstJob.id}/exceptions.csv`)
    assert.equal(csv.status, 200)
    assert.match(csv.text, /INV-1013/)
    assert.match(csv.text, /ambiguous/)
  })

  await t.test('uploaded files are purged after the retention window; the record stays', async () => {
    const { purgeExpiredUploads } = await import('./importService.js')
    await db.query("UPDATE billing_import_jobs SET created_at = NOW() - INTERVAL '40 days' WHERE id = (SELECT MIN(id) FROM billing_import_jobs)")
    const n = await purgeExpiredUploads(db, 30)
    assert.equal(n, 1)
    const rows = (await db.query('SELECT id, raw_file IS NULL AS purged, raw_purged_at IS NOT NULL AS stamped, (filename IS NOT NULL AND file_sha256 IS NOT NULL) AS kept FROM billing_import_jobs ORDER BY id')).rows
    assert.deepEqual(rows[0], { id: rows[0].id, purged: true, stamped: true, kept: true })
    assert.ok(rows.slice(1).every((r) => !r.purged), 'recent uploads untouched')
  })

  await t.test('audit trail records each step without client names', async () => {
    const actions = (await db.query('SELECT action, details FROM billing_audit_events ORDER BY id')).rows
    const names = new Set(actions.map((a) => a.action))
    for (const a of ['import.uploaded', 'import.previewed', 'import.applied', 'match.approved', 'monday.config_saved', 'monday.sync_previewed', 'monday.sync_applied']) {
      assert.ok(names.has(a), a)
    }
    const dump = JSON.stringify(actions)
    assert.ok(!/Prueba|Ana Ejemplo/.test(dump), 'no client names in audit details')
  })
})
