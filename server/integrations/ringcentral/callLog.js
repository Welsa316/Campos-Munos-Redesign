// RingCentral call log → rc_calls, and the readable list the portal shows
// (docs/ringcentral-call-log.md).
//
// Import: GET /restapi/v1.0/account/~/call-log (the whole company, needs an
// administrator's authorisation) or, when RingCentral refuses that,
// /restapi/v1.0/account/~/extension/~/call-log (only the calls of the user
// who connected). view=Detailed (legs, to see who answered), type=Voice (no
// faxes). Read-only: nothing here changes RingCentral.
//
// Each run re-reads a few hours before the previous run's end, because
// RingCentral adds a call to its log only after the call ends and sometimes
// later still; records are upserted by RingCentral's record id, so overlap
// never duplicates. One run at a time across instances (advisory lock).
// The call-log endpoint is in RingCentral's "Heavy" rate group (about 10
// requests a minute), so pages are spaced out and a 429 ends the run; the
// next one picks up from the same place.
import { getAccessToken, maintainConnection, RingCentralNotConnectedError } from './service.js'
import { rcGet, RingCentralApiError } from './api.js'
import { sanitizeRecord, classifyCall, CLASSIFIER_VERSION, UNANSWERED_CLASSES, systemOnlyPlaces } from './callEvidence.js'
import { refreshDirectory, loadDirectory } from './extensionDirectory.js'
import { loadEvents, purgeOldEvents } from './telephonyEvents.js'

export const ACCOUNT_PATH = '/restapi/v1.0/account/~/call-log'
export const EXTENSION_PATH = '/restapi/v1.0/account/~/extension/~/call-log'
export const OVERLAP_MS = 3 * 60 * 60 * 1000
export const SCOPE_RECHECK_MS = 24 * 60 * 60 * 1000
export const DEFAULT_BACKFILL_DAYS = 14
export const DEFAULT_RETENTION_DAYS = 365
export const EVIDENCE_BACKFILL_DAYS = 90
const PER_PAGE = 250
const MAX_PAGES = 20
// RingCentral sends the newest calls first, so a window cut off at MAX_PAGES
// is missing its oldest calls. The import then reads again from the start of
// the window up to the oldest call it got, at most this many times per run.
const MAX_WINDOWS = 5
const PAGE_DELAY_MS = 6500
const LOCK_KEY = 'cm_rc_call_sync'

// --- reading one record -----------------------------------------------------------

const norm = (s) => String(s ?? '').trim().toLowerCase()
const ANSWERED = new Set(['accepted', 'call connected'])
const INBOUND_MISSED = new Set(['missed', 'no answer', 'rejected', 'hang up', 'abandoned', 'busy', 'declined'])
const OUTBOUND_NO_ANSWER = new Set(['no answer', 'busy', 'rejected', 'hang up', 'missed', 'declined'])

/** RingCentral's result text → answered | missed | voicemail | connected | no_answer | other. */
export function classifyOutcome(direction, result) {
  const r = norm(result)
  if (direction === 'inbound') {
    if (ANSWERED.has(r)) return 'answered'
    if (r === 'voicemail') return 'voicemail'
    if (INBOUND_MISSED.has(r)) return 'missed'
    return 'other'
  }
  if (ANSWERED.has(r)) return 'connected'
  if (OUTBOUND_NO_ANSWER.has(r)) return 'no_answer'
  return 'other'
}

const GENERIC_CALLER_ID = /^(wireless caller|cell phone|unknown( caller| name)?|unavailable|anonymous|private( caller| number| name)?|restricted|blocked|toll free( call)?|no caller id|out of area)$/i
/**
 * Caller ID that says nothing about who called: carrier placeholders, bare
 * numbers, and the "CITY ST" form many carriers send instead of a name
 * ("NEW ORLEANS LA"; it arrives in capitals with a 2-letter state last).
 */
export function isGenericCallerId(name) {
  const s = String(name ?? '').trim()
  if (!s || /^[\d\s+().-]+$/.test(s)) return true
  if (/^[A-Z .'-]+ [A-Z]{2}$/.test(s)) return true
  return GENERIC_CALLER_ID.test(s)
}

const cap = (v, n = 120) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, n) : null
}

/** One RingCentral call log record → an rc_calls row, or null to skip it. */
export function normalizeRecord(rec, scope) {
  if (!rec || typeof rec !== 'object' || rec.id == null) return null
  if (rec.type && rec.type !== 'Voice') return null
  const direction = rec.direction === 'Inbound' ? 'inbound' : rec.direction === 'Outbound' ? 'outbound' : null
  if (!direction) return null
  const startedAt = new Date(rec.startTime)
  if (Number.isNaN(startedAt.getTime())) return null

  const from = rec.from || {}
  const to = rec.to || {}
  const counterpart = direction === 'inbound' ? from : to
  const firm = direction === 'inbound' ? to : from
  const outcome = classifyOutcome(direction, rec.result)

  // Who picked up: on Detailed records, the last leg that was answered by an
  // extension (after transfers, the person who ended up with the caller).
  let answeredBy = null
  if (direction === 'inbound' && outcome === 'answered') {
    const legs = Array.isArray(rec.legs) ? rec.legs : []
    for (const leg of legs) {
      if (!ANSWERED.has(norm(leg?.result))) continue
      const t = leg?.to || {}
      if (t.extensionNumber || (t.name && !t.phoneNumber)) answeredBy = { name: t.name, extension: t.extensionNumber }
    }
    if (!answeredBy && firm.extensionNumber) answeredBy = { name: firm.name, extension: firm.extensionNumber }
  }

  return {
    rc_record_id: cap(rec.id, 200),
    telephony_session_id: cap(rec.telephonySessionId, 200),
    session_id: cap(rec.sessionId, 200),
    direction,
    started_at: startedAt,
    duration_seconds: Math.max(0, Math.trunc(Number(rec.duration) || 0)),
    result_raw: cap(rec.result, 60),
    outcome,
    counterpart_number: cap(counterpart.phoneNumber, 40),
    caller_id_name: cap(counterpart.name),
    firm_number: cap(firm.phoneNumber, 40),
    firm_name: cap(firm.name),
    firm_extension: cap(firm.extensionNumber, 20),
    answered_by_name: cap(answeredBy?.name),
    answered_by_extension: cap(answeredBy?.extension, 20),
    // Extension to extension inside the firm: no outside number at all.
    is_internal: !counterpart.phoneNumber && Boolean(counterpart.extensionNumber || counterpart.extensionId),
    scope,
    rc_last_modified_at: rec.lastModifiedTime && !Number.isNaN(new Date(rec.lastModifiedTime).getTime()) ? new Date(rec.lastModifiedTime) : null,
    rc_raw: sanitizeRecord(rec),
  }
}


// --- import ----------------------------------------------------------------------

export class CallSyncError extends Error {
  constructor(code, status = 502) {
    super(code)
    this.name = 'CallSyncError'
    this.code = code
    this.status = status
  }
}

async function fetchWindow({ config, token, path, scope, dateFrom, dateTo, deps, sleep, pageDelayMs, maxPages = MAX_PAGES }) {
  const rows = []
  let fetched = 0
  let truncated = false
  for (let page = 1; ; page++) {
    if (page > 1 && pageDelayMs) await sleep(pageDelayMs)
    const body = await rcGet(config, token, path, {
      view: 'Detailed', type: 'Voice', dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), perPage: PER_PAGE, page,
    }, deps)
    const records = Array.isArray(body?.records) ? body.records : []
    fetched += records.length
    for (const r of records) {
      const row = normalizeRecord(r, scope)
      if (row) rows.push(row)
    }
    const more = Boolean(body?.navigation?.nextPage) && records.length > 0
    if (!more) break
    if (page >= maxPages) { truncated = true; break }
  }
  return { rows, fetched, truncated }
}

