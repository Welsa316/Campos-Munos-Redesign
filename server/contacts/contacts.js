// A caller's history across the portal, and the internal notes staff write
// about them. Nothing is copied: calls stay in rc_calls (RingCentral is the
// record), website leads in submissions, replies and lead notes in their own
// tables. A contact is a phone number as cm_phone_key() normalises it.
//
// A number is not a person. A website lead with the same number is shown as
// a possible match until someone confirms it, and one marked as someone else
// (a shared family phone, a reassigned number) leaves the history.

import { inTransaction } from '../db/transaction.js'

export class ContactError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

const NOTE_MAX = 5000
const PAGE_MAX = 100

const cleanBody = (body) => {
  const text = typeof body === 'string' ? body.replace(/\r\n/g, '\n').trim() : ''
  if (!text) throw new ContactError('note_required', 'Write something first')
  if (text.length > NOTE_MAX) throw new ContactError('note_too_long', `Notes are at most ${NOTE_MAX} characters`)
  return text
}

// The name shown for an admin_users row joined as `alias`.
const authorSql = (alias = 'u') => `COALESCE(NULLIF(${alias}.display_name, ''), split_part(${alias}.email, '@', 1))`

function presentNote(r) {
  return {
    id: Number(r.id),
    body: r.body,
    authorId: r.author_id == null ? null : Number(r.author_id),
    author: r.author || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    edited: new Date(r.updated_at) - new Date(r.created_at) > 1000,
    callId: r.call_id == null ? null : Number(r.call_id),
  }
}

/** The call's number key and call key, or a 404. */
async function loadCall(db, callId) {
  const r = (await db.query('SELECT id, call_key, counterpart_key FROM rc_calls WHERE id = $1', [callId])).rows[0]
  if (!r) throw new ContactError('not_found', 'Call not found', 404)
  return r
}

/** Notes about this call's caller: every note on the number, or the call's own when the number was withheld. */
export async function listCallNotes(db, { callId, accountId = null }) {
  const call = await loadCall(db, callId)
  const rows = (await db.query(
    `SELECT n.*, ${authorSql()} AS author, c.id AS call_id
       FROM call_notes n
       LEFT JOIN admin_users u ON u.id = n.author_id
       LEFT JOIN LATERAL (SELECT id FROM rc_calls WHERE call_key = n.call_key ORDER BY is_primary DESC, id LIMIT 1) c ON TRUE
      WHERE n.deleted_at IS NULL
        AND (($1 <> '' AND n.phone_key = $1) OR n.call_key = $2)
      ORDER BY n.created_at, n.id`,
    [call.counterpart_key || '', call.call_key]
  )).rows
  return rows.map((r) => ({ ...presentNote(r), mine: accountId != null && Number(r.author_id) === Number(accountId) }))
}

export async function addCallNote(db, { callId, body, accountId }) {
  const call = await loadCall(db, callId)
  const text = cleanBody(body)
  const r = (await db.query(
    `INSERT INTO call_notes (phone_key, call_key, body, author_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [call.counterpart_key || null, call.call_key, text, accountId]
  )).rows[0]
  return { ...presentNote({ ...r, call_id: call.id, author: null }), mine: true }
}

/**
 * Edit or delete a note: its author may, and an administrator may delete.
 * The text it replaced is kept in call_note_revisions.
 */
export async function changeCallNote(db, { noteId, body, accountId, mayDeleteAny = false, remove = false }) {
  return inTransaction(db, async (client) => {
    const note = (await client.query('SELECT * FROM call_notes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [noteId])).rows[0]
    if (!note) throw new ContactError('not_found', 'Note not found', 404)
    const own = note.author_id != null && Number(note.author_id) === Number(accountId)
    if (!own && !(remove && mayDeleteAny)) throw new ContactError('not_yours', 'Only the person who wrote a note can change it', 403)
    let updated
    if (remove) {
      await client.query(`INSERT INTO call_note_revisions (note_id, action, previous_body, changed_by) VALUES ($1, 'delete', $2, $3)`, [note.id, note.body, accountId])
      updated = (await client.query('UPDATE call_notes SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *', [note.id])).rows[0]
    } else {
      const text = cleanBody(body)
      if (text !== note.body) {
        await client.query(`INSERT INTO call_note_revisions (note_id, action, previous_body, changed_by) VALUES ($1, 'edit', $2, $3)`, [note.id, note.body, accountId])
        updated = (await client.query('UPDATE call_notes SET body = $2, updated_at = NOW() WHERE id = $1 RETURNING *', [note.id, text])).rows[0]
      } else updated = note
    }
    return { ...presentNote({ ...updated, author: null, call_id: null }), mine: own }
  })
}

/**
 * The website leads that share this number, and what staff decided about
 * each. Distinct people (by email, else by name) are listed separately, so
 * a shared phone is visible rather than merged.
 */
export async function contactMatches(db, { key }) {
  if (!key) return []
  const rows = (await db.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.created_at, l.state
       FROM submissions s
       LEFT JOIN contact_links l ON l.phone_key = $1 AND l.submission_id = s.id
      WHERE cm_phone_key(s.phone) = $1
      ORDER BY s.created_at DESC
      LIMIT 50`,
    [key]
  )).rows
  const people = new Map()
  for (const r of rows) {
    const who = (r.email || '').trim().toLowerCase() || `${r.first_name} ${r.last_name}`.trim().toLowerCase()
    const p = people.get(who) || { name: `${r.first_name} ${r.last_name}`.trim(), email: r.email || null, submissions: [] }
    p.submissions.push({ id: Number(r.id), at: r.created_at, state: r.state || 'possible' })
    people.set(who, p)
  }
  return [...people.values()]
}

