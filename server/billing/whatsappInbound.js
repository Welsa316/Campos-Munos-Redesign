// What a WhatsApp webhook event means for billing. Called once per NEW event
// (server/routes/whatsapp.js dedupes first), for real Meta deliveries and for
// the mock provider's simulated receipts alike.
//
//   status events  → advance billing_messages and the reminder, forward only
//   inbound text   → from a known client: a reply for staff to review; a bare
//                    STOP/BAJA-style message records the opt-out and cancels
//                    that client's pending reminders.
// Messages from numbers we have no billing contact for are ignored here (the
// webhook still stores them).
import { normalizeName } from './matching.js'
import { audit } from './audit.js'

const STATUS_RANK = { pending: 0, unknown: 0, sent: 1, delivered: 2, read: 3 }

// Whole-message match only, after removing accents and punctuation, so
// "no puedo pagar" or "alto el costo" never opt anyone out.
export const OPT_OUT_WORDS = new Set(['stop', 'unsubscribe', 'baja', 'darme de baja', 'cancelar', 'alto', 'parar', 'detener', 'no mas', 'no mas mensajes'])
export const OPT_IN_WORDS = new Set(['start', 'alta', 'suscribir', 'si'])

export function inboundText(raw) {
  if (!raw) return ''
  return raw.text?.body ?? raw.button?.text ?? raw.interactive?.button_reply?.title ?? ''
}

export function classifyInbound(text) {
  const t = normalizeName(text)
  if (OPT_OUT_WORDS.has(t)) return 'opt_out'
  if (OPT_IN_WORDS.has(t)) return 'opt_in'
  return 'reply'
}

export async function handleWhatsAppEvent(db, evt, { log } = {}) {
  if (evt.kind === 'status') return handleStatus(db, evt, { log })
  if (evt.kind === 'message') return handleInbound(db, evt, { log })
  return null
}

async function handleStatus(db, evt) {
  const status = evt.status
  if (!['sent', 'delivered', 'read', 'failed'].includes(status)) return null
  const msg = (await db.query('SELECT id, reminder_id, status FROM billing_messages WHERE provider_message_id = $1', [evt.messageId])).rows[0]
  if (!msg) {
    // Possibly ours, just faster than our own write: park it.
    await db.query(
      `INSERT INTO billing_early_receipts (event_key, provider_message_id, status, raw) VALUES ($1, $2, $3, $4) ON CONFLICT (event_key) DO NOTHING`,
      [evt.key || `status:${evt.messageId}:${status}`, evt.messageId, status, JSON.stringify(evt.raw || {})]
    )
    return { parked: true }
  }

  const forward = status === 'failed'
    ? ['pending', 'unknown', 'sent'].includes(msg.status)
    : STATUS_RANK[status] > (STATUS_RANK[msg.status] ?? 99)
  if (!forward) return { ignored: 'not_forward' }

  const errorCode = status === 'failed' ? String(evt.raw?.errors?.[0]?.code ?? 'failed') : null
  await db.query(
    'UPDATE billing_messages SET status = $2, error_code = COALESCE($3, error_code), updated_at = NOW() WHERE id = $1',
    [msg.id, status, errorCode]
  )
  if (msg.reminder_id) {
    const col = { sent: 'sent_at', delivered: 'delivered_at', read: 'read_at', failed: null }[status]
    await db.query(
      `UPDATE billing_reminders SET state = $2, ${col ? `${col} = COALESCE(${col}, NOW()),` : ''}
              last_error = CASE WHEN $2::varchar = 'failed' THEN $3 ELSE last_error END,
              last_error_retryable = CASE WHEN $2::varchar = 'failed' THEN FALSE ELSE last_error_retryable END,
              updated_at = NOW()
        WHERE id = $1 AND state IN ('queued', 'sent', 'delivered', 'unknown')`,
      [msg.reminder_id, status, errorCode ? `Delivery failed (${errorCode})` : null]
    )
  }
  return { message: Number(msg.id), status }
}

async function handleInbound(db, evt, { log }) {
  const phone = String(evt.from || '').replace(/\D/g, '')
  if (!phone) return null
  const contact = (await db.query('SELECT client_id, opted_out_at FROM billing_client_contacts WHERE phone_e164 = $1', [phone])).rows[0]
  if (!contact) return null

  const kind = classifyInbound(inboundText(evt.raw))
  const inserted = await db.query(
    `INSERT INTO billing_inbound_reviews (event_key, client_id, from_phone, kind, body, received_at, handled_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), CASE WHEN $4::varchar = 'opt_out' THEN NOW() ELSE NULL END)
     ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [evt.key, contact.client_id, phone, kind, inboundText(evt.raw).slice(0, 2000) || null, evt.timestamp]
  )
  if (!inserted.rowCount) return null

  if (kind === 'opt_out') {
    await db.query(
      `UPDATE billing_client_contacts SET opted_out_at = NOW(), opt_out_source = 'whatsapp_reply', updated_at = NOW() WHERE client_id = $1`,
      [contact.client_id]
    )
    const cancelled = await db.query(
      `UPDATE billing_reminders SET state = 'cancelled', cancel_reason = 'opted_out', cancelled_at = NOW(), updated_at = NOW()
        WHERE client_id = $1 AND state IN ('draft', 'approved', 'queued')`,
      [contact.client_id]
    )
    await audit(db, { action: 'contact.opted_out', entityType: 'client', entityId: contact.client_id, details: { source: 'whatsapp_reply', cancelled: cancelled.rowCount } })
    log?.info?.({ clientId: Number(contact.client_id), cancelled: cancelled.rowCount }, 'Client opted out by WhatsApp reply')
  }
  // An opt-in word is recorded for staff to confirm, never applied
  // automatically: consent is recorded by a person (see contacts screen).
  return { kind, clientId: Number(contact.client_id) }
}

/** Apply receipts that arrived before the message id was stored. */
export async function applyEarlyReceipts(db, providerMessageId) {
  const rows = (await db.query(
    'DELETE FROM billing_early_receipts WHERE provider_message_id = $1 RETURNING event_key, status, raw',
    [providerMessageId]
  )).rows
  const order = { sent: 1, delivered: 2, read: 3, failed: 4 }
  rows.sort((a, b) => order[a.status] - order[b.status])
  for (const r of rows) {
    await handleStatus(db, { kind: 'status', key: r.event_key, messageId: providerMessageId, status: r.status, raw: r.raw })
  }
  return rows.length
}

export default { handleWhatsAppEvent, classifyInbound, inboundText, applyEarlyReceipts }