/**
 * The whole of [dateFrom, dateTo], in as many windows as it takes (up to
 * maxWindows): each truncated window is followed by one ending at the oldest
 * call it returned. truncated: the oldest part is still unread.
 */
async function fetchRange({ dateFrom, dateTo, maxWindows = MAX_WINDOWS, ...args }) {
  const rows = []
  let fetched = 0
  let to = dateTo
  for (let w = 0; w < maxWindows; w++) {
    const got = await fetchWindow({ ...args, dateFrom, dateTo: to })
    rows.push(...got.rows)
    fetched += got.fetched
    if (!got.truncated) return { rows, fetched, truncated: false }
    const oldest = Math.min(...got.rows.map((r) => r.started_at.getTime()))
    // A second past the oldest call: calls in that same second are read
    // again rather than skipped (the import is idempotent).
    const next = new Date(oldest + 1000)
    if (!Number.isFinite(oldest) || next >= to || next <= dateFrom) break
    to = next
  }
  return { rows, fetched, truncated: true }
}

async function upsertCalls(db, rows) {
  let inserted = 0
  for (const r of rows) {
    const res = await db.query(
      `INSERT INTO rc_calls (rc_record_id, telephony_session_id, session_id, direction, started_at, duration_seconds, result_raw, outcome,
              counterpart_number, counterpart_key, caller_id_name, firm_number, firm_name, firm_extension,
              answered_by_name, answered_by_extension, is_internal, scope, rc_last_modified_at, rc_raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, cm_phone_key($9), $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (rc_record_id) DO UPDATE SET
              telephony_session_id = EXCLUDED.telephony_session_id, session_id = EXCLUDED.session_id,
              direction = EXCLUDED.direction, started_at = EXCLUDED.started_at, duration_seconds = EXCLUDED.duration_seconds,
              result_raw = EXCLUDED.result_raw, outcome = EXCLUDED.outcome, counterpart_number = EXCLUDED.counterpart_number,
              counterpart_key = EXCLUDED.counterpart_key, caller_id_name = EXCLUDED.caller_id_name,
              firm_number = EXCLUDED.firm_number, firm_name = EXCLUDED.firm_name, firm_extension = EXCLUDED.firm_extension,
              answered_by_name = EXCLUDED.answered_by_name, answered_by_extension = EXCLUDED.answered_by_extension,
              is_internal = EXCLUDED.is_internal, rc_last_modified_at = EXCLUDED.rc_last_modified_at, rc_raw = EXCLUDED.rc_raw, updated_at = NOW()
              -- A company-wide record is never replaced by the narrower per-user copy.
        WHERE rc_calls.scope = EXCLUDED.scope OR EXCLUDED.scope = 'account'
       RETURNING (xmax = 0) AS inserted`,
      [r.rc_record_id, r.telephony_session_id, r.session_id, r.direction, r.started_at, r.duration_seconds, r.result_raw, r.outcome,
        r.counterpart_number, r.caller_id_name, r.firm_number, r.firm_name, r.firm_extension,
        r.answered_by_name, r.answered_by_extension, r.is_internal, r.scope, r.rc_last_modified_at, r.rc_raw ? JSON.stringify(r.rc_raw) : null]
    )
    if (res.rows[0]?.inserted) inserted++
  }
  return inserted
}

const errorCodeOf = (err) => {
  if (err instanceof RingCentralNotConnectedError) return err.code
  if (err instanceof RingCentralApiError) {
    if (err.status === 429) return 'rate_limited'
    if (err.status === 403) return 'missing_permission'
    return err.code
  }
  return err?.code || 'error'
}

const callKeyOf = (r) => r.telephony_session_id || r.session_id || r.rc_record_id

/**
 * Classify stored calls from their RingCentral records (callEvidence.js),
 * reading every record of one call together and marking one of them as the
 * call (is_primary) so it counts once. `keys`: the calls to read again;
 * `all`: every stored call. Calls classified by an older version of the
 * rules are always read again, unless `onlyKeys` (a live event about one
 * call): then exactly `keys`, nothing else.
 *
 * The sweep goes through matching calls in batches of `batchSize` call keys
 * (keyset on call_key), so a changed directory or new rules never load the
 * whole call log at once. A call's records are always in the same batch.
 */
export async function classifyStored(db, { keys = [], all = false, onlyKeys = false, batchSize = 500 } = {}) {
  const ctx = { directory: null }
  if (onlyKeys) return classifyCalls(db, keys, ctx)
  const total = { calls: 0, rows: 0 }
  let after = null
  for (;;) {
    const page = (await db.query(
      `SELECT DISTINCT call_key FROM rc_calls
        WHERE call_key IS NOT NULL AND ($4::text IS NULL OR call_key > $4)
          AND ($1 OR call_key = ANY($2::text[]) OR classifier_version IS DISTINCT FROM $3)
        ORDER BY call_key LIMIT $5`,
      [all, keys, CLASSIFIER_VERSION, after, batchSize]
    )).rows.map((r) => r.call_key)
    if (!page.length) break
    const r = await classifyCalls(db, page, ctx)
    total.calls += r.calls
    total.rows += r.rows
    if (page.length < batchSize) break
    after = page[page.length - 1]
  }
  return total
}

// Every record of the given calls. The directory is read once per sweep, and
// only when there is something to classify.
async function classifyCalls(db, keys, ctx) {
  if (!keys.length) return { calls: 0, rows: 0 }
  const rows = (await db.query(
    `SELECT id, call_key, direction, scope, rc_raw FROM rc_calls
      WHERE call_key = ANY($1::text[])
      ORDER BY call_key, id`,
    [keys]
  )).rows
  if (!rows.length) return { calls: 0, rows: 0 }
  if (!ctx.directory) ctx.directory = await loadDirectory(db)
  const directory = ctx.directory
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r.call_key)) groups.set(r.call_key, [])
    groups.get(r.call_key).push(r)
  }
  // Live call events, by telephony session (the call key when RingCentral gave one).
  const events = await loadEvents(db, [...groups.keys()])
  const updates = []
  for (const group of groups.values()) {
    // A session with an incoming record is an incoming call (an outgoing
    // record beside it is a transfer out), read from its incoming records.
    // The company-wide record with the fullest evidence stands for the call.
    const inbound = group.filter((r) => r.direction === 'inbound')
    const own = inbound.length ? inbound : group
    const legsOf = (r) => (Array.isArray(r.rc_raw?.legs) ? r.rc_raw.legs.length : -1)
    const primary = [...own].sort((a, b) => (a.scope === 'account' ? 0 : 1) - (b.scope === 'account' ? 0 : 1) || legsOf(b) - legsOf(a) || Number(a.id) - Number(b.id))[0]
    const evidence = classifyCall(own.map((r) => r.rc_raw).filter(Boolean), { direction: primary.direction, directory, events: events.get(primary.call_key) || null })
    for (const r of group) updates.push([r.id, evidence.classification, primary.direction === 'inbound' ? evidence : null, r.id === primary.id])
  }
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    await db.query(
      `UPDATE rc_calls c SET classification = v.cls, classification_evidence = v.ev, classifier_version = $5, is_primary = v.prim,
              updated_at = CASE WHEN c.classification IS DISTINCT FROM v.cls OR c.is_primary IS DISTINCT FROM v.prim THEN NOW() ELSE c.updated_at END
         FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS cls, unnest($3::jsonb[]) AS ev, unnest($4::boolean[]) AS prim) v
        WHERE c.id = v.id`,
      [chunk.map((u) => u[0]), chunk.map((u) => u[1]), chunk.map((u) => (u[2] ? JSON.stringify(u[2]) : null)), chunk.map((u) => u[3]), CLASSIFIER_VERSION]
    )
  }
  return { calls: groups.size, rows: updates.length }
}

