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

  -- Test automation mode (testChannel/automation.js): the lead automation
  -- rehearsed on a test form. Everything it does is written here and only
  -- here; none of these tables is read by the inbox, the automation worker,
  -- the activity log or anything a staff member works from.
  ALTER TABLE test_submissions ADD COLUMN IF NOT EXISTS language VARCHAR(5);
  ALTER TABLE test_submissions ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT FALSE;
  -- 'portal': a test started from the Test channel page itself, not the website.
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_submissions_source_check' AND pg_get_constraintdef(oid) LIKE '%portal%') THEN
      ALTER TABLE test_submissions DROP CONSTRAINT IF EXISTS test_submissions_source_check;
      ALTER TABLE test_submissions ADD CONSTRAINT test_submissions_source_check CHECK (source IN ('contact', 'chat', 'portal'));
    END IF;
  END $$;

  -- One rehearsal per test form. lead_status is the test's own pretend
  -- status; no lead's status is ever read or written.
  CREATE TABLE IF NOT EXISTS test_automation_runs (
    id SERIAL PRIMARY KEY,
    test_submission_id INTEGER NOT NULL UNIQUE REFERENCES test_submissions(id) ON DELETE CASCADE,
    started_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    timing VARCHAR(20) NOT NULL CHECK (timing IN ('accelerated', 'production')),
    -- Really email the acknowledgment to the test's own address (else it is only shown).
    send_email BOOLEAN NOT NULL DEFAULT FALSE,
    -- Show the escalation notice to the administrator who started the test, and nobody else.
    notify_starter BOOLEAN NOT NULL DEFAULT FALSE,
    lead_status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'no_response', 'scheduled', 'closed')),
    status_reason VARCHAR(60),
    escalation_level SMALLINT NOT NULL DEFAULT 0,
    replied_at TIMESTAMPTZ,
    booked_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS test_automation_steps (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES test_automation_runs(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    due_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'skipped', 'cancelled', 'failed')),
    outcome VARCHAR(60),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    UNIQUE (run_id, type)
  );
  CREATE INDEX IF NOT EXISTS idx_test_automation_steps_due ON test_automation_steps(due_at) WHERE state = 'pending';

  -- The test-only history: every step run, every message sent or only
  -- shown, every button pressed. run_id is empty for what outlives a test
  -- (a reset, a removed test).
  CREATE TABLE IF NOT EXISTS test_automation_events (
    id BIGSERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES test_automation_runs(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('started', 'sent', 'simulated', 'skipped', 'cancelled', 'failed', 'status', 'action', 'reset')),
    step VARCHAR(40),
    channel VARCHAR(10),
    recipient VARCHAR(255),
    subject TEXT,
    body TEXT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_test_automation_events_run ON test_automation_events(run_id, id);

  -- What an administrator chose for their tests, and the addresses they
  -- confirmed a real email may go to even though a lead also has them.
  CREATE TABLE IF NOT EXISTS test_automation_prefs (
    account_id INTEGER PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
    auto_start BOOLEAN NOT NULL DEFAULT FALSE,
    timing VARCHAR(20) NOT NULL DEFAULT 'accelerated' CHECK (timing IN ('accelerated', 'production')),
    send_email BOOLEAN NOT NULL DEFAULT TRUE,
    notify_me BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_emails TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Really text the test's own phone from the firm's RingCentral number
  -- (else each text is only shown), and the numbers an administrator
  -- confirmed a real text may go to even though a lead or client has them.
  ALTER TABLE test_automation_runs ADD COLUMN IF NOT EXISTS send_sms BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE test_automation_prefs ADD COLUMN IF NOT EXISTS send_sms BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE test_automation_prefs ADD COLUMN IF NOT EXISTS confirmed_phones TEXT[] NOT NULL DEFAULT '{}';
`

export async function applyTestChannelSchema(db) {
  await db.query(TEST_CHANNEL_SCHEMA_SQL)
}
