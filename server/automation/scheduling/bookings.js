// Consultation bookings: finding the ones that belong to a lead.
//
// The firm keeps scheduling where it already is. A lead gets the firm's own
// booking link (a Google Calendar appointment schedule) in the automatic
// messages; the person picks a time on Google's page, which creates the
// event on the firm's calendar. The portal only READS that calendar and
// links an event to a lead when a guest's email address is exactly a lead's.
//
// The scheduling provider (scheduling/google.js, or a fake in tests) is:
//   kind, capabilities { detectBookings, createBooking, availability, cancel }
//   describe()                                → { kind, configured, problems }
//   listChanges({ syncToken, timeMin })       → { events, nextSyncToken, full }
//     events: [{ id, cancelled, startsAt, endsAt, guestEmails, updatedAt }]
// A provider that could offer times and create the booking itself would add
// getAvailability / createBooking and set those capabilities; nothing here
// assumes them.
//
// What is kept: only events matched to a lead, and only their time and
// state (consultation_bookings). The calendar's other events are not copied.
//
// Matching is by email alone, on purpose: it is the one identifier both
// sides have, and an exact address is not a guess. A booking made with a
// different address than the form's is not matched; staff set Scheduled by
// hand, as they do today.
import { getState, noteSuccess, noteFailure, dueToRun } from '../state.js'
import { recordSystemEvent } from '../events.js'

export const SYNC_EVERY_MS = 5 * 60 * 1000
const STATE_KEY = 'calendar'
const LEAD_WINDOW_DAYS = 120

/** The lead an event's guest is: the newest open lead with that address, written before the event starts. */
async function leadFor(db, emails, startsAt) {
  if (!emails.length) return null
  return (await db.query(
    `SELECT id FROM submissions
      WHERE LOWER(email) = ANY($1::text[]) AND NOT is_archived AND COALESCE(spam_state, '') <> 'spam'
        AND created_at > NOW() - make_interval(days => $2::int)
        AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
      ORDER BY created_at DESC LIMIT 1`,
    [emails, LEAD_WINDOW_DAYS, startsAt]
  )).rows[0] || null
}

/** Apply one calendar event. Returns 'booked' | 'cancelled' | null (nothing of ours). */
export async function applyEvent(db, provider, e, { log = null } = {}) {
  if (e.cancelled) {
    const r = await db.query(
      "UPDATE consultation_bookings SET status = 'cancelled', updated_at = NOW() WHERE provider = $1 AND external_id = $2 AND status = 'booked' RETURNING submission_id",
      [provider.kind, e.id]
    )
    if (!r.rowCount) return null
    await recordSystemEvent(db, { action: 'automation.booking_cancelled', entityType: 'lead', entityId: r.rows[0].submission_id, details: { provider: provider.kind }, log })
    return 'cancelled'
  }
  if (!e.startsAt) return null
  const lead = await leadFor(db, e.guestEmails, e.startsAt)
  if (!lead) {
    // An event we linked before whose guest was removed is left as it was:
    // only a cancellation unbooks.
    await db.query('UPDATE consultation_bookings SET starts_at = $3, ends_at = $4, external_updated_at = $5, updated_at = NOW() WHERE provider = $1 AND external_id = $2', [provider.kind, e.id, e.startsAt, e.endsAt, e.updatedAt])
    return null
  }
  const r = await db.query(
    `INSERT INTO consultation_bookings (provider, external_id, submission_id, starts_at, ends_at, status, external_updated_at)
     VALUES ($1, $2, $3, $4, $5, 'booked', $6)
     ON CONFLICT (provider, external_id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
       status = 'booked', external_updated_at = EXCLUDED.external_updated_at, updated_at = NOW()
     RETURNING (xmax = 0) AS created, submission_id`,
    [provider.kind, e.id, lead.id, e.startsAt, e.endsAt, e.updatedAt]
  )
  if (r.rows[0].created) {
    await recordSystemEvent(db, { action: 'automation.booking_detected', entityType: 'lead', entityId: r.rows[0].submission_id, details: { provider: provider.kind, match: 'attendee_email' }, log })
    return 'booked'
  }
  return null
}

/**
 * Read what changed on the calendar and apply it. Returns
 * { events, booked, cancelled, full } or { skipped }.
 */
export async function syncBookings(db, provider, { now = new Date(), force = false, log = null } = {}) {
  if (!provider?.capabilities?.detectBookings) return { skipped: 'not_supported' }
  const state = await getState(db, STATE_KEY)
  if (!force && !dueToRun(state, now, SYNC_EVERY_MS)) return { skipped: 'not_due' }
  let syncToken = state?.details?.syncToken || null
  let changes
  try {
    try {
      changes = await provider.listChanges(syncToken ? { syncToken } : { timeMin: new Date(now.getTime() - 24 * 60 * 60 * 1000) })
    } catch (err) {
      if (err?.code !== 'sync_token_invalid') throw err
      // Google asked for a fresh start.
      syncToken = null
      changes = await provider.listChanges({ timeMin: new Date(now.getTime() - 24 * 60 * 60 * 1000) })
    }
  } catch (err) {
    await noteFailure(db, STATE_KEY, err?.code || err?.name || 'error', { lastRunAt: now.toISOString() })
    throw err
  }
  const out = { events: changes.events.length, booked: 0, cancelled: 0, full: Boolean(changes.full) }
  for (const e of changes.events) {
    const what = await applyEvent(db, provider, e, { log })
    if (what) out[what]++
  }
  await noteSuccess(db, STATE_KEY, { syncToken: changes.nextSyncToken || syncToken || null, events: out.events, lastRunAt: now.toISOString() })
  return out
}

/** A lead's bookings, soonest first, for the lead's page. */
export async function bookingsFor(db, submissionId) {
  const rows = (await db.query(
    'SELECT id, provider, starts_at, ends_at, status, created_at FROM consultation_bookings WHERE submission_id = $1 ORDER BY starts_at DESC NULLS LAST LIMIT 10',
    [submissionId]
  )).rows
  return rows.map((b) => ({ id: Number(b.id), provider: b.provider, startsAt: b.starts_at, endsAt: b.ends_at, status: b.status, foundAt: b.created_at }))
}

export default { syncBookings, applyEvent, bookingsFor }