/**
 * Import new and changed calls. Returns { status: 'ok' | 'busy' | 'error', ... }.
 * Never throws for RingCentral problems: the error code is recorded and returned.
 */
export async function syncCallLog(db, config, {
  trigger = 'manual', backfillDays = DEFAULT_BACKFILL_DAYS, retentionDays = DEFAULT_RETENTION_DAYS,
  deps = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pageDelayMs = PAGE_DELAY_MS,
  maxPages = MAX_PAGES, maxWindows = MAX_WINDOWS,
} = {}) {
  const now = deps.now ? deps.now() : new Date()
  const lockClient = typeof db.totalCount === 'number' ? await db.connect() : db
  try {
    const got = (await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [LOCK_KEY])).rows[0]?.ok
    if (!got) return { status: 'busy' }
    try {
      return await runSync(db, config, { trigger, backfillDays, retentionDays, deps, sleep, pageDelayMs, maxPages, maxWindows, now })
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {})
    }
  } finally {
    if (lockClient !== db) lockClient.release()
  }
}

async function runSync(db, config, { trigger, backfillDays, retentionDays, deps, sleep, pageDelayMs, maxPages, maxWindows, now }) {
  await db.query(`INSERT INTO rc_call_sync_state (key) VALUES ('ringcentral') ON CONFLICT (key) DO NOTHING`)
  const state = (await db.query(`SELECT * FROM rc_call_sync_state WHERE key = 'ringcentral'`)).rows[0]
  // Calls classified by older rules (or not yet) are read again first, even
  // if RingCentral cannot be reached this time: it needs only stored records.
  await classifyStored(db)

  const dateTo = now
  const backfillFrom = new Date(now.getTime() - Math.min(90, Math.max(1, backfillDays)) * 24 * 60 * 60 * 1000)
  let dateFrom = state.window_to ? new Date(new Date(state.window_to).getTime() - OVERLAP_MS) : backfillFrom
  // Calls imported before their steps were kept: read the backfill period
  // again once, so recent calls show where they went too.
  if (!state.legs_backfilled_at && dateFrom > backfillFrom) dateFrom = backfillFrom
  // Likewise, once, for RingCentral's full record (the evidence the
  // classification rests on), over the longest period the import allows.
  const evidenceFrom = new Date(now.getTime() - EVIDENCE_BACKFILL_DAYS * 24 * 60 * 60 * 1000)
  if (!state.raw_backfilled_at && dateFrom > evidenceFrom) dateFrom = evidenceFrom

  const recordError = async (code) => {
    await db.query(
      `UPDATE rc_call_sync_state SET last_run_at = $1, last_trigger = $2, last_error_code = $3, last_error_at = $1 WHERE key = 'ringcentral'`,
      [now, trigger, code]
    )
    return { status: 'error', code }
  }

  let token
  try {
    token = await getAccessToken(db, config, deps)
  } catch (err) {
    return recordError(errorCodeOf(err))
  }

  // One call with a single forced token refresh if RingCentral says the token
  // is no longer valid (revoked or expired early).
  const withToken = async (fn) => {
    try {
      return await fn(token)
    } catch (err) {
      if (!(err instanceof RingCentralApiError) || err.status !== 401) throw err
      await maintainConnection(db, config, { force: true }, deps)
      token = await getAccessToken(db, config, deps)
      return fn(token)
    }
  }

  const fetchArgs = { config, dateFrom, dateTo, deps, sleep, pageDelayMs, maxPages, maxWindows }
  const recentlyExtension = state.scope === 'extension' && state.scope_checked_at
    && now.getTime() - new Date(state.scope_checked_at).getTime() < SCOPE_RECHECK_MS
  let scope = recentlyExtension ? 'extension' : 'account'
  let scopeCheckedAt = recentlyExtension ? state.scope_checked_at : now
  let result
  try {
    try {
      result = await withToken((t) => fetchRange({ ...fetchArgs, token: t, path: scope === 'account' ? ACCOUNT_PATH : EXTENSION_PATH, scope }))
    } catch (err) {
      // The connecting user may read only their own calls; RingCentral says
      // so with a 403 on the company log.
      if (scope !== 'account' || !(err instanceof RingCentralApiError) || err.status !== 403) throw err
      scope = 'extension'
      scopeCheckedAt = now
      result = await withToken((t) => fetchRange({ ...fetchArgs, token: t, path: EXTENSION_PATH, scope }))
    }
  } catch (err) {
    return recordError(errorCodeOf(err))
  }

  const inserted = await upsertCalls(db, result.rows)
  // Which extensions are people (daily), then read the calls again on that
  // evidence: the ones just imported, or all of them when the directory changed.
  const directory = await refreshDirectory(db, config, { token, now, deps })
  await classifyStored(db, { keys: result.rows.map(callKeyOf), all: directory.changed })
  await db.query(`DELETE FROM rc_calls WHERE started_at < $1::timestamptz - make_interval(days => $2)`, [now, Math.max(30, retentionDays)])
  await purgeOldEvents(db, now)
  // Portal-placed calls are only needed while they ring; the call itself is in the call log.
  await db.query(`DELETE FROM rc_ringouts WHERE created_at < $1::timestamptz - INTERVAL '90 days'`, [now])
  // Still cut off after every window: the oldest calls are unread, so the
  // window stays where it was and the next run reads it again, instead of
  // moving on and leaving them behind for good.
  const complete = !result.truncated
  await db.query(
    `UPDATE rc_call_sync_state SET scope = $1, scope_checked_at = $2, window_to = CASE WHEN $8 THEN $3 ELSE window_to END,
            last_run_at = $3, last_success_at = $3,
            last_trigger = $4, last_fetched = $5, last_new = $6, last_truncated = $7, last_error_code = NULL, last_error_at = NULL,
            legs_backfilled_at = CASE WHEN $8 THEN COALESCE(legs_backfilled_at, $3) ELSE legs_backfilled_at END,
            raw_backfilled_at = CASE WHEN $8 THEN COALESCE(raw_backfilled_at, $3) ELSE raw_backfilled_at END
      WHERE key = 'ringcentral'`,
    [scope, scopeCheckedAt, dateTo, trigger, result.fetched, inserted, result.truncated, complete]
  )
  return { status: 'ok', scope, fetched: result.fetched, new: inserted, truncated: result.truncated, directory: directory.status, directoryCode: directory.code }
}

export async function getSyncState(db) {
  const s = (await db.query(`SELECT * FROM rc_call_sync_state WHERE key = 'ringcentral'`)).rows[0]
  if (!s) return { scope: null, lastRunAt: null, lastSuccessAt: null, lastErrorCode: null, lastErrorAt: null, lastNew: null, truncated: false, directoryRefreshedAt: null, directoryErrorCode: null, directoryErrorAt: null }
  return {
    scope: s.scope,
    lastRunAt: s.last_run_at,
    lastSuccessAt: s.last_success_at,
    lastErrorCode: s.last_error_code,
    lastErrorAt: s.last_error_at,
    lastNew: s.last_new,
    truncated: s.last_truncated,
    // The extension list the classification needs (who is a person).
    directoryRefreshedAt: s.directory_refreshed_at,
    directoryErrorCode: s.directory_error_code,
    directoryErrorAt: s.directory_error_at,
  }
}

// --- the list the portal shows ------------------------------------------------------

export const OUTCOME_FILTERS = Object.freeze([
  'all', 'answered', 'missed', 'hung_up', 'ended', 'voicemail', 'unconfirmed', 'system', 'unanswered', 'outgoing', 'not_returned', 'excluded', 'attention', 'handled',
])

