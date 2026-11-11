// The automation's work queue (automation_jobs): things to do at a time,
// kept in the database so they survive a restart and need no portal open.
//
// Safe with several API processes, and across restarts:
//   enqueue  the job's idempotency key is UNIQUE, so queueing the same thing
//            twice (a retried form, two instances, a restart) queues it once.
//   claim    a worker takes a job by moving it from 'pending' to 'running'
//            under FOR UPDATE SKIP LOCKED: two workers never hold the same one.
//   retry    a handler that answers { status: 'retry' } (or throws) is tried
//            again after 2, 10, 30, then 120 minutes; after max_attempts it
//            stays 'failed' for a person to look at. It is never retried in
//            a tight loop.
//   recover  a job left 'running' by a crash goes back to 'pending' after
//            ten minutes. Running it again is safe because anything that
//            sends first writes its automation_messages row (messaging.js):
//            the second run finds that row and does not send twice.
//
// `now` is for tests (a fixed instant); without it the database's clock.

export const BACKOFF_MINUTES = Object.freeze([2, 10, 30, 120])
export const STUCK_RUNNING_MS = 10 * 60 * 1000
const RUN_BATCH = 100

const AT = (n) => `COALESCE($${n}::timestamptz, NOW())`
const short = (v) => (v == null ? null : String(v).slice(0, 300))

/**
 * Queue one job. Returns { id, created }: created is false when a job with
 * this key already exists (whatever its state), and nothing changes.
 */
export async function enqueue(db, { type, key, entityType = null, entityId = null, runAt = null, payload = {}, maxAttempts = BACKOFF_MINUTES.length }) {
  if (!type || !key) throw new Error('A job needs a type and an idempotency key')
  const r = await db.query(
    `INSERT INTO automation_jobs (type, idempotency_key, entity_type, entity_id, run_at, payload, max_attempts)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [type, key, entityType, entityId == null ? null : String(entityId), runAt, JSON.stringify(payload || {}), maxAttempts]
  )
  if (r.rowCount) return { id: Number(r.rows[0].id), created: true }
  const existing = (await db.query('SELECT id FROM automation_jobs WHERE idempotency_key = $1', [key])).rows[0]
  return { id: existing ? Number(existing.id) : null, created: false }
}

/**
 * Pending jobs about one thing are not run. `types`: only these; otherwise
 * every pending job for it. Returns the types cancelled.
 */
export async function cancelJobs(db, { entityType, entityId, types = null, reason }) {
  const r = await db.query(
    `UPDATE automation_jobs SET status = 'cancelled', outcome = $4, completed_at = NOW(), updated_at = NOW()
      WHERE status = 'pending' AND entity_type = $1 AND entity_id = $2 AND ($3::text[] IS NULL OR type = ANY($3::text[]))
      RETURNING type`,
    [entityType, String(entityId), types, short(reason)]
  )
  return r.rows.map((x) => x.type)
}

async function claimNext(db, now, types) {
  return (await db.query(
    `UPDATE automation_jobs SET status = 'running', locked_at = ${AT(1)}, attempts = attempts + 1, updated_at = NOW()
      WHERE status = 'pending' AND id = (
        SELECT id FROM automation_jobs
         WHERE status = 'pending' AND run_at <= ${AT(1)} AND ($2::text[] IS NULL OR type = ANY($2::text[]))
         ORDER BY run_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [now, types]
  )).rows[0] || null
}

// Every finishing write carries AND status = 'running', so a job cancelled
// or recovered meanwhile is never overwritten.
const finish = (db, id, status, { outcome = null, error = null } = {}) => db.query(
  `UPDATE automation_jobs SET status = $2, outcome = $3, last_error = $4, locked_at = NULL, completed_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND status = 'running'`,
  [id, status, short(outcome), short(error)]
)

async function retryOrFail(db, job, now, error, outcome = null) {
  const wait = job.attempts < job.max_attempts ? BACKOFF_MINUTES[Math.min(job.attempts, BACKOFF_MINUTES.length) - 1] : null
  if (wait == null) {
    await finish(db, job.id, 'failed', { outcome: outcome || 'gave_up', error })
    return 'failed'
  }
  await db.query(
    `UPDATE automation_jobs SET status = 'pending', run_at = ${AT(2)} + make_interval(mins => $3::int), last_error = $4, locked_at = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'running'`,
    [job.id, now, wait, short(error)]
  )
  return 'retry'
}

