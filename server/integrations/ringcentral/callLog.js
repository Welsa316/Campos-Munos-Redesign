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

export const ACCOUNT_PATH = '/restapi/v1.0/account/~/call-log'
export const EXTENSION_PATH = '/restapi/v1.0/account/~/extension/~/call-log'
export const OVERLAP_MS = 3 * 60 * 60 * 1000
export const SCOPE_RECHECK_MS = 24 * 60 * 60 * 1000
export const DEFAULT_BACKFILL_DAYS = 14
export const DEFAULT_RETENTION_DAYS = 365
const PER_PAGE = 250
const MAX_PAGES = 20
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

async function fetchWindow({ config, token, path, scope, dateFrom, dateTo, deps, sleep, pageDelayMs }) {
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
    if (page >= MAX_PAGES) { truncated = true; break }
  }
  return { rows, fetched, truncated }
}

async function upsertCalls(db, rows) {
  let inserted = 0
  for (const r of rows) {
    const res = await db.query(
      `INSERT INTO rc_calls (rc_record_id, telephony_session_id, session_id, direction, started_at, duration_seconds, result_raw, outcome,
              counterpart_number, counterpart_key, caller_id_name, firm_number, firm_name, firm_extension,
              answered_by_name, answered_by_extension, is_internal, scope, rc_last_modified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, cm_phone_key($9), $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (rc_record_id) DO UPDATE SET
              telephony_session_id = EXCLUDED.telephony_session_id, session_id = EXCLUDED.session_id,
              direction = EXCLUDED.direction, started_at = EXCLUDED.started_at, duration_seconds = EXCLUDED.duration_seconds,
              result_raw = EXCLUDED.result_raw, outcome = EXCLUDED.outcome, counterpart_number = EXCLUDED.counterpart_number,
              counterpart_key = EXCLUDED.counterpart_key, caller_id_name = EXCLUDED.caller_id_name,
              firm_number = EXCLUDED.firm_number, firm_name = EXCLUDED.firm_name, firm_extension = EXCLUDED.firm_extension,
              answered_by_name = EXCLUDED.answered_by_name, answered_by_extension = EXCLUDED.answered_by_extension,
              is_internal = EXCLUDED.is_internal, rc_last_modified_at = EXCLUDED.rc_last_modified_at, updated_at = NOW()
              -- A company-wide record is never replaced by the narrower per-user copy.
        WHERE rc_calls.scope = EXCLUDED.scope OR EXCLUDED.scope = 'account'
       RETURNING (xmax = 0) AS inserted`,
      [r.rc_record_id, r.telephony_session_id, r.session_id, r.direction, r.started_at, r.duration_seconds, r.result_raw, r.outcome,
        r.counterpart_number, r.caller_id_name, r.firm_number, r.firm_name, r.firm_extension,
        r.answered_by_name, r.answered_by_extension, r.is_internal, r.scope, r.rc_last_modified_at]
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

/**
 * Import new and changed calls. Returns { status: 'ok' | 'busy' | 'error', ... }.
 * Never throws for RingCentral problems: the error code is recorded and returned.
 */
export async function syncCallLog(db, config, {
  trigger = 'manual', backfillDays = DEFAULT_BACKFILL_DAYS, retentionDays = DEFAULT_RETENTION_DAYS,
  deps = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pageDelayMs = PAGE_DELAY_MS,
} = {}) {
  const now = deps.now ? deps.now() : new Date()
  const lockClient = typeof db.totalCount === 'number' ? await db.connect() : db
  try {
    const got = (await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [LOCK_KEY])).rows[0]?.ok
    if (!got) return { status: 'busy' }
    try {
      return await runSync(db, config, { trigger, backfillDays, retentionDays, deps, sleep, pageDelayMs, now })
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {})
    }
  } finally {
    if (lockClient !== db) lockClient.release()
  }
}

async function runSync(db, config, { trigger, backfillDays, retentionDays, deps, sleep, pageDelayMs, now }) {
  await db.query(`INSERT INTO rc_call_sync_state (key) VALUES ('ringcentral') ON CONFLICT (key) DO NOTHING`)
  const state = (await db.query(`SELECT * FROM rc_call_sync_state WHERE key = 'ringcentral'`)).rows[0]

  const dateTo = now
  const dateFrom = state.window_to
    ? new Date(new Date(state.window_to).getTime() - OVERLAP_MS)
    : new Date(now.getTime() - Math.min(90, Math.max(1, backfillDays)) * 24 * 60 * 60 * 1000)

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

  const fetchArgs = { config, dateFrom, dateTo, deps, sleep, pageDelayMs }
  const recentlyExtension = state.scope === 'extension' && state.scope_checked_at
    && now.getTime() - new Date(state.scope_checked_at).getTime() < SCOPE_RECHECK_MS
  let scope = recentlyExtension ? 'extension' : 'account'
  let scopeCheckedAt = recentlyExtension ? state.scope_checked_at : now
  let result
  try {
    try {
      result = await withToken((t) => fetchWindow({ ...fetchArgs, token: t, path: scope === 'account' ? ACCOUNT_PATH : EXTENSION_PATH, scope }))
    } catch (err) {
      // The connecting user may read only their own calls; RingCentral says
      // so with a 403 on the company log.
      if (scope !== 'account' || !(err instanceof RingCentralApiError) || err.status !== 403) throw err
      scope = 'extension'
      scopeCheckedAt = now
      result = await withToken((t) => fetchWindow({ ...fetchArgs, token: t, path: EXTENSION_PATH, scope }))
    }
  } catch (err) {
    return recordError(errorCodeOf(err))
  }

  const inserted = await upsertCalls(db, result.rows)
  await db.query(`DELETE FROM rc_calls WHERE started_at < $1::timestamptz - make_interval(days => $2)`, [now, Math.max(30, retentionDays)])
  // Portal-placed calls are only needed while they ring; the call itself is in the call log.
  await db.query(`DELETE FROM rc_ringouts WHERE created_at < $1::timestamptz - INTERVAL '90 days'`, [now])
  await db.query(
    `UPDATE rc_call_sync_state SET scope = $1, scope_checked_at = $2, window_to = $3, last_run_at = $3, last_success_at = $3,
            last_trigger = $4, last_fetched = $5, last_new = $6, last_truncated = $7, last_error_code = NULL, last_error_at = NULL
      WHERE key = 'ringcentral'`,
    [scope, scopeCheckedAt, dateTo, trigger, result.fetched, inserted, result.truncated]
  )
  return { status: 'ok', scope, fetched: result.fetched, new: inserted, truncated: result.truncated }
}

export async function getSyncState(db) {
  const s = (await db.query(`SELECT * FROM rc_call_sync_state WHERE key = 'ringcentral'`)).rows[0]
  if (!s) return { scope: null, lastRunAt: null, lastSuccessAt: null, lastErrorCode: null, lastErrorAt: null, lastNew: null, truncated: false }
  return {
    scope: s.scope,
    lastRunAt: s.last_run_at,
    lastSuccessAt: s.last_success_at,
    lastErrorCode: s.last_error_code,
    lastErrorAt: s.last_error_at,
    lastNew: s.last_new,
    truncated: s.last_truncated,
  }
}

// --- the list the portal shows ------------------------------------------------------

export const OUTCOME_FILTERS = Object.freeze(['all', 'answered', 'missed', 'voicemail', 'unanswered', 'outgoing', 'not_returned', 'excluded'])

// The firm's opening hours, as published on the website (site/index.html,
// LegalService openingHoursSpecification): Monday to Friday, 9:00 to 17:00,
// New Orleans time. Public holidays are not excluded.
export const BUSINESS_HOURS = Object.freeze({ timeZone: 'America/Chicago', days: 'Mon–Fri', start: '09:00', end: '17:00' })
const local = (col) => `(${col} AT TIME ZONE '${BUSINESS_HOURS.timeZone}')`
export const businessHoursSql = (col) =>
  `(EXTRACT(ISODOW FROM ${local(col)}) BETWEEN 1 AND 5 AND ${local(col)}::time >= '${BUSINESS_HOURS.start}' AND ${local(col)}::time < '${BUSINESS_HOURS.end}')`

// A missed call or voicemail counts as returned once the firm called that
// number back, or the person called again and got through.
const RETURNED_SQL = `EXISTS (
  SELECT 1 FROM rc_calls r
   WHERE r.counterpart_key = c.counterpart_key AND r.started_at > c.started_at AND NOT r.is_internal
     AND (r.direction = 'outbound' OR r.outcome = 'answered'))`

// Staff marked it as needing no callback, on its own or by its number
// (callExclusions.js). It stays in the log but leaves every missed count.
const EXCLUDED_SQL = `(EXISTS (SELECT 1 FROM rc_call_exclusions x WHERE x.call_id = c.id)
  OR (c.counterpart_key <> '' AND EXISTS (SELECT 1 FROM rc_ignored_numbers ig WHERE ig.counterpart_key = c.counterpart_key)))`

/**
 * Unanswered incoming calls (missed or voicemail) during business hours in
 * the last `days` days, and how many of them nobody has returned yet (a
 * withheld number cannot be returned, so it is not counted there).
 */
export async function summarizeMissed(db, { now = new Date(), days = 30, from: start = null } = {}) {
  // The portal passes the same start as its "30 days" view (local midnight 29
  // days ago), so the card and the list agree exactly.
  const from = start || new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const row = (await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.outcome = 'voicemail')::int AS voicemail,
            COUNT(*) FILTER (WHERE c.counterpart_key <> '' AND NOT ${RETURNED_SQL})::int AS not_returned
       FROM rc_calls c
      WHERE NOT c.is_internal AND c.direction = 'inbound' AND c.outcome IN ('missed', 'voicemail')
        AND c.started_at >= $1 AND c.started_at < $2 AND ${businessHoursSql('c.started_at')} AND NOT ${EXCLUDED_SQL}`,
    [from, now]
  )).rows[0]
  return { days, from, to: now, businessHours: BUSINESS_HOURS, total: row.total, voicemail: row.voicemail, notReturned: row.not_returned }
}

/** "NEW ORLEANS LA" → "New Orleans, LA"; null when caller ID is not a city. */
export function callerLocation(name) {
  const m = /^([A-Z .'-]+) ([A-Z]{2})$/.exec(String(name ?? '').trim())
  return m ? `${titleCase(m[1].trim())}, ${m[2]}` : null
}

const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase())

/**
 * Calls in [from, to), newest first, with the name from the firm's own
 * records when the number matches one, and for missed calls whether anyone
 * called back (as far as RingCentral saw: a callback from a personal mobile
 * is not in the log).
 */
export async function queryCalls(db, { from, to, outcome = 'all', q = '', limit = 300, businessHours = false }) {
  const params = [from, to]
  const where = ['c.started_at >= $1', 'c.started_at < $2', 'NOT c.is_internal']
  if (businessHours) where.push(businessHoursSql('c.started_at'))
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
      searchSql = `(b.client_name ILIKE ${p} OR (b.lead_first || ' ' || b.lead_last) ILIKE ${p} OR b.caller_id_name ILIKE ${p} OR b.answered_by_name ILIKE ${p})`
    }
  }

  const base = `
    WITH base AS (
      SELECT c.*,
             lead.id AS lead_id, lead.first_name AS lead_first, lead.last_name AS lead_last, lead.n AS lead_count,
             cl.client_id, cl.client_name,
             -- Marked "someone from the firm" for every call from the number:
             -- a colleague's own phone, so not a website lead even when they
             -- once tried the contact form with it.
             EXISTS (SELECT 1 FROM rc_ignored_numbers fn
                      WHERE c.counterpart_key <> '' AND fn.counterpart_key = c.counterpart_key AND fn.reason = 'staff_test') AS from_firm,
             fu.started_at AS followup_at, fu.direction AS followup_direction, fu.outcome AS followup_outcome,
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
           WHERE c.direction = 'inbound' AND c.outcome IN ('missed', 'voicemail') AND c.counterpart_key <> ''
             AND r.counterpart_key = c.counterpart_key AND r.started_at > c.started_at AND NOT r.is_internal
             AND (r.direction = 'outbound' OR r.outcome = 'answered')
           ORDER BY r.started_at LIMIT 1) fu ON TRUE
        -- A number rule wins over a single-call exclusion: it is the broader one.
        LEFT JOIN LATERAL (
          SELECT e.kind, e.reason, e.note, e.created_at, e.created_by FROM (
            SELECT 'number' AS kind, ig.reason, ig.note, ig.created_at, ig.created_by, 1 AS rank
              FROM rc_ignored_numbers ig WHERE c.counterpart_key <> '' AND ig.counterpart_key = c.counterpart_key
            UNION ALL
            SELECT 'call', x.reason, x.note, x.created_at, x.created_by, 2 FROM rc_call_exclusions x WHERE x.call_id = c.id) e
           WHERE c.direction = 'inbound' AND c.outcome IN ('missed', 'voicemail')
           ORDER BY e.rank LIMIT 1) ex ON TRUE
        LEFT JOIN admin_users exu ON exu.id = ex.created_by
       WHERE ${where.join(' AND ')}
    ), filtered AS (
      SELECT * FROM base b ${searchSql ? `WHERE ${searchSql}` : ''}
    )`

  const outcomeSql = {
    all: 'TRUE',
    answered: "direction = 'inbound' AND outcome = 'answered'",
    missed: "direction = 'inbound' AND outcome = 'missed' AND excluded_kind IS NULL",
    voicemail: "direction = 'inbound' AND outcome = 'voicemail' AND excluded_kind IS NULL",
    unanswered: "direction = 'inbound' AND outcome IN ('missed', 'voicemail') AND excluded_kind IS NULL",
    outgoing: "direction = 'outbound'",
    not_returned: "direction = 'inbound' AND outcome IN ('missed', 'voicemail') AND followup_at IS NULL AND counterpart_key <> '' AND excluded_kind IS NULL",
    excluded: 'excluded_kind IS NOT NULL',
  }[OUTCOME_FILTERS.includes(outcome) ? outcome : 'all']

  const lim = Math.max(1, Math.min(1000, Math.trunc(Number(limit)) || 300))
  const [list, counts] = await Promise.all([
    db.query(`${base} SELECT * FROM filtered WHERE ${outcomeSql} ORDER BY started_at DESC, id DESC LIMIT ${lim + 1}`, params),
    db.query(`${base} SELECT
        COUNT(*) FILTER (WHERE direction = 'inbound')::int AS incoming,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND outcome = 'answered')::int AS answered,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND outcome = 'missed' AND excluded_kind IS NULL)::int AS missed,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND outcome = 'voicemail' AND excluded_kind IS NULL)::int AS voicemail,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outgoing,
        COUNT(*) FILTER (WHERE direction = 'inbound' AND outcome IN ('missed', 'voicemail') AND followup_at IS NULL AND counterpart_key <> '' AND excluded_kind IS NULL)::int AS not_returned,
        COUNT(*) FILTER (WHERE excluded_kind IS NOT NULL)::int AS excluded
      FROM filtered`, params),
  ])

  const rows = list.rows.slice(0, lim)
  return {
    calls: rows.map(present),
    counts: counts.rows[0],
    truncated: list.rows.length > lim,
  }
}

function present(r) {
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
  return {
    id: Number(r.id),
    startedAt: r.started_at,
    direction: r.direction,
    outcome: r.outcome,
    result: r.result_raw,
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
    answeredBy: r.answered_by_name || r.answered_by_extension ? { name: r.answered_by_name, extension: r.answered_by_extension } : null,
    followUp,
    // Marked as needing no callback: this call alone, or every call from its number.
    exclusion: r.excluded_kind
      ? { scope: r.excluded_kind, reason: r.excluded_reason, note: r.excluded_note, by: r.excluded_by, at: r.excluded_at }
      : null,
  }
}

export default { syncCallLog, queryCalls, getSyncState, normalizeRecord, classifyOutcome, isGenericCallerId }
