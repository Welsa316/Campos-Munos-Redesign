// Callback reminders: "follow up on this caller (or this website lead) at
// this time", for one staff account. The rules live here; routes/reminders.js
// is the HTTP shape and worker.js delivers them when they fall due.
//
// Who may do what (capabilities, never role names):
//   a caller (a callback episode in Needs attention)  calls.exclude to set or
//     change one, calls.view to see them
//   a website lead  crm.view and (crm.manage or calls.exclude) to set or
//     change one, crm.view to see them
// A reminder can be assigned to any active account that can see its target.
//
// Notes are internal and stay in the portal: they are never put in an email
// or a notification.
import { displayName, capsOfRow } from '../auth/account.js'
import { inTransaction } from '../db/transaction.js'
import { episodeOpen } from '../integrations/ringcentral/callLog.js'
import { parseDue } from './dueTime.js'

export const NOTE_MAX = 500
export const OPEN_STATUSES = Object.freeze(['open', 'due'])
// The same list for SQL (constants only, never input).
const OPEN_SQL = `status IN (${OPEN_STATUSES.map((st) => `'${st}'`).join(', ')})`
const SNOOZE_MAX_MINUTES = 7 * 24 * 60
// Open reminders one person may have set for one assignee (themselves
// included) at once: far above a real follow-up list, low enough that a
// slip or a script cannot bury a colleague in reminder emails.
export const MAX_OPEN_PER_ASSIGNEE = 50

export class ReminderError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message)
    this.name = 'ReminderError'
    this.code = code
    this.status = status
    this.extra = extra
  }
}

// --- who may see and act on a target -------------------------------------------------

const VIEW = { call: ['calls.view'], submission: ['crm.view'] }
export const canSeeKind = (caps, kind) => VIEW[kind]?.every((c) => caps.has(c)) ?? false
export function canActOnKind(caps, kind) {
  if (kind === 'call') return caps.has('calls.exclude')
  if (kind === 'submission') return caps.has('crm.view') && (caps.has('crm.manage') || caps.has('calls.exclude'))
  return false
}

/** Active accounts that can see a target of this kind (who a reminder can be assigned to). */
export async function assignableAccounts(db, kind) {
  const rows = (await db.query(
    `SELECT id, email, display_name, role, capability_grants, capability_revokes FROM admin_users
      WHERE disabled_at IS NULL ORDER BY COALESCE(NULLIF(display_name, ''), email)`
  )).rows
  return rows.filter((r) => canSeeKind(capsOfRow(r), kind)).map((r) => ({ id: Number(r.id), name: displayName(r) }))
}

async function checkAssignee(db, kind, id) {
  const r = (await db.query(
    'SELECT id, email, display_name, role, capability_grants, capability_revokes, disabled_at FROM admin_users WHERE id = $1',
    [id]
  )).rows[0]
  if (!r || r.disabled_at || !canSeeKind(capsOfRow(r), kind)) {
    throw new ReminderError('invalid_assignee', 'That person cannot see this follow-up, so it cannot be assigned to them', 400)
  }
  return Number(r.id)
}

// --- targets -------------------------------------------------------------------------

/** { kind: 'call', id } (an episode's first call) or { kind: 'submission', id } from a request body. */
export function parseTarget(t) {
  const kind = t?.kind
  const id = Number(t?.id)
  if (!['call', 'submission'].includes(kind) || !Number.isSafeInteger(id) || id < 1) {
    throw new ReminderError('invalid_target', 'Choose the caller or lead to be reminded about')
  }
  return { kind, id }
}

async function loadTarget(db, { kind, id }) {
  if (kind === 'call') {
    const c = (await db.query('SELECT id, call_key, counterpart_key, direction, is_internal FROM rc_calls WHERE id = $1', [id])).rows[0]
    if (!c) throw new ReminderError('not_found', 'Call not found', 404)
    if (c.direction !== 'inbound' || c.is_internal || !c.counterpart_key) {
      throw new ReminderError('not_remindable', 'Only a caller waiting for a call back can have a reminder', 409)
    }
    if (!(await episodeOpen(db, id))) throw new ReminderError('resolved', 'This caller no longer needs a call back', 409)
    return { kind, callId: Number(c.id), callKey: c.call_key, phoneKey: c.counterpart_key }
  }
  const s = (await db.query('SELECT id, is_archived FROM submissions WHERE id = $1', [id])).rows[0]
  if (!s) throw new ReminderError('not_found', 'Lead not found', 404)
  if (s.is_archived) throw new ReminderError('resolved', 'This lead is archived', 409)
  return { kind, submissionId: Number(s.id) }
}

