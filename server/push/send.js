// Sending a desktop notification to one staff account's computers.
//
// The callback reminder worker (reminders/worker.js) calls it once per
// reminder that falls due, the missed-call and website-lead alerts once per
// account, and the Test button for one computer:
//
//   await sendPush(db, {
//     accountId,                          // the admin_users id it is for
//     eventKey: `callback-reminder:${reminderId}`,  // stable per event
//     ...CALLBACK_REMINDER,               // title and body, generic on purpose
//     url: '/calls',                      // where clicking it opens, in the portal
//     tag: `callback-reminder:${reminderId}`,
//   })
//
// Payloads travel through Google's, Microsoft's, Mozilla's or Apple's push
// service and are shown on a screen others may see, so they never carry a
// client's name, number, case or notes: only the generic text above and a
// portal path. The portal shows the detail once someone signs in.
//
// Each (eventKey, device) is recorded before the send (push_deliveries), so
// running the worker twice, or two instances at once, never sends the same
// reminder to the same computer twice. Only a 'failed' row is tried again
// when the same event comes round; sent, expired, skipped and one left
// 'sending' by a crash are final (at most once, never twice). A device the push service reports gone
// (404 or 410) is removed. 'sent' means the push service accepted it: whether
// the notification was shown depends on the browser and the operating system.
import webpush from 'web-push'
import { pushConfig } from './config.js'
import { recordNotification } from './feed.js'

// How long the push service keeps a notification for a computer that is off,
// or whose browser is closed, before dropping it: long enough that a reminder
// or a website message sent overnight still shows when the browser starts in
// the morning. (The test notification keeps its own few minutes.)
export const PUSH_TTL_SECONDS = 24 * 60 * 60

export const CALLBACK_REMINDER = Object.freeze({
  title: 'Callback reminder',
  body: 'You have a scheduled follow-up ready to review.',
})

export const TEST_NOTIFICATION = Object.freeze({
  title: 'Test notification',
  body: 'Desktop notifications are working on this computer.',
})

// A test is for checking a computer works, not for sending many: five in a
// quarter of an hour per account, for browser push and the desktop feed alike.
export const TEST_LIMIT = (name) => ({
  name, windowMs: 15 * 60 * 1000, max: 5,
  error: 'Too many test notifications. Wait a few minutes and try again.', code: 'too_many_tests',
})

// A path inside the portal ('/calls', '/whatsapp?x=1'); anything else
// (another origin, '//host', a backslash trick, a script URL) becomes '/'.
// The service worker checks again before opening anything.
export function portalPath(url) {
  if (typeof url !== 'string' || url.length > 300) return '/'
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(url)) return '/'
  return url
}

const short = (v, n) => String(v ?? '').slice(0, n)

/**
 * What a notification may carry, cut to size: the same for browser push
 * and the desktop app's feed (push/feed.js).
 */
export function notificationFields({ title, body, url = '/', tag = null, eventKey = null }) {
  const t = tag || eventKey
  return { title: short(title, 120), body: short(body, 240), url: portalPath(url), tag: t ? short(t, 120) : null }
}

/**
 * Send one event to every computer the account turned notifications on in
 * (or to one of them, with subscriptionId).
 *
 * Returns { status, devices: [{ subscriptionId, outcome, httpStatus }] }:
 *   status   'done' | 'not_configured' | 'no_account' | 'account_disabled' | 'no_devices'
 *   outcome  'sent' (accepted by the push service) | 'already_sent' |
 *            'expired' (device removed) | 'failed' | 'skipped' (account disabled)
 */