/** Put a job back without counting the attempt (a sending window, a rate limit). */
async function defer(db, job, runAt) {
  await db.query(
    `UPDATE automation_jobs SET status = 'pending', run_at = $2, attempts = GREATEST(attempts - 1, 0), locked_at = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'running'`,
    [job.id, runAt]
  )
}

/** Jobs a crashed worker left 'running' go back to 'pending'. */
export async function recoverStuck(db, { now = null } = {}) {
  const r = await db.query(
    `UPDATE automation_jobs SET status = 'pending', run_at = ${AT(1)}, locked_at = NULL, last_error = 'retried after an interrupted run', updated_at = NOW()
      WHERE status = 'running' AND locked_at < ${AT(1)} - make_interval(secs => $2::int)`,
    [now, STUCK_RUNNING_MS / 1000]
  )
  return r.rowCount
}

/**
 * Run everything that is due. handlers: { [type]: async (job, ctx) => result }
 * where result is one of
 *   { status: 'done', outcome? }        finished
 *   { status: 'skipped', outcome }      deliberately not done (why)
 *   { status: 'cancelled', outcome }    no longer needed
 *   { status: 'retry', error }          transient: try again after the backoff
 *   { status: 'failed', outcome, error } will not work by trying again
 *   { status: 'defer', runAt }          not now (does not count as an attempt)
 * A handler that throws is treated as 'retry'. One job failing never stops
 * the others. Returns [{ id, type, key, result }].
 */
export async function runDueJobs(db, handlers, { now = null, ctx = {}, limit = RUN_BATCH, log = null } = {}) {
  const types = Object.keys(handlers)
  const out = []
  if (!types.length) return out
  for (let i = 0; i < limit; i++) {
    const job = await claimNext(db, now, types)
    if (!job) break
    let result
    try {
      result = (await handlers[job.type](job, ctx)) || { status: 'done' }
    } catch (err) {
      log?.warn?.({ job: Number(job.id), type: job.type, err: { name: err?.name, code: err?.code } }, 'Automation job error')
      result = { status: 'retry', error: err?.code || err?.name || 'error' }
    }
    let final = result.status
    try {
      if (result.status === 'retry') final = await retryOrFail(db, job, now, result.error, result.outcome)
      else if (result.status === 'defer') await defer(db, job, result.runAt)
      else if (['done', 'skipped', 'cancelled', 'failed'].includes(result.status)) await finish(db, job.id, result.status, result)
      else { await finish(db, job.id, 'failed', { outcome: 'bad_handler_result' }); final = 'failed' }
    } catch (err) {
      // The result could not be recorded: the job stays 'running' and is
      // recovered later, where the message row stops a second send.
      log?.error?.({ job: Number(job.id), err: { name: err?.name, code: err?.code } }, 'Automation job result could not be recorded')
    }
    out.push({ id: Number(job.id), type: job.type, key: job.idempotency_key, entityId: job.entity_id, result: { ...result, status: final } })
  }
  return out
}

/** A failed job a person asked to run again: one more attempt, now. */
export async function retryJob(db, id) {
  const r = await db.query(
    `UPDATE automation_jobs SET status = 'pending', run_at = NOW(), max_attempts = attempts + 1, outcome = NULL, completed_at = NULL,
            acknowledged_at = NULL, acknowledged_by = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'failed' RETURNING id`,
    [id]
  )
  return r.rowCount > 0
}

/** A failed job a person has dealt with another way: it leaves the exception list. */
export async function acknowledgeJob(db, id, accountId) {
  const r = await db.query(
    "UPDATE automation_jobs SET acknowledged_at = NOW(), acknowledged_by = $2, updated_at = NOW() WHERE id = $1 AND status = 'failed' AND acknowledged_at IS NULL RETURNING id",
    [id, accountId]
  )
  return r.rowCount > 0
}

export const JOB_RETENTION_DAYS = 180
/** Finished jobs are kept JOB_RETENTION_DAYS; pending, running and unacknowledged failures are never purged. */
export const purgeOldJobs = (db, days = JOB_RETENTION_DAYS) => db.query(
  `DELETE FROM automation_jobs
    WHERE completed_at < NOW() - make_interval(days => $1::int)
      AND (status IN ('done', 'cancelled', 'skipped') OR (status = 'failed' AND acknowledged_at IS NOT NULL))`,
  [days]
)

export default { enqueue, cancelJobs, runDueJobs, recoverStuck, retryJob, acknowledgeJob, purgeOldJobs, BACKOFF_MINUTES }
