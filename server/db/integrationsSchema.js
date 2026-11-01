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
`

export async function applyIntegrationsSchema(db) {
  await db.query(INTEGRATIONS_SCHEMA_SQL)
}
