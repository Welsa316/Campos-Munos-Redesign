// Third-party integrations connected by an administrator through OAuth
// (docs/ringcentral-oauth.md). Additive and safe to run on every deploy.
//
// Tokens are stored encrypted (server/integrations/secretBox.js); OAuth
// states are stored only as SHA-256 digests, so a database read alone can
// neither complete a pending authorization nor call the provider.
export const INTEGRATIONS_SCHEMA_SQL = `
  -- One row per authorization attempt. state_hash is the digest of the
  -- 'state' parameter sent to the provider; binding_hash the digest of a
  -- nonce held in an httpOnly cookie in the administrator's browser. A row is
  -- usable once (consumed_at) and only until expires_at.
  CREATE TABLE IF NOT EXISTS integration_oauth_states (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(30) NOT NULL CHECK (provider IN ('ringcentral')),
    state_hash CHAR(64) NOT NULL UNIQUE,
    binding_hash CHAR(64) NOT NULL,
    code_verifier_enc TEXT,
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_expires ON integration_oauth_states(expires_at);

  -- The firm's connection to a provider: one row per provider.
  CREATE TABLE IF NOT EXISTS integration_connections (
    provider VARCHAR(30) PRIMARY KEY CHECK (provider IN ('ringcentral')),
    status VARCHAR(15) NOT NULL CHECK (status IN ('connected', 'needs_reauth')),
    environment VARCHAR(12) NOT NULL CHECK (environment IN ('production', 'sandbox')),
    access_token_enc TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_enc TEXT,
    refresh_token_expires_at TIMESTAMPTZ,
    token_type TEXT,
    scope TEXT,
    owner_id TEXT,
    endpoint_id TEXT,
    connected_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_refreshed_at TIMESTAMPTZ,
    last_error_code TEXT,
    last_error_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A connected row always has both tokens; a row needing reauthorisation
    -- has none (they no longer work and are not kept).
    CONSTRAINT integration_connections_tokens_chk CHECK (
      (status = 'connected' AND access_token_enc IS NOT NULL AND refresh_token_enc IS NOT NULL)
      OR (status = 'needs_reauth' AND access_token_enc IS NULL AND refresh_token_enc IS NULL)
    )
  );

  -- One comparable key per phone number, used to match a caller to a lead or
  -- client however each was typed: digits only, and for North American
  -- numbers the last 10 digits ('+1 (504) 555-0101' and '504.555.0101' agree).
  -- Empty for no number.
  CREATE OR REPLACE FUNCTION cm_phone_key(raw TEXT) RETURNS TEXT
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
      SELECT CASE
        WHEN d ~ '^1[0-9]{10}$' THEN right(d, 10)
        ELSE d
      END
      FROM (SELECT regexp_replace(COALESCE(raw, ''), '[^0-9]', '', 'g') AS d) x
    $fn$;
  CREATE INDEX IF NOT EXISTS idx_submissions_phone_key ON submissions (cm_phone_key(phone));
  CREATE INDEX IF NOT EXISTS idx_billing_client_contacts_phone_key ON billing_client_contacts (cm_phone_key(phone_e164));

  -- RingCentral call log, imported by server/integrations/ringcentral/callLog.js
  -- (docs/ringcentral-call-log.md). One row per RingCentral call log record.
  -- Only what the portal shows is kept: no recordings, no raw payload.
  CREATE TABLE IF NOT EXISTS rc_calls (
    id BIGSERIAL PRIMARY KEY,
    rc_record_id TEXT NOT NULL UNIQUE,
    telephony_session_id TEXT,
    session_id TEXT,
    direction VARCHAR(8) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    started_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    -- RingCentral's own result text ('Accepted', 'Missed', ...) and our reading of it.
    result_raw TEXT,
    outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('answered', 'missed', 'voicemail', 'connected', 'no_answer', 'other')),
    -- The person outside the firm: caller on inbound calls, callee on outbound.
    counterpart_number TEXT,
    counterpart_key TEXT NOT NULL DEFAULT '',
    caller_id_name TEXT,
    -- The firm's side: the number or line reached, or the extension calling out.
    firm_number TEXT,
    firm_name TEXT,
    firm_extension TEXT,
    answered_by_name TEXT,
    answered_by_extension TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    scope VARCHAR(10) NOT NULL CHECK (scope IN ('account', 'extension')),
    rc_last_modified_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_rc_calls_started ON rc_calls(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_rc_calls_key ON rc_calls(counterpart_key, started_at);

  -- RingOut ("call this number" from the portal): the phone RingCentral rings
  -- first for each person (their direct number rings their RingCentral app),
  -- and each call they placed, so its progress can be shown and cancelled.
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS ringout_phone TEXT;
  CREATE TABLE IF NOT EXISTS rc_ringouts (
    id BIGSERIAL PRIMARY KEY,
    rc_ringout_id TEXT NOT NULL,
    placed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    to_number TEXT NOT NULL,
    from_number TEXT NOT NULL,
    phase VARCHAR(16) NOT NULL CHECK (phase IN ('ringing_you', 'calling_client', 'connected', 'finished', 'failed', 'cancelled')),
    rc_status JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_rc_ringouts_placed_by ON rc_ringouts(placed_by, created_at DESC);

  -- Missed calls that need no callback (a verification code read out by a
  -- machine, someone from the firm testing the line, spam). They stay in the
  -- log but leave the missed and not-called-back counts. Either one call, or
  -- every call from a number (a staff member's mobile). Who and why are kept.
  CREATE TABLE IF NOT EXISTS rc_call_exclusions (
    call_id BIGINT PRIMARY KEY REFERENCES rc_calls(id) ON DELETE CASCADE,
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('verification', 'staff_test', 'spam', 'other')),
    note TEXT,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS rc_ignored_numbers (
    counterpart_key TEXT PRIMARY KEY CHECK (counterpart_key <> ''),
    number TEXT,
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('verification', 'staff_test', 'spam', 'other')),
    note TEXT,
    created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Where the import stands: one row.
  CREATE TABLE IF NOT EXISTS rc_call_sync_state (
    key VARCHAR(20) PRIMARY KEY CHECK (key = 'ringcentral'),
    scope VARCHAR(10) CHECK (scope IN ('account', 'extension')),
    scope_checked_at TIMESTAMPTZ,
    window_to TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_trigger VARCHAR(10),
    last_fetched INTEGER,
    last_new INTEGER,
    last_truncated BOOLEAN NOT NULL DEFAULT FALSE,
    last_error_code TEXT,
    last_error_at TIMESTAMPTZ
  );
`

export async function applyIntegrationsSchema(db) {
  await db.query(INTEGRATIONS_SCHEMA_SQL)
}
