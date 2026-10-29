// /api/billing — staff portal billing section (docs/billing-automation-plan.md).
//
// Every route needs a signed-in staff session. Anything that changes
// financial records or an external system (approving an import, linking a
// client, saving the monday mapping, syncing) additionally needs the 'admin'
// role. The cross-origin write check in httpSecurity.js applies to all of it.
//
// Logs carry ids and counts only.
import { Router, raw } from 'express'
import { param } from 'express-validator'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireRole from '../middleware/requireRole.js'
import validate from '../middleware/validate.js'
import { escapeCsvField } from '../utils/sanitize.js'
import {
  createImportJob, previewImport, approveImport, cancelImport, MAX_UPLOAD_BYTES, ImportError, todayInFirmTz,
} from '../billing/importService.js'
import {
  getMondayConfig, saveMondayConfig, loadMatchContext, previewSync, applySync, SyncError, writesEnabled,
} from '../billing/syncService.js'
import { matchClient, loadLinks } from '../billing/matching.js'
import { createMondayProvider } from '../billing/providers/monday/index.js'
import { createFileImportBillingProvider, createEImmigrationApiProvider } from '../billing/providers/billing/index.js'
import { audit } from '../billing/audit.js'

const idParam = (name) => param(name).isInt({ min: 1, max: 2147483647 }).withMessage('Invalid id')

