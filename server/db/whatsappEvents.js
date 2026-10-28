// Durable record of every WhatsApp webhook event, keyed so a redelivery is a
// no-op. The UNIQUE index is the authoritative duplicate check: it holds
// across restarts and across instances, which the router's in-memory guard
// does not.
import getPool from './pool.js'

/**
 * Insert one event. Resolves true when it was new, false when the key was
 * already present (Meta redelivered it). Throws on a database error so the
 * caller can log it — never on a duplicate.
 */
export async function recordEvent(evt) {
  const result = await getPool().query(
    `INSERT INTO whatsapp_events
       (event_key, kind, wa_message_id, status, from_wa_id, contact_name, recipient_wa_id,
        message_type, phone_number_id, display_phone_number, waba_id, event_timestamp, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING id`,
    [
      evt.key, evt.kind, evt.messageId, evt.status, evt.from, evt.contactName, evt.recipient,
      evt.messageType, evt.phoneNumberId, evt.displayPhoneNumber, evt.wabaId, evt.timestamp,
      toJsonb(evt.raw),
    ]
  )
  return result.rowCount === 1
}

// Postgres JSONB cannot hold U+0000; a message body containing one would make
// the insert throw. Strip the escape rather than lose the whole event.
function toJsonb(value) {
  return JSON.stringify(value ?? {}).replace(/\\u0000/g, '')
}

export default { recordEvent }
