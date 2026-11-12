# RingCentral connection (OAuth Authorization Code flow)

An administrator connects the firm's RingCentral account from the staff
portal (**Integrations**, `https://admin.camulaw.com/integrations`). The API
stores the resulting tokens encrypted in Postgres and keeps them fresh. This
is authentication only: nothing here reads call logs yet, and nothing
anywhere changes RingCentral numbers, call routing, queues, extensions,
greetings or voicemail.

## Flow

```
Portal (admin.camulaw.com)            API (api.camulaw.com)                     RingCentral
  "Connect RingCentral" ──POST /api/integrations/ringcentral/authorize──▶
                                       new state + browser nonce;
                                       stores sha256(state), sha256(nonce)
                        ◀── { authorizeUrl } + Set-Cookie cm_rc_oauth=<nonce>
  window.location = authorizeUrl ─────────────────────────────────────────────▶ sign in, approve
                                       ◀── GET /api/integrations/ringcentral/callback?code&state
                                       consume state once; check nonce cookie,
                                       session, same admin; exchange code
                                       (Basic auth with client secret) ─────────▶ /restapi/oauth/token
                                       store tokens encrypted
  ◀── 303 https://admin.camulaw.com/integrations?ringcentral=connected
```

### State validation

The callback accepts a `state` only if **all** hold:

1. It matches a stored, unconsumed authorization for RingCentral. It is
   consumed atomically on first use, so a replayed or concurrent callback is
   refused (`invalid_state`).
2. It is less than 10 minutes old (`expired_state`).
3. The browser presents the matching `cm_rc_oauth` cookie: httpOnly,
   `SameSite=Lax`, `Path=/api/integrations/ringcentral`, set when the same
   administrator clicked Connect. A link opened in another browser fails
   (`invalid_state`).
4. The portal session on that request belongs to the same administrator who
   started it, and the account still has `integrations.manage`
   (`session_mismatch`).

Only SHA-256 digests of the state and nonce are stored. The outcome reaches
the portal as one fixed code (`connected`, `denied`, `invalid_state`,
`expired_state`, `session_mismatch`, `invalid_request`, `exchange_failed`,
`not_configured`, `error`); nothing from RingCentral's query string is
reflected. PKCE (S256) can be added with `RINGCENTRAL_USE_PKCE=true`.

### Token storage and refresh

- Table `integration_connections` (one row per provider), created by the
  additive migration that runs on every deploy (`server/db/integrationsSchema.js`).
- Access and refresh tokens are encrypted with AES-256-GCM, bound to their
  column by the AAD, with a random IV each time
  (`server/integrations/secretBox.js`). The key comes from
  `RINGCENTRAL_TOKEN_ENCRYPTION_KEY` if set, otherwise it is derived (HKDF)
  from `RINGCENTRAL_CLIENT_SECRET`. The key is never in the database.
- `getAccessToken()` (`server/integrations/ringcentral/service.js`) is what
  future RingCentral API calls use. It refreshes when under 2 minutes remain,
  under a row lock (`SELECT … FOR UPDATE`), so two requests or two instances
  never both spend the same rotated refresh token.
- Keep-alive: RingCentral refresh tokens expire after 7 days of disuse. In
  production the API checks every 6 hours and refreshes once less than 3 days
  remain. Off on developer machines unless `RINGCENTRAL_KEEPALIVE=true`.
- A refresh RingCentral rejects permanently (`invalid_grant`, e.g. revoked)
  deletes the dead tokens and shows **Reconnect needed**. A temporary failure
  (network, 429, 5xx) keeps the connection and records the error code.
- A process whose key or RingCentral environment differs from the one that
  stored the tokens refuses to use them but never deletes them (a developer
  machine pointed at production cannot wipe the firm's connection).
- **Disconnect** revokes the token at RingCentral (best effort) and deletes it.

### What never leaves the server

The client secret, the encryption key, tokens, authorization codes and state
values are never sent to the portal or the site, never written to logs (the
request logger masks `code` and `state` on `/api/integrations/*`), and never
written to the audit trail. The status endpoint returns connection metadata
only (environment, authorised extension ID, scopes, timestamps, last error
code) and, when unconfigured, the *names* of missing variables.

## API

All under `/api/integrations`. All but the callback need a portal session
with `integrations.manage` (administrators only); the POSTs also pass the
cross-origin write check.

| Route | Purpose |
|---|---|
| `GET /ringcentral` | Status |
| `POST /ringcentral/authorize` | Start; returns `{ authorizeUrl }` and sets the nonce cookie |
| `GET /ringcentral/callback` | RingCentral's redirect; always 303 to the portal |
| `POST /ringcentral/refresh` | Refresh now (the portal's "Check connection") |
| `POST /ringcentral/disconnect` | Revoke and delete |

Every action is in `billing_audit_events` (`entity_type = 'integration'`).

## Activation

1. **RingCentral Developer Console** (a RingCentral admin):
   - App type: REST API app, server-side web app, **3-legged OAuth
     (Authorization Code)**, with a client secret.
   - OAuth redirect URI:
     `https://api.camulaw.com/api/integrations/ringcentral/callback`
   - Permissions: only what is needed. For the planned call-log attribution,
     **Read Call Log** and **Read Accounts**. Do not request permissions that
     can change call handling, numbers or settings.
   - Use the sandbox first if the app is not yet approved for production.
2. **Railway → API service → Variables**:
   `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`,
   `RINGCENTRAL_SERVER_URL` (`https://platform.ringcentral.com`, or
   `https://platform.devtest.ringcentral.com` for the sandbox),
   `RINGCENTRAL_REDIRECT_URI` (the URI above, exactly). Recommended:
   `RINGCENTRAL_TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32`), so the client
   secret can be rotated without reconnecting. Never set any of these on the
   website or portal services.
3. Deploy the API (the migration adds the two tables) and the portal.
4. In the portal, as an administrator: **Integrations → Connect RingCentral**,
   sign in on RingCentral's page with an account that may authorise the app,
   approve. You land back on Integrations showing **Connected**. Click
   **Check connection** to confirm a refresh works.

The callback lives on `api.camulaw.com`, so it works once the API runs as its
own service with that domain (docs/architecture-split.md). In the
transitional single-service deployment, set `RINGCENTRAL_REDIRECT_URI` and
the RingCentral app's redirect URI to that host's
`/api/integrations/ringcentral/callback` and `ADMIN_APP_URL` to
`https://camulaw.com/admin`.

Rollback: **Disconnect** in the portal, or unset the variables (the screen
then shows "Not set up" and nothing calls RingCentral).

## Tests

```bash
cd server && node --test integrations/ringcentral/oauth.test.js
cd server && TEST_DATABASE_URL=postgresql://localhost:5432/camulaw_test node --test integrations/ringcentral/flow.test.js
```

The second runs the whole flow over HTTP and Postgres against a fake
RingCentral: role checks, unconfigured server, every state-validation
failure (unknown, missing/wrong cookie, other admin, no session, expired,
replay, declined), refused code, encrypted storage, status without secrets,
concurrent refresh (exactly one), transient vs permanent refresh failures,
keep-alive threshold, key mismatch not wiping tokens, reconnect and
disconnect. Removing the cookie check, the one-time consume, the same-admin
check or the row lock each turns it red.

## Text messages (Phase 1 automation)

Sending and reading text messages needs two more permissions on the same
RingCentral app, **SMS** and **Read Messages**, and connecting again on the
Integrations page afterwards so they are granted. RingOut alone does not allow
texting, and the number must be registered for it. Everything is in
`docs/phase1-automation.md`, "RingCentral SMS setup".
