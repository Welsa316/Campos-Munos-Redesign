# WhatsApp Cloud API webhook

Receives Meta's WhatsApp webhook deliveries (inbound messages and
sent/delivered/read/failed statuses), verifies them, and stores each one once
in Postgres. **Receiving only** — nothing in the backend sends a WhatsApp
message or calls the Graph API.

## Callback URL

The Express server serves the API and the site from one Railway service at
the apex domain, so the webhook lives on the same host:

```
https://camulaw.com/webhooks/whatsapp
```

After the site/admin/API split (`docs/architecture-split.md`) the API lives at
`https://api.camulaw.com`, so the callback URL becomes
`https://api.camulaw.com/webhooks/whatsapp`. Until Meta's dashboard is
updated, the website forwards `camulaw.com/webhooks/whatsapp` to the API
byte-for-byte, so the signature still verifies.

Paste that into **Meta App Dashboard → WhatsApp → Configuration → Webhook →
Callback URL**, and the value of `WHATSAPP_VERIFY_TOKEN` into **Verify token**.
Then subscribe the app to the **`messages`** webhook field. Use the apex, not
`www.camulaw.com`: the server 301s `www` to the apex, and a redirect in front
of a webhook is one more thing that can break the handshake.

## Environment variables (Railway → backend service → Variables)

| Variable | Where it comes from | Effect when missing |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | A random string of at least 16 characters (e.g. `openssl rand -hex 32`). Must equal the "Verify token" typed into the Meta dashboard. Placeholder values containing "change-me" are refused. | GET handshake answers 403; Meta cannot verify the URL. |
| `META_APP_SECRET` | Meta App Dashboard → **App settings → Basic → App secret** (click Show). | Every POST answers 503. Fails closed on purpose: without it, forged deliveries could not be told from real ones. |

Both are read at request time; a boot-time warning is logged when either is
unset. Neither value is ever written to logs — the verify token is masked in
the request URL that pino-http prints, and the app secret is only used inside
the HMAC check. `.env.example` lists both.

## Request flow

| Step | Behaviour |
|---|---|
| `GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` | Constant-time compare of the token against `WHATSAPP_VERIFY_TOKEN`. Match → `200 text/plain` with the challenge. Anything else → `403`. |
| `POST /webhooks/whatsapp` | Body read as raw bytes (1 MB limit) by the router's own `express.raw()`; the global `express.json()` is mounted after it and never sees this path. |
| Signature | `X-Hub-Signature-256` must be `sha256=` + hex HMAC-SHA256 of the raw body keyed with `META_APP_SECRET`. Compared with `crypto.timingSafeEqual`. Missing / malformed / wrong → `401`, nothing processed. |
| Body | Unparseable JSON → `400`. A signed delivery whose `object` is not `whatsapp_business_account` (another product of the same Meta app pointed here) is answered `200` and ignored, so Meta does not retry it for hours. |
| Acknowledge | `200` is sent **before** any storage work. Meta retries anything it does not get a 200 for within its deadline. |
| Dedupe (fast) | A bounded in-process set of recent event keys (5 000) drops immediate redeliveries without touching the database. |
| Dedupe (durable) | Each event is inserted into `whatsapp_events` with `ON CONFLICT (event_key) DO NOTHING`. The UNIQUE index is what holds across restarts and replicas. |
| Processing | Runs on `setImmediate` after the response; one failure is logged and does not affect the other events in the batch or the HTTP status. A failed insert releases its key from the in-memory guard so a replay (Meta dashboard → Webhooks → Test, or a manual signed POST) gets through. |

Event keys: `message:<wamid>` for an inbound message; `status:<wamid>:<status>`
for a status change (the same outbound wamid legitimately reports `sent`,
`delivered`, `read` in turn, so each is its own event).

## Storage

`whatsapp_events` (created by `server/db/migrate.js`, which runs on every
deploy via `prestart`):

| Column | Meaning |
|---|---|
| `event_key` (UNIQUE) | Dedupe key, see above |
| `kind` | `message` or `status` |
| `wa_message_id` | The wamid |
| `status` | For statuses: `sent` / `delivered` / `read` / `failed` |
| `from_wa_id`, `contact_name` | Inbound sender (phone in WhatsApp's E.164-without-plus format) and profile name |
| `recipient_wa_id` | For statuses: who the outbound message went to |
| `message_type` | `text`, `image`, `audio`, `button`, `interactive`, … |
| `phone_number_id`, `display_phone_number`, `waba_id` | Which business number / account received it |
| `event_timestamp` | Meta's timestamp for the event |
| `payload` | The full message or status object as JSONB |
| `received_at` | When we got it |

Logs carry identifiers and types only (wamid, status, message type,
phone_number_id). Phone numbers, contact names and message text stay in the
database row.

## Files

| File | Role |
|---|---|
| `server/routes/whatsapp.js` | Router (GET handshake, POST receive, in-memory dedupe, async processing). `createWhatsappRouter(deps)` takes env/store/log for tests. |
| `server/utils/whatsapp.js` | Pure helpers: `verifyChallenge`, `verifySignature`, `extractEvents`, `redactVerifyToken`. |
| `server/db/whatsappEvents.js` | `recordEvent(evt)` → `true` if new, `false` if duplicate. |
| `server/db/migrate.js` | `whatsapp_events` table + indexes. |
| `server/index.js` | Mounts the router before `express.json()`; pino-http moved above the body parsers so webhook requests carry `req.log`; verify token masked in logged URLs; boot warning for missing env. |
| `server/logger.js` | Redacts `err.body`: with pino-http ahead of the JSON parser, a malformed-JSON 400 is now logged, and body-parser attaches the raw body to that error. |
| `server/whatsappWebhook.test.js` | 19 tests over the helpers and a live router on an ephemeral port. |

## Verifying a deploy

1. Handshake (expect `200` and the body `test123`):
   ```bash
   curl -i "https://camulaw.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=test123"
   ```
2. Forged delivery (expect `401`):
   ```bash
   curl -i -X POST https://camulaw.com/webhooks/whatsapp -H 'content-type: application/json' -H 'x-hub-signature-256: sha256=00' -d '{}'
   ```
3. Signed delivery (expect `200`, then one row in `whatsapp_events`):
   ```bash
   BODY='{"object":"whatsapp_business_account","entry":[{"id":"0","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"0","phone_number_id":"0"},"messages":[{"from":"0","id":"wamid.smoke1","timestamp":"1700000000","type":"text","text":{"body":"smoke"}}]}}]}]}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | sed 's/^.* //')
   curl -i -X POST https://camulaw.com/webhooks/whatsapp -H 'content-type: application/json' -H "x-hub-signature-256: sha256=$SIG" --data-binary "$BODY"
   railway run psql "$DATABASE_URL" -c "select event_key, kind, received_at from whatsapp_events order by id desc limit 5"
   ```
4. In the Meta dashboard use **Webhooks → Test** on the `messages` field, then
   send a real WhatsApp message to the business number and check the table.

## Not done yet (by design)

- No outbound messages, no auto-replies, no Graph API calls.
- No staff notification (email) on an inbound WhatsApp message — the row is
  stored and logged only. Wire that in `processEvents` in
  `server/routes/whatsapp.js` when the firm decides how it wants to be alerted.
- No admin-portal view of `whatsapp_events`.
