// The notifications meant for each account, as a feed the desktop app reads
// (it cannot receive browser push). Same generic text as the push payloads.
import { portalPath } from './send.js'

const FEED_PAGE = 50
const KEEP_DAYS = 30

export async function recordNotification(db, { accountId, eventKey, title, body, url = '/', tag = null }) {
  const r = await db.query(
    `INSERT INTO account_notifications (account_id, event_key, title, body, url, tag)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (account_id, event_key) DO NOTHING RETURNING id`,
    [accountId, eventKey, String(title).slice(0, 120), String(body).slice(0, 240), portalPath(url), tag ? String(tag).slice(0, 120) : null]
  )
  return r.rowCount ? Number(r.rows[0].id) : null
}

/**
 * Notifications after `after` (an id), oldest first. Without `after`, none:
 * just the cursor, so a desktop app starting up never replays history.
 */
export async function feedFor(db, { accountId, after = null }) {
  if (after == null) {
    const r = (await db.query('SELECT COALESCE(MAX(id), 0)::bigint AS id FROM account_notifications WHERE account_id = $1', [accountId])).rows[0]
    return { items: [], cursor: String(r.id) }
  }
  const rows = (await db.query(
    `SELECT id, title, body, url, tag, created_at FROM account_notifications
      WHERE account_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
    [accountId, after, FEED_PAGE]
  )).rows
  const items = rows.map((r) => ({ id: String(r.id), title: r.title, body: r.body, url: r.url, tag: r.tag, createdAt: r.created_at }))
  return { items, cursor: items.length ? items[items.length - 1].id : String(after) }
}

/** Old notifications prove nothing; keep a month. */
export const purgeOldNotifications = (db) => db.query(`DELETE FROM account_notifications WHERE created_at < NOW() - INTERVAL '${KEEP_DAYS} days'`)
