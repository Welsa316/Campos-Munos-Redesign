// Durable record of every WhatsApp webhook event, keyed so a redelivery is a
// no-op. The UNIQUE index is the authoritative duplicate check: it holds
// across restarts and across instances, which the router's in-memory guard
// does not.
import getPool from './pool.js'
import { hiddenSql } from '../whatsapp/hiddenSql.js'

/**
 * Insert one event. Resolves true when it was new, false when the key was
 * already present (Meta redelivered it). Throws on a database error so the
 * caller can log it — never on a duplicate.
 *
 * A new message also opens the sender's inbox conversation, in the same
 * statement, so the inbox list only reads. (History from before this is
 * backfilled by the staff schema at boot: db/staffSchema.js.)
 */
export async function recordEvent(evt) {
  // A message from a number kept out of the portal (whatsapp/hiddenSql.js:
  // one staff hid, or one Calls has marked as someone from the firm) is kept
  // only as a deleted row, so a redelivery is still recognised and nothing
  // it said is stored. It opens no conversation. Billing still sees the
  // event in memory (an opt-out still counts).
  const result = await getPool().query(
    `WITH hidden AS (
       SELECT ($2::text = 'message' AND ${hiddenSql('$5::text')}) AS yes
     ), ins AS (
       INSERT INTO whatsapp_events
         (event_key, kind, wa_message_id, status, from_wa_id, contact_name, recipient_wa_id,
          message_type, phone_number_id, display_phone_number, waba_id, event_timestamp, payload, deleted_at)
       -- Typed: in INSERT … SELECT an untyped parameter would be read as text.
       SELECT $1::text, $2::text, $3::text, $4::text, $5::text, CASE WHEN hidden.yes THEN NULL ELSE $6::text END,
              $7::text, $8::text, $9::text, $10::text, $11::text, $12::timestamptz,
              CASE WHEN hidden.yes THEN '{}'::jsonb ELSE $13::jsonb END,
              CASE WHEN hidden.yes THEN NOW() END
         FROM hidden
       ON CONFLICT (event_key) DO NOTHING
       RETURNING id, kind, from_wa_id, deleted_at
     ), conv AS (
       INSERT INTO wa_conversations (wa_id)
       SELECT from_wa_id FROM ins WHERE kind = 'message' AND from_wa_id IS NOT NULL AND deleted_at IS NULL
       ON CONFLICT (wa_id) DO NOTHING
     )
     SELECT id FROM ins`,
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
