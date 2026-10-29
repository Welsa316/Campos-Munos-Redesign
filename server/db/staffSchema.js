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
    CHECK (role IN ('admin', 'staff', 'front_desk', 'billing_paralegal'));

  -- Per-account adjustments on top of the role, set with scripts/staff.js.
  -- Unknown names in either list grant nothing.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS capability_grants TEXT[] NOT NULL DEFAULT '{}';
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS capability_revokes TEXT[] NOT NULL DEFAULT '{}';
  -- The name colleagues see beside a message or note.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name TEXT;
  -- A disabled account cannot sign in and its open sessions stop working.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

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
`

export async function applyStaffSchema(db) {
  await db.query(STAFF_SCHEMA_SQL)
}
