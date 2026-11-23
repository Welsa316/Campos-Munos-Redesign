// The shared WhatsApp inbox: one conversation per client number, the same
// history for every staff account that may read it (docs/staff-accounts.md).
//
// Nothing here touches the webhook. Inbound messages and delivery receipts
// are read from whatsapp_events, which the webhook already stores durably;
// payment reminders from billing_messages. This module adds what staff decide
// (assignment, internal notes, open/closed) and the replies they send.
//
// A reply is sent only when ALL of these hold, checked here on the server:
//   - WHATSAPP_SENDING_ENABLED is 'true' (one switch for real and simulated
//     sending, the same one payment reminders obey);
//   - the client wrote within the last 24 hours (Meta's customer-service
//     window: outside it free text is refused and only approved templates
//     may be sent, which is the reminders' job, not a chat box's);
//   - the client has not opted out since they last wrote, and their last
//     message is not itself an opt-out word.
// A number is matched to billing contacts through phoneVariants(): Meta can
// report a Mexican mobile as 521… when staff saved 52… (Argentina: 549…/54…),
// and an opt-out recorded under one form must stop replies to the other.
// Logs and audit rows carry ids and outcomes, never message text or numbers.
import { audit } from '../billing/audit.js'
import { classifyInbound, phoneVariants } from '../billing/whatsappInbound.js'
import { whatsappSendingEnabled } from '../billing/providers/whatsapp/index.js'
import { displayName, accountsWith } from '../auth/account.js'
import inTransaction from '../db/transaction.js'
import { hiddenSql, firmNumberSql, waKeySql } from './hiddenSql.js'

export const WINDOW_HOURS = 24
export const MAX_NOTE_LENGTH = 2000
export const MAX_REPLY_LENGTH = 4096
const CLIENT_KEY_RE = /^[A-Za-z0-9-]{8,64}$/