// The firm's opening hours, as published on the website (site/index.html,
// LegalService openingHoursSpecification): Monday to Friday, 9:00 to 17:00,
// New Orleans time. Public holidays are not excluded.
export const BUSINESS_HOURS = Object.freeze({ timeZone: 'America/Chicago', days: 'Mon–Fri', start: '09:00', end: '17:00' })
const local = (col) => `(${col} AT TIME ZONE '${BUSINESS_HOURS.timeZone}')`
export const businessHoursSql = (col) =>
  `(EXTRACT(ISODOW FROM ${local(col)}) BETWEEN 1 AND 5 AND ${local(col)}::time >= '${BUSINESS_HOURS.start}' AND ${local(col)}::time < '${BUSINESS_HOURS.end}')`

// Proven not answered by anyone (callEvidence.js UNANSWERED_CLASSES): not
// answered by the people it was offered to, the caller hung up first, or
// voicemail. A call the evidence cannot settle ('unknown') is never counted
// as missed.
const UNANSWERED_SQL = (col) => `${col} IN (${UNANSWERED_CLASSES.map((c) => `'${c}'`).join(', ')})`

// Dealt with (Calls → Handled, and "Handled today" when given a since): an
// unanswered call marked handled, or closed by a connected callback or a
// later answered call. One marked as needing no callback is not counted,
// and neither is a bulk clear in "Handled today" (nobody dealt with those
// calls today; the list was emptied).
const DEALT_WITH_SQL = (since = null) => {
  const at = (col) => (since ? `${col} >= ${since}` : `${col} IS NOT NULL`)
  const marked = since ? `(${at('handled_at')} AND handled_batch IS NULL)` : at('handled_at')
  return `direction = 'inbound' AND excluded_kind IS NULL AND (${marked} OR (${at('connected_followup_at')} AND ${UNANSWERED_SQL('classification')} AND counterpart_key <> ''))`
}

// A missed call or voicemail counts as returned once the firm called that
// number back, or the person called again and got through.
const RETURNED_SQL = `EXISTS (
  SELECT 1 FROM rc_calls r
   WHERE r.counterpart_key = c.counterpart_key AND r.started_at > c.started_at AND NOT r.is_internal AND r.is_primary
     AND (r.direction = 'outbound' OR r.classification = 'answered'))`

// Staff marked it as needing no callback, on its own or by its number
// (callExclusions.js). It stays in the log but leaves every missed count.
// A mark on any record of the call counts.
const EXCLUDED_SQL = `(EXISTS (SELECT 1 FROM rc_call_exclusions x JOIN rc_calls d ON d.id = x.call_id WHERE d.call_key = c.call_key)
  OR (c.counterpart_key <> '' AND EXISTS (SELECT 1 FROM rc_ignored_numbers ig WHERE ig.counterpart_key = c.counterpart_key)))`

/**
 * Incoming calls proven not answered (not answered, caller hung up,
 * voicemail) during business hours in the last `days` days, and how many of
 * them nobody has returned yet (a withheld number cannot be returned, so it
 * is not counted there). `unconfirmed`: calls the evidence could not settle,
 * counted apart and never as missed.
 */
export async function summarizeMissed(db, { now = new Date(), days = 30, from: start = null } = {}) {
  // The portal passes the same start as its "30 days" view (local midnight 29
  // days ago), so the card and the list agree exactly.
  const from = start || new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const row = (await db.query(
    `SELECT COUNT(*) FILTER (WHERE ${UNANSWERED_SQL('c.classification')} AND NOT ${EXCLUDED_SQL})::int AS total,
            COUNT(*) FILTER (WHERE c.classification = 'voicemail' AND NOT ${EXCLUDED_SQL})::int AS voicemail,
            COUNT(*) FILTER (WHERE ${UNANSWERED_SQL('c.classification')} AND NOT ${EXCLUDED_SQL} AND c.counterpart_key <> '' AND NOT ${RETURNED_SQL}
                                AND NOT EXISTS (SELECT 1 FROM rc_call_resolutions hd WHERE hd.call_key = c.call_key))::int AS not_returned,
            COUNT(*) FILTER (WHERE c.classification = 'unknown' AND NOT ${EXCLUDED_SQL})::int AS unconfirmed
       FROM rc_calls c
      WHERE NOT c.is_internal AND c.direction = 'inbound' AND c.is_primary
        AND c.started_at >= $1 AND c.started_at < $2 AND ${businessHoursSql('c.started_at')}`,
    [from, now]
  )).rows[0]
  return {
    days, from, to: now, businessHours: BUSINESS_HOURS,
    total: row.total, voicemail: row.voicemail, notReturned: row.not_returned, unconfirmed: row.unconfirmed,
  }
}

