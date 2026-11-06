// Callback reminders (server/reminders/). Additive and safe to run on every
// deploy. Needs admin_users, submissions and rc_calls.
//
// A reminder is "follow up on this caller / this website lead at this time",
// for one staff account. It is about a callback episode (call_id: the
// episode's first call, with its number's key) or a lead (submission_id).
// due_at is stored in UTC; the portal shows it in New Orleans time.
//
//   open       waiting for due_at
//   due        due_at has passed; the reminder worker has sent (or is
//              sending) its email and desktop notification
//   done       completed by someone (completed_by), or closed by the server
//              because the follow-up was already dealt with (completed_by
//              NULL, completion_reason 'resolved'): a connected callback,
//              the calls marked handled, the lead archived
//   cancelled  nobody needs it any more
//
// version: bumped by every change a person makes, so two people editing the
// same reminder cannot silently overwrite each other (the API answers 409).
// cycle: bumped each time the reminder becomes due; a snoozed reminder that
// comes round again is a new cycle with its own deliveries.
export const REMINDERS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS follow_up_reminders (
    id BIGSERIAL PRIMARY KEY,
    target_kind VARCHAR(12) NOT NULL CHECK (target_kind IN ('call', 'submission')),
    call_id BIGINT REFERENCES rc_calls(id) ON DELETE CASCADE,
    call_key TEXT,
    phone_key TEXT,
    submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
    assigned_to INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'due', 'done', 'cancelled')),
    note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
    version INTEGER NOT NULL DEFAULT 1,
    cycle INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    completed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    completion_reason VARCHAR(12) CHECK (completion_reason IS NULL OR completion_reason IN ('completed', 'resolved')),
    cancelled_at TIMESTAMPTZ,
    cancelled_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    CONSTRAINT follow_up_reminders_target_chk CHECK (
      (target_kind = 'call' AND call_id IS NOT NULL AND phone_key IS NOT NULL AND submission_id IS NULL)
      OR (target_kind = 'submission' AND submission_id IS NOT NULL AND call_id IS NULL))
  );
  -- What the worker claims every minute.
  CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_due ON follow_up_reminders(due_at) WHERE status = 'open';
  CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_assignee ON follow_up_reminders(assigned_to, status);
  CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_phone ON follow_up_reminders(phone_key) WHERE status IN ('open', 'due');
  CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_submission ON follow_up_reminders(submission_id) WHERE status IN ('open', 'due');

  -- One row per attempt to deliver one reminder on one channel, written
  -- before the attempt. The UNIQUE key is what stops two workers (or a
  -- restart) sending the same reminder twice: a row is created once, and
  -- only the worker that moves it from 'pending' to 'sending' delivers it.
  -- A transient email failure adds the next attempt as a new 'pending' row
  -- with next_attempt_at set by the backoff; the failed row stays.
  --   kind     'due' (when it became due) or 'overdue' (the optional
  --            REMINDER_OVERDUE_EMAIL_MINUTES email, once)
  --   status   pending | sending | sent | failed | skipped_allowlist |
  --            skipped_disabled | skipped_no_email | not_configured |
  --            no_devices | cancelled (the reminder was done, cancelled,
  --            rescheduled or resolved before this attempt)
  CREATE TABLE IF NOT EXISTS reminder_deliveries (
    id BIGSERIAL PRIMARY KEY,
    reminder_id BIGINT NOT NULL REFERENCES follow_up_reminders(id) ON DELETE CASCADE,
    cycle INTEGER NOT NULL,
    kind VARCHAR(8) NOT NULL DEFAULT 'due' CHECK (kind IN ('due', 'overdue')),
    channel VARCHAR(8) NOT NULL CHECK (channel IN ('email', 'push')),
    attempt INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL CHECK (status IN (
      'pending', 'sending', 'sent', 'failed', 'skipped_allowlist', 'skipped_disabled',
      'skipped_no_email', 'not_configured', 'no_devices', 'cancelled')),
    error TEXT,
    provider_id TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempted_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (reminder_id, cycle, kind, channel, attempt)
  );
  CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_pending ON reminder_deliveries(next_attempt_at) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_sending ON reminder_deliveries(attempted_at) WHERE status = 'sending';
`

export async function applyRemindersSchema(db) {
  await db.query(REMINDERS_SCHEMA_SQL)
}