/** Is the follow-up a reminder is about still waiting for someone? */
export async function targetStillOpen(db, r) {
  if (r.target_kind === 'call') return episodeOpen(db, Number(r.call_id))
  const s = (await db.query('SELECT is_archived FROM submissions WHERE id = $1', [r.submission_id])).rows[0]
  return Boolean(s && !s.is_archived)
}

export const targetPath = (r) => (r.target_kind === 'call' ? `/calls?call=${r.call_id}` : `/inbox?lead=${r.submission_id}`)

// --- reading -------------------------------------------------------------------------

const SELECT = `
  SELECT r.*, a.email AS a_email, a.display_name AS a_name, a.disabled_at AS a_disabled,
         cb.email AS cb_email, cb.display_name AS cb_name, db.email AS db_email, db.display_name AS db_name,
         (SELECT json_agg(json_build_object('kind', d.kind, 'channel', d.channel, 'attempt', d.attempt, 'status', d.status,
                  'error', d.error, 'at', COALESCE(d.finished_at, d.attempted_at, d.created_at), 'next', d.next_attempt_at) ORDER BY d.attempt)
            FROM reminder_deliveries d WHERE d.reminder_id = r.id AND d.cycle = r.cycle) AS deliveries
    FROM follow_up_reminders r
    JOIN admin_users a ON a.id = r.assigned_to
    LEFT JOIN admin_users cb ON cb.id = r.created_by
    LEFT JOIN admin_users db ON db.id = r.completed_by`

const person = (id, email, name) => (id == null ? null : { id: Number(id), name: displayName({ display_name: name, email }) })

// The latest attempt per channel of this cycle's 'due' delivery, for "emailed
// 9:01 AM" / "Email could not be sent". Errors are short codes or the
// provider's words, never an address.
function deliverySummary(rows) {
  const out = {}
  for (const ch of ['email', 'push']) {
    const mine = (rows || []).filter((d) => d.channel === ch && d.kind === 'due')
    const last = mine[mine.length - 1]
    if (last) out[ch] = { status: last.status, attempts: mine.length, error: last.error || null, at: last.at, nextAttemptAt: last.status === 'pending' ? last.next : null }
  }
  const overdue = (rows || []).filter((d) => d.kind === 'overdue').pop()
  if (overdue) out.overdueEmail = { status: overdue.status, at: overdue.at }
  return out
}

export function present(r) {
  return {
    id: Number(r.id),
    target: r.target_kind === 'call'
      ? { kind: 'call', id: Number(r.call_id), path: targetPath(r) }
      : { kind: 'submission', id: Number(r.submission_id), path: targetPath(r) },
    dueAt: r.due_at,
    status: r.status,
    note: r.note || '',
    version: r.version,
    assignee: { ...person(r.assigned_to, r.a_email, r.a_name), disabled: Boolean(r.a_disabled) },
    createdBy: person(r.created_by, r.cb_email, r.cb_name),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    completedBy: person(r.completed_by, r.db_email, r.db_name),
    // 'resolved': closed by the server because the follow-up was dealt with.
    completionReason: r.completion_reason,
    cancelledAt: r.cancelled_at,
    // What happened when it fell due; nothing while it waits (again, after a snooze).
    delivery: r.status === 'open' ? {} : deliverySummary(r.deliveries),
  }
}

export async function getReminder(db, id) {
  const r = (await db.query(`${SELECT} WHERE r.id = $1`, [id])).rows[0]
  return r ? present(r) : null
}

/** Open and due reminders assigned to an account, soonest first, on targets it can still see. */
export async function listMine(db, { accountId, caps }) {
  const rows = (await db.query(`${SELECT} WHERE r.assigned_to = $1 AND r.${OPEN_SQL} ORDER BY r.due_at, r.id`, [accountId])).rows
  return rows.filter((r) => canSeeKind(caps, r.target_kind)).map(present)
}

/**
 * Open and due reminders on targets: every caller's (kind 'call', for the
 * Calls page), one caller's episode (callIds: its calls), or one lead's.
 */