export async function sendPush(db, { accountId, eventKey, title, body, url = '/', tag, subscriptionId = null, ttl = PUSH_TTL_SECONDS } = {}, { env = process.env, transport = webpush } = {}) {
  if (!Number.isInteger(accountId) || accountId < 1) throw new TypeError('sendPush: accountId must be an admin_users id')
  if (typeof eventKey !== 'string' || !eventKey || eventKey.length > 200) throw new TypeError('sendPush: eventKey must be a short string')
  if (typeof title !== 'string' || !title || typeof body !== 'string' || !body) throw new TypeError('sendPush: title and body are required')

  const account = (await db.query('SELECT id, disabled_at FROM admin_users WHERE id = $1', [accountId])).rows[0]
  if (!account) return { status: 'no_account', devices: [] }

  // The desktop app's copy (push/feed.js), kept whether or not browser push
  // is set up or this account turned it on. Never for a disabled account.
  if (!account.disabled_at && !subscriptionId) await recordNotification(db, { accountId, eventKey, title, body, url, tag })

  const cfg = pushConfig(env)
  if (!cfg.configured) return { status: 'not_configured', devices: [] }

  const subs = (await db.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
      WHERE account_id = $1 AND ($2::bigint IS NULL OR id = $2) ORDER BY id`,
    [accountId, subscriptionId]
  )).rows
  if (!subs.length) return { status: 'no_devices', devices: [] }

  const claim = (subId, status) => db.query(
    `INSERT INTO push_deliveries (account_id, subscription_id, event_key, status) VALUES ($1, $2, $3, $4)
     ON CONFLICT (event_key, subscription_id) DO UPDATE SET status = EXCLUDED.status, http_status = NULL, error = NULL, created_at = NOW()
       WHERE push_deliveries.status = 'failed' AND EXCLUDED.status = 'sending'
     RETURNING id`,
    [accountId, subId, eventKey, status]
  )

  // A disabled account gets nothing; the rows say why it was not sent.
  if (account.disabled_at) {
    const devices = []
    for (const s of subs) {
      const r = await claim(s.id, 'skipped')
      devices.push({ subscriptionId: s.id, outcome: r.rowCount ? 'skipped' : 'already_sent', httpStatus: null })
    }
    return { status: 'account_disabled', devices }
  }

  const payload = JSON.stringify(notificationFields({ title, body, url, tag, eventKey }))

  const devices = []
  for (const s of subs) {
    const claimed = await claim(s.id, 'sending')
    if (!claimed.rowCount) {
      devices.push({ subscriptionId: s.id, outcome: 'already_sent', httpStatus: null })
      continue
    }
    const deliveryId = claimed.rows[0].id
    try {
      const res = await transport.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { vapidDetails: cfg.vapidDetails, TTL: ttl, urgency: 'normal', timeout: 10000 }
      )
      const httpStatus = Number(res?.statusCode) || null
      await db.query("UPDATE push_deliveries SET status = 'sent', http_status = $2 WHERE id = $1", [deliveryId, httpStatus])
      await db.query('UPDATE push_subscriptions SET last_success_at = NOW(), failures = 0 WHERE id = $1', [s.id])
      devices.push({ subscriptionId: s.id, outcome: 'sent', httpStatus })
    } catch (err) {
      const httpStatus = Number(err?.statusCode) || null
      // The push service's own words, short; never the endpoint or keys.
      const error = short(err?.body || err?.message || err?.name || 'send failed', 200)
      if (httpStatus === 404 || httpStatus === 410) {
        await db.query("UPDATE push_deliveries SET status = 'expired', http_status = $2, error = $3 WHERE id = $1", [deliveryId, httpStatus, error])
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id])
        devices.push({ subscriptionId: s.id, outcome: 'expired', httpStatus })
      } else {
        await db.query("UPDATE push_deliveries SET status = 'failed', http_status = $2, error = $3 WHERE id = $1", [deliveryId, httpStatus, error])
        await db.query('UPDATE push_subscriptions SET last_failure_at = NOW(), failures = failures + 1 WHERE id = $1', [s.id])
        devices.push({ subscriptionId: s.id, outcome: 'failed', httpStatus })
      }
    }
  }
  return { status: 'done', devices }
}
