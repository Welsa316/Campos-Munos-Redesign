// Phase 1 automation (server/automation/, docs/phase1-automation.md).
// Additive and safe to run on every deploy. Needs admin_users, submissions,
// rc_calls and staff_activity.
//
// Nothing here sends anything: every automation is off until its switch is
// set (automation/flags.js).
export const AUTOMATION_SCHEMA_SQL = `
  -- What an administrator can change without a deploy: message templates,
  -- the follow-up sequence, office hours, thresholds, spam rules, and which
  -- automations are paused.
  CREATE TABLE IF NOT EXISTS automation_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Where each automation stands, for the health view: one row per
  -- automation (worker, sms_inbound, calendar, payment_reminders, ...).
  CREATE TABLE IF NOT EXISTS automation_state (
    key TEXT PRIMARY KEY,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Delayed work, kept in the database so it survives a restart and runs
  -- with nobody signed in. One row per thing to do at a time.
  --   idempotency_key  what the job is, once: 'lead-ack-email:42'. The UNIQUE
  --                    index is what makes a second enqueue (a retried form,
  --                    a second instance, a restart) a no-op.
  --   status           pending | running | done | failed | cancelled | skipped
  --   outcome          a short code for why it ended as it did
  -- A worker takes a job by moving it to 'running' under FOR UPDATE SKIP
  -- LOCKED, so two workers never run the same one.
  CREATE TABLE IF NOT EXISTS automation_jobs (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(40) NOT NULL,
    entity_type VARCHAR(20),
    entity_id TEXT,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled', 'skipped')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 4,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}',
    outcome TEXT,
    last_error TEXT,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    -- A failed job a person has looked at (retried elsewhere, or dismissed).
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_automation_jobs_due ON automation_jobs(run_at, id) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_automation_jobs_running ON automation_jobs(locked_at) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS idx_automation_jobs_entity ON automation_jobs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_automation_jobs_failed ON automation_jobs(completed_at DESC) WHERE status = 'failed';
  CREATE INDEX IF NOT EXISTS idx_automation_jobs_done ON automation_jobs(completed_at) WHERE status IN ('done', 'cancelled', 'skipped');

  -- Every automatic message to someone outside the firm, written BEFORE the
  -- provider is called. idempotency_key is its job's key, so one job can
  -- never produce two messages. No message text is kept: the template and
  -- language say what was sent.
  --   sending  the provider is being called (or the process died mid-call)
  --   sent     the provider accepted it
  --   failed   the provider definitely did not accept it
  --   unknown  it may have gone out; never sent again automatically
  CREATE TABLE IF NOT EXISTS automation_messages (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT REFERENCES automation_jobs(id) ON DELETE SET NULL,
    channel VARCHAR(8) NOT NULL CHECK (channel IN ('email', 'sms')),
    purpose VARCHAR(24) NOT NULL,
    entity_type VARCHAR(20),
    entity_id TEXT,
    -- Who it went to, as a comparable key (cm_phone_key of the number, or
    -- the lower-cased address): the cooldown and opt-out checks read it.
    to_key TEXT NOT NULL,
    template_key TEXT,
    language VARCHAR(5),
    idempotency_key TEXT NOT NULL UNIQUE,
    status VARCHAR(10) NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'unknown')),
    attempts INTEGER NOT NULL DEFAULT 1,
    provider_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_automation_messages_to ON automation_messages(to_key, purpose, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_automation_messages_entity ON automation_messages(entity_type, entity_id);

  -- People who must not get automatic messages: an opt-out they sent (STOP),
  -- one a staff member recorded, or an address that cannot receive.
  -- channel 'all' covers both. Removing one keeps the row (removed_at).
  CREATE TABLE IF NOT EXISTS automation_suppressions (
    id BIGSERIAL PRIMARY KEY,
    channel VARCHAR(8) NOT NULL CHECK (channel IN ('sms', 'email', 'all')),
    address_key TEXT NOT NULL CHECK (address_key <> ''),
    reason VARCHAR(12) NOT NULL CHECK (reason IN ('opt_out', 'staff', 'invalid')),
    source VARCHAR(20) NOT NULL DEFAULT 'staff',
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,
    removed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_suppressions_active
    ON automation_suppressions(channel, address_key) WHERE removed_at IS NULL;

  -- Text messages people sent to the firm's RingCentral number, read from
  -- RingCentral's message store. Only what the automation needs: who, when,
  -- and what kind (a reply, an opt-out, an opt back in, a help request).
  -- The text itself stays in RingCentral.
  CREATE TABLE IF NOT EXISTS rc_sms_inbound (
    id BIGSERIAL PRIMARY KEY,
    rc_message_id TEXT NOT NULL UNIQUE,
    from_key TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    kind VARCHAR(8) NOT NULL CHECK (kind IN ('reply', 'opt_out', 'opt_in', 'help')),
    submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
    handled_at TIMESTAMPTZ,
    handled_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_rc_sms_inbound_from ON rc_sms_inbound(from_key, received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_rc_sms_inbound_open ON rc_sms_inbound(submission_id) WHERE handled_at IS NULL AND kind = 'reply';

  -- A consultation found on the firm's calendar that belongs to a lead
  -- (matched by the guest's email address). Only matched events are kept,
  -- and only their time and state: no title, no description.
  CREATE TABLE IF NOT EXISTS consultation_bookings (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(20) NOT NULL,
    external_id TEXT NOT NULL,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    status VARCHAR(10) NOT NULL CHECK (status IN ('booked', 'cancelled')),
    match_method VARCHAR(16) NOT NULL DEFAULT 'attendee_email',
    external_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, external_id)
  );
  CREATE INDEX IF NOT EXISTS idx_consultation_bookings_submission ON consultation_bookings(submission_id, starts_at DESC);

  -- Leads: what the automation needs to know about each one.
  --   language            the website language the form was sent in (es|en);
  --                       NULL when unknown, never guessed from a name
  --   sms_consent_at      when the person agreed on the form to be texted
  --   owner_id            who follows this lead up (NULL: the front desk)
  --   sla_due_at          by when a person should have made contact
  --   escalation_level    0 none, 1 the owner was told, 2 the manager was
  --   automation_paused   staff stopped automatic messages for this lead
  --   automation_started_at  the lead's jobs were queued (a missed one is
  --                       picked up by the worker)
  --   spam_state          possible | spam | cleared (a person said it is not)
  --   status_reason / status_auto / status_changed_at  why the status is
  --                       what it is, and whether the system set it
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS language VARCHAR(2) CHECK (language IN ('es', 'en'));
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS escalation_level SMALLINT NOT NULL DEFAULT 0;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS automation_paused BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS automation_started_at TIMESTAMPTZ;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS spam_state VARCHAR(8) CHECK (spam_state IN ('possible', 'spam', 'cleared'));
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS spam_reason TEXT;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status_reason TEXT;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status_auto BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
  CREATE INDEX IF NOT EXISTS idx_submissions_sla ON submissions(sla_due_at) WHERE status = 'new' AND NOT is_archived;
  CREATE INDEX IF NOT EXISTS idx_submissions_email_lower ON submissions(LOWER(email));

  -- Callers waiting for a call back who were escalated, once per level.
  CREATE TABLE IF NOT EXISTS call_episode_escalations (
    episode_id BIGINT NOT NULL,
    level SMALLINT NOT NULL,
    escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (episode_id, level)
  );

  -- A contact match the system confirmed on its own (phone and email both
  -- agree) is told apart from one a person decided, and can be undone.
  ALTER TABLE contact_links ADD COLUMN IF NOT EXISTS decided_auto BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE contact_links ADD COLUMN IF NOT EXISTS evidence TEXT;

  -- The activity log now also records what the system did on its own
  -- (source 'system'). Dropped and added again rather than guarded: a guard
  -- on the name could never widen the list on a database that has it.
  ALTER TABLE staff_activity DROP CONSTRAINT IF EXISTS staff_activity_source_check;
  ALTER TABLE staff_activity ADD CONSTRAINT staff_activity_source_check CHECK (source IN ('portal', 'cli', 'system'));
  CREATE INDEX IF NOT EXISTS idx_staff_activity_system ON staff_activity(id DESC) WHERE source = 'system';

  -- Payment reminders: a rule the firm approved to send on its own, and the
  -- reminders it approved (approved_by stays NULL for those).
  ALTER TABLE billing_reminder_rules ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE billing_reminders ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;
`

export async function applyAutomationSchema(db) {
  await db.query(AUTOMATION_SCHEMA_SQL)
}
