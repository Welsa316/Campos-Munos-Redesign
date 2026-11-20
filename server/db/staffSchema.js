// Staff accounts, capabilities and the shared WhatsApp inbox
// (docs/staff-accounts.md).
//
// Additive and safe to run on every deploy, after the billing schema (which
// creates admin_users.role). Existing accounts, sessions and data are left as
// they are: no column is dropped, every new column is nullable or defaults to
// "nothing extra", and an existing admin stays an admin.
export const STAFF_SCHEMA_SQL = `
  -- Roles are bundles of capabilities (server/auth/capabilities.js). Dropped
  -- and recreated rather than guarded by name, so the list can grow on a
  -- database that already has the narrower constraint. Keep in sync with
  -- ROLES in server/auth/capabilities.js.
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_chk;
  ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_chk
    CHECK (role IN ('admin', 'staff', 'front_desk', 'billing_paralegal', 'receptionist', 'office_manager'));

  -- Per-account adjustments on top of the role, set with scripts/staff.js.
  -- Unknown names in either list grant nothing.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS capability_grants TEXT[] NOT NULL DEFAULT '{}';
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS capability_revokes TEXT[] NOT NULL DEFAULT '{}';
  -- The name colleagues see beside a message or note.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name TEXT;
  -- A disabled account cannot sign in and its open sessions stop working.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
  -- The profile picture each person picks on Home ('fluent:fox', 'emoji:🦊')
  -- and its background colour; NULL until they choose (a default is shown).
  -- Only values from server/auth/avatars.js are ever stored.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar TEXT;
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_bg TEXT;
  -- Portal colour theme (server/auth/themes.js); NULL = Campos Muños Classic.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS theme TEXT;
  -- A person's own colours when theme = 'custom' (Home → Themes → Custom):
  -- { base, header, primary, … } with #RRGGBB values, validated by
  -- server/auth/themes.js. Kept when they go back to a preset; NULL = none.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_theme JSONB;
  -- How large they read chat text (server/auth/textSizes.js); NULL = standard.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS text_size TEXT;

  -- Who wrote each lead note and sent each email reply. NULL on rows from
  -- before there was more than one account.
  ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
  ALTER TABLE replies ADD COLUMN IF NOT EXISTS sent_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

  -- One WhatsApp conversation per client number (Meta's wa_id: E.164 digits
  -- without '+'). Inbound messages are read from whatsapp_events, which the
  -- webhook already stores; this row only carries what staff decide about
  -- the conversation.
  CREATE TABLE IF NOT EXISTS wa_conversations (
    id BIGSERIAL PRIMARY KEY,
    wa_id TEXT NOT NULL UNIQUE,
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    assigned_to INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    assigned_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    closed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_wa_conversations_assigned ON wa_conversations(assigned_to);
  -- Deleting from the portal (server/whatsapp/inbox.js): a deleted message
  -- keeps its row, so a redelivery from Meta is still recognised as one, but
  -- loses what it said (payload emptied, contact_name cleared) and is never
  -- shown again. Nothing is deleted on the phone or for the client.
  ALTER TABLE whatsapp_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

  -- Numbers kept out of the portal: a coworker, a personal chat. Messages
  -- from them are stored without their text and open no conversation, until
  -- the number is shown again.
  CREATE TABLE IF NOT EXISTS wa_hidden_numbers (
    wa_id TEXT PRIMARY KEY,
    hidden_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- New messages open their conversation as they are stored
  -- (db/whatsappEvents.js). This catches up history stored before that.
  -- Idempotent; one scan of the events per deploy instead of one per inbox
  -- poll. Deleted messages and hidden numbers stay out, or a chat deleted in
  -- the portal would come back with the next deploy.
  INSERT INTO wa_conversations (wa_id)
  SELECT DISTINCT e.from_wa_id FROM whatsapp_events e
   WHERE e.kind = 'message' AND e.from_wa_id IS NOT NULL AND e.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM wa_hidden_numbers h WHERE h.wa_id = e.from_wa_id)
  ON CONFLICT (wa_id) DO NOTHING;

  -- Internal notes: seen by staff only, never sent.
  CREATE TABLE IF NOT EXISTS wa_conversation_notes (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_wa_conversation_notes_conv ON wa_conversation_notes(conversation_id, created_at);

  -- Free-text replies staff send from the portal. Written as 'pending' before
  -- the provider is called, so a crash mid-send is never mistaken for "not
  -- sent" and resent. Payment reminders keep their own record
  -- (billing_messages).
  CREATE TABLE IF NOT EXISTS wa_outbound_messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    sent_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    provider_mode VARCHAR(8) NOT NULL CHECK (provider_mode IN ('mock', 'meta')),
    simulated BOOLEAN NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'unknown')),
    provider_message_id TEXT UNIQUE,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_wa_outbound_messages_conv ON wa_outbound_messages(conversation_id, created_at);
  -- A reply deleted from the portal: its text is emptied and it is no
  -- longer shown. The client still has it.
  ALTER TABLE wa_outbound_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

  -- Activity log (server/activity/): every change made in the portal or with
  -- scripts/staff.js, by whom and when, including attempts that were refused
  -- or failed. actor_email and actor_role are copied as they were at the
  -- time, so the row still reads right after an account is renamed, changes
  -- role or is removed. Details hold ids, statuses and counts, never message
  -- text, passwords or full phone numbers. Rows are never updated; they are
  -- deleted after 400 days (purgeActivity in server/activity/recorder.js).
  CREATE TABLE IF NOT EXISTS staff_activity (
    id BIGSERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    label TEXT NOT NULL,
    method VARCHAR(7),
    path TEXT,
    entity_type TEXT,
    entity_id TEXT,
    outcome VARCHAR(7) NOT NULL CHECK (outcome IN ('ok', 'denied', 'failed')),
    status_code SMALLINT,
    ip TEXT,
    source VARCHAR(6) NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'cli')),
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_staff_activity_created ON staff_activity(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_staff_activity_actor ON staff_activity(actor_id, id DESC);

  -- Sessions ended by signing out (server/auth/session.js), by token id.
  -- Kept only until the token would have expired anyway.
  CREATE TABLE IF NOT EXISTS revoked_sessions (
    jti TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_revoked_sessions_expires ON revoked_sessions(expires_at);
`

export async function applyStaffSchema(db) {
  await db.query(STAFF_SCHEMA_SQL)
}