export async function listForTargets(db, { kind, callIds = null, submissionId = null }) {
  if (kind === 'call') {
    const ids = Array.isArray(callIds) ? callIds : null
    const rows = (await db.query(
      `${SELECT} WHERE r.target_kind = 'call' AND r.${OPEN_SQL} AND ($1::bigint[] IS NULL OR r.call_id = ANY($1::bigint[]))
       ORDER BY r.due_at, r.id`,
      [ids]
    )).rows
    return rows.map(present)
  }
  const rows = (await db.query(
    `${SELECT} WHERE r.target_kind = 'submission' AND r.submission_id = $1 AND r.${OPEN_SQL} ORDER BY r.due_at, r.id`,
    [submissionId]
  )).rows
  return rows.map(present)
}

// --- changing ------------------------------------------------------------------------

function cleanNote(note) {
  if (note == null) return null
  if (typeof note !== 'string') throw new ReminderError('invalid_note', 'The note must be text')
  const text = note.trim()
  if (text.length > NOTE_MAX) throw new ReminderError('note_too_long', `Keep the note under ${NOTE_MAX} characters`)
  return text || null
}

function dueFrom(value, now) {
  const d = parseDue(value, now)
  if (d.error) throw new ReminderError('invalid_due', d.error)
  return d.at
}

/**
 * Set a reminder. assignee defaults to the person setting it. A second open
 * reminder for the same person on the same caller or lead is refused (409,
 * code 'duplicate', with the existing one) unless allowDuplicate is set: the
 * portal offers to change the existing one instead.
 */
