// monday.com synchronisation: preview, then a separate, admin-only apply.
//
// Safety rules:
//   - Only columns the administrator mapped are ever written (mondaySync.js).
//   - Against the real API, apply is a dry run unless MONDAY_WRITES_ENABLED is
//     exactly 'true'. The mock provider writes to its in-memory board only.
//   - A preview older than PREVIEW_TTL_MINUTES, or superseded by a newer one,
//     cannot be applied.
//   - Applying is claimed atomically (previewed → applying), so two clicks or
//     two instances never write the same job twice.
import { buildProposedChanges, toColumnValues, validateColumnMap } from './mondaySync.js'
import { listAllItems } from './providers/monday/api.js'
import { summarizeClient } from './reconcile.js'
import { fromInvoiceRow, todayInFirmTz } from './importService.js'
import { audit } from './audit.js'
import { mondayWritesEnabled } from './providers/monday/index.js'
import crypto from 'crypto'

export const PREVIEW_TTL_MINUTES = 60

export class SyncError extends Error {
  constructor(message, status = 400, code = 'sync_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

// One definition of the write switch, shared with the provider.
export const writesEnabled = (env = process.env) => mondayWritesEnabled(env)

/** Fingerprint of the billing figures a preview showed (timestamps excluded). */
export function summaryFingerprint(summaries) {
  const rows = summaries
    .map(({ syncedAt, ...rest }) => rest)
    .sort((a, b) => String(a.mondayItemId).localeCompare(String(b.mondayItemId)))
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export async function getMondayConfig(db) {
  const row = (await db.query("SELECT value, updated_at FROM billing_settings WHERE key = 'monday'")).rows[0]
  return row ? { ...row.value, updatedAt: row.updated_at } : null
}

export async function saveMondayConfig(db, provider, { boardId, columnMap = {}, eimIdColumnId = null }, { actorId }) {
  if (!boardId) throw new SyncError('Choose a board')
  const columns = await provider.getBoardColumns(String(boardId))
  const errors = validateColumnMap(columnMap, columns).map((e) => e.message)
  if (eimIdColumnId && !columns.some((c) => c.id === eimIdColumnId)) errors.push(`Column ${eimIdColumnId} is not on this board`)
  if (errors.length) throw new SyncError(errors.join('; '), 422, 'invalid_mapping')
  const value = { boardId: String(boardId), columnMap, eimIdColumnId, providerMode: provider.mode }
  await db.query(
    `INSERT INTO billing_settings (key, value, updated_by) VALUES ('monday', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [JSON.stringify(value), actorId]
  )
  await audit(db, { actorId, action: 'monday.config_saved', entityType: 'settings', entityId: 'monday', details: { boardId: value.boardId, fields: Object.keys(columnMap) } })
  return value
}

/** Items for matching during an import preview. Never throws: no board = no items. */
export async function loadMatchContext(db, provider, log) {
  const cfg = await getMondayConfig(db)
  if (!cfg?.boardId) return { items: [], eimIdColumnId: null, available: false, reason: 'not_configured' }
  try {
    const { items, complete } = await listAllItems(provider, cfg.boardId)
    // A partial walk could miss a second item carrying the same eImmigration
    // ID and produce a false unique match; treat it as unavailable.
    if (!complete) return { items: [], eimIdColumnId: null, available: false, reason: 'unavailable' }
    return { items, eimIdColumnId: cfg.eimIdColumnId || null, available: true }
  } catch (err) {
    log?.warn?.({ code: err.code }, 'monday items unavailable for matching')
    return { items: [], eimIdColumnId: null, available: false, reason: 'unavailable' }
  }
}

/** One summary per (linked client, monday item). */
export async function buildSummaries(db, { now = new Date() } = {}) {
  const links = (await db.query("SELECT client_id, external_id FROM billing_client_links WHERE system = 'monday'")).rows
  if (!links.length) return []
  const clientIds = [...new Set(links.map((l) => Number(l.client_id)))]
  const invoices = (await db.query('SELECT * FROM billing_invoices WHERE client_id = ANY($1)', [clientIds])).rows
  const payments = (await db.query(
    "SELECT client_id, payment_date, payment_type FROM billing_payments WHERE client_id = ANY($1)", [clientIds]
  )).rows
  const today = todayInFirmTz(now)
  const syncedAt = now.toISOString()
  const out = []
  for (const cid of clientIds) {
    const inv = invoices.filter((i) => Number(i.client_id) === cid).map(fromInvoiceRow)
    const pays = payments.filter((p) => Number(p.client_id) === cid).map((p) => ({ paymentDate: p.payment_date, paymentType: p.payment_type }))
    const s = summarizeClient(inv, pays, { today })
    for (const l of links.filter((x) => Number(x.client_id) === cid)) {
      out.push({ mondayItemId: l.external_id, clientId: cid, ...s, syncedAt })
    }
  }
  return out
}

export async function previewSync(db, provider, { actorId, env = process.env, now = new Date() }) {
  const cfg = await getMondayConfig(db)
  if (!cfg?.boardId) throw new SyncError('Connect a monday.com board and map its columns first', 409, 'not_configured')
  const [columns, walk, summaries] = await Promise.all([
    provider.getBoardColumns(cfg.boardId),
    listAllItems(provider, cfg.boardId),
    buildSummaries(db, { now }),
  ])
  // A partial walk would mark real items 'item_not_found'; refuse instead.
  if (!walk.complete) throw new SyncError('The monday.com board could not be read completely. Try again.', 502, 'partial_board')
  const items = walk.items
  const configErrors = validateColumnMap(cfg.columnMap || {}, columns).map((e) => e.message)
  if (configErrors.length) throw new SyncError(`The column mapping no longer matches the board: ${configErrors.join('; ')}`, 409, 'mapping_stale')

  const proposed = buildProposedChanges({ summaries, columnMap: cfg.columnMap || {}, boardColumns: columns, currentItems: items })
  const withChanges = proposed.filter((p) => p.changes.length)
  const dryRun = provider.mode === 'api' && !writesEnabled(env)

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query("UPDATE billing_sync_jobs SET status = 'superseded' WHERE status = 'previewed'")
    const job = (await client.query(
      `INSERT INTO billing_sync_jobs (provider_mode, board_id, status, dry_run, stats, created_by)
       VALUES ($1, $2, 'previewed', $3, $4, $5) RETURNING id, created_at`,
      [provider.mode, cfg.boardId, dryRun, JSON.stringify({
        items: proposed.length, withChanges: withChanges.length,
        fieldChanges: withChanges.reduce((n, p) => n + p.changes.length, 0),
        skipped: proposed.reduce((n, p) => n + p.skipped.length, 0),
        summaryHash: summaryFingerprint(summaries),
      }), actorId]
    )).rows[0]
    const clientOf = new Map(summaries.map((s) => [s.mondayItemId, s.clientId]))
    for (const p of withChanges) {
      await client.query(
        `INSERT INTO billing_sync_items (job_id, item_id, item_name, client_id, changes, column_values) VALUES ($1, $2, $3, $4, $5, $6)`,
        [job.id, p.itemId, p.itemName, clientOf.get(p.itemId) ?? null, JSON.stringify(p.changes), JSON.stringify(toColumnValues(p.changes))]
      )
    }
    await audit(client, { actorId, action: 'monday.sync_previewed', entityType: 'sync_job', entityId: job.id, details: { items: withChanges.length, dryRun } })
    await client.query('COMMIT')
    return { jobId: Number(job.id), dryRun, providerMode: provider.mode, proposed, createdAt: job.created_at }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function applySync(db, provider, jobId, { actorId, now = new Date(), env = process.env }) {
  const claimed = (await db.query(
    `UPDATE billing_sync_jobs SET status = 'applying', applied_by = $2
      WHERE id = $1 AND status = 'previewed' AND created_at > NOW() - ($3 || ' minutes')::interval
      RETURNING *`,
    [jobId, actorId, String(PREVIEW_TTL_MINUTES)]
  )).rows[0]
  if (!claimed) {
    const job = (await db.query('SELECT status FROM billing_sync_jobs WHERE id = $1', [jobId])).rows[0]
    if (!job) throw new SyncError('Sync not found', 404, 'not_found')
    if (job.status === 'previewed') throw new SyncError('This preview is more than an hour old. Preview again before applying.', 409, 'stale_preview')
    throw new SyncError(`This sync is ${job.status}`, 409, 'bad_state')
  }
  if (claimed.provider_mode !== provider.mode) {
    await db.query("UPDATE billing_sync_jobs SET status = 'failed', error = $2 WHERE id = $1", [jobId, 'Provider mode changed since preview'])
    throw new SyncError('The monday.com connection changed since this preview. Preview again.', 409, 'mode_changed')
  }

  // The billing figures must still be the ones staff previewed: an import or
  // a link change in between would otherwise push stale values.
  const current = summaryFingerprint(await buildSummaries(db, { now }))
  if (current !== claimed.stats?.summaryHash) {
    await db.query("UPDATE billing_sync_jobs SET status = 'superseded', error = $2 WHERE id = $1", [jobId, 'Billing data changed after preview'])
    throw new SyncError('Billing data changed since this preview. Preview again before applying.', 409, 'stale_preview')
  }

  // Decided now, not at preview time: turning writes off must stop an apply.
  const dryRun = provider.mode === 'api' && !writesEnabled(env)
  const items = (await db.query("SELECT * FROM billing_sync_items WHERE job_id = $1 AND outcome = 'pending' ORDER BY id", [jobId])).rows
  let written = 0
  let failed = 0
  for (const it of items) {
    if (dryRun) {
      await db.query("UPDATE billing_sync_items SET outcome = 'dry_run' WHERE id = $1", [it.id])
      continue
    }
    try {
      const res = await provider.updateItemColumns(claimed.board_id, it.item_id, it.column_values)
      if (res?.ok === false) throw Object.assign(new Error(res.error || 'write refused'), { code: 'write_refused' })
      await db.query("UPDATE billing_sync_items SET outcome = 'written' WHERE id = $1", [it.id])
      written++
    } catch (err) {
      failed++
      await db.query("UPDATE billing_sync_items SET outcome = 'failed', error = $2 WHERE id = $1", [it.id, String(err.code || err.message).slice(0, 200)])
    }
  }
  const status = dryRun ? 'dry_run' : (failed ? 'failed' : 'applied')
  await db.query(
    `UPDATE billing_sync_jobs SET status = $2, dry_run = $3, applied_at = NOW(),
       stats = stats || $4::jsonb, error = $5 WHERE id = $1`,
    [jobId, status, dryRun, JSON.stringify({ written, failed }), failed ? `${failed} item(s) failed` : null]
  )
  await audit(db, { actorId, action: 'monday.sync_applied', entityType: 'sync_job', entityId: jobId, details: { written, failed, dryRun, mode: provider.mode } })
  return { jobId: Number(jobId), status, dryRun, written, failed }
}

export default { getMondayConfig, saveMondayConfig, loadMatchContext, buildSummaries, previewSync, applySync }
