// Import pipeline: upload → preview (staged) → approve (applied) | cancel.
//
// Nothing touches billing_invoices / billing_payments until approveImport,
// and approve re-runs reconciliation against the database inside a
// transaction: if anything changed since the preview staff looked at (another
// import applied in between), it refuses instead of applying stale proposals.
//
// Importing the same file twice is safe: every row comes back 'unchanged'.
import crypto from 'crypto'
import pg from 'pg'
import { parseReport } from './parsers/index.js'
import { detectMapping, applyManualMapping, detectReportType, missingFieldWarnings } from './columnMapping.js'
import { normalizeRows } from './normalize.js'
import {
  reconcileInvoice, reconcilePayment, paymentDedupeKey, absentInvoices,
} from './reconcile.js'
import { matchClient, loadLinks, normalizeName } from './matching.js'
import { REPORT_TYPES } from './model.js'
import { audit } from './audit.js'

// DATE columns come back as 'YYYY-MM-DD' strings, not JS Dates at local
// midnight: a due date must never shift a day because of the server's zone.
// Only DATE (oid 1082) is affected; TIMESTAMPTZ columns are unchanged.
pg.types.setTypeParser(1082, (v) => v)

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const FIRM_TZ = 'America/Chicago'

export class ImportError extends Error {
  constructor(message, status = 400, code = 'import_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function todayInFirmTz(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FIRM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex')
export const headerSignature = (headers) => sha256(JSON.stringify(headers.map((h) => String(h).trim().toLowerCase())))

// --- upload ---------------------------------------------------------------------

export async function createImportJob(db, { buffer, filename, actorId = null, source = 'manual_upload' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ImportError('The file is empty')
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ImportError('The file is larger than 15 MB', 413, 'too_large')
  const safeName = String(filename || 'report').replace(/[^\w.\- ]+/g, '_').slice(0, 200)
  const fileSha = sha256(buffer)

  let table
  try {
    table = parseReport(buffer, { filename: safeName })
  } catch (err) {
    throw new ImportError(`This file could not be read: ${err.message}`, 422, 'unreadable')
  }
  if (!table.headers?.length || !table.rows?.length) throw new ImportError('No data rows were found in the file', 422, 'no_rows')

  const sig = headerSignature(table.headers)
  const template = (await db.query('SELECT mapping, report_type FROM billing_mapping_templates WHERE header_signature = $1', [sig])).rows[0]
  const mapping = template
    ? applyManualMapping(table.headers, template.mapping)
    : detectMapping(table.headers)
  const detected = detectReportType(mapping)
  const reportType = template?.report_type || detected.reportType

  const dup = (await db.query(
    `SELECT id, created_at FROM billing_import_jobs WHERE file_sha256 = $1 AND status = 'applied' ORDER BY id DESC LIMIT 1`,
    [fileSha]
  )).rows[0]

  const { rows } = await db.query(
    `INSERT INTO billing_import_jobs (source, filename, file_sha256, file_size, raw_file, headers, mapping, report_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
    [source, safeName, fileSha, buffer.length, buffer, JSON.stringify(table.headers), JSON.stringify(mappingToNames(table.headers, mapping)), reportType, actorId]
  )
  await audit(db, { actorId, action: 'import.uploaded', entityType: 'import_job', entityId: rows[0].id, details: { rows: table.rows.length, duplicateOfJob: dup?.id ?? null } })

  return {
    id: Number(rows[0].id),
    filename: safeName,
    headers: table.headers,
    sampleRows: table.rows.slice(0, 5),
    rowCount: table.rows.length,
    sheetName: table.sheetName ?? null,
    mapping: mappingToNames(table.headers, mapping),
    mappingSource: mapping.source,
    usedSavedMapping: Boolean(template),
    reportType,
    reportTypeReasons: detected.reasons,
    duplicateOf: dup ? { jobId: Number(dup.id), appliedAt: dup.created_at } : null,
  }
}

/** { canonicalKey: headerName } is what we persist and show; indexes are internal. */
function mappingToNames(headers, mapping) {
  const out = {}
  for (const [field, idx] of Object.entries(mapping.fields)) out[field] = headers[idx]
  return out
}

// --- preview ----------------------------------------------------------------------

/**
 * @param {object} matchContext { items, eimIdColumnId } from the monday provider
 *   (empty items when no board is configured: everything is 'unmatched').
 */
export async function previewImport(db, jobId, { mapping: overrides = null, reportType = null, reportDate = null, actorId = null, matchContext = {}, now = new Date() } = {}) {
  const job = await loadJob(db, jobId)
  if (!['uploaded', 'previewed'].includes(job.status)) throw new ImportError(`This import is already ${job.status}`, 409, 'bad_state')
  if (!job.raw_file) throw new ImportError('The uploaded file has been purged; upload it again', 410, 'purged')
  if (reportType && !REPORT_TYPES.includes(reportType)) throw new ImportError('Unknown report type')
  if (reportDate && !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new ImportError('Report date must be YYYY-MM-DD')

  const table = parseReport(job.raw_file, { filename: job.filename })
  const mapping = applyManualMapping(table.headers, overrides || job.mapping || {})
  const type = reportType || job.report_type || detectReportType(mapping).reportType
  if (!type) {
    const fieldWarnings = [{ field: '_report', severity: 'error', message: 'Choose what this report contains before previewing.' }]
    return { jobId, ready: false, fieldWarnings, stats: null }
  }
  const fieldWarnings = missingFieldWarnings(mapping, type)
  if (fieldWarnings.some((w) => w.severity === 'error')) {
    // Still stage nothing, but tell staff exactly what is missing.
    await db.query(
      `UPDATE billing_import_jobs SET mapping = $2, report_type = $3, errors = $4, status = 'uploaded'
        WHERE id = $1 AND status IN ('uploaded', 'previewed')`,
      [jobId, JSON.stringify(mappingToNames(table.headers, mapping)), type, JSON.stringify(fieldWarnings)]
    )
    return { jobId, ready: false, fieldWarnings, stats: null }
  }

  const normalized = normalizeRows(table, mapping, { reportType: type, reportDate: reportDate || null })
  const effectiveReportDate = reportDate || normalized.reportDate || null
  // The report date decides overdue status and which report is newer. It is
  // never guessed from the upload date: an undated old export would otherwise
  // pass as today's and roll paid invoices back to overdue.
  const dateProblem = reportDateProblem(effectiveReportDate, now)
  if (dateProblem) {
    const warnings = [...fieldWarnings, { field: 'reportDate', severity: 'error', message: dateProblem }]
    await db.query(
      `UPDATE billing_import_jobs SET mapping = $2, report_type = $3, errors = $4
        WHERE id = $1 AND status IN ('uploaded', 'previewed')`,
      [jobId, JSON.stringify(mappingToNames(table.headers, mapping)), type, JSON.stringify(warnings)]
    )
    return { jobId, ready: false, fieldWarnings: warnings, stats: null }
  }
  const asOfDate = effectiveReportDate
  const plan = await planChanges(db, normalized, { reportType: type, reportDate: effectiveReportDate, asOfDate, matchContext, mappedFields: Object.keys(mapping.fields) })

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // Re-check under a row lock: an approval running at the same moment
    // must not have its staged rows replaced after it applied them.
    const locked = (await client.query('SELECT status FROM billing_import_jobs WHERE id = $1 FOR UPDATE', [jobId])).rows[0]
    if (!locked || !['uploaded', 'previewed'].includes(locked.status)) {
      throw new ImportError(`This import is already ${locked?.status || 'gone'}`, 409, 'bad_state')
    }
    await client.query('DELETE FROM billing_import_rows WHERE job_id = $1', [jobId])
    for (const r of plan.rows) {
      await client.query(
        `INSERT INTO billing_import_rows (job_id, row_number, kind, record, issues, action, changes, match_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [jobId, r.rowNumber, r.kind, JSON.stringify(r.record), JSON.stringify(r.issues), r.action, JSON.stringify(r.changes), r.matchStatus]
      )
    }
    const fileIssues = [...fieldWarnings, ...(normalized.issues || [])]
    await client.query(
      `UPDATE billing_import_jobs
         SET status = 'previewed', mapping = $2, report_type = $3, report_date = $4, stats = $5,
             errors = $6, preview_fingerprint = $7, previewed_at = NOW()
       WHERE id = $1`,
      [jobId, JSON.stringify(mappingToNames(table.headers, mapping)), type, effectiveReportDate,
        JSON.stringify(plan.stats), JSON.stringify(fileIssues), plan.fingerprint]
    )
    await client.query(
      `INSERT INTO billing_mapping_templates (header_signature, headers, mapping, report_type, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (header_signature) DO UPDATE SET mapping = EXCLUDED.mapping, report_type = EXCLUDED.report_type,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [headerSignature(table.headers), JSON.stringify(table.headers), JSON.stringify(mappingToNames(table.headers, mapping)), type, actorId]
    )
    await audit(client, { actorId, action: 'import.previewed', entityType: 'import_job', entityId: jobId, details: { reportType: type, ...plan.stats.counts } })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  return { jobId, ready: true, reportType: type, reportDate: effectiveReportDate, asOfDate, fieldWarnings, fileIssues: normalized.issues || [], stats: plan.stats }
}

/**
 * Compute what every row would do against the current database. Used by
 * preview, and again by approve to detect drift.
 */
async function planChanges(db, normalized, { reportType, reportDate, asOfDate, matchContext, mappedFields = null }) {
  const invoices = normalized.invoices || []
  const payments = normalized.payments || []

  const ids = [...new Set(invoices.map((i) => i.externalInvoiceId).filter(Boolean))]
  const existingRows = ids.length
    ? (await db.query(
      `SELECT i.*, c.eimmigration_client_id FROM billing_invoices i
         LEFT JOIN billing_clients c ON c.id = i.client_id
        WHERE i.external_invoice_id = ANY($1)`, [ids])).rows
    : []
  const existing = new Map(existingRows.map((r) => [r.external_invoice_id, fromInvoiceRow(r)]))

  // Two genuine same-day payments of the same amount with no id or reference
  // share a content key; number the occurrences so neither is lost. The
  // numbering is stable, so re-importing the file still matches both.
  const seenKeys = new Map()
  const payKeys = payments.map((p) => {
    const k = paymentDedupeKey(p)
    if (p.externalPaymentId) return k
    const n = (seenKeys.get(k) || 0) + 1
    seenKeys.set(k, n)
    return n === 1 ? k : `${k}#${n}`
  })
  const existingPays = payKeys.length
    ? (await db.query('SELECT * FROM billing_payments WHERE dedupe_key = ANY($1)', [payKeys])).rows
    : []
  const payByKey = new Map(existingPays.map((r) => [r.dedupe_key, fromPaymentRow(r)]))

  // Matching per distinct eImmigration client in the file.
  const { links, linkedItemIds } = await loadLinks(db)
  const clientIds = [...new Set([...invoices, ...payments].map((r) => r.externalClientId).filter(Boolean))]
  const knownClients = clientIds.length
    ? (await db.query('SELECT id, eimmigration_client_id FROM billing_clients WHERE eimmigration_client_id = ANY($1)', [clientIds])).rows
    : []
  const clientDbId = new Map(knownClients.map((c) => [c.eimmigration_client_id, Number(c.id)]))
  const matchByClient = new Map()
  for (const r of [...invoices, ...payments]) {
    if (!r.externalClientId || matchByClient.has(r.externalClientId)) continue
    matchByClient.set(r.externalClientId, matchClient(
      { id: clientDbId.get(r.externalClientId) ?? -1, eimmigrationClientId: r.externalClientId, displayName: r.clientName },
      { links, linkedItemIds, items: matchContext.items || [], eimIdColumnId: matchContext.eimIdColumnId || null },
    ))
  }
  const matchStatusOf = (r) => (r.externalClientId ? matchByClient.get(r.externalClientId).status : 'no_client_id')

  const rows = []
  const counts = { insert: 0, update: 0, unchanged: 0, skip: 0, stale: 0 }
  const payCounts = { insert: 0, update: 0, unchanged: 0, skip: 0 }
  const statuses = {}
  for (const inv of invoices) {
    const r = reconcileInvoice(existing.get(inv.externalInvoiceId) || null, inv, { asOfDate, reportDate, mappedFields })
    counts[r.action]++
    if (r.record) statuses[r.record.status] = (statuses[r.record.status] || 0) + 1
    rows.push({
      rowNumber: inv.rowNumber, kind: 'invoice', action: r.action, changes: r.changes, issues: inv.issues || [],
      record: { input: stripRaw(inv), proposed: r.record, reason: r.reason }, matchStatus: matchStatusOf(inv),
    })
  }
  for (const [i, p] of payments.entries()) {
    const r = reconcilePayment(payByKey.get(payKeys[i]) || null, p)
    payCounts[r.action]++
    rows.push({
      rowNumber: p.rowNumber, kind: 'payment', action: r.action, changes: r.changes, issues: p.issues || [],
      record: { input: stripRaw(p), reason: r.reason, dedupeKey: payKeys[i] }, matchStatus: matchStatusOf(p),
    })
  }

  let absent = []
  if (reportType === 'invoice_summary' || reportType === 'mixed') {
    const all = (await db.query('SELECT external_invoice_id FROM billing_invoices WHERE status <> $1 ORDER BY external_invoice_id', ['void'])).rows.map((r) => r.external_invoice_id)
    absent = absentInvoices(all, ids, reportType)
  }

  const matching = { linked: 0, matched_by_id: 0, ambiguous: 0, unmatched: 0, no_client_id: 0 }
  for (const m of matchByClient.values()) matching[m.status]++
  matching.no_client_id = new Set([...invoices, ...payments].filter((r) => !r.externalClientId).map((r) => normalizeName(r.clientName))).size

  const warnings = rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'warning').length, 0)
  const errors = rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'error').length, 0)
  const stats = {
    counts: { invoices: invoices.length, payments: payments.length, ...prefix('invoice_', counts), ...prefix('payment_', payCounts), absent: absent.length, warnings, errors },
    statuses,
    matching,
    absentInvoiceIds: absent.slice(0, 200),
  }
  const fingerprint = sha256(JSON.stringify(rows.map((r) => [r.kind, r.rowNumber, r.action, r.changes])) + JSON.stringify(absent))
  return { rows, stats, fingerprint, absent, matchByClient }
}