export async function createReminder(db, { target, dueAt, assignee, note, allowDuplicate = false, accountId, caps, now = new Date() }) {
  const t = parseTarget(target)
  if (!canActOnKind(caps, t.kind)) throw new ReminderError('forbidden', 'Your account cannot set reminders on this', 403)
  const at = dueFrom(dueAt, now)
  const text = cleanNote(note)
  const assignedTo = assignee == null || assignee === '' ? accountId : await checkAssignee(db, t.kind, Number(assignee))
  const tgt = await loadTarget(db, t)

  const id = await inTransaction(db, async (client) => {
    // One at a time per (setter, person), so two at once cannot both pass the
    // cap, then per (target, person) for the duplicate check. Always in this
    // order, so two requests never wait on each other's second lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cm_follow_up_cap:' || $1 || ':' || $2))", [String(accountId), String(assignedTo)])
    const open = (await client.query(
      `SELECT COUNT(*)::int AS n FROM follow_up_reminders WHERE created_by = $1 AND assigned_to = $2 AND ${OPEN_SQL}`,
      [accountId, assignedTo]
    )).rows[0].n
    if (open >= MAX_OPEN_PER_ASSIGNEE) return { tooMany: true }
    const lockKey = tgt.kind === 'call' ? `call:${tgt.phoneKey}` : `submission:${tgt.submissionId}`
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cm_follow_up_reminder:' || $1 || ':' || $2))", [lockKey, String(assignedTo)])
    if (!allowDuplicate) {
      const dup = (await client.query(
        `SELECT id FROM follow_up_reminders WHERE assigned_to = $1 AND ${OPEN_SQL}
           AND ${tgt.kind === 'call' ? "target_kind = 'call' AND phone_key = $2" : "target_kind = 'submission' AND submission_id = $2::int"}
         ORDER BY due_at LIMIT 1`,
        [assignedTo, tgt.kind === 'call' ? tgt.phoneKey : tgt.submissionId]
      )).rows[0]
      if (dup) return { duplicateOf: dup.id }
    }
    return (await client.query(
      `INSERT INTO follow_up_reminders (target_kind, call_id, call_key, phone_key, submission_id, assigned_to, created_by, due_at, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [tgt.kind, tgt.callId ?? null, tgt.callKey ?? null, tgt.phoneKey ?? null, tgt.submissionId ?? null, assignedTo, accountId, at, text]
    )).rows[0].id
  })
  if (id?.tooMany) {
    throw new ReminderError('too_many_open', `There are already ${MAX_OPEN_PER_ASSIGNEE} open reminders from you for this person. Finish or cancel some first.`, 409)
  }
  if (id?.duplicateOf) {
    throw new ReminderError('duplicate', 'There is already a reminder for this person on this follow-up', 409, { reminder: await getReminder(db, id.duplicateOf) })
  }
  return getReminder(db, id)
}

async function loadForChange(db, id, caps) {
  const r = (await db.query('SELECT * FROM follow_up_reminders WHERE id = $1', [id])).rows[0]
  if (!r) throw new ReminderError('not_found', 'Reminder not found', 404)
  if (!canActOnKind(caps, r.target_kind)) throw new ReminderError('forbidden', 'Your account cannot change this reminder', 403)
  return r
}

// Someone else changed it since this person loaded it: say so, with what it is now.
async function conflict(db, id) {
  return new ReminderError('conflict', 'This reminder was changed by someone else. Check it and try again.', 409, { reminder: await getReminder(db, id) })
}
const closedError = async (db, id) => new ReminderError('closed', 'This reminder is already done or cancelled', 409, { reminder: await getReminder(db, id) })

function versionOf(v) {
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n < 1) throw new ReminderError('version_required', 'Reload the reminder and try again')
  return n
}

/**
 * Change when, who or the note (version required). A new due time puts a
 * due reminder back to waiting, so it is delivered again then.
 */
export async function updateReminder(db, { id, version, dueAt, assignee, note, caps, now = new Date() }) {
  const v = versionOf(version)
  const r = await loadForChange(db, id, caps)
  const sets = []
  const params = [id, v]
  const set = (sql, value) => { params.push(value); sets.push(sql.replace('?', `$${params.length}`)) }
  if (dueAt !== undefined) {
    set('due_at = ?', dueFrom(dueAt, now))
    sets.push("status = 'open'")
  }
  if (assignee !== undefined) set('assigned_to = ?', await checkAssignee(db, r.target_kind, Number(assignee)))
  if (note !== undefined) set('note = ?', cleanNote(note))
  if (!sets.length) throw new ReminderError('nothing_to_change', 'Nothing to change')
  const changed = await inTransaction(db, async (c) => {
    // The row stays locked until COMMIT, so the worker cannot claim the new
    // due time in between (claimDue skips locked rows).
    const out = await c.query(
      `UPDATE follow_up_reminders SET ${sets.join(', ')}, version = version + 1, updated_at = NOW()
        WHERE id = $1 AND version = $2 AND ${OPEN_SQL} RETURNING cycle`,
      params
    )
    if (!out.rowCount) return false
    // Retries still waiting for the old due time are not sent: only that
    // cycle's (the cycle is only bumped when the worker claims it again).
    if (dueAt !== undefined) await cancelPendingDeliveries(c, id, 'rescheduled', { cycle: out.rows[0].cycle })
    return true
  })
  if (!changed) throw (OPEN_STATUSES.includes(r.status) ? await conflict(db, id) : await closedError(db, id))
  return getReminder(db, id)
}

/** Snooze a due (or open) reminder: { minutes } from now, or { until } (ISO or 'tomorrow_morning'). */
export async function snoozeReminder(db, { id, version, minutes, until, caps, now = new Date() }) {
  let dueAt
  if (minutes != null) {
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 1 || m > SNOOZE_MAX_MINUTES) throw new ReminderError('invalid_due', 'Choose how long to snooze')
    dueAt = new Date(now.getTime() + m * 60 * 1000).toISOString()
  } else dueAt = until
  return updateReminder(db, { id, version: version ?? (await loadForChange(db, id, caps)).version, dueAt, caps, now })
}

// Done (the follow-up happened) or cancelled (nobody needs it): the same
// change apart from what is recorded. version is optional (closing twice
// is harmless).
const CLOSE = {
  done: "status = 'done', completion_reason = 'completed', completed_at = NOW(), completed_by = $3",
  cancelled: "status = 'cancelled', cancelled_at = NOW(), cancelled_by = $3",
}
async function closeReminder(db, { id, version, accountId, caps }, to) {
  const r = await loadForChange(db, id, caps)
  const v = version == null ? r.version : versionOf(version)
  const closed = await inTransaction(db, async (c) => {
    const out = await c.query(
      `UPDATE follow_up_reminders SET ${CLOSE[to]}, version = version + 1, updated_at = NOW()
        WHERE id = $1 AND version = $2 AND ${OPEN_SQL} RETURNING id`,
      [id, v, accountId]
    )
    if (out.rowCount) await cancelPendingDeliveries(c, id)
    return out.rowCount > 0
  })
  if (!closed) throw (OPEN_STATUSES.includes(r.status) ? await conflict(db, id) : await closedError(db, id))
  return getReminder(db, id)
}

export const completeReminder = (db, opts) => closeReminder(db, opts, 'done')
export const cancelReminder = (db, opts) => closeReminder(db, opts, 'cancelled')

/** Pending deliveries of a reminder (of one cycle, or every cycle) are not sent. */
export async function cancelPendingDeliveries(db, reminderId, error = null, { cycle = null } = {}) {
  await db.query(
    `UPDATE reminder_deliveries SET status = 'cancelled', error = COALESCE($2, error), finished_at = NOW()
      WHERE reminder_id = $1 AND status = 'pending' AND ($3::int IS NULL OR cycle = $3::int)`,
    [reminderId, error, cycle]
  )
}

// --- closing reminders whose follow-up was dealt with --------------------------------

/**
 * Close (done, completed_by NULL, reason 'resolved') the open and due
 * reminders whose caller or lead no longer needs anyone: a connected
 * callback, the calls marked handled or cleared, the lead archived.
 * Narrowed to one number's callers (phoneKeys) or one lead (submissionId);
 * with neither, every open reminder (the worker's sweep, bounded by limit).
 * Returns the ids it closed.
 */
export async function closeResolvedReminders(db, { phoneKeys = null, submissionId = null, limit = 500 } = {}) {
  const where = [OPEN_SQL]
  const params = []
  if (phoneKeys) { params.push(phoneKeys); where.push(`target_kind = 'call' AND phone_key = ANY($${params.length}::text[])`) }
  if (submissionId != null) { params.push(submissionId); where.push(`target_kind = 'submission' AND submission_id = $${params.length}`) }
  params.push(limit)
  const rows = (await db.query(`SELECT * FROM follow_up_reminders WHERE ${where.join(' AND ')} ORDER BY due_at LIMIT $${params.length}`, params)).rows
  const closed = []
  // Episodes are checked once each, however many reminders share one.
  const seen = new Map()
  for (const r of rows) {
    const key = r.target_kind === 'call' ? `c${r.call_id}` : `s${r.submission_id}`
    if (!seen.has(key)) seen.set(key, await targetStillOpen(db, r))
    if (seen.get(key)) continue
    if (await markResolved(db, r.id)) closed.push(Number(r.id))
  }
  return closed
}

/** One reminder closed by the server (only while it is still open or due). */
export async function markResolved(db, id) {
  return inTransaction(db, async (c) => {
    const out = await c.query(
      `UPDATE follow_up_reminders SET status = 'done', completion_reason = 'resolved', completed_at = NOW(), completed_by = NULL,
              version = version + 1, updated_at = NOW()
        WHERE id = $1 AND ${OPEN_SQL} RETURNING id`,
      [id]
    )
    if (out.rowCount) await cancelPendingDeliveries(c, id, 'resolved')
    return out.rowCount > 0
  })
}

/**
 * Undo of an action that closed reminders as resolved (Undo after marking a
 * caller handled, Reopen, Count it again, undoing Clear the list, a lead
 * taken out of the archive): the reminders on those callers (phoneKeys) or
 * that lead (submissionId) that the server closed as resolved at or after
 * `since` come back, when their caller or lead needs someone again. Anything
 * closed by a person, or still dealt with another way (a connected
 * callback), stays closed.
 *
 * A reminder whose time is still to come waits again ('open'). One whose
 * time has passed is 'due': if nothing was delivered for it yet, as a new
 * cycle with its email and notification queued for the worker; if its
 * person was already told, it just goes back on their list.
 * Returns the ids it reopened.
 */
export async function reopenResolvedReminders(db, { phoneKeys = null, submissionId = null, since, now = new Date() }) {
  if (!since || (!phoneKeys?.length && submissionId == null)) return []
  const rows = (await db.query(
    `SELECT * FROM follow_up_reminders
      WHERE status = 'done' AND completion_reason = 'resolved' AND completed_at >= $1
        AND (($2::text[] IS NOT NULL AND target_kind = 'call' AND phone_key = ANY($2::text[]))
          OR ($3::int IS NOT NULL AND target_kind = 'submission' AND submission_id = $3::int))
      ORDER BY due_at, id LIMIT 500`,
    [since, phoneKeys?.length ? phoneKeys : null, submissionId]
  )).rows
  const reopened = []
  const seen = new Map()
  for (const r of rows) {
    const key = r.target_kind === 'call' ? `c${r.call_id}` : `s${r.submission_id}`
    if (!seen.has(key)) seen.set(key, await targetStillOpen(db, r))
    if (!seen.get(key)) continue
    if (await reopenOne(db, r.id, now)) reopened.push(Number(r.id))
  }
  return reopened
}

async function reopenOne(db, id, now) {
  return inTransaction(db, async (c) => {
    const r = (await c.query(
      `SELECT id, cycle, due_at <= $2 AS past,
              EXISTS (SELECT 1 FROM reminder_deliveries d WHERE d.reminder_id = r.id AND d.cycle = r.cycle AND d.kind = 'due' AND d.status = 'sent') AS told
         FROM follow_up_reminders r WHERE id = $1 AND status = 'done' AND completion_reason = 'resolved' FOR UPDATE`,
      [id, now]
    )).rows[0]
    if (!r) return false
    const newCycle = r.past && !(r.cycle > 0 && r.told)
    const out = await c.query(
      `UPDATE follow_up_reminders SET status = $2, cycle = cycle + $3::int, completion_reason = NULL, completed_at = NULL, completed_by = NULL,
              version = version + 1, updated_at = NOW()
        WHERE id = $1 RETURNING cycle`,
      [id, r.past ? 'due' : 'open', newCycle ? 1 : 0]
    )
    if (newCycle) {
      await c.query(
        `INSERT INTO reminder_deliveries (reminder_id, cycle, kind, channel, attempt, status, next_attempt_at)
         SELECT $1, $2, 'due', ch, 1, 'pending', $3 FROM unnest(ARRAY['email', 'push']) AS ch ON CONFLICT DO NOTHING`,
        [id, out.rows[0].cycle, now]
      )
    }
    return true
  })
}

/**
 * An account is being disabled: its open and due reminders go to someone
 * who can still act on them, instead of waiting for nobody. To `toId` (the
 * person disabling it) when they can see that kind of follow-up, else to
 * whoever set the reminder when they are active and can; otherwise it stays
 * (and shows as assigned to a disabled account). A due one goes back to
 * waiting with its time unchanged, so the worker delivers it to its new
 * person on its next run. Run inside the disabling transaction (`db` is its
 * client). Returns { reassigned, left, to: { accountId: count } }.
 */
export async function reassignFromDisabled(db, { accountId, toId = null }) {
  const rows = (await db.query(
    `SELECT id, target_kind, created_by, status FROM follow_up_reminders WHERE assigned_to = $1 AND ${OPEN_SQL} ORDER BY id FOR UPDATE`,
    [accountId]
  )).rows
  if (!rows.length) return { reassigned: 0, left: 0, to: {} }
  const ids = [...new Set([toId, ...rows.map((r) => r.created_by)].filter((id) => id != null && Number(id) !== Number(accountId)))]
  const people = new Map((await db.query(
    'SELECT id, role, capability_grants, capability_revokes FROM admin_users WHERE id = ANY($1::int[]) AND disabled_at IS NULL',
    [ids]
  )).rows.map((p) => [Number(p.id), capsOfRow(p)]))
  const able = (id, kind) => id != null && people.has(Number(id)) && canSeeKind(people.get(Number(id)), kind)
  const byPerson = new Map()
  let left = 0
  for (const r of rows) {
    const to = able(toId, r.target_kind) ? Number(toId) : able(r.created_by, r.target_kind) ? Number(r.created_by) : null
    if (to == null) { left++; continue }
    if (!byPerson.has(to)) byPerson.set(to, [])
    byPerson.get(to).push(Number(r.id))
  }
  const out = {}
  for (const [to, list] of byPerson) {
    await db.query(
      `UPDATE follow_up_reminders SET assigned_to = $2, status = 'open', version = version + 1, updated_at = NOW() WHERE id = ANY($1::bigint[])`,
      [list, to]
    )
    await db.query(
      "UPDATE reminder_deliveries SET status = 'cancelled', error = 'reassigned', finished_at = NOW() WHERE reminder_id = ANY($1::bigint[]) AND status = 'pending'",
      [list]
    )
    out[to] = list.length
  }
  return { reassigned: rows.length - left, left, to: out }
}

/**
 * Done and cancelled reminders are kept REMINDER_RETENTION_DAYS (180) after
 * they last changed, with their delivery history (ON DELETE CASCADE); open
 * and due ones are never purged.
 */
export const REMINDER_RETENTION_DAYS = 180
export const purgeClosedReminders = (db, days = REMINDER_RETENTION_DAYS) => db.query(
  "DELETE FROM follow_up_reminders WHERE status IN ('done', 'cancelled') AND updated_at < NOW() - make_interval(days => $1::int)",
  [days]
)

/** The numbers (phone keys) of some calls, for closing reminders after they were marked. */
export async function phoneKeysOf(db, callIds) {
  const ids = (Array.isArray(callIds) ? callIds : [callIds]).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)
  if (!ids.length) return []
  return (await db.query("SELECT DISTINCT counterpart_key FROM rc_calls WHERE id = ANY($1::bigint[]) AND counterpart_key <> ''", [ids])).rows.map((r) => r.counterpart_key)
}
