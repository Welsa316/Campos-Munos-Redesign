// Where each automation stands (automation_state), for the health view and
// for "has this failed several times in a row". One row per key; details
// carries counts and codes only, never a name, a number or message text.

const short = (v) => (v == null ? null : String(v).slice(0, 300))

export async function noteAttempt(db, key, details = null) {
  await db.query(
    `INSERT INTO automation_state (key, last_attempt_at, details) VALUES ($1, NOW(), COALESCE($2::jsonb, '{}'))
     ON CONFLICT (key) DO UPDATE SET last_attempt_at = NOW(), details = automation_state.details || COALESCE($2::jsonb, '{}'), updated_at = NOW()`,
    [key, details ? JSON.stringify(details) : null]
  )
}

export async function noteSuccess(db, key, details = null) {
  await db.query(
    `INSERT INTO automation_state (key, last_attempt_at, last_success_at, consecutive_failures, details)
     VALUES ($1, NOW(), NOW(), 0, COALESCE($2::jsonb, '{}'))
     ON CONFLICT (key) DO UPDATE SET last_attempt_at = NOW(), last_success_at = NOW(), consecutive_failures = 0, last_error = NULL,
       details = automation_state.details || COALESCE($2::jsonb, '{}'), updated_at = NOW()`,
    [key, details ? JSON.stringify(details) : null]
  )
}

/** Records the failure and returns how many there have been in a row. */
export async function noteFailure(db, key, error, details = null) {
  const r = await db.query(
    `INSERT INTO automation_state (key, last_attempt_at, last_failure_at, last_error, consecutive_failures, details)
     VALUES ($1, NOW(), NOW(), $2, 1, COALESCE($3::jsonb, '{}'))
     ON CONFLICT (key) DO UPDATE SET last_attempt_at = NOW(), last_failure_at = NOW(), last_error = $2,
       consecutive_failures = automation_state.consecutive_failures + 1,
       details = automation_state.details || COALESCE($3::jsonb, '{}'), updated_at = NOW()
     RETURNING consecutive_failures`,
    [key, short(error), details ? JSON.stringify(details) : null]
  )
  return r.rows[0].consecutive_failures
}

/**
 * Has `everyMs` passed since this step last ran? Paced by the run's own
 * clock (details.lastRunAt), not the database's, so a run given a fixed
 * instant behaves the same.
 */
export function dueToRun(state, now, everyMs) {
  const last = state?.details?.lastRunAt
  return !last || Math.abs(now.getTime() - new Date(last).getTime()) >= everyMs
}

export async function getState(db, key) {
  return (await db.query('SELECT * FROM automation_state WHERE key = $1', [key])).rows[0] || null
}

export async function allState(db) {
  const rows = (await db.query('SELECT * FROM automation_state')).rows
  return Object.fromEntries(rows.map((r) => [r.key, {
    lastAttemptAt: r.last_attempt_at, lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at,
    lastError: r.last_error, consecutiveFailures: r.consecutive_failures, details: r.details || {},
  }]))
}

export default { noteAttempt, noteSuccess, noteFailure, getState, allState }