/** "NEW ORLEANS LA" → "New Orleans, LA"; null when caller ID is not a city. */
export function callerLocation(name) {
  const m = /^([A-Z .'-]+) ([A-Z]{2})$/.exec(String(name ?? '').trim())
  return m ? `${titleCase(m[1].trim())}, ${m[2]}` : null
}

const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase())


// The calls query: every call with the firm's own name for the caller, its
// follow-ups, any mark it carries, and whether it still needs someone.
// "Needs attention" is a workflow state, never a classification: an incoming
// call proven not answered by anyone (UNANSWERED_CLASSES), from a number that
// can be called back, that nobody has dealt with yet: no connected callback
// or later answered call, not marked handled, not marked as needing no
// callback. It says nothing about who missed it.
function baseSql(where, searchSql = '') {
  return `
    WITH base AS (
      -- Every column but RingCentral's raw record and the old legs copy: a
      -- page of up to a thousand calls never needs them.
      SELECT c.id, c.rc_record_id, c.telephony_session_id, c.session_id, c.direction, c.started_at, c.duration_seconds,
             c.result_raw, c.outcome, c.counterpart_number, c.counterpart_key, c.caller_id_name, c.firm_number, c.firm_name,
             c.firm_extension, c.answered_by_name, c.answered_by_extension, c.is_internal, c.scope, c.rc_last_modified_at,
             c.first_seen_at, c.updated_at, c.call_key, c.is_primary, c.classification, c.classification_evidence, c.classifier_version,
             lead.id AS lead_id, lead.first_name AS lead_first, lead.last_name AS lead_last, lead.n AS lead_count,
             cl.client_id, cl.client_name,
             -- Marked "someone from the firm" for every call from the number:
             -- a colleague's own phone, so not a website lead even when they
             -- once tried the contact form with it.
             EXISTS (SELECT 1 FROM rc_ignored_numbers fn
                      WHERE c.counterpart_key <> '' AND fn.counterpart_key = c.counterpart_key AND fn.reason = 'staff_test') AS from_firm,
             fu.started_at AS followup_at, fu.direction AS followup_direction, fu.outcome AS followup_outcome,
             -- The follow-up that closes a call: a connected callback, or the
             -- caller getting through later. A callback attempt that did not
             -- connect leaves it open ("try again").
             fc.started_at AS connected_followup_at, fc.direction AS connected_followup_direction,
             fa.started_at AS attempt_at,
             hd.created_at AS handled_at, hd.note AS handled_note, hd.batch_id AS handled_batch, COALESCE(NULLIF(hdu.display_name, ''), split_part(hdu.email, '@', 1)) AS handled_by,
             (c.direction = 'inbound' AND ${UNANSWERED_SQL('c.classification')} AND c.counterpart_key <> ''
              AND fc.started_at IS NULL AND hd.call_key IS NULL AND ex.kind IS NULL) AS needs_attention,
             -- The quiet review group: RingCentral recorded no outcome
             -- ('unknown'), the number can be called back, and nothing since
             -- shows the person reached us. Never counted as missed, never
             -- attributed to anyone, not in the Needs attention count.
             (c.direction = 'inbound' AND c.classification = 'unknown' AND c.counterpart_key <> ''
              AND fc.started_at IS NULL AND hd.call_key IS NULL AND ex.kind IS NULL) AS needs_review,
             ex.kind AS excluded_kind, ex.reason AS excluded_reason, ex.note AS excluded_note, ex.created_at AS excluded_at,
             COALESCE(NULLIF(exu.display_name, ''), exu.email) AS excluded_by
        FROM rc_calls c
        LEFT JOIN LATERAL (
          SELECT s.id, s.first_name, s.last_name, COUNT(*) OVER () AS n
            FROM submissions s
           WHERE c.counterpart_key <> '' AND cm_phone_key(s.phone) = c.counterpart_key
           ORDER BY s.created_at DESC LIMIT 1) lead ON TRUE
        LEFT JOIN LATERAL (
          SELECT bc.id AS client_id, bc.display_name AS client_name
            FROM billing_client_contacts cc JOIN billing_clients bc ON bc.id = cc.client_id
           WHERE c.counterpart_key <> '' AND cm_phone_key(cc.phone_e164) = c.counterpart_key
           ORDER BY cc.updated_at DESC LIMIT 1) cl ON TRUE
        LEFT JOIN LATERAL (
          SELECT r.started_at, r.direction, r.outcome
            FROM rc_calls r
           WHERE c.direction = 'inbound' AND ${UNANSWERED_SQL('c.classification')} AND c.counterpart_key <> ''
             AND r.counterpart_key = c.counterpart_key AND r.started_at > c.started_at AND NOT r.is_internal AND r.is_primary
             AND (r.direction = 'outbound' OR r.classification = 'answered')
           ORDER BY r.started_at LIMIT 1) fu ON TRUE
        LEFT JOIN LATERAL (
          SELECT r.started_at, r.direction
            FROM rc_calls r
           WHERE c.direction = 'inbound' AND c.counterpart_key <> ''
             AND r.counterpart_key = c.counterpart_key AND r.started_at > c.started_at AND NOT r.is_internal AND r.is_primary
             AND ((r.direction = 'outbound' AND r.outcome = 'connected') OR r.classification = 'answered')
           ORDER BY r.started_at LIMIT 1) fc ON TRUE
        LEFT JOIN LATERAL (
          SELECT r.started_at
            FROM rc_calls r
           WHERE c.direction = 'inbound' AND c.counterpart_key <> ''
             AND r.counterpart_key = c.counterpart_key AND r.started_at > c.started_at AND NOT r.is_internal AND r.is_primary
             AND r.direction = 'outbound' AND r.outcome <> 'connected'
           ORDER BY r.started_at DESC LIMIT 1) fa ON TRUE
        LEFT JOIN rc_call_resolutions hd ON hd.call_key = c.call_key
        LEFT JOIN admin_users hdu ON hdu.id = hd.created_by
        -- A number rule wins over a single-call exclusion: it is the broader one.
        LEFT JOIN LATERAL (
          SELECT e.kind, e.reason, e.note, e.created_at, e.created_by FROM (
            SELECT 'number' AS kind, ig.reason, ig.note, ig.created_at, ig.created_by, 1 AS rank
              FROM rc_ignored_numbers ig WHERE c.counterpart_key <> '' AND ig.counterpart_key = c.counterpart_key
            UNION ALL
            SELECT 'call', x.reason, x.note, x.created_at, x.created_by, 2
              FROM rc_call_exclusions x JOIN rc_calls d ON d.id = x.call_id WHERE d.call_key = c.call_key) e
           WHERE c.direction = 'inbound' AND c.classification IS DISTINCT FROM 'answered'
           ORDER BY e.rank LIMIT 1) ex ON TRUE
        LEFT JOIN admin_users exu ON exu.id = ex.created_by
       WHERE ${where.join(' AND ')}
    ), filtered AS (
      SELECT * FROM base b ${searchSql ? `WHERE ${searchSql}` : ''}
    )`
}

// --- what is left to do about a call, and callback episodes ----------------------

/**
 * The follow-up decision for one call, kept apart from its classification
 * (which says what the call *was* and who it is attributed to; this only says
 * what is left to do). `r` is a row of the calls query. In order:
 *
 *   not_actionable       outgoing; between extensions; a duplicate record of a
 *                        call (not is_primary); withheld number; ended by the
 *                        phone system; not classified yet
 *   confirmed_answered   answered by someone at the firm
 *   resolved             proven unanswered or not confirmed, and since dealt
 *                        with: a connected callback, a later answered call,
 *                        marked handled (or cleared), or no callback needed
 *   confirmed_unanswered proven not answered by anyone (UNANSWERED_CLASSES) and
 *                        still open: Needs attention
 *   review               RingCentral recorded no outcome ('unknown') and still
 *                        open: "Check if they still need help", never counted
 *                        as missed or against anyone
 *
 * The SQL columns needs_attention and needs_review are the same rules; the
 * tests hold the two together.
 */
export function followUpDecision(r) {
  if (r.direction !== 'inbound' || r.is_internal || r.is_primary === false) return 'not_actionable'
  if (r.classification === 'answered') return 'confirmed_answered'
  if (!r.counterpart_key || !r.classification || r.classification === 'system') return 'not_actionable'
  const open = !r.handled_at && !r.excluded_kind && !r.connected_followup_at
  if (UNANSWERED_CLASSES.includes(r.classification)) return open ? 'confirmed_unanswered' : 'resolved'
  if (r.classification === 'unknown') return open ? 'review' : 'resolved'
  return 'not_actionable'
}

// Callback episodes: Needs attention lists one item per person waiting for a
// call back, not one per call. The open calls from one number belong to the
// same episode unless something closed the earlier ones in between: a
// connected callback or a later answered call (which closes every earlier
// call anyway), or a call of the same kind marked handled, cleared or as
// needing no callback. episode_after is the latest such event before the
// call, so the open calls of one episode share (number, episode_after).
// Callback attempts that did not connect close nothing; they are counted.
// Derived from the stored calls on every read: nothing to keep in step.
const EPISODE_START_JOIN = (f) => `
  LEFT JOIN LATERAL (
    SELECT MAX(r.started_at) AS at FROM rc_calls r
     WHERE (${f}.needs_attention OR ${f}.needs_review)
       AND r.counterpart_key = ${f}.counterpart_key AND r.started_at < ${f}.started_at AND NOT r.is_internal AND r.is_primary
       AND ((r.direction = 'outbound' AND r.outcome = 'connected') OR r.classification = 'answered'
         OR (r.direction = 'inbound'
             AND (CASE WHEN ${f}.needs_attention THEN ${UNANSWERED_SQL('r.classification')} ELSE r.classification = 'unknown' END)
             AND (EXISTS (SELECT 1 FROM rc_call_resolutions x WHERE x.call_key = r.call_key)
               OR EXISTS (SELECT 1 FROM rc_call_exclusions x JOIN rc_calls d ON d.id = x.call_id WHERE d.call_key = r.call_key))))
  ) ep ON TRUE`
// Callbacks tried after the call that did not connect ("tried 2×").
const EPISODE_TRIES_JOIN = (f) => `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS n FROM rc_calls r
     WHERE (${f}.needs_attention OR ${f}.needs_review)
       AND r.counterpart_key = ${f}.counterpart_key AND r.started_at > ${f}.started_at AND NOT r.is_internal AND r.is_primary
       AND r.direction = 'outbound' AND r.outcome <> 'connected'
  ) et ON TRUE`
const EPISODE_KEY_SQL = (f) => `(${f}.counterpart_key || '|' || COALESCE(ep.at::text, ''))`

/**
 * Open calls (rows of the calls query with episode_after and episode_tries)
 * → callback episodes, in the order the rows came. A withheld number is never
 * grouped: each such call stays its own item. Each episode is identified by
 * its first call, so it keeps its id as later calls join it.
 */
export function groupEpisodes(rows, { names = new Map(), now = new Date(), kind = 'attention' } = {}) {
  const groups = new Map()
  for (const r of rows) {
    const key = r.counterpart_key ? `${r.counterpart_key}|${r.episode_after ? new Date(r.episode_after).toISOString() : ''}` : `call:${r.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const at = (r) => new Date(r.started_at).getTime()
  return [...groups.values()].map((g) => {
    const calls = [...g].sort((a, b) => at(a) - at(b) || Number(a.id) - Number(b.id))
    const first = calls[0]
    const last = calls[calls.length - 1]
    const shown = calls.map((r) => present(r, names, now))
    const latest = shown[shown.length - 1]
    const named = [...shown].reverse().find((c) => c.name) || latest
    // Who it was offered to, across the calls: for display only.
    const offeredTo = []
    const seen = new Set()
    for (const c of shown) for (const p of c.offeredTo) {
      const id = p.extensionId || p.name || JSON.stringify(p)
      if (!seen.has(id)) { seen.add(id); offeredTo.push(p) }
    }
    const tries = Number(first.episode_tries) || 0
    return {
      id: Number(first.id),
      kind,
      number: latest.number,
      name: named.name,
      nameSource: named.nameSource,
      callerLocation: latest.callerLocation,
      fromFirm: latest.fromFirm,
      client: latest.client,
      lead: latest.lead,
      attempts: calls.length,
      firstAt: first.started_at,
      lastAt: last.started_at,
      callbackAttempts: tries,
      lastCallbackAttemptAt: tries ? first.attempt_at ?? null : null,
      latestCallId: Number(last.id),
      callIds: calls.map((r) => Number(r.id)),
      // From the first unanswered call: waiting since an earlier day, tried
      // without connecting, or new today.
      attentionGroup: kind === 'attention' ? (at(first) < startOfToday(now).getTime() ? 'waiting' : tries ? 'try_again' : 'new') : null,
      offeredTo,
    }
  })
}

/**
 * Calls in [from, to), newest first, one row per call, with the name from the
 * firm's own records when the number matches one, and for missed calls
 * whether anyone called back (as far as RingCentral saw: a callback from a
 * personal mobile is not in the log).
 *
 * `person`: a RingCentral extension id. Only calls a leg proves were offered
 * to that person, with counts of what happened to them (answered by them,
 * not answered by them).
 *
 * outcome 'attention' also returns `episodes` (the open calls grouped per
 * person waiting for a call back, groupEpisodes) and the quiet review group:
 * `review` (episodes of calls with no recorded outcome) and `reviewCalls`.
 * `calls` stays one row per call, as do the counts.
 */
export async function queryCalls(db, { from, to, outcome = 'all', q = '', limit = 300, businessHours = false, person = null, now = new Date() }) {
  const params = [from, to]
  const where = ['c.started_at >= $1', 'c.started_at < $2', 'NOT c.is_internal', 'c.is_primary']
  if (businessHours) where.push(businessHoursSql('c.started_at'))
  let personParam = null
  if (person) {
    params.push(JSON.stringify([{ extensionId: String(person) }]))
    personParam = `$${params.length}`
    where.push(`c.classification_evidence->'offeredTo' @> ${personParam}::jsonb`)
  }
  const search = String(q || '').trim().slice(0, 80)
  let searchSql = ''
  if (search) {
    const digits = search.replace(/\D/g, '')
    if (digits.length >= 3 && /^[\d\s+().-]+$/.test(search)) {
      params.push(`%${digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits}%`)
      searchSql = `b.counterpart_key LIKE $${params.length}`
    } else {
      params.push(`%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)
      const p = `$${params.length}`
      searchSql = `(b.client_name ILIKE ${p} OR (b.lead_first || ' ' || b.lead_last) ILIKE ${p} OR b.caller_id_name ILIKE ${p}
        OR b.classification_evidence->'answeredBy'->>'name' ILIKE ${p}
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(b.classification_evidence->'offeredTo', '[]'::jsonb)) o WHERE o->>'name' ILIKE ${p})
        -- The portal name of a linked account (Team tab), e.g. "Yoletty" for
        -- an extension RingCentral calls "Office CML".
        OR EXISTS (SELECT 1 FROM admin_users au WHERE au.rc_extension_id IS NOT NULL AND au.display_name ILIKE ${p}
             AND (b.classification_evidence->'offeredTo' @> jsonb_build_array(jsonb_build_object('extensionId', au.rc_extension_id))
               OR b.classification_evidence->'answeredBy'->>'extensionId' = au.rc_extension_id)))`
    }
  }

  const base = baseSql(where, searchSql)

  const inbound = "direction = 'inbound'"
  const kept = 'excluded_kind IS NULL'
  const outcomeSql = {
    all: 'TRUE',
    answered: `${inbound} AND classification = 'answered'`,
    missed: `${inbound} AND classification = 'not_answered' AND ${kept}`,
    hung_up: `${inbound} AND classification = 'caller_hung_up' AND ${kept}`,
    ended: `${inbound} AND classification = 'ended_before_ringing' AND ${kept}`,
    voicemail: `${inbound} AND classification = 'voicemail' AND ${kept}`,
    unconfirmed: `${inbound} AND classification = 'unknown' AND ${kept}`,
    system: `${inbound} AND classification = 'system'`,
    unanswered: `${inbound} AND ${UNANSWERED_SQL('classification')} AND ${kept}`,
    outgoing: "direction = 'outbound'",
    // Marked handled (or cleared from Needs attention) is dealt with: not "not called back".
    not_returned: `${inbound} AND ${UNANSWERED_SQL('classification')} AND followup_at IS NULL AND handled_at IS NULL AND counterpart_key <> '' AND ${kept}`,
    excluded: 'excluded_kind IS NOT NULL',
    attention: 'needs_attention',
    handled: DEALT_WITH_SQL(),
  }[OUTCOME_FILTERS.includes(outcome) ? outcome : 'all']

  const personCounts = personParam
    ? `,
        COUNT(*) FILTER (WHERE classification_evidence->'answeredBy'->>'extensionId' = (${personParam}::jsonb)->0->>'extensionId')::int AS person_answered,
        COUNT(*) FILTER (WHERE ${UNANSWERED_SQL('classification')} AND classification_evidence->'notAnsweredBy' @> ${personParam}::jsonb AND ${kept})::int AS person_not_answered`
    : ''
  const lim = Math.max(1, Math.min(1000, Math.trunc(Number(limit)) || 300))
  const attention = outcome === 'attention'
  // Where each open call's episode starts, only for the Needs attention view.
  const episodeCols = attention ? ', ep.at AS episode_after, et.n AS episode_tries' : ''
  const episodeJoins = attention ? `${EPISODE_START_JOIN('f')} ${EPISODE_TRIES_JOIN('f')}` : ''
  const [list, counts, names, reviewList] = await Promise.all([
    db.query(`${base} SELECT f.*${episodeCols} FROM filtered f ${episodeJoins} WHERE ${outcomeSql} ORDER BY started_at DESC, id DESC LIMIT ${lim + 1}`, params),
    db.query(`${base} SELECT
        COUNT(*) FILTER (WHERE ${inbound})::int AS incoming,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'answered')::int AS answered,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'not_answered' AND ${kept})::int AS missed,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'caller_hung_up' AND ${kept})::int AS hung_up,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'ended_before_ringing' AND ${kept})::int AS ended,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'voicemail' AND ${kept})::int AS voicemail,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'unknown' AND ${kept})::int AS unconfirmed,
        COUNT(*) FILTER (WHERE ${inbound} AND classification = 'system')::int AS system,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outgoing,
        COUNT(*) FILTER (WHERE ${inbound} AND ${UNANSWERED_SQL('classification')} AND followup_at IS NULL AND handled_at IS NULL AND counterpart_key <> '' AND ${kept})::int AS not_returned,
        COUNT(*) FILTER (WHERE excluded_kind IS NOT NULL)::int AS excluded,
        COUNT(*) FILTER (WHERE needs_attention)::int AS attention,
        COUNT(*) FILTER (WHERE ${DEALT_WITH_SQL()})::int AS handled${personCounts}
      FROM filtered`, params),
    linkedNames(db),
    attention
      ? db.query(`${base} SELECT f.*${episodeCols} FROM filtered f ${episodeJoins} WHERE f.needs_review ORDER BY started_at DESC, id DESC LIMIT ${REVIEW_LIMIT}`, params)
      : null,
  ])

  const rows = list.rows.slice(0, lim)
  return {
    calls: rows.map((r) => present(r, names, now)),
    counts: counts.rows[0],
    truncated: list.rows.length > lim,
    ...(attention
      ? {
          episodes: groupEpisodes(rows, { names, now }),
          review: groupEpisodes(reviewList.rows, { names, now, kind: 'review' }),
          reviewCalls: reviewList.rows.map((r) => present(r, names, now)),
        }
      : {}),
  }
}

