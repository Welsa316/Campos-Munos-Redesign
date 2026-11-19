// Setting and clearing entry colours (palette.js). routes/colors.js is the
// HTTP shape; the colours themselves are read with the data each page
// already loads (the call log, the leads list, reminders).
//
// Who may colour what (capabilities, never role names; the same people who
// can work the entry):
//   caller    calls.exclude
//   lead      crm.view and (crm.manage or calls.exclude)
//   reminder  the rule for changing that reminder (reminders.js canActOnKind)
//
// A caller is named by one of their calls; the server reads that call's
// number key. The portal never sends a phone key, so nobody can colour a
// number they have no call from.
import { ENTRY_COLORS, isEntryColor, isEntryKind } from './palette.js'
import { canActOnKind } from '../reminders/reminders.js'

export class ColorError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'ColorError'
    this.code = code
    this.status = status
  }
}

export function canColorKind(caps, kind) {
  if (kind === 'caller') return caps.has('calls.exclude')
  if (kind === 'lead') return canActOnKind(caps, 'submission')
  // A reminder's own rule depends on what it is about; checked once it is read.
  if (kind === 'reminder') return canActOnKind(caps, 'call') || canActOnKind(caps, 'submission')
  return false
}

const forbidden = () => new ColorError('forbidden', 'Your account cannot change the color of this', 403)
const notFound = (what) => new ColorError('not_found', `${what} not found`, 404)

/** The table key for { kind, id }, after checking the entry exists and the account may colour it. */
async function keyFor(db, { kind, id, caps }) {
  if (kind === 'caller') {
    const r = (await db.query('SELECT counterpart_key FROM rc_calls WHERE id = $1', [id])).rows[0]
    if (!r) throw notFound('Call')
    if (!r.counterpart_key) throw new ColorError('no_number', 'This call has no number, so its caller cannot be given a color')
    return r.counterpart_key
  }
  if (kind === 'lead') {
    if (!(await db.query('SELECT 1 FROM submissions WHERE id = $1', [id])).rowCount) throw notFound('Lead')
    return String(id)
  }
  const r = (await db.query('SELECT target_kind FROM follow_up_reminders WHERE id = $1', [id])).rows[0]
  if (!r) throw notFound('Reminder')
  if (!canActOnKind(caps, r.target_kind)) throw forbidden()
  return String(id)
}

/**
 * { kind, id, color } from a request body → the colour now stored (null
 * when cleared). id is the call (any call from the caller), the lead or the
 * reminder.
 */
export async function setEntryColor(db, { kind, id, color, accountId, caps }) {
  if (!isEntryKind(kind)) throw new ColorError('invalid_kind', 'Choose a caller, a lead or a reminder')
  const n = Number(id)
  if (typeof id === 'boolean' || !Number.isSafeInteger(n) || n < 1) throw new ColorError('invalid_id', 'Choose what to colour')
  if (color !== null && !isEntryColor(color)) {
    throw new ColorError('invalid_color', `Choose one of: ${ENTRY_COLORS.join(', ')}, or no color`)
  }
  if (!canColorKind(caps, kind)) throw forbidden()
  if (kind === 'lead' && n > 2147483647) throw notFound('Lead')
  const key = await keyFor(db, { kind, id: n, caps })
  await db.query(
    `INSERT INTO entry_colors (kind, key, color, set_by, updated_at) VALUES ($1, $2, $3, $4, clock_timestamp())
     ON CONFLICT (kind, key) DO UPDATE SET color = EXCLUDED.color, set_by = EXCLUDED.set_by, updated_at = clock_timestamp()`,
    [kind, key, color, accountId]
  )
  return { kind, id: n, color }
}