export class InboxError extends Error {
  constructor(message, status = 400, code = 'inbox_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

// Text of an inbound message as staff should read it.
const INBOUND_TEXT_SQL = `COALESCE(e.payload->'text'->>'body', e.payload->'button'->>'text',
  e.payload->'interactive'->'button_reply'->>'title', e.payload->'interactive'->'list_reply'->>'title',
  e.payload->'image'->>'caption', e.payload->'document'->>'caption')`
const AT_SQL = 'COALESCE(e.event_timestamp, e.received_at)'
const NAME_SQL = (alias) => `COALESCE(NULLIF(TRIM(${alias}.display_name), ''), split_part(${alias}.email, '@', 1))`

const VIEWS = {
  open: "c.status = 'open'",
  mine: "c.status = 'open' AND c.assigned_to = $1",
  unassigned: "c.status = 'open' AND c.assigned_to IS NULL",
  closed: "c.status = 'closed'",
}

// Every number that has written to the firm has a conversation row, created
// when its first message is stored (db/whatsappEvents.js). Listing only reads.
// A number kept out of the portal (hiddenSql.js) can still have a row from
// before it was marked in Calls: it is not listed and cannot be opened.
export async function listConversations(db, { view = 'open', accountId }) {
  const where = VIEWS[view] || VIEWS.open
  const { rows } = await db.query(
    `WITH timeline AS (
       SELECT c.id AS conversation_id, ${AT_SQL} AS at, 'in' AS direction, ${INBOUND_TEXT_SQL} AS body, e.message_type
         FROM whatsapp_events e JOIN wa_conversations c ON c.wa_id = e.from_wa_id
        WHERE e.kind = 'message' AND e.deleted_at IS NULL
       UNION ALL
       SELECT o.conversation_id, o.created_at, 'out', o.body, 'text' FROM wa_outbound_messages o
        WHERE o.status <> 'failed' AND o.deleted_at IS NULL
       UNION ALL
       SELECT c.id, m.created_at, 'out', r.preview, 'reminder'
         FROM billing_messages m JOIN wa_conversations c ON c.wa_id = m.to_phone
         LEFT JOIN billing_reminders r ON r.id = m.reminder_id
        WHERE m.status <> 'failed'
     ), last AS (
       SELECT DISTINCT ON (conversation_id) conversation_id, at, direction, body, message_type
         FROM timeline ORDER BY conversation_id, at DESC
     )
     SELECT c.id, c.wa_id, c.status, c.assigned_to, ${NAME_SQL('u')} AS assigned_name,
            l.at AS last_at, l.direction AS last_direction, LEFT(l.body, 140) AS preview, l.message_type AS last_type,
            (SELECT e.contact_name FROM whatsapp_events e WHERE e.from_wa_id = c.wa_id AND e.contact_name IS NOT NULL AND e.deleted_at IS NULL
              ORDER BY e.received_at DESC LIMIT 1) AS profile_name
       FROM wa_conversations c
       LEFT JOIN last l ON l.conversation_id = c.id
       LEFT JOIN admin_users u ON u.id = c.assigned_to
      WHERE ${where} AND NOT ${hiddenSql('c.wa_id')}
      ORDER BY l.at DESC NULLS LAST, c.id DESC
      LIMIT 200`,
    view === 'mine' ? [accountId] : []
  )
  const namesByPhone = new Map()
  for (const k of (await db.query(
    `SELECT k.phone_e164, bc.display_name FROM billing_client_contacts k
       JOIN billing_clients bc ON bc.id = k.client_id WHERE k.phone_e164 IS NOT NULL AND bc.display_name IS NOT NULL`
  )).rows) namesByPhone.set(k.phone_e164, [...(namesByPhone.get(k.phone_e164) || []), k.display_name])
  const clientNames = (waId) => [...new Set(phoneVariants(waId).flatMap((v) => namesByPhone.get(v) || []))].sort().join(', ') || null
  return rows.map((r) => ({
    id: Number(r.id),
    phone: r.wa_id,
    name: clientNames(r.wa_id) || r.profile_name || null,
    profileName: r.profile_name,
    status: r.status,
    assignee: r.assigned_to ? { id: r.assigned_to, name: r.assigned_name } : null,
    lastAt: r.last_at,
    lastDirection: r.last_direction,
    preview: r.preview ?? (r.last_type && r.last_type !== 'text' ? `[${r.last_type}]` : null),
    // The client spoke last: someone owes them an answer.
    needsReply: r.last_direction === 'in' && r.status === 'open',
  }))
}

async function loadConversation(db, id) {
  const c = (await db.query(`SELECT c.*, ${hiddenSql('c.wa_id')} AS hidden FROM wa_conversations c WHERE c.id = $1`, [id])).rows[0]
  if (!c || c.hidden) throw new InboxError('Conversation not found', 404, 'not_found')
  return c
}

/** Why a reply cannot be sent right now, or null when it can. */
export async function replyBlocker(db, waId, { env = process.env, now = new Date() } = {}) {
  if (!whatsappSendingEnabled(env)) {
    return { code: 'sending_disabled', message: 'WhatsApp sending is switched off for the portal. An administrator turns it on (WHATSAPP_SENDING_ENABLED) once the account is verified.' }
  }
  const last = (await db.query(
    `SELECT ${AT_SQL} AS at, ${INBOUND_TEXT_SQL} AS body FROM whatsapp_events e
      WHERE e.kind = 'message' AND e.from_wa_id = $1 ORDER BY ${AT_SQL} DESC LIMIT 1`,
    [waId]
  )).rows[0]
  if (!last) return { code: 'no_inbound', message: 'This client has not written to the firm on WhatsApp.' }
  const openUntil = new Date(new Date(last.at).getTime() + WINDOW_HOURS * 3600 * 1000)
  if (openUntil <= now) {
    return { code: 'window_closed', message: `It has been more than ${WINDOW_HOURS} hours since the client last wrote. WhatsApp only allows an approved template now; call the client or wait for them to write.`, openUntil }
  }
  if (last.body && classifyInbound(last.body) === 'opt_out') {
    return { code: 'opted_out', message: 'The client asked not to receive messages.' }
  }
  const optedOut = (await db.query(
    `SELECT 1 FROM billing_client_contacts
      WHERE phone_e164 = ANY($1) AND opted_out_at IS NOT NULL AND (opted_in_at IS NULL OR opted_out_at > opted_in_at)
        AND opted_out_at > $2 LIMIT 1`,
    [phoneVariants(waId), last.at]
  )).rowCount > 0
  if (optedOut) return { code: 'opted_out', message: 'The client opted out after their last message.' }
  return null
}

const STATUS_RANK = { sent: 1, delivered: 2, read: 3 }

export async function getConversation(db, id, { canSeeBilling = false, env = process.env, now = new Date() } = {}) {
  const c = await loadConversation(db, id)
  const variants = phoneVariants(c.wa_id)
  const [inbound, outbound, reminders, notes, clients, profile] = await Promise.all([
    db.query(
      `SELECT e.id, ${AT_SQL} AS at, ${INBOUND_TEXT_SQL} AS body, e.message_type
         FROM whatsapp_events e WHERE e.kind = 'message' AND e.from_wa_id = $1 AND e.deleted_at IS NULL ORDER BY at`, [c.wa_id]
    ),
    db.query(
      `SELECT o.id, o.created_at AS at, o.body, o.status, o.simulated, o.error_message, o.provider_message_id,
              ${NAME_SQL('u')} AS by_name,
              (SELECT array_agg(DISTINCT e.status) FROM whatsapp_events e WHERE e.kind = 'status' AND e.wa_message_id = o.provider_message_id) AS receipts
         FROM wa_outbound_messages o LEFT JOIN admin_users u ON u.id = o.sent_by
        WHERE o.conversation_id = $1 AND o.deleted_at IS NULL ORDER BY o.created_at`, [id]
    ),
    db.query(
      `SELECT m.id, m.created_at AS at, r.preview AS body, m.status, m.simulated, ${NAME_SQL('u')} AS approved_by
         FROM billing_messages m LEFT JOIN billing_reminders r ON r.id = m.reminder_id
         LEFT JOIN admin_users u ON u.id = r.approved_by
        WHERE m.to_phone = ANY($1) ORDER BY m.created_at`, [variants]
    ),
    db.query(
      `SELECT n.id, n.body, n.created_at AS at, ${NAME_SQL('u')} AS author
         FROM wa_conversation_notes n LEFT JOIN admin_users u ON u.id = n.author_id
        WHERE n.conversation_id = $1 ORDER BY n.created_at`, [id]
    ),
    db.query(
      `SELECT bc.id, bc.display_name, k.opted_in_at, k.opted_out_at
         FROM billing_client_contacts k JOIN billing_clients bc ON bc.id = k.client_id
        WHERE k.phone_e164 = ANY($1) ORDER BY bc.display_name`, [variants]
    ),
    db.query(
      `SELECT contact_name FROM whatsapp_events WHERE from_wa_id = $1 AND contact_name IS NOT NULL AND deleted_at IS NULL ORDER BY received_at DESC LIMIT 1`, [c.wa_id]
    ),
  ])

  const messages = [
    ...inbound.rows.map((m) => ({
      key: `in-${m.id}`, direction: 'in', kind: 'client', at: m.at,
      body: m.body ?? null, mediaType: m.body == null ? m.message_type : null,
    })),
    ...outbound.rows.map((m) => {
      // The furthest receipt Meta reported; our own status until one arrives.
      const best = (m.receipts || []).filter((s) => STATUS_RANK[s]).sort((a, b) => STATUS_RANK[b] - STATUS_RANK[a])[0]
      const failedReceipt = (m.receipts || []).includes('failed')
      return {
        key: `out-${m.id}`, direction: 'out', kind: 'staff', at: m.at, body: m.body, by: m.by_name,
        status: failedReceipt ? 'failed' : (m.status === 'sent' && best ? best : m.status),
        simulated: m.simulated, error: m.error_message,
      }
    }),
    ...reminders.rows.map((m) => ({
      key: `rem-${m.id}`, direction: 'out', kind: 'reminder', at: m.at, body: m.body, by: m.approved_by ? `Payment reminder, approved by ${m.approved_by}` : 'Payment reminder',
      status: m.status, simulated: m.simulated,
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at))

  let invoices = null
  if (canSeeBilling && clients.rows.length) {
    // Open balances first, then paid ones ("did my payment arrive?").
    invoices = (await db.query(
      `SELECT i.client_id, i.external_invoice_id, i.status, i.balance_cents, COALESCE(i.next_installment_date, i.due_date) AS next_due
         FROM billing_invoices i WHERE i.client_id = ANY($1) AND i.status <> 'void'
        ORDER BY (i.status = 'paid'), next_due NULLS LAST LIMIT 20`,
      [clients.rows.map((r) => r.id)]
    )).rows.map((r) => ({
      clientId: Number(r.client_id), invoiceId: r.external_invoice_id, status: r.status,
      balanceCents: Number(r.balance_cents), nextDue: r.next_due,
    }))
  }

  const blocker = await replyBlocker(db, c.wa_id, { env, now })
  const assignee = c.assigned_to
    ? (await db.query(`SELECT id, ${NAME_SQL('u')} AS name FROM admin_users u WHERE id = $1`, [c.assigned_to])).rows[0] || null
    : null

  return {
    id: Number(c.id),
    phone: c.wa_id,
    profileName: profile.rows[0]?.contact_name ?? null,
    status: c.status,
    assignee,
    assignedAt: c.assigned_at,
    clients: clients.rows.map((r) => ({
      id: Number(r.id), name: r.display_name,
      optedOut: Boolean(r.opted_out_at && (!r.opted_in_at || r.opted_out_at > r.opted_in_at)),
    })),
    // null when the account may not read payment status.
    invoices,
    messages,
    notes: notes.rows.map((n) => ({ id: Number(n.id), body: n.body, at: n.at, author: n.author })),
    reply: blocker ? { allowed: false, ...blocker } : { allowed: true },
  }
}

export async function sendReply(db, provider, { conversationId, body, clientKey, account, env = process.env, now = new Date(), log } = {}) {
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text) throw new InboxError('Write a message first')
  if (text.length > MAX_REPLY_LENGTH) throw new InboxError(`A WhatsApp message can be at most ${MAX_REPLY_LENGTH} characters`)
  if (typeof clientKey !== 'string' || !CLIENT_KEY_RE.test(clientKey)) throw new InboxError('Missing or invalid clientKey')
  const c = await loadConversation(db, conversationId)

  const idempotencyKey = `staff-${account.id}-${clientKey}`
  // The same click arriving twice (double submit, a retried request) returns
  // the first attempt instead of sending again.
  const existing = (await db.query('SELECT * FROM wa_outbound_messages WHERE idempotency_key = $1', [idempotencyKey])).rows[0]
  if (existing) return { message: outboundJson(existing, account), duplicate: true }

  const blocker = await replyBlocker(db, c.wa_id, { env, now })
  if (blocker) throw new InboxError(blocker.message, 409, blocker.code)

  const inserted = (await db.query(
    `INSERT INTO wa_outbound_messages (conversation_id, body, sent_by, idempotency_key, provider_mode, simulated, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
    [c.id, text, account.id, idempotencyKey, provider.mode, provider.mode !== 'meta']
  )).rows[0]
  if (!inserted) {
    const row = (await db.query('SELECT * FROM wa_outbound_messages WHERE idempotency_key = $1', [idempotencyKey])).rows[0]
    return { message: outboundJson(row, account), duplicate: true }
  }

  let res
  try {
    res = await provider.sendText({ to: c.wa_id, body: text, idempotencyKey })
  } catch (err) {
    log?.error?.({ err: err.message, messageId: Number(inserted.id) }, 'WhatsApp reply send threw')
    res = { ok: false, outcome: 'unknown', error: { code: 'exception', message: 'The send did not complete; check WhatsApp before trying again' } }
  }
  const status = res.ok ? 'sent' : (res.outcome === 'failed' ? 'failed' : 'unknown')
  const row = (await db.query(
    `UPDATE wa_outbound_messages SET status = $2, provider_message_id = $3, error_code = $4, error_message = $5, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [inserted.id, status, res.ok ? res.providerMessageId : null, res.ok ? null : String(res.error?.code ?? ''), res.ok ? null : String(res.error?.message ?? '').slice(0, 300)]
  )).rows[0]

  if (status !== 'failed') {
    // Answering a conversation claims it when nobody had, and reopens it.
    await db.query(
      `UPDATE wa_conversations SET assigned_to = COALESCE(assigned_to, $2),
              assigned_by = CASE WHEN assigned_to IS NULL THEN $2 ELSE assigned_by END,
              assigned_at = CASE WHEN assigned_to IS NULL THEN NOW() ELSE assigned_at END,
              status = 'open', closed_at = NULL, closed_by = NULL, updated_at = NOW()
        WHERE id = $1`,
      [c.id, account.id]
    )
  }
  await audit(db, { actorId: account.id, action: 'whatsapp.reply', entityType: 'conversation', entityId: c.id, details: { messageId: Number(row.id), status, mode: provider.mode } })
  log?.info?.({ conversationId: Number(c.id), messageId: Number(row.id), status, mode: provider.mode }, 'WhatsApp reply from the portal')
  return { message: outboundJson(row, account), duplicate: false }
}

// A reply is written as 'pending' before the provider is called. One still
// pending after this long was cut off mid-send (a restart): it becomes
// 'unknown', which tells staff to check WhatsApp before sending again,
// instead of looking like it is still on its way.
export const PENDING_REPLY_MINUTES = 10

export async function sweepPendingReplies(db) {
  return (await db.query(
    `UPDATE wa_outbound_messages SET status = 'unknown', error_code = 'interrupted',
            error_message = 'The send did not finish; check WhatsApp before trying again', updated_at = NOW()
      WHERE status = 'pending' AND created_at < NOW() - make_interval(mins => $1)`,
    [PENDING_REPLY_MINUTES]
  )).rowCount
}

function outboundJson(row, account) {
  return {
    key: `out-${row.id}`, direction: 'out', kind: 'staff', at: row.created_at, body: row.body,
    by: account.name, status: row.status, simulated: row.simulated, error: row.error_message,
  }
}

export async function addNote(db, conversationId, body, { account }) {
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text) throw new InboxError('Write a note first')
  if (text.length > MAX_NOTE_LENGTH) throw new InboxError(`A note can be at most ${MAX_NOTE_LENGTH} characters`)
  await loadConversation(db, conversationId)
  const row = (await db.query(
    'INSERT INTO wa_conversation_notes (conversation_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at',
    [conversationId, account.id, text]
  )).rows[0]
  await audit(db, { actorId: account.id, action: 'whatsapp.note', entityType: 'conversation', entityId: conversationId, details: { noteId: Number(row.id) } })
  return { id: Number(row.id), body: row.body, at: row.created_at, author: account.name }
}

/** Accounts a conversation can be assigned to: enabled, and able to read WhatsApp. */
export async function listAssignees(db) {
  return (await accountsWith(db, 'whatsapp.view', { rows: true })).map((r) => ({ id: r.id, name: displayName(r) }))
}

export async function assign(db, conversationId, assigneeId, { account }) {
  await loadConversation(db, conversationId)
  if (assigneeId != null) {
    const ok = (await listAssignees(db)).some((a) => a.id === assigneeId)
    if (!ok) throw new InboxError('That person cannot be assigned WhatsApp conversations', 400, 'bad_assignee')
  }
  await db.query(
    `UPDATE wa_conversations SET assigned_to = $2, assigned_by = $3, assigned_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END, updated_at = NOW()
      WHERE id = $1`,
    [conversationId, assigneeId, account.id]
  )
  await audit(db, { actorId: account.id, action: 'whatsapp.assigned', entityType: 'conversation', entityId: conversationId, details: { assigneeId } })
}

export async function setStatus(db, conversationId, status, { account }) {
  if (!['open', 'closed'].includes(status)) throw new InboxError('Status must be open or closed')
  await loadConversation(db, conversationId)
  await db.query(
    `UPDATE wa_conversations SET status = $2::varchar,
            closed_at = CASE WHEN $2::varchar = 'closed' THEN NOW() ELSE NULL END,
            closed_by = CASE WHEN $2::varchar = 'closed' THEN $3::int ELSE NULL END, updated_at = NOW()
      WHERE id = $1`,
    [conversationId, status, account.id]
  )
  await audit(db, { actorId: account.id, action: `whatsapp.${status}`, entityType: 'conversation', entityId: conversationId })
}

// --- Deleting and hiding -----------------------------------------------------
//
// The firm's WhatsApp number is also used from a phone, so the portal can
// show chats that are nobody else's business (coworkers, family). Deleting
// here removes what a message said from the portal's database for every
// account; it does not touch the phone, and the client keeps what they were
// sent. Payment reminders are billing records and stay under Billing.
// Audit rows carry ids, never text or numbers.

const MESSAGE_KEY_RE = /^(in|out|rem)-([1-9]\d{0,17})$/

/** Delete one message (key as getConversation returns it: in-12, out-3). */
export async function deleteMessage(db, conversationId, key, { account }) {
  const m = MESSAGE_KEY_RE.exec(String(key ?? ''))
  if (!m) throw new InboxError('Invalid message', 400, 'bad_message')
  const [, kind, rawId] = m
  if (kind === 'rem') {
    throw new InboxError('Payment reminders are billing records and cannot be deleted here.', 409, 'reminder')
  }
  const c = await loadConversation(db, conversationId)
  const { rowCount } = kind === 'in'
    ? await db.query(
      `UPDATE whatsapp_events SET payload = '{}'::jsonb, contact_name = NULL, deleted_at = NOW()
        WHERE id = $1 AND kind = 'message' AND from_wa_id = $2 AND deleted_at IS NULL`,
      [rawId, c.wa_id]
    )
    : await db.query(
      `UPDATE wa_outbound_messages SET body = '', deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND conversation_id = $2 AND deleted_at IS NULL`,
      [rawId, c.id]
    )
  if (!rowCount) throw new InboxError('That message is not in this chat, or it was already deleted', 404, 'not_found')
  await audit(db, { actorId: account.id, action: 'whatsapp.message_deleted', entityType: 'conversation', entityId: c.id, details: { message: `${kind}-${rawId}` } })
}

/**
 * Delete a whole chat: every message the number sent, the replies sent from
 * the portal, internal notes and the assignment. With hide, the number is
 * also kept out of the portal from now on. Without it, the next message
 * from the number starts a new, empty chat.
 */
export async function deleteConversation(db, conversationId, { account, hide = false }) {
  const c = await loadConversation(db, conversationId)
  // One unit: a chat half-deleted (messages gone, number not hidden) would
  // let the coworker's next message straight back in.
  await inTransaction(db, async (tx) => {
    await tx.query(
      `UPDATE whatsapp_events SET payload = '{}'::jsonb, contact_name = NULL, deleted_at = NOW()
        WHERE kind = 'message' AND from_wa_id = $1 AND deleted_at IS NULL`,
      [c.wa_id]
    )
    if (hide) {
      await tx.query(
        'INSERT INTO wa_hidden_numbers (wa_id, hidden_by) VALUES ($1, $2) ON CONFLICT (wa_id) DO NOTHING',
        [c.wa_id, account.id]
      )
    }
    // Notes and portal replies go with the row (ON DELETE CASCADE).
    await tx.query('DELETE FROM wa_conversations WHERE id = $1', [c.id])
    await audit(tx, { actorId: account.id, action: 'whatsapp.conversation_deleted', entityType: 'conversation', entityId: c.id, details: { hidden: Boolean(hide) } })
  })
}

/**
 * Numbers kept out of the portal, newest first. source 'manual': someone hid
 * it here. source 'firm': Calls has it marked as someone from the firm, and
 * it is shown again there, by counting its calls again.
 */
export async function listHiddenNumbers(db) {
  const { rows } = await db.query(
    `SELECT h.wa_id AS phone, h.hidden_at AS at, ${NAME_SQL('u')} AS by_name, 'manual' AS source, NULL AS note
       FROM wa_hidden_numbers h LEFT JOIN admin_users u ON u.id = h.hidden_by
      WHERE NOT ${firmNumberSql('h.wa_id')}
     UNION ALL
     SELECT regexp_replace(COALESCE(NULLIF(f.number, ''), f.counterpart_key), '[^0-9]', '', 'g'), f.created_at, ${NAME_SQL('u')}, 'firm', f.note
       FROM rc_ignored_numbers f LEFT JOIN admin_users u ON u.id = f.created_by
      WHERE f.reason = 'staff_test'
      ORDER BY at DESC`
  )
  return rows.map((r) => ({
    phone: asWaId(r.phone), hiddenAt: r.at, hiddenBy: r.by_name ?? null, source: r.source, note: r.note ?? null,
  }))
}

// A number as WhatsApp writes it: digits with the country code. Ten digits
// are a US number written the way people here write them.
const asWaId = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length === 10 ? `1${digits}` : digits
}

/**
 * Hide a number someone typed, before or after it has written. When the
 * number already has a chat, nothing happens until the caller says to delete
 * it (deleteChat): the refusal names the chat, so a mistyped number is seen
 * before a client's messages are gone.
 */
export async function hideNumber(db, rawPhone, { account, deleteChat = false }) {
  const typed = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  const phone = asWaId(typed)
  if (!typed || typed.length > 40 || !/^[\d\s()+.-]+$/.test(typed) || !/^\d{8,15}$/.test(phone)) {
    throw new InboxError('Enter the whole number. Outside the United States, start with the country code.', 400, 'bad_number')
  }
  const already = (await db.query(`SELECT ${firmNumberSql('$1::text')} AS firm, ${hiddenSql('$1::text')} AS hidden`, [phone])).rows[0]
  if (already.hidden) {
    throw new InboxError(
      already.firm ? 'That number is already hidden: Calls has it marked as someone from the firm.' : 'That number is already hidden.',
      409, 'already_hidden'
    )
  }
  const chats = (await db.query(`SELECT c.id FROM wa_conversations c WHERE ${waKeySql('c.wa_id')} = ${waKeySql('$1::text')} ORDER BY c.id`, [phone])).rows
  if (chats.length && !deleteChat) {
    const chat = await getConversation(db, chats[0].id)
    const err = new InboxError('That number has a chat in the portal. Hiding the number deletes the chat.', 409, 'has_chat')
    err.details = { chat: { id: chat.id, phone: chat.phone, name: chat.clients[0]?.name || chat.profileName || null } }
    throw err
  }
  // The chat's own form of the number is the one WhatsApp reports.
  for (const c of chats) await deleteConversation(db, c.id, { account, hide: true })
  if (!chats.length) {
    await db.query('INSERT INTO wa_hidden_numbers (wa_id, hidden_by) VALUES ($1, $2) ON CONFLICT (wa_id) DO NOTHING', [phone, account.id])
  }
  await audit(db, { actorId: account.id, action: 'whatsapp.number_hidden', entityType: 'whatsapp_number', entityId: null, details: { last4: phone.slice(-4), chatDeleted: chats.length > 0 } })
  return { phone, chatDeleted: chats.length > 0 }
}

/**
 * Show a hidden number again. Its next message opens a chat; what was
 * deleted stays deleted. A number Calls marks as someone from the firm is
 * shown again there, not here.
 */
export async function unhideNumber(db, waId, { account }) {
  const phone = String(waId ?? '')
  if (!/^\d{6,20}$/.test(phone)) throw new InboxError('Invalid number', 400, 'bad_number')
  const firm = (await db.query(`SELECT ${firmNumberSql('$1::text')} AS yes`, [phone])).rows[0].yes
  if (firm) {
    throw new InboxError('Calls has this number marked as someone from the firm. To show it here again, open one of its calls in Calls and choose Count it again.', 409, 'firm_number')
  }
  const { rowCount } = await db.query('DELETE FROM wa_hidden_numbers WHERE wa_id = $1', [phone])
  if (!rowCount) throw new InboxError('That number is not hidden', 404, 'not_found')
  await audit(db, { actorId: account.id, action: 'whatsapp.number_shown', entityType: 'whatsapp_number', entityId: null, details: { last4: phone.slice(-4) } })
}

export default {
  listConversations, getConversation, sendReply, addNote, assign, setStatus, listAssignees, replyBlocker,
  deleteMessage, deleteConversation, listHiddenNumbers, hideNumber, unhideNumber,
}
