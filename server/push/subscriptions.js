// Checking and storing a browser's push subscription. Every query is scoped
// to the signed-in account; the account id never comes from the request body.

// The push services the portal's browsers use. The API POSTs to whatever
// endpoint is stored, so anything else (an internal address, a test server)
// is refused rather than becoming a way to make the API call it.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, and Edge on some builds
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows (WNS)
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/, // Firefox
  /^(web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com)$/, // Safari
]

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/

export function isPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  let u
  try { u = new URL(endpoint) } catch { return false }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false
  return PUSH_HOSTS.some((re) => re.test(u.hostname))
}

/** { endpoint, p256dh, auth } from a PushSubscription's toJSON(), or null. */
export function parseSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null
  const { endpoint, keys } = sub
  if (!isPushEndpoint(endpoint) || !keys || typeof keys !== 'object') return null
  const { p256dh, auth } = keys
  // p256dh: an uncompressed P-256 point (65 bytes); auth: 16 bytes.
  if (typeof p256dh !== 'string' || !B64URL.test(p256dh) || Buffer.from(p256dh, 'base64url').length !== 65) return null
  if (typeof auth !== 'string' || !B64URL.test(auth) || Buffer.from(auth, 'base64url').length !== 16) return null
  return { endpoint, p256dh, auth }
}

// Computers per account. Past this, registering one more drops the one
// longest without a delivery (an old browser profile, a reinstalled laptop),
// so nobody is ever refused and the list cannot grow without end.
export const MAX_DEVICES = 10

/**
 * Register this browser for the account, or refresh its keys. An endpoint
 * another account registered moves to this one: re-subscribing needs this
 * browser, so whoever is signed in on it now is who it notifies. Keeps at
 * most MAX_DEVICES per account, this one always among them.
 */
export async function saveSubscription(db, accountId, { endpoint, p256dh, auth }, userAgent) {
  const { rows } = await db.query(
    `INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       account_id = EXCLUDED.account_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, updated_at = NOW(), failures = 0, last_failure_at = NULL
     RETURNING id, created_at, (xmax = 0) AS inserted`,
    [accountId, endpoint, p256dh, auth, userAgent ? String(userAgent).slice(0, 300) : null]
  )
  await db.query(
    `DELETE FROM push_subscriptions WHERE account_id = $1 AND id IN (
       SELECT id FROM push_subscriptions WHERE account_id = $1 AND id <> $2
        ORDER BY GREATEST(last_success_at, updated_at) DESC NULLS LAST, id DESC OFFSET $3)`,
    [accountId, rows[0].id, MAX_DEVICES - 1]
  )
  return rows[0]
}

export async function findOwnSubscription(db, accountId, endpoint) {
  const { rows } = await db.query(
    'SELECT id, created_at, last_success_at, last_failure_at, failures FROM push_subscriptions WHERE account_id = $1 AND endpoint = $2',
    [accountId, endpoint]
  )
  return rows[0] || null
}

export async function removeOwnSubscription(db, accountId, endpoint) {
  const { rowCount } = await db.query('DELETE FROM push_subscriptions WHERE account_id = $1 AND endpoint = $2', [accountId, endpoint])
  return rowCount > 0
}

export async function countOwnSubscriptions(db, accountId) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE account_id = $1', [accountId])
  return rows[0].n
}
