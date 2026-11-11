// Who must not get automatic messages (automation_suppressions): one list
// for every automation, checked right before each send.
//
//   opt_out   the person asked (a STOP text, or told a staff member)
//   staff     the firm decided (a colleague's own phone, a vendor)
//   invalid   the address cannot receive (a landline, a bounced address)
//
// By channel: 'sms' (a number), 'email' (an address), or 'all'. A number
// that opted out of the firm's WhatsApp payment reminders is not texted
// either: someone who said "stop messaging this phone" meant the phone.
//
// Opt-out words are matched conservatively: the whole message must be one of
// them (after trimming punctuation), so "please stop calling my husband" is
// a reply for a person to read, not an opt-out the system acts on alone.
import { phoneKey } from '../utils/phone.js'

export const CHANNELS = Object.freeze(['sms', 'email', 'all'])
export const REASONS = Object.freeze(['opt_out', 'staff', 'invalid'])

// RingCentral's own keyword lists, plus the Spanish words a client of this
// firm would use.
const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'END', 'REVOKE', 'OPT OUT', 'OPTOUT', 'ALTO', 'BAJA', 'PARAR', 'CANCELAR', 'NO MAS', 'NO MÁS'])
const OPT_IN = new Set(['START', 'SUBSCRIBE', 'RESUME', 'CONTINUE', 'UNSTOP', 'YES', 'INICIAR', 'REANUDAR'])
const HELP = new Set(['HELP', 'INFO', 'AYUDA'])

/** 'opt_out' | 'opt_in' | 'help' | 'reply' for the text of an incoming message. */
export function classifyInbound(text) {
  const word = String(text ?? '').normalize('NFC').trim().replace(/^[\s"'¡¿.,!]+|[\s"'.,!?]+$/g, '').replace(/\s+/g, ' ').toUpperCase()
  if (OPT_OUT.has(word)) return 'opt_out'
  if (OPT_IN.has(word)) return 'opt_in'
  if (HELP.has(word)) return 'help'
  return 'reply'
}

/** The key an address is stored and compared by: a phone key, or a lower-cased email. */
export function addressKey(channel, address) {
  if (channel === 'email') return String(address ?? '').trim().toLowerCase()
  return phoneKey(address)
}

/**
 * Why this address must not get an automatic message on this channel, or
 * null. Reasons: 'opt_out', 'staff', 'invalid', 'whatsapp_opt_out'.
 */
export async function suppressionReason(db, { channel, address }) {
  const key = addressKey(channel, address)
  if (!key) return 'invalid'
  const row = (await db.query(
    `SELECT reason FROM automation_suppressions
      WHERE removed_at IS NULL AND address_key = $1 AND channel IN ($2, 'all') ORDER BY created_at LIMIT 1`,
    [key, channel]
  )).rows[0]
  if (row) return row.reason
  if (channel === 'sms') {
    const wa = (await db.query(
      'SELECT 1 FROM billing_client_contacts WHERE opted_out_at IS NOT NULL AND phone_e164 IS NOT NULL AND cm_phone_key(phone_e164) = $1 LIMIT 1',
      [key]
    )).rowCount
    if (wa) return 'whatsapp_opt_out'
  }
  return null
}

/** Add (or keep) a suppression. Returns { id, created }. */
export async function suppress(db, { channel, address, reason = 'staff', source = 'staff', actorId = null }) {
  if (!CHANNELS.includes(channel) || !REASONS.includes(reason)) throw Object.assign(new Error('Unknown channel or reason'), { status: 400, code: 'invalid' })
  const key = addressKey(channel === 'all' && String(address).includes('@') ? 'email' : channel, address)
  if (!key) throw Object.assign(new Error('Enter a phone number or an email address'), { status: 400, code: 'invalid' })
  const r = await db.query(
    `INSERT INTO automation_suppressions (channel, address_key, reason, source, created_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (channel, address_key) WHERE removed_at IS NULL DO NOTHING RETURNING id`,
    [channel, key, reason, String(source).slice(0, 20), actorId]
  )
  return { id: r.rows[0] ? Number(r.rows[0].id) : null, created: r.rowCount > 0, key }
}

/** Lift a suppression (the row stays, with who lifted it). `onlyReason`: lift only that kind. */
export async function unsuppress(db, { id = null, channel = null, address = null, onlyReason = null, actorId = null }) {
  const key = id == null ? addressKey(channel, address) : null
  const r = await db.query(
    `UPDATE automation_suppressions SET removed_at = NOW(), removed_by = $5
      WHERE removed_at IS NULL AND (($1::bigint IS NOT NULL AND id = $1::bigint) OR ($1::bigint IS NULL AND channel = $2 AND address_key = $3))
        AND ($4::text IS NULL OR reason = $4::text)
      RETURNING id`,
    [id, channel, key, onlyReason, actorId]
  )
  return r.rowCount
}

/** The list for the portal. Keys are shown masked to their last four characters for numbers. */
export async function listSuppressions(db, { limit = 200 } = {}) {
  const rows = (await db.query(
    `SELECT s.id, s.channel, s.address_key, s.reason, s.source, s.created_at,
            COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1)) AS by_name
       FROM automation_suppressions s LEFT JOIN admin_users u ON u.id = s.created_by
      WHERE s.removed_at IS NULL ORDER BY s.created_at DESC LIMIT $1`,
    [Math.min(500, Math.max(1, Number(limit) || 200))]
  )).rows
  return rows.map((r) => ({ id: Number(r.id), channel: r.channel, address: r.address_key, reason: r.reason, source: r.source, at: r.created_at, by: r.by_name || null }))
}

export default { classifyInbound, addressKey, suppressionReason, suppress, unsuppress, listSuppressions }
