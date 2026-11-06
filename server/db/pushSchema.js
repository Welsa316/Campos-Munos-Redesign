// Desktop notifications (Web Push, server/push/). Additive and safe to run on
// every deploy.
//
// A subscription is one browser on one computer that a staff member turned
// notifications on in. The endpoint is the push service's address for that
// browser (Chrome and Edge: Google's or Microsoft's), unique across accounts:
// a browser that re-subscribes while someone else is signed in moves to them.
export const PUSH_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    -- Consecutive failures; back to 0 on the next delivery the service accepts.
    failures INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account ON push_subscriptions(account_id);

  -- One row per event per device, written before the send: the UNIQUE pair is
  -- what stops a retried or overlapping run sending the same reminder to the
  -- same computer twice. 'sending' only while the push service is being
  -- called. 'sent' means the push service accepted it, not that anyone saw it.
  CREATE TABLE IF NOT EXISTS push_deliveries (
    id BIGSERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    subscription_id BIGINT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
    event_key TEXT NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'expired', 'skipped')),
    http_status INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_key, subscription_id)
  );
  CREATE INDEX IF NOT EXISTS idx_push_deliveries_account ON push_deliveries(account_id, created_at DESC);

  -- Every notification meant for an account, whether or not it turned on
  -- browser notifications: the desktop app reads these (GET
  -- /api/notifications/feed), since it cannot receive browser push. One per
  -- (account, event), so a repeated event is never listed twice.
  CREATE TABLE IF NOT EXISTS account_notifications (
    id BIGSERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '/',
    tag TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, event_key)
  );
  CREATE INDEX IF NOT EXISTS idx_account_notifications_feed ON account_notifications (account_id, id);
`

export async function applyPushSchema(db) {
  await db.query(PUSH_SCHEMA_SQL)
}