const prefix = (p, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [p + k, v]))
const stripRaw = ({ raw, ...rest }) => rest

// --- approve ----------------------------------------------------------------------

export async function approveImport(db, jobId, { actorId, matchContext = {} } = {}) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // One import applies at a time, across instances.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('billing_import_apply'))")
    const job = (await client.query('SELECT * FROM billing_import_jobs WHERE id = $1 FOR UPDATE', [jobId])).rows[0]
    if (!job) throw new ImportError('Import not found', 404, 'not_found')
    if (job.status !== 'previewed') throw new ImportError(`This import is ${job.status}; preview it before approving`, 409, 'bad_state')

    const staged = (await client.query('SELECT * FROM billing_import_rows WHERE job_id = $1 ORDER BY kind, row_number', [jobId])).rows
    const normalized = {
      invoices: staged.filter((r) => r.kind === 'invoice').map((r) => ({ ...r.record.input, issues: r.issues })),
      payments: staged.filter((r) => r.kind === 'payment').map((r) => ({ ...r.record.input, issues: r.issues })),
    }
    const reportDate = job.report_date ? toDateString(job.report_date) : null
    if (!reportDate) throw new ImportError('This import has no report date. Preview it again.', 409, 'no_report_date')
    const asOfDate = reportDate
    const plan = await planChanges(client, normalized, { reportType: job.report_type, reportDate, asOfDate, matchContext, mappedFields: Object.keys(job.mapping || {}) })
    if (plan.fingerprint !== job.preview_fingerprint) {
      throw new ImportError('Billing data changed since this preview was made. Preview it again before approving.', 409, 'stale_preview')
    }

    const clientIdFor = async (externalClientId, name) => {
      if (!externalClientId) return null
      const { rows } = await client.query(
        `INSERT INTO billing_clients (eimmigration_client_id, display_name, normalized_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (eimmigration_client_id) DO UPDATE
           SET display_name = COALESCE(EXCLUDED.display_name, billing_clients.display_name),
               normalized_name = COALESCE(EXCLUDED.normalized_name, billing_clients.normalized_name),
               updated_at = NOW()
         RETURNING id`,
        [externalClientId, name || null, name ? normalizeName(name) : null]
      )
      return Number(rows[0].id)
    }

    const applied = { invoices: 0, payments: 0, links: 0 }
    for (const row of plan.rows) {
      if (row.kind !== 'invoice' || !['insert', 'update'].includes(row.action)) continue
      const rec = row.record.proposed
      const cid = await clientIdFor(rec.externalClientId, rec.clientName)
      const before = (await client.query(
        `SELECT i.*, c.eimmigration_client_id FROM billing_invoices i
           LEFT JOIN billing_clients c ON c.id = i.client_id WHERE i.external_invoice_id = $1`, [rec.externalInvoiceId])).rows[0]
      const { rows } = await client.query(
        `INSERT INTO billing_invoices (external_invoice_id, client_id, client_name, invoice_date, due_date, total_cents, paid_cents,
            balance_cents, balance_source, currency, source_status, status, review_reason, payment_plan_text,
            next_installment_date, next_installment_cents, last_payment_date, last_report_date, last_import_job_id,
            last_verified_at, not_in_latest_report)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),FALSE)
         ON CONFLICT (external_invoice_id) DO UPDATE SET
           client_id = EXCLUDED.client_id, client_name = EXCLUDED.client_name, invoice_date = EXCLUDED.invoice_date,
           due_date = EXCLUDED.due_date, total_cents = EXCLUDED.total_cents, paid_cents = EXCLUDED.paid_cents,
           balance_cents = EXCLUDED.balance_cents, balance_source = EXCLUDED.balance_source, currency = EXCLUDED.currency,
           source_status = EXCLUDED.source_status, status = EXCLUDED.status, review_reason = EXCLUDED.review_reason,
           payment_plan_text = EXCLUDED.payment_plan_text, next_installment_date = EXCLUDED.next_installment_date,
           next_installment_cents = EXCLUDED.next_installment_cents, last_payment_date = EXCLUDED.last_payment_date,
           last_report_date = EXCLUDED.last_report_date, last_import_job_id = EXCLUDED.last_import_job_id,
           last_verified_at = NOW(), not_in_latest_report = FALSE, updated_at = NOW()
         RETURNING *`,
        [rec.externalInvoiceId, cid, rec.clientName, rec.invoiceDate, rec.dueDate, rec.totalCents, rec.paidCents,
          rec.balanceCents, rec.balanceSource, rec.currency, rec.sourceStatus, rec.status, rec.reviewReason, rec.paymentPlanText,
          rec.nextInstallmentDate, rec.nextInstallmentCents, rec.lastPaymentDate, rec.reportDate, jobId]
      )
      await client.query(
        `INSERT INTO billing_invoice_revisions (invoice_id, import_job_id, before, after, changes) VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, jobId, before ? JSON.stringify(fromInvoiceRow(before)) : null, JSON.stringify(rec), JSON.stringify(row.changes)]
      )
      applied.invoices++
    }

    // Rows confirmed by an unchanged re-import still count as verified now.
    const unchangedIds = plan.rows.filter((r) => r.kind === 'invoice' && r.action === 'unchanged').map((r) => r.record.input.externalInvoiceId)
    if (unchangedIds.length) {
      await client.query(
        `UPDATE billing_invoices SET last_verified_at = NOW(), not_in_latest_report = FALSE, last_import_job_id = $2 WHERE external_invoice_id = ANY($1)`,
        [unchangedIds, jobId]
      )
    }
    if (plan.absent.length) {
      await client.query('UPDATE billing_invoices SET not_in_latest_report = TRUE WHERE external_invoice_id = ANY($1)', [plan.absent])
    }

    for (const row of plan.rows) {
      if (row.kind !== 'payment' || !['insert', 'update'].includes(row.action)) continue
      const p = row.record.input
      const cid = await clientIdFor(p.externalClientId, p.clientName)
      const inv = p.externalInvoiceId
        ? (await client.query('SELECT id FROM billing_invoices WHERE external_invoice_id = $1', [p.externalInvoiceId])).rows[0]
        : null
      await client.query(
        `INSERT INTO billing_payments (dedupe_key, external_payment_id, external_invoice_id, invoice_id, client_id, payment_date,
            amount_cents, payment_type, method, reference, currency, import_job_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (dedupe_key) DO UPDATE SET
           external_invoice_id = EXCLUDED.external_invoice_id, invoice_id = EXCLUDED.invoice_id, client_id = EXCLUDED.client_id,
           payment_date = EXCLUDED.payment_date, amount_cents = EXCLUDED.amount_cents, payment_type = EXCLUDED.payment_type,
           method = EXCLUDED.method, reference = EXCLUDED.reference, currency = EXCLUDED.currency,
           import_job_id = EXCLUDED.import_job_id, updated_at = NOW()`,
        [row.record.dedupeKey, p.externalPaymentId, p.externalInvoiceId, inv?.id ?? null, cid, p.paymentDate,
          p.amountCents, p.paymentType, p.method, p.reference, p.currency || 'USD', jobId]
      )
      applied.payments++
    }

    // A match by the eImmigration ID on the monday item is deterministic:
    // persist it so later imports and syncs use the stored link.
    // Only links staff saw in the preview: the board may have changed since.
    const previewedIdMatches = new Set(staged
      .filter((r) => r.match_status === 'matched_by_id')
      .map((r) => r.record?.input?.externalClientId)
      .filter(Boolean))
    for (const [eimId, m] of plan.matchByClient) {
      if (m.status !== 'matched_by_id' || !previewedIdMatches.has(eimId)) continue
      const cid = await clientIdFor(eimId, null)
      const item = (matchContext.items || []).find((it) => it.id === m.itemIds[0])
      const res = await client.query(
        `INSERT INTO billing_client_links (client_id, system, external_id, external_label, method, approved_by)
         VALUES ($1, 'monday', $2, $3, 'external_id', $4) ON CONFLICT (system, external_id) DO NOTHING`,
        [cid, m.itemIds[0], item?.name ?? null, actorId]
      )
      applied.links += res.rowCount
    }

    // Any monday.com preview made before this import now shows old figures.
    await client.query("UPDATE billing_sync_jobs SET status = 'superseded' WHERE status = 'previewed'")
    await client.query(
      `UPDATE billing_import_jobs SET status = 'applied', approved_by = $2, applied_at = NOW() WHERE id = $1`,
      [jobId, actorId]
    )
    await audit(client, { actorId, action: 'import.applied', entityType: 'import_job', entityId: jobId, details: { ...applied, absent: plan.absent.length } })
    await client.query('COMMIT')
    return { jobId, status: 'applied', applied, absent: plan.absent.length }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function cancelImport(db, jobId, { actorId }) {
  const { rowCount } = await db.query(
    `UPDATE billing_import_jobs SET status = 'cancelled' WHERE id = $1 AND status IN ('uploaded', 'previewed')`,
    [jobId]
  )
  if (!rowCount) throw new ImportError('Only an import that has not been applied can be cancelled', 409, 'bad_state')
  await audit(db, { actorId, action: 'import.cancelled', entityType: 'import_job', entityId: jobId })
  return { jobId, status: 'cancelled' }
}

/** Drop raw upload bytes older than the retention window. Metadata stays. */
export async function purgeExpiredUploads(db, retentionDays = 30) {
  const { rowCount } = await db.query(
    `UPDATE billing_import_jobs SET raw_file = NULL, raw_purged_at = NOW()
      WHERE raw_file IS NOT NULL AND created_at < NOW() - ($1 || ' days')::interval`,
    [String(Math.max(1, Number(retentionDays) || 30))]
  )
  return rowCount
}

// --- helpers ------------------------------------------------------------------------

/** Why a report date is unusable, or null. Never in the future, never before 2000. */
export function reportDateProblem(date, now = new Date()) {
  if (!date) return 'Enter the date this report was generated. Overdue status and which report is newer both depend on it.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'The report date must be a calendar date.'
  if (date < '2000-01-01') return 'The report date is implausibly old.'
  if (date > todayInFirmTz(now)) return 'The report date is in the future. Check for a typo.'
  return null
}

async function loadJob(db, jobId) {
  const job = (await db.query('SELECT * FROM billing_import_jobs WHERE id = $1', [jobId])).rows[0]
  if (!job) throw new ImportError('Import not found', 404, 'not_found')
  return job
}

const num = (v) => (v == null ? null : Number(v))
export function toDateString(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.slice(0, 10)
  // pg returns DATE as a JS Date at local midnight; format in local time.
  const d = v
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromInvoiceRow(r) {
  return {
    externalInvoiceId: r.external_invoice_id,
    externalClientId: r.eimmigration_client_id ?? null,
    clientName: r.client_name,
    invoiceDate: toDateString(r.invoice_date),
    dueDate: toDateString(r.due_date),
    totalCents: num(r.total_cents),
    paidCents: num(r.paid_cents),
    balanceCents: num(r.balance_cents),
    balanceSource: r.balance_source,
    currency: r.currency,
    sourceStatus: r.source_status,
    status: r.status,
    reviewReason: r.review_reason,
    paymentPlanText: r.payment_plan_text,
    nextInstallmentDate: toDateString(r.next_installment_date),
    nextInstallmentCents: num(r.next_installment_cents),
    lastPaymentDate: toDateString(r.last_payment_date),
    reportDate: toDateString(r.last_report_date),
  }
}

function fromPaymentRow(r) {
  return {
    externalInvoiceId: r.external_invoice_id,
    paymentDate: toDateString(r.payment_date),
    amountCents: num(r.amount_cents),
    paymentType: r.payment_type,
    method: r.method,
    reference: r.reference,
    currency: r.currency,
  }
}

export default { createImportJob, previewImport, approveImport, cancelImport, purgeExpiredUploads }