export async function decideMatch(db, { key, submissionId, state, accountId }) {
  if (!['confirmed', 'rejected', 'possible'].includes(state)) throw new ContactError('invalid_state', 'Unknown decision')
  const sub = (await db.query('SELECT id FROM submissions WHERE id = $1 AND cm_phone_key(phone) = $2', [submissionId, key])).rows[0]
  if (!sub) throw new ContactError('not_found', 'That lead does not use this number', 404)
  if (state === 'possible') {
    await db.query('DELETE FROM contact_links WHERE phone_key = $1 AND submission_id = $2', [key, submissionId])
  } else {
    await db.query(
      `INSERT INTO contact_links (phone_key, submission_id, state, decided_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone_key, submission_id) DO UPDATE SET state = EXCLUDED.state, decided_by = EXCLUDED.decided_by, decided_at = NOW()`,
      [key, submissionId, state, accountId]
    )
  }
  return { submissionId: Number(submissionId), state }
}

/**
 * One page of a number's history, newest first, as one list of events:
 * calls (calls.view), website leads with their replies and notes (crm.view)
 * and call notes (either). Each source is read only when the account may
 * see it, so a matching number never shows someone a section they cannot
 * open. Leads marked as someone else are left out.
 */
export async function contactHistory(db, { key, can, before = null, limit = 30 }) {
  if (!key) return { events: [], more: false }
  const lim = Math.max(1, Math.min(PAGE_MAX, Math.trunc(Number(limit)) || 30))
  const parts = []
  const seeCalls = can('calls.view')
  const seeLeads = can('crm.view')
  if (seeCalls) {
    parts.push(`
      SELECT 'call' AS type, c.started_at AS at, c.id AS ref, c.direction AS a, c.classification AS b, c.outcome AS c3,
             COALESCE(c.classification_evidence->'answeredBy'->>'name', '') AS person, c.firm_name AS d, NULL::int AS sub
        FROM rc_calls c
       WHERE c.counterpart_key = $1 AND c.is_primary AND NOT c.is_internal`)
  }
  if (seeLeads) {
    const kept = `cm_phone_key(s.phone) = $1 AND NOT EXISTS (SELECT 1 FROM contact_links l WHERE l.phone_key = $1 AND l.submission_id = s.id AND l.state = 'rejected')`
    parts.push(`
      SELECT 'submission', s.created_at, s.id, COALESCE(s.consultation_type, ''), COALESCE(s.source, ''), COALESCE(l.state, 'possible'),
             trim(s.first_name || ' ' || s.last_name), NULL, s.id
        FROM submissions s LEFT JOIN contact_links l ON l.phone_key = $1 AND l.submission_id = s.id
       WHERE ${kept}`)
    parts.push(`
      SELECT 'reply', r.sent_at, r.id, NULL, NULL, NULL, ${authorSql('ru')}, NULL, s.id
        FROM replies r JOIN submissions s ON s.id = r.submission_id LEFT JOIN admin_users ru ON ru.id = r.sent_by
       WHERE ${kept}`)
    parts.push(`
      SELECT 'lead_note', n.created_at, n.id, NULL, NULL, NULL, ${authorSql('nu')}, NULL, s.id
        FROM lead_notes n JOIN submissions s ON s.id = n.submission_id LEFT JOIN admin_users nu ON nu.id = n.author_id
       WHERE ${kept}`)
  }
  if (seeCalls || seeLeads) {
    parts.push(`
      SELECT 'call_note', n.created_at, n.id, NULL, NULL, NULL, ${authorSql('cu')}, NULL, NULL
        FROM call_notes n LEFT JOIN admin_users cu ON cu.id = n.author_id
       WHERE n.phone_key = $1 AND n.deleted_at IS NULL`)
  }
  if (!parts.length) return { events: [], more: false }
  const params = [key]
  let cursor = ''
  if (before) {
    params.push(new Date(before))
    cursor = `WHERE at < $${params.length}`
  }
  params.push(lim + 1)
  const rows = (await db.query(
    `SELECT * FROM (${parts.join(' UNION ALL ')}) e(type, at, ref, a, b, c3, person, d, sub) ${cursor}
      ORDER BY at DESC, type, ref DESC LIMIT $${params.length}`,
    params
  )).rows
  const more = rows.length > lim
  return { events: rows.slice(0, lim).map(presentEvent), more }
}

function presentEvent(r) {
  const base = { type: r.type, at: r.at, id: `${r.type}:${r.ref}` }
  switch (r.type) {
    case 'call':
      return { ...base, source: 'RingCentral', callId: Number(r.ref), direction: r.a, classification: r.b, outcome: r.c3, employee: r.person || null, firmName: r.d || null }
    case 'submission':
      return { ...base, source: 'Website', submissionId: Number(r.sub), consultationType: r.a || null, channel: r.b || null, match: r.c3, name: r.person }
    case 'reply':
      return { ...base, source: 'Email', submissionId: Number(r.sub), employee: r.person || null }
    case 'lead_note':
      return { ...base, source: 'Portal', submissionId: Number(r.sub), employee: r.person || null }
    default:
      return { ...base, source: 'Portal', noteId: Number(r.ref), employee: r.person || null }
  }
}