export function createBillingRouter({ db = null, env = process.env, mondayProvider = null, now = () => new Date() } = {}) {
  const router = Router()
  const pool = () => db || getPool()
  const fileSource = createFileImportBillingProvider()

  // One provider per process: the mock keeps its synthetic board in memory,
  // so creating it per request would forget every simulated write.
  let monday = mondayProvider
  let mondayError = null
  const getMonday = () => {
    if (monday) return monday
    try {
      monday = createMondayProvider(env)
    } catch (err) {
      mondayError = err.message
      throw Object.assign(new SyncError(`monday.com is misconfigured: ${err.message}`, 503, 'monday_config'), {})
    }
    return monday
  }

  router.use(requireAuth)
  const admin = requireRole('admin')
  const actor = (req) => req.admin?.id ?? null

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof ImportError || err instanceof SyncError) {
        return res.status(err.status).json({ error: err.message, code: err.code })
      }
      if (err?.name === 'MondayApiError') {
        req.log?.warn({ code: err.code, status: err.status }, 'monday.com call failed')
        return res.status(502).json({ error: 'monday.com did not accept the request. Check the connection on the Settings tab.', code: err.code })
      }
      req.log?.error({ err }, 'Billing route error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  // --- overview --------------------------------------------------------------

  router.get('/overview', wrap(async (_req, res) => {
    const db = pool()
    const [totals, upcoming, attention, lastImport, lastSync, unmatched, mondayCfg] = await Promise.all([
      db.query(`SELECT status, COUNT(*)::int AS n, COALESCE(SUM(CASE WHEN balance_cents > 0 THEN balance_cents END), 0)::bigint AS owed
                  FROM billing_invoices GROUP BY status`),
      db.query(`SELECT external_invoice_id, client_name, COALESCE(next_installment_date, due_date) AS due, balance_cents
                  FROM billing_invoices
                 WHERE status IN ('unpaid', 'partial') AND balance_cents > 0
                   AND COALESCE(next_installment_date, due_date) >= $1::date
                 ORDER BY due ASC LIMIT 8`, [todayInFirmTz(now())]),
      db.query(`SELECT COUNT(*) FILTER (WHERE status = 'needs_review')::int AS needs_review,
                       COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue,
                       COUNT(*) FILTER (WHERE not_in_latest_report)::int AS absent
                  FROM billing_invoices`),
      db.query(`SELECT id, filename, report_type, report_date, applied_at, stats FROM billing_import_jobs
                 WHERE status = 'applied' ORDER BY applied_at DESC LIMIT 1`),
      db.query(`SELECT id, provider_mode, status, dry_run, applied_at, stats FROM billing_sync_jobs
                 WHERE status IN ('applied', 'dry_run', 'failed') ORDER BY applied_at DESC NULLS LAST LIMIT 1`),
      db.query(`SELECT COUNT(*)::int AS n FROM billing_clients c
                 WHERE NOT EXISTS (SELECT 1 FROM billing_client_links l WHERE l.client_id = c.id)`),
      getMondayConfig(db),
    ])
    const byStatus = Object.fromEntries(totals.rows.map((r) => [r.status, { count: r.n, owedCents: Number(r.owed) }]))
    const verifiedOwed = ['unpaid', 'partial', 'overdue'].reduce((s, k) => s + (byStatus[k]?.owedCents || 0), 0)
    res.json({
      verifiedOutstandingCents: verifiedOwed,
      byStatus,
      upcoming: upcoming.rows.map((r) => ({ invoiceId: r.external_invoice_id, clientName: r.client_name, dueDate: r.due, balanceCents: Number(r.balance_cents) })),
      attention: { ...attention.rows[0], unmatchedClients: unmatched.rows[0].n },
      lastImport: lastImport.rows[0] || null,
      lastSync: lastSync.rows[0] || null,
      monday: { configured: Boolean(mondayCfg?.boardId), mode: env.MONDAY_PROVIDER === 'api' ? 'api' : 'mock' },
    })
  }))

  // --- invoices ----------------------------------------------------------------

  router.get('/invoices', wrap(async (req, res) => {
    const where = []
    const params = []
    const status = String(req.query.status || '')
    if (['paid', 'partial', 'unpaid', 'overdue', 'void', 'needs_review'].includes(status)) {
      params.push(status)
      where.push(`i.status = $${params.length}`)
    }
    if (req.query.absent === 'true') where.push('i.not_in_latest_report')
    const q = String(req.query.search || '').trim().slice(0, 100)
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`)
      where.push(`(i.client_name ILIKE $${params.length} OR i.external_invoice_id ILIKE $${params.length} OR c.eimmigration_client_id ILIKE $${params.length})`)
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500)
    params.push(limit)
    const { rows } = await pool().query(
      `SELECT i.id, i.external_invoice_id, i.client_name, c.eimmigration_client_id, i.total_cents, i.paid_cents, i.balance_cents,
              i.balance_source, i.due_date, i.next_installment_date, i.status, i.review_reason, i.last_verified_at,
              i.last_report_date, i.not_in_latest_report, i.currency
         FROM billing_invoices i LEFT JOIN billing_clients c ON c.id = i.client_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY CASE i.status WHEN 'needs_review' THEN 0 WHEN 'overdue' THEN 1 WHEN 'partial' THEN 2 WHEN 'unpaid' THEN 3 ELSE 4 END,
                 COALESCE(i.next_installment_date, i.due_date) NULLS LAST, i.id
        LIMIT $${params.length}`,
      params
    )
    res.json(rows.map(invoiceJson))
  }))

  router.get('/invoices/:id', idParam('id'), validate, wrap(async (req, res) => {
    const db = pool()
    const inv = (await db.query(
      `SELECT i.*, c.eimmigration_client_id FROM billing_invoices i LEFT JOIN billing_clients c ON c.id = i.client_id WHERE i.id = $1`,
      [req.params.id]
    )).rows[0]
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })
    const [payments, revisions, links] = await Promise.all([
      db.query('SELECT id, external_payment_id, payment_date, amount_cents, payment_type, method, reference FROM billing_payments WHERE external_invoice_id = $1 ORDER BY payment_date NULLS LAST, id', [inv.external_invoice_id]),
      db.query('SELECT id, import_job_id, changes, created_at FROM billing_invoice_revisions WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 50', [inv.id]),
      inv.client_id ? db.query("SELECT external_id, external_label, method FROM billing_client_links WHERE client_id = $1 AND system = 'monday'", [inv.client_id]) : { rows: [] },
    ])
    res.json({
      ...invoiceJson(inv),
      invoiceDate: inv.invoice_date,
      sourceStatus: inv.source_status,
      paymentPlanText: inv.payment_plan_text,
      nextInstallmentCents: num(inv.next_installment_cents),
      lastPaymentDate: inv.last_payment_date,
      payments: payments.rows.map((p) => ({ ...p, amount_cents: Number(p.amount_cents) })),
      revisions: revisions.rows,
      mondayLinks: links.rows,
    })
  }))

  // --- imports -------------------------------------------------------------------

  router.get('/imports', wrap(async (_req, res) => {
    const { rows } = await pool().query(
      `SELECT j.id, j.filename, j.status, j.report_type, j.report_date, j.file_size, j.stats, j.created_at, j.applied_at,
              j.raw_purged_at, u.email AS uploaded_by
         FROM billing_import_jobs j LEFT JOIN admin_users u ON u.id = j.uploaded_by
        ORDER BY j.created_at DESC LIMIT 100`
    )
    res.json(rows)
  }))

  router.post(
    '/imports',
    admin,
    raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    wrap(async (req, res) => {
      let filename = 'report'
      try { filename = decodeURIComponent(req.get('x-filename') || 'report') } catch { /* keep default */ }
      const job = await createImportJob(pool(), { buffer: req.body, filename, actorId: actor(req) })
      req.log?.info({ jobId: job.id, rows: job.rowCount }, 'Billing report uploaded')
      res.status(201).json(job)
    })
  )

  router.get('/imports/:id', idParam('id'), validate, wrap(async (req, res) => {
    const db = pool()
    const job = (await db.query(
      `SELECT id, filename, status, report_type, report_date, headers, mapping, stats, errors, created_at, previewed_at, applied_at,
              raw_purged_at, raw_file, file_sha256
         FROM billing_import_jobs WHERE id = $1`, [req.params.id]
    )).rows[0]
    if (!job) return res.status(404).json({ error: 'Import not found' })
    // A few rows so staff can see what each column holds while mapping.
    let sampleRows = []
    if (job.raw_file && job.status !== 'applied') {
      try { sampleRows = fileSource.readReport(job.raw_file, { filename: job.filename }).rows.slice(0, 3) } catch { /* shown as unreadable elsewhere */ }
    }
    const duplicate = (await db.query(
      `SELECT id, applied_at FROM billing_import_jobs WHERE file_sha256 = $1 AND status = 'applied' AND id <> $2 ORDER BY id DESC LIMIT 1`,
      [job.file_sha256, job.id]
    )).rows[0] || null
    delete job.raw_file
    delete job.file_sha256
    job.sampleRows = sampleRows
    job.duplicateOf = duplicate
    const filter = String(req.query.filter || '')
    const conds = ['job_id = $1']
    if (filter === 'problems') conds.push(`(action IN ('skip', 'stale') OR jsonb_array_length(issues) > 0 OR match_status IN ('ambiguous', 'unmatched', 'no_client_id'))`)
    else if (['insert', 'update', 'unchanged', 'skip', 'stale'].includes(filter)) conds.push(`action = '${filter}'`)
    const rows = (await db.query(
      `SELECT row_number, kind, record, issues, action, changes, match_status FROM billing_import_rows
        WHERE ${conds.join(' AND ')} ORDER BY row_number, kind LIMIT 500`, [req.params.id]
    )).rows
    res.json({ ...job, rows })
  }))

  router.post('/imports/:id/preview', admin, idParam('id'), validate, wrap(async (req, res) => {
    const db = pool()
    const matchContext = await loadMatchContext(db, safeMonday(), req.log)
    const result = await previewImport(db, Number(req.params.id), {
      mapping: req.body?.mapping || null,
      reportType: req.body?.reportType || null,
      reportDate: req.body?.reportDate || null,
      actorId: actor(req),
      matchContext,
      now: now(),
    })
    res.json({ ...result, mondayMatching: { available: matchContext.available, reason: matchContext.reason || null } })
  }))

  router.post('/imports/:id/approve', admin, idParam('id'), validate, wrap(async (req, res) => {
    const db = pool()
    const matchContext = await loadMatchContext(db, safeMonday(), req.log)
    const result = await approveImport(db, Number(req.params.id), { actorId: actor(req), matchContext })
    req.log?.info({ jobId: result.jobId, ...result.applied }, 'Billing import applied')
    res.json(result)
  }))

  router.post('/imports/:id/cancel', admin, idParam('id'), validate, wrap(async (req, res) => {
    res.json(await cancelImport(pool(), Number(req.params.id), { actorId: actor(req) }))
  }))

  router.get('/imports/:id/exceptions.csv', idParam('id'), validate, wrap(async (req, res) => {
    const rows = (await pool().query(
      `SELECT row_number, kind, record, issues, action, match_status FROM billing_import_rows
        WHERE job_id = $1 AND (action IN ('skip', 'stale') OR jsonb_array_length(issues) > 0 OR match_status IN ('ambiguous', 'unmatched', 'no_client_id'))
        ORDER BY row_number, kind`, [req.params.id]
    )).rows
    const header = ['Row', 'Type', 'Invoice ID', 'Payment ID', 'Client ID', 'Client name', 'Action', 'Client match', 'Problems']
    const lines = [header.map(escapeCsvField).join(',')]
    for (const r of rows) {
      const input = r.record?.input || {}
      const problems = [...(r.issues || []).map((i) => `${i.severity}: ${i.message}`), r.record?.reason].filter(Boolean).join(' | ')
      lines.push([r.row_number, r.kind, input.externalInvoiceId, input.externalPaymentId, input.externalClientId, input.clientName, r.action, r.match_status, problems]
        .map((v) => escapeCsvField(v == null ? '' : String(v))).join(','))
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="import-${req.params.id}-exceptions.csv"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send('﻿' + lines.join('\r\n'))
  }))

  // --- matching ------------------------------------------------------------------

  // Admin only: it reads the whole monday board (every item name, not just
  // billing clients) and spends API budget on each load.
  router.get('/matching', admin, wrap(async (req, res) => {
    const db = pool()
    const matchContext = await loadMatchContext(db, safeMonday(), req.log)
    const { links, linkedItemIds } = await loadLinks(db)
    const clients = (await db.query(
      `SELECT c.id, c.eimmigration_client_id, c.display_name,
              COUNT(i.id)::int AS invoices, COALESCE(SUM(CASE WHEN i.balance_cents > 0 THEN i.balance_cents END), 0)::bigint AS owed
         FROM billing_clients c LEFT JOIN billing_invoices i ON i.client_id = c.id
        GROUP BY c.id ORDER BY c.display_name NULLS LAST, c.id`
    )).rows
    const out = clients.map((c) => {
      const m = matchClient(
        { id: Number(c.id), eimmigrationClientId: c.eimmigration_client_id, displayName: c.display_name },
        { links, linkedItemIds, items: matchContext.items, eimIdColumnId: matchContext.eimIdColumnId },
      )
      return {
        clientId: Number(c.id), eimmigrationClientId: c.eimmigration_client_id, name: c.display_name,
        invoices: c.invoices, owedCents: Number(c.owed), ...m,
        linked: (links.get(Number(c.id)) || []),
      }
    })
    const noClientId = (await db.query(
      `SELECT COUNT(*)::int AS n FROM billing_invoices WHERE client_id IS NULL AND status <> 'void'`
    )).rows[0].n
    res.json({
      board: matchContext.available ? { items: matchContext.items.map((it) => ({ id: it.id, name: it.name })) } : null,
      mondayStatus: matchContext.available ? 'available' : matchContext.reason,
      clients: out,
      invoicesWithoutClientId: noClientId,
    })
  }))

  router.post('/matching/:clientId', admin, idParam('clientId'), validate, wrap(async (req, res) => {
    const db = pool()
    const itemId = String(req.body?.mondayItemId || '').trim()
    if (!itemId) return res.status(400).json({ error: 'Choose a monday.com item' })
    const client = (await db.query('SELECT id FROM billing_clients WHERE id = $1', [req.params.clientId])).rows[0]
    if (!client) return res.status(404).json({ error: 'Client not found' })
    // The item must really exist on the configured board.
    const ctx = await loadMatchContext(db, safeMonday(), req.log)
    const item = ctx.items.find((it) => it.id === itemId)
    if (!item) return res.status(422).json({ error: 'That item is not on the configured monday.com board' })
    const existing = (await db.query("SELECT client_id FROM billing_client_links WHERE system = 'monday' AND external_id = $1", [itemId])).rows[0]
    if (existing && Number(existing.client_id) !== Number(client.id)) {
      return res.status(409).json({ error: 'That monday.com item is already linked to another client. Unlink it first.' })
    }
    const inserted = await db.query(
      `INSERT INTO billing_client_links (client_id, system, external_id, external_label, method, approved_by)
       VALUES ($1, 'monday', $2, $3, 'manual', $4) ON CONFLICT (system, external_id) DO NOTHING`,
      [client.id, itemId, item.name, actor(req)]
    )
    if (!inserted.rowCount) {
      // Someone linked this item between our check and the insert.
      const owner = (await db.query("SELECT client_id FROM billing_client_links WHERE system = 'monday' AND external_id = $1", [itemId])).rows[0]
      if (owner && Number(owner.client_id) !== Number(client.id)) {
        return res.status(409).json({ error: 'That monday.com item was just linked to another client.' })
      }
      return res.json({ ok: true, alreadyLinked: true })
    }
    await db.query(
      `INSERT INTO billing_match_decisions (client_id, decision, system, external_id, decided_by) VALUES ($1, 'approve', 'monday', $2, $3)`,
      [client.id, itemId, actor(req)]
    )
    await audit(db, { actorId: actor(req), action: 'match.approved', entityType: 'client', entityId: client.id, details: { mondayItemId: itemId } })
    res.status(201).json({ ok: true })
  }))

  router.delete('/matching/:clientId/:itemId', admin, idParam('clientId'), validate, wrap(async (req, res) => {
    const db = pool()
    const { rowCount } = await db.query(
      "DELETE FROM billing_client_links WHERE client_id = $1 AND system = 'monday' AND external_id = $2",
      [req.params.clientId, req.params.itemId]
    )
    if (!rowCount) return res.status(404).json({ error: 'Link not found' })
    await db.query(
      `INSERT INTO billing_match_decisions (client_id, decision, system, external_id, decided_by) VALUES ($1, 'unlink', 'monday', $2, $3)`,
      [req.params.clientId, req.params.itemId, actor(req)]
    )
    await audit(db, { actorId: actor(req), action: 'match.unlinked', entityType: 'client', entityId: req.params.clientId, details: { mondayItemId: req.params.itemId } })
    res.json({ ok: true })
  }))

  // --- monday.com ------------------------------------------------------------------

  router.get('/monday', wrap(async (_req, res) => {
    const db = pool()
    const cfg = await getMondayConfig(db)
    const check = (await db.query("SELECT * FROM billing_integration_checks WHERE provider = 'monday'")).rows[0] || null
    const history = (await db.query(
      `SELECT j.id, j.provider_mode, j.status, j.dry_run, j.stats, j.error, j.created_at, j.applied_at, u.email AS applied_by
         FROM billing_sync_jobs j LEFT JOIN admin_users u ON u.id = j.applied_by
        ORDER BY j.created_at DESC LIMIT 30`
    )).rows
    res.json({
      mode: env.MONDAY_PROVIDER === 'api' ? 'api' : 'mock',
      writesEnabled: writesEnabled(env),
      configError: mondayError,
      config: cfg,
      lastCheck: check,
      history,
    })
  }))

  router.post('/monday/check', admin, wrap(async (req, res) => {
    const provider = getMonday()
    let result
    try {
      result = await provider.validateConnection()
    } catch (err) {
      result = { ok: false, error: err.code || 'connection_failed' }
    }
    await pool().query(
      `INSERT INTO billing_integration_checks (provider, mode, ok, detail, checked_at) VALUES ('monday', $1, $2, $3, NOW())
       ON CONFLICT (provider) DO UPDATE SET mode = EXCLUDED.mode, ok = EXCLUDED.ok, detail = EXCLUDED.detail, checked_at = NOW()`,
      [provider.mode, Boolean(result.ok), JSON.stringify({ account: result.account?.name ?? null, error: result.error ?? null })]
    )
    res.json({ mode: provider.mode, ...result })
  }))

  router.get('/monday/boards', admin, wrap(async (_req, res) => {
    res.json(await getMonday().listBoards())
  }))

  router.get('/monday/boards/:boardId/columns', admin, wrap(async (req, res) => {
    const provider = getMonday()
    const [columns, items] = await Promise.all([
      provider.getBoardColumns(String(req.params.boardId)),
      provider.listItems(String(req.params.boardId), { limit: 5 }).then((r) => r.items).catch(() => []),
    ])
    res.json({ columns, sampleItems: items.map((it) => ({ id: it.id, name: it.name })) })
  }))

  router.put('/monday/config', admin, wrap(async (req, res) => {
    const saved = await saveMondayConfig(pool(), getMonday(), req.body || {}, { actorId: actor(req) })
    res.json(saved)
  }))

  router.post('/monday/sync/preview', admin, wrap(async (req, res) => {
    res.json(await previewSync(pool(), getMonday(), { actorId: actor(req), env, now: now() }))
  }))

  router.post('/monday/sync/:jobId/apply', admin, idParam('jobId'), validate, wrap(async (req, res) => {
    const result = await applySync(pool(), getMonday(), Number(req.params.jobId), { actorId: actor(req), env, now: now() })
    req.log?.info({ jobId: result.jobId, written: result.written, failed: result.failed, dryRun: result.dryRun }, 'monday.com sync applied')
    res.json(result)
  }))

  router.get('/monday/sync/:jobId', idParam('jobId'), validate, wrap(async (req, res) => {
    const db = pool()
    const job = (await db.query('SELECT * FROM billing_sync_jobs WHERE id = $1', [req.params.jobId])).rows[0]
    if (!job) return res.status(404).json({ error: 'Sync not found' })
    const items = (await db.query('SELECT item_id, item_name, changes, outcome, error FROM billing_sync_items WHERE job_id = $1 ORDER BY id', [job.id])).rows
    res.json({ ...job, items })
  }))

  // --- integrations ------------------------------------------------------------------

  router.get('/integrations', wrap(async (_req, res) => {
    const db = pool()
    const check = (await db.query("SELECT * FROM billing_integration_checks WHERE provider = 'monday'")).rows[0]
    const lastImport = (await db.query("SELECT applied_at FROM billing_import_jobs WHERE status = 'applied' ORDER BY applied_at DESC LIMIT 1")).rows[0]
    const mondayMode = env.MONDAY_PROVIDER === 'api' ? 'api' : 'mock'
    let mondayState
    if (mondayMode === 'mock') mondayState = 'mock'
    else if (!env.MONDAY_API_TOKEN) mondayState = 'configuration_error'
    else if (!check || check.mode !== 'api') mondayState = 'unverified'
    else mondayState = check.ok ? 'connected' : 'error'

    const waConfigured = Boolean(env.WHATSAPP_VERIFY_TOKEN && env.META_APP_SECRET)
    res.json([
      { key: 'eimmigration_import', name: 'eImmigration report importer', state: 'connected',
        detail: lastImport ? `Last import applied ${lastImport.applied_at.toISOString()}` : 'No report imported yet' },
      { key: 'eimmigration_api', name: 'eImmigration API', ...pick(createEImmigrationApiProvider(env).describe()) },
      { key: 'monday', name: 'monday.com', state: mondayState,
        detail: mondayState === 'mock' ? 'Simulated board; nothing reaches monday.com'
          : mondayState === 'configuration_error' ? 'MONDAY_PROVIDER=api but MONDAY_API_TOKEN is missing'
            : mondayState === 'unverified' ? 'Token set; run a connection check'
              : check.ok ? `Verified ${check.checked_at.toISOString()}` : `Last check failed (${check.detail?.error || 'error'})`,
        writesEnabled: writesEnabled(env), lastCheckedAt: check?.checked_at ?? null },
      { key: 'whatsapp', name: 'WhatsApp Cloud API', state: waConfigured ? 'webhook_configured' : 'not_configured',
        detail: waConfigured ? 'Webhook secrets set (receiving only). Sending is not built yet.' : 'Webhook secrets not set. Sending is not built yet.' },
    ])
  }))

  function safeMonday() {
    try { return getMonday() } catch { return { mode: 'unavailable', listItems: async () => { throw new Error('unavailable') } } }
  }

  return router
}

function pick({ status, detail }) {
  return { state: status, detail }
}

const num = (v) => (v == null ? null : Number(v))

function invoiceJson(r) {
  return {
    id: Number(r.id),
    invoiceId: r.external_invoice_id,
    clientName: r.client_name,
    eimmigrationClientId: r.eimmigration_client_id ?? null,
    totalCents: num(r.total_cents),
    paidCents: num(r.paid_cents),
    balanceCents: num(r.balance_cents),
    balanceSource: r.balance_source,
    dueDate: r.due_date,
    nextInstallmentDate: r.next_installment_date,
    status: r.status,
    reviewReason: r.review_reason,
    lastVerifiedAt: r.last_verified_at,
    lastReportDate: r.last_report_date,
    notInLatestReport: r.not_in_latest_report,
    currency: r.currency,
  }
}

export default createBillingRouter
