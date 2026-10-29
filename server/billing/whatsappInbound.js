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

/**
 * The same number as Meta reports it and as staff typed it. Meta's sender
 * id can carry a mobile prefix the stored number lacks, or the reverse:
 * Mexico 521… vs 52…, Argentina 549… vs 54….
 */
export function phoneVariants(digits) {
  const d = String(digits || '').replace(/\D/g, '')
  if (!d) return []
  const out = new Set([d])
  if (/^521\d{10}$/.test(d)) out.add(`52${d.slice(3)}`)
  if (/^52\d{10}$/.test(d)) out.add(`521${d.slice(2)}`)
  if (/^549\d{10}$/.test(d)) out.add(`54${d.slice(3)}`)
  if (/^54\d{10}$/.test(d)) out.add(`549${d.slice(2)}`)
  return [...out]
}

async function handleInbound(db, evt, { log }) {
  const phone = String(evt.from || '').replace(/\D/g, '')
  if (!phone) return null
  // A number can belong to several clients (a parent's phone on file for
  // the children's cases). Consent belongs to the number: a STOP from it
  // stops messages to every client using it.
  const contacts = (await db.query('SELECT client_id FROM billing_client_contacts WHERE phone_e164 = ANY($1)', [phoneVariants(phone)])).rows
  const text = inboundText(evt.raw)
  const kind = classifyInbound(text)
  // Replies from numbers we do not know are not billing's business, except
  // an opt-out word, which a person should see in case a number on file is
  // wrong.
  if (!contacts.length && kind !== 'opt_out') return null

  const clientIds = contacts.map((c) => Number(c.client_id))
  const inserted = await db.query(
    `INSERT INTO billing_inbound_reviews (event_key, client_id, from_phone, kind, body, received_at, handled_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), CASE WHEN $4::varchar = 'opt_out' AND $7::boolean THEN NOW() ELSE NULL END)
     ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [evt.key, clientIds.length === 1 ? clientIds[0] : null, phone, kind, text.slice(0, 2000) || null, evt.timestamp, clientIds.length > 0]
  )
  if (!inserted.rowCount) return null

  if (kind === 'opt_out' && clientIds.length) {
    await db.query(
      `UPDATE billing_client_contacts SET opted_out_at = NOW(), opt_out_source = 'whatsapp_reply', updated_at = NOW() WHERE client_id = ANY($1)`,
      [clientIds]
    )
    // Including 'queued': the dispatcher re-checks consent right before
    // sending, and its own UPDATEs are guarded, so this cannot be undone.
    const cancelled = await db.query(
      `UPDATE billing_reminders SET state = 'cancelled', cancel_reason = 'opted_out', cancelled_at = NOW(), updated_at = NOW()
        WHERE client_id = ANY($1) AND action = 'whatsapp' AND state IN ('draft', 'approved')`,
      [clientIds]
    )
    await audit(db, { action: 'contact.opted_out', entityType: 'client', entityId: clientIds.join(','), details: { source: 'whatsapp_reply', clients: clientIds.length, cancelled: cancelled.rowCount } })
    log?.info?.({ clients: clientIds.length, cancelled: cancelled.rowCount }, 'Opt-out by WhatsApp reply')
  }
  // An opt-in word is recorded for staff to confirm, never applied
  // automatically: consent is recorded by a person (see contacts screen).
  return { kind, clientIds }
}

/**
 * Retry webhook events billing failed to handle (handled = stored and then
 * acted on). Safe to repeat: every handler is idempotent. Old receipts that
 * never matched a message are dropped after a week.
 */
export async function sweepUnhandled(db, { log, maxAgeDays = 7, batch = 100 } = {}) {
  const rows = (await db.query(
    `SELECT event_key, kind, wa_message_id, status, from_wa_id, payload, event_timestamp FROM whatsapp_events
      WHERE billing_processed_at IS NULL AND billing_attempts < 5
        AND received_at < NOW() - INTERVAL '1 minute' AND received_at > NOW() - ($1 || ' days')::interval
      ORDER BY received_at LIMIT $2`,
    [String(maxAgeDays), batch]
  )).rows
  let handled = 0
  for (const r of rows) {
    try {
      await handleWhatsAppEvent(db, {
        kind: r.kind, key: r.event_key, messageId: r.wa_message_id, status: r.status, from: r.from_wa_id,
        raw: r.payload, timestamp: r.event_timestamp,
      }, { log })
      await db.query('UPDATE whatsapp_events SET billing_processed_at = NOW() WHERE event_key = $1', [r.event_key])
      handled++
    } catch (err) {
      await db.query('UPDATE whatsapp_events SET billing_attempts = billing_attempts + 1 WHERE event_key = $1', [r.event_key])
      log?.warn?.({ err: err.message, key: r.event_key }, 'Billing could not handle a webhook event (will retry)')
    }
  }
  await db.query("DELETE FROM billing_early_receipts WHERE received_at < NOW() - ($1 || ' days')::interval", [String(maxAgeDays)])
  return { handled, pending: rows.length - handled }
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

export default { handleWhatsAppEvent, classifyInbound, inboundText, applyEarlyReceipts, sweepUnhandled, phoneVariants }
