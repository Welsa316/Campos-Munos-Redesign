// The administrator's test channel (server/testChannel/). Additive and safe
// to run on every deploy.
//
// Test forms live in their own tables, not in submissions with a flag: every
// query that reads leads (the inbox, unread badge, CSV export, contacts,
// call matching, Home) would otherwise need a filter, and the one that
// forgot it would count a test as a lead. Nothing outside the test channel
// reads these tables.
export const TEST_CHANNEL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS test_submissions (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    source VARCHAR(20) NOT NULL DEFAULT 'contact' CHECK (source IN ('contact', 'chat')),
    consultation_type VARCHAR(50) NOT NULL DEFAULT 'other',
    location VARCHAR(255) NOT NULL DEFAULT '',
    chat_token VARCHAR(64),
    -- The administrator whose test link sent it.
    sent_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_test_submissions_created ON test_submissions(created_at DESC);

  CREATE TABLE IF NOT EXISTS test_chat_messages (
    id SERIAL PRIMARY KEY,
    test_submission_id INTEGER NOT NULL REFERENCES test_submissions(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_test_chat_messages_submission ON test_chat_messages(test_submission_id, sent_at);
`

export async function applyTestChannelSchema(db) {
  await db.query(TEST_CHANNEL_SCHEMA_SQL)
}
