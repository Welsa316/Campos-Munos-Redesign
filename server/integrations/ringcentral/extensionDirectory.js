// The firm's RingCentral extensions (who is a person, which is a queue or an
// IVR menu), read from GET /restapi/v1.0/account/~/extension. The call
// classifier needs it: a leg only counts as an employee when this says the
// extension is a person (callEvidence.js PERSON_TYPES).
//
// Needs the Read Accounts app permission (user permission ReadExtensions);
// "Medium" rate group. Read-only. Refreshed at most once a day by the call
// import; when RingCentral refuses, the last good copy is kept and the error
// recorded, and calls that depend on it stay "not confirmed".
import { rcGet, RingCentralApiError } from './api.js'
import { PERSON_TYPES } from './callEvidence.js'

export const DIRECTORY_PATH = '/restapi/v1.0/account/~/extension'
export const DIRECTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000
const PER_PAGE = 1000
const MAX_PAGES = 5

const s = (v, n = 120) => (v == null || v === '' ? null : String(v).slice(0, n))

/** Fetch every extension; returns [{ id, number, name, type, status }]. */
export async function fetchDirectory(config, token, deps = {}) {
  const out = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await rcGet(config, token, DIRECTORY_PATH, { perPage: PER_PAGE, page }, deps)
    const records = Array.isArray(body?.records) ? body.records : []
    for (const r of records) {
      if (r?.id == null) continue
      out.push({ id: s(r.id, 40), number: s(r.extensionNumber, 20), name: s(r.name), type: s(r.type, 40), status: s(r.status, 20) })
    }
    if (!body?.navigation?.nextPage || !records.length) break
  }
  return out
}

/** Replace the stored directory. Returns true when anything changed (calls must then be re-read). */
export async function saveDirectory(db, entries, now = new Date()) {
  const before = await db.query('SELECT id, extension_number, name, type FROM rc_extensions ORDER BY id')
  const sig = (rows) => JSON.stringify(rows.map((r) => [r.id, r.extension_number ?? r.number, r.name, r.type]).sort())
  const changed = sig(before.rows) !== sig(entries)
  for (const e of entries) {
    await db.query(
      `INSERT INTO rc_extensions (id, extension_number, name, type, status, seen_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET extension_number = EXCLUDED.extension_number, name = EXCLUDED.name, type = EXCLUDED.type,
              status = EXCLUDED.status, seen_at = EXCLUDED.seen_at`,
      [e.id, e.number, e.name, e.type, e.status, now]
    )
  }
  // Extensions deleted in RingCentral are dropped: an old call that went to
  // one then reads as an unconfirmed extension, which is the truth.
  if (entries.length) await db.query('DELETE FROM rc_extensions WHERE seen_at < $1', [now])
  return changed
}

/** The stored directory as the classifier reads it. */
export async function loadDirectory(db) {
  const [stateRes, extRes] = await Promise.all([
    db.query(`SELECT directory_refreshed_at FROM rc_call_sync_state WHERE key = 'ringcentral'`),
    db.query('SELECT id, extension_number AS number, name, type, status FROM rc_extensions'),
  ])
  const state = stateRes.rows[0]
  const rows = extRes.rows
  return {
    available: Boolean(state?.directory_refreshed_at) && rows.length > 0,
    refreshedAt: state?.directory_refreshed_at ?? null,
    byId: new Map(rows.map((r) => [r.id, r])),
    people: rows.filter((r) => PERSON_TYPES.includes(r.type)),
  }
}

/**
 * Refresh the stored directory when it is older than a day (or `force`).
 * Returns { status: 'fresh' | 'refreshed' | 'error', changed, code }.
 */
export async function refreshDirectory(db, config, { token, now = new Date(), force = false, deps = {} } = {}) {
  const state = (await db.query(`SELECT directory_refreshed_at FROM rc_call_sync_state WHERE key = 'ringcentral'`)).rows[0]
  const last = state?.directory_refreshed_at ? new Date(state.directory_refreshed_at).getTime() : 0
  if (!force && now.getTime() - last < DIRECTORY_MAX_AGE_MS) return { status: 'fresh', changed: false }
  try {
    const entries = await fetchDirectory(config, token, deps)
    const changed = await saveDirectory(db, entries, now)
    await db.query(
      `UPDATE rc_call_sync_state SET directory_refreshed_at = $1, directory_error_code = NULL, directory_error_at = NULL WHERE key = 'ringcentral'`,
      [now]
    )
    return { status: 'refreshed', changed }
  } catch (err) {
    if (!(err instanceof RingCentralApiError)) throw err
    const code = err.status === 403 ? 'missing_permission' : err.status === 429 ? 'rate_limited' : err.code || 'error'
    await db.query(`UPDATE rc_call_sync_state SET directory_error_code = $1, directory_error_at = $2 WHERE key = 'ringcentral'`, [code, now])
    return { status: 'error', changed: false, code }
  }
}