// The review group is meant to stay small; past this many calls, the oldest wait.
const REVIEW_LIMIT = 100

/**
 * RingCentral extension id → the name of the portal account linked to it on
 * the Team tab. The stored evidence keeps RingCentral's own name; this only
 * changes what is shown.
 */
export async function linkedNames(db) {
  const rows = (await db.query(
    `SELECT rc_extension_id, COALESCE(NULLIF(TRIM(display_name), ''), split_part(email, '@', 1)) AS name
       FROM admin_users WHERE rc_extension_id IS NOT NULL`
  )).rows
  return new Map(rows.map((r) => [r.rc_extension_id, r.name]))
}

// A person on a call, with the portal name when the extension is linked and
// RingCentral's own name kept beside it.
const named = (p, names) => {
  if (p?.kind === 'external') return p.onBehalfOfId && names.has(p.onBehalfOfId) ? { ...p, onBehalfOf: names.get(p.onBehalfOfId) } : p
  if (!p || !p.extensionId || !names.has(p.extensionId)) return p
  return { ...p, name: names.get(p.extensionId), rcName: p.name ?? null }
}

/** The people calls can be offered to (extension directory, person types only), for the filter. */
export async function listPeople(db) {
  const [d, names] = await Promise.all([loadDirectory(db), linkedNames(db)])
  return d.people
    .filter((p) => p.status !== 'Disabled')
    .map((p) => ({ extensionId: p.id, extension: p.number, name: names.get(p.id) || p.name, rcName: p.name }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
}

/**
 * A key for each party in a call's live events, unique within the call and
 * the same on every read: RingCentral's party id, or the party's place in the
 * list when a stored record has none. An extension can appear as several
 * parties (rung, then transferred to), so it is no key on its own.
 */
export function livePartyIds(parties) {
  const used = new Set()
  return parties.map((p, i) => {
    let id = p?.partyId != null && String(p.partyId) !== '' ? String(p.partyId) : `party-${i + 1}`
    if (used.has(id)) id = `${id}#${i + 1}`
    used.add(id)
    return id
  })
}

/**
 * One call's evidence for the detail view: the classification, every step
 * RingCentral recorded (with each reason's documented meaning), who it was
 * confirmed offered to, who answered, and RingCentral's own result.
 */
export async function callEvidence(db, id) {
  const r = (await db.query(
    `SELECT c.id, c.call_key, c.direction, c.result_raw, c.classification, c.classification_evidence, c.classifier_version,
            (SELECT COUNT(*) FROM rc_calls d WHERE d.call_key = c.call_key)::int AS records,
            c.rc_raw IS NOT NULL AS has_raw
       FROM rc_calls c WHERE c.id = $1`,
    [id]
  )).rows[0]
  if (!r) return null
  const ev = r.classification_evidence || {}
  const names = await linkedNames(db)
  const partyIds = ev.live ? livePartyIds(ev.live.parties) : []
  const toNamed = (to) => (to?.kind === 'extension' && to.id && names.has(to.id) ? { ...to, name: names.get(to.id), rcName: to.name ?? null } : to)
  return {
    id: Number(r.id),
    direction: r.direction,
    classification: r.classification,
    rcResult: r.result_raw,
    rcResults: ev.rcResults || (r.result_raw ? [r.result_raw] : []),
    records: r.records,
    hasRaw: r.has_raw,
    classifierVersion: r.classifier_version,
    answeredBy: named(ev.answeredBy || null, names),
    offeredTo: (ev.offeredTo || []).map((p) => named(p, names)),
    notAnsweredBy: (ev.notAnsweredBy || []).map((p) => named(p, names)),
    facts: (ev.facts || []).map((f) => ({ ...f, to: toNamed(f.to) })),
    gaps: ev.gaps || [],
    steps: (ev.steps || []).map(({ onBehalfOf: _drop, ...s }) => ({ ...s, to: toNamed(s.to) })),
    stage: ev.stage ?? null,
    // RingCentral's live events for the call: each party and its states in order.
    live: ev.live
      ? {
          events: ev.live.events,
          complete: ev.live.complete,
          parties: ev.live.parties.map((p, i) => ({
            partyId: partyIds[i],
            extensionId: p.extensionId, extension: p.extension, type: p.type, person: p.person,
            name: (p.extensionId && names.get(p.extensionId)) || p.name, rcName: p.name,
            rang: p.rang, answered: p.answered, voicemail: p.voicemail, missedCall: p.missedCall, endedAt: p.endedAt,
            states: p.states,
          })),
        }
      : null,
  }
}

// Local midnight in the firm's time zone, today.
export function startOfToday(now = new Date()) {
  const tz = BUSINESS_HOURS.timeZone
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset)
}

// Oldest first in Needs attention: waiting since before today, then callbacks
// tried without connecting, then today's.
function attentionGroup(r, now = new Date()) {
  if (new Date(r.started_at) < startOfToday(now)) return 'waiting'
  if (r.attempt_at) return 'try_again'
  return 'new'
}

/** How far back Needs attention looks (older open calls are left in All calls). */
export const ATTENTION_DAYS = 90

/**
 * The three counts at the top of Calls: people waiting for a call back (open
 * callback episodes, last ATTENTION_DAYS days), calls dealt with today
 * (marked handled today, or a connected callback or later answered call
 * today), and every call today. "No callback needed" marks are not counted
 * as handled.
 *
 * needsAttention and openEpisodes are the same number (open episodes);
 * openCalls is the unanswered calls behind them. review counts the quiet
 * review group's episodes, which are in neither.
 */
export async function callKpis(db, { now = new Date() } = {}) {
  const today = startOfToday(now)
  const from = new Date(now.getTime() - ATTENTION_DAYS * 24 * 60 * 60 * 1000)
  const row = (await db.query(
    `${baseSql(['c.started_at >= $1', 'c.started_at < $2', 'NOT c.is_internal', 'c.is_primary'])}
     SELECT COUNT(DISTINCT ${EPISODE_KEY_SQL('f')}) FILTER (WHERE needs_attention)::int AS open_episodes,
            COUNT(*) FILTER (WHERE needs_attention)::int AS open_calls,
            COUNT(DISTINCT ${EPISODE_KEY_SQL('f')}) FILTER (WHERE needs_review)::int AS review,
            COUNT(*) FILTER (WHERE ${DEALT_WITH_SQL('$3')})::int AS handled_today,
            COUNT(*) FILTER (WHERE started_at >= $3)::int AS total_today
       FROM filtered f ${EPISODE_START_JOIN('f')}`,
    [from, new Date(now.getTime() + 60 * 1000), today]
  )).rows[0]
  return {
    needsAttention: row.open_episodes, openEpisodes: row.open_episodes, openCalls: row.open_calls, review: row.review,
    handledToday: row.handled_today, totalToday: row.total_today, since: from, today,
  }
}

/**
 * The calls Needs attention lists now that came in before `before`
 * (Calls → Clear the list). Same rows, same rules as the list. `review`:
 * the review group's calls too (left out unless asked for).
 * Returns { keys, people, review }: the call_keys to clear, how many
 * episodes they make up, and how many review calls there are before the
 * cutoff, whether or not they are included.
 */
export async function openCalls(db, { before = new Date(), now = new Date(), review = false } = {}) {
  const from = new Date(now.getTime() - ATTENTION_DAYS * 24 * 60 * 60 * 1000)
  const to = before < now ? before : new Date(now.getTime() + 60 * 1000)
  const rows = (await db.query(
    `${baseSql(['c.started_at >= $1', 'c.started_at < $2', 'NOT c.is_internal', 'c.is_primary'])}
     SELECT f.call_key, f.needs_attention, ${EPISODE_KEY_SQL('f')} AS episode FROM filtered f ${EPISODE_START_JOIN('f')}
      WHERE f.needs_attention OR f.needs_review`,
    [from, to]
  )).rows
  const cleared = rows.filter((r) => r.needs_attention || review)
  return {
    keys: cleared.map((r) => r.call_key),
    people: new Set(cleared.map((r) => `${r.needs_attention ? 'a' : 'r'}:${r.episode}`)).size,
    review: rows.filter((r) => !r.needs_attention).length,
  }
}

/**
 * Is the callback episode that `callId` started still waiting for someone?
 * True while any unanswered call from the same number, from that call on, is
 * still open (Needs attention or the review group) and belongs to the same
 * episode: nothing closed the episode in between (a connected callback, a
 * later answered call, or its calls marked handled, cleared or as needing no
 * callback). The same rules as the list, so a reminder on a caller closes
 * exactly when their row leaves Needs attention.
 */
export async function episodeOpen(db, callId) {
  const first = (await db.query('SELECT started_at, counterpart_key FROM rc_calls WHERE id = $1', [callId])).rows[0]
  if (!first || !first.counterpart_key) return false
  const r = await db.query(
    `${baseSql(['c.counterpart_key = $1', 'c.started_at >= $2', 'NOT c.is_internal', 'c.is_primary'])}
     SELECT 1 FROM filtered f ${EPISODE_START_JOIN('f')}
      WHERE (f.needs_attention OR f.needs_review) AND (ep.at IS NULL OR ep.at < $2) LIMIT 1`,
    [first.counterpart_key, first.started_at]
  )
  return r.rowCount > 0
}

export async function openCallKeys(db, opts = {}) {
  return (await openCalls(db, opts)).keys
}

/**
 * A cheap fingerprint of everything the Calls page shows: it changes when a
 * call is imported or re-read, a call is marked or unmarked, or a reminder
 * on a caller changes. The page polls this and reloads the list only when
 * it moves.
 */
export async function callsStamp(db) {
  const r = (await db.query(
    `SELECT (SELECT MAX(updated_at) FROM rc_calls) AS calls,
            (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at)::text, '') FROM rc_call_resolutions) AS handled,
            (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at)::text, '') FROM rc_call_exclusions) AS excluded,
            (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at)::text, '') FROM rc_ignored_numbers) AS numbers,
            -- Callback reminders on callers, so a reminder someone else set shows on the row.
            (SELECT COUNT(*) || ':' || COALESCE(MAX(updated_at)::text, '') FROM follow_up_reminders WHERE target_kind = 'call') AS reminders`
  )).rows[0]
  return [r.calls?.toISOString?.() ?? '', r.handled, r.excluded, r.numbers, r.reminders].join('|')
}

function present(r, names = new Map(), now = new Date()) {
  const leadName = r.lead_id ? `${r.lead_first || ''} ${r.lead_last || ''}`.trim() : null
  const callerId = r.caller_id_name && !isGenericCallerId(r.caller_id_name) ? titleCase(r.caller_id_name) : null
  let name = null
  let nameSource = null
  if (r.client_name) { name = r.client_name; nameSource = 'client' } else if (leadName) { name = leadName; nameSource = 'lead' } else if (callerId) { name = callerId; nameSource = 'caller_id' }
  let followUp = null
  if (r.followup_at) {
    followUp = {
      at: r.followup_at,
      kind: r.followup_direction === 'outbound' ? (r.followup_outcome === 'connected' ? 'called_back' : 'call_back_attempt') : 'answered_later',
    }
  }
  const ev = r.classification_evidence || null
  return {
    id: Number(r.id),
    startedAt: r.started_at,
    direction: r.direction,
    // RingCentral's own result, unchanged, and the portal's evidence-based reading.
    outcome: r.outcome,
    result: r.result_raw,
    classification: r.classification,
    durationSeconds: r.duration_seconds,
    number: r.counterpart_number,
    name,
    nameSource,
    callerIdName: r.caller_id_name,
    // Where the call came from, when the carrier sent a city instead of a name.
    callerLocation: callerLocation(r.caller_id_name),
    fromFirm: r.from_firm,
    lead: r.lead_id && !r.from_firm ? { id: r.lead_id, name: leadName, matches: Number(r.lead_count) } : null,
    client: r.client_id ? { id: Number(r.client_id), name: r.client_name } : null,
    firm: { number: r.firm_number, name: r.firm_name, extension: r.firm_extension },
    // Only from the evidence: a person's extension (or a forwarded phone) that accepted it.
    answeredBy: named(ev?.answeredBy || null, names),
    offeredTo: (ev?.offeredTo || []).map((p) => named(p, names)),
    notAnsweredBy: (ev?.notAnsweredBy || []).map((p) => named(p, names)),
    gaps: ev?.gaps || [],
    // Not confirmed, and every recorded step went to the phone system: where it got to.
    systemOnly: systemOnlyPlaces(ev),
    // A hang-up seen live: before anyone was rung, or while someone's phone rang.
    stage: ev?.stage ?? null,
    rang: ev?.live ? ev.live.parties.filter((p) => p.person && p.rang).map((p) => named({ extensionId: p.extensionId, extension: p.extension, name: p.name, seconds: p.rang.seconds }, names)) : [],
    followUp,
    // The workflow around the call (Calls → Needs attention). None of it
    // changes how the call is classified or who it is attributed to.
    needsAttention: Boolean(r.needs_attention),
    attentionGroup: r.needs_attention ? attentionGroup(r, now) : null,
    // No recorded outcome, and nothing since shows the person reached us.
    needsReview: Boolean(r.needs_review),
    decision: followUpDecision(r),
    attemptAt: r.attempt_at ?? null,
    connectedFollowUp: r.connected_followup_at ? { at: r.connected_followup_at, kind: r.connected_followup_direction === 'outbound' ? 'called_back' : 'answered_later' } : null,
    handled: r.handled_at ? { at: r.handled_at, by: r.handled_by, note: r.handled_note, bulk: Boolean(r.handled_batch) } : null,
    // Marked as needing no callback: this call alone, or every call from its number.
    exclusion: r.excluded_kind
      ? { scope: r.excluded_kind, reason: r.excluded_reason, note: r.excluded_note, by: r.excluded_by, at: r.excluded_at }
      : null,
  }
}
