# Billing automation: architecture and implementation plan

Status: living document. The checklist at the end is the source of truth for
what is done and what is pending.

## 0. Repository audit (what exists, what we build on)

| Area | Finding |
|---|---|
| Repo shape | Monorepo of three apps since the split (`docs/architecture-split.md`): `site/` public Vue SPA, `admin/` staff portal (Vue 3 + Vite + Tailwind 4), `server/` Express 4 + `pg` (raw SQL), ESM, `node --test`. |
| Is this the management platform? | Yes: the staff portal is `admin/` (admin.camulaw.com), a separate app from the public website, which never bundles portal code (enforced at build). Billing lives in `admin/src/modules/billing/` (routes `/billing/*`) and `/api/billing/*` on the API, inheriting cookie auth, the cross-origin write check and the portal's noindex/no-third-party CSP. |
| Auth | `admin_users` table, bcrypt + JWT in an httpOnly `token` cookie, `requireAuth` middleware. One account today, no roles. We add a `role` column (`admin` default, `staff`) and `requireRole()`; approve/sync/send are `admin`-only, enforced server-side. |
| DB | `server/db/migrate.js` is a single idempotent SQL script run by `prestart` on every deploy. We append a `billing` block the same way (additive only, `IF NOT EXISTS`). |
| Existing integrations | Resend email (leads), OpenAI conversions pixel, and the **receive-only WhatsApp Cloud API webhook from PR 36** (`server/routes/whatsapp.js`, `server/utils/whatsapp.js`, `whatsapp_events` table, 19 tests). We reuse it unchanged for verification and inbound storage, and extend `processEvents` to forward status events and inbound replies to the billing module. |
| monday.com | No existing integration. |
| Tests | `node --test` in `server/`; 46 passing at the start of this work. No DB-backed tests existed; we add them behind `TEST_DATABASE_URL` (skipped when unset) because the local `.env` `DATABASE_URL` points at production and must never be used by tests. |
| UI patterns | Portal shell (`admin/src/views/InboxView.vue`): white 64px header on `bg-brand-surface`, `font-ui` (Inter), navy/red brand tokens, cards `bg-white rounded-xl ring-1 ring-gray-200`, pill statuses from `site/src/data/leadStatuses.js`, FontAwesome via `<i class="fa-solid …">` + a tree-shaken registry in `site/src/icons.js`. The `/admin/demo/operations` dashboard shows the metric-card and "needs attention" patterns we mirror. Admin UI is English-only today; the billing UI follows that. |
| Deployment | Railway, Nixpacks. Secrets are env vars on the backend service. Filesystem is ephemeral, so uploaded reports are stored in Postgres (`bytea`), not on disk. |

## 1. Goals and non-goals

Goals: make eImmigration billing exports useful immediately (import, reconcile,
see who owes what), keep monday.com in step with an explicit preview/approve
step, and prepare WhatsApp payment reminders behind an approval queue, with
mock providers so every workflow can be exercised without credentials.

Non-goals: replacing eImmigration or monday.com, a conversational inbox,
AI agents, creating financial transactions in eImmigration, auto-sending
messages in the initial release.

## 2. Architecture

```
admin/src/modules/billing/*         Vue views under /billing in the portal (overview,
                                    invoices, imports, matching, monday, settings)
        │  fetch /api/billing/*  (cookie auth, role-gated)
server/routes/billing/*.js          Express routers: imports, invoices, matching,
                                    monday, reminders, integrations, overview
server/billing/
  config.js            provider modes + write/send policy, all from env
  money.js, dates.js   decimal→cents (no floats), date parsing incl. Excel serials
  parsers/             csv.js, xlsx.js (zero-dependency), index.js (sniff + parse)
  columnMapping.js     canonical fields, header aliases, report-type detection
  normalize.js         mapped rows → normalized invoice / payment records + issues
  matching.js          name normalisation, deterministic match hierarchy, candidates
  reconcile.js         pure reconciliation: proposed actions + status derivation
  importService.js     staging → preview → approve → apply (transactional, idempotent)
  mondaySync.js        proposed column changes, preview, apply, sync jobs
  reminders.js         rule evaluation, drafts, approval, queue, dispatch, cancellation
  templates.js         EN/ES example reminder templates
  audit.js             billing_audit_events writer
  scheduler.js         in-process interval + advisory lock (evaluate, dispatch, purge)
  providers/
    billing/   FileImportBillingProvider (live), EImmigrationApiProvider (boundary only)
    monday/    MockMondayProvider, MondayApiProvider (GraphQL), index.js factory
    whatsapp/  MockWhatsAppProvider, MetaWhatsAppCloudProvider, index.js factory
server/db/billingSchema.js   additive SQL run by migrate.js (and by tests)
```

Dependency injection is the codebase's existing style (`createWhatsappRouter({ env, store, log })`),
so every provider factory takes `env` and every service takes `{ db, providers, log, now }`.

### 2.1 Provider interfaces

Billing source (`providers/billing`):
```
fetchReport({ job }) → { parsed, detectedMapping }     // file provider: parse the stored upload
describe() → { kind: 'file_import' | 'eimmigration_api', status }
```
The reconciliation pipeline only consumes normalized records, so the API
provider will produce the same shape once the schema is verified.

Client management (`providers/monday`):
```
validateConnection() → { ok, account?, user?, error? }
listBoards() → [{ id, name, itemsCount }]
getBoardColumns(boardId) → [{ id, title, type, settings }]
listItems(boardId, { cursor?, limit? }) → { items: [{ id, name, columns: { [colId]: { text, value } } }], cursor }
updateItemColumns(boardId, itemId, columnValues) → { ok, itemId, error? }
mode → 'mock' | 'api'
```

Messaging (`providers/whatsapp`):
```
sendTemplate({ to, templateName, language, parameters, idempotencyKey }) →
  { ok: true, providerMessageId, simulated } | { ok: false, error: { code, message, retryable }, simulated }
describe() → { mode, configured, graphVersion }
```
The mock provider writes simulated `sent/delivered/read/failed` status events
through the same `whatsapp_events` path the real webhook uses, so delivery
tracking is exercised end to end. Every mock message carries `simulated = true`
and the dispatcher refuses to hand a simulated message to the live provider.

### 2.2 Provider selection and safety policy (all backend, all env)

| Variable | Effect |
|---|---|
| `MONDAY_PROVIDER` | `mock` (default) or `api`. `api` without `MONDAY_API_TOKEN` is a configuration error, never a silent fallback to mock. |
| `MONDAY_WRITES_ENABLED` | `false` default. With `api`, every apply is forced to dry-run until this is `true`. |
| `WHATSAPP_PROVIDER` | `mock` (default) or `meta`. Same no-fallback rule. |
| `WHATSAPP_SENDING_ENABLED` | `false` default. With `meta`, dispatch refuses to send until `true`. |
| `BILLING_SCHEDULER_ENABLED` | `true` default; runs evaluation/dispatch/purge every `BILLING_SCHEDULER_INTERVAL_MINUTES` (15). |
| `BILLING_UPLOAD_RETENTION_DAYS` | 30 default; raw upload bytes are nulled after this, metadata and staged rows stay. |
| `BILLING_STALE_AFTER_DAYS` | 10 default; invoices whose last verified report is older are flagged stale and reminders are suppressed. |

A failed real API call returns an error to the caller and is recorded; it never
returns mock data as though it were real.

## 3. Data model (all additive, `server/db/billingSchema.js`)

| Table | Purpose |
|---|---|
| `admin_users.role` | `admin` / `staff`. Existing account defaults to `admin`. |
| `billing_clients` | One row per billed person. `eimmigration_client_id` (unique), display name, normalised name, phone (E.164), language, timezone, WhatsApp opt-in / opt-out timestamps. |
| `billing_client_external_ids` | External mappings: `(system, external_id)` unique → client. Systems: `monday`, `eimmigration`. Carries how it was approved and by whom. |
| `billing_import_jobs` | One per uploaded report: file metadata, SHA-256, raw bytes (purgeable), detected and confirmed mapping, report type, status (`uploaded → previewed → approved → applied` or `failed`/`cancelled`), stats, errors, report generation date. |
| `billing_import_rows` | Staged rows: raw values, normalised record, issues, match outcome, proposed action, applied flag. |
| `billing_invoices` | Current state per external invoice id: amounts in integer cents, `balance_source` (`authoritative`/`computed`/`unknown`), status, payment-plan JSON, next instalment date, last verified (report) date, stale flag, review reason. |
| `billing_invoice_revisions` | Before/after snapshot for every change, keyed to the import job that caused it. |
| `billing_payments` | Payment / credit / adjustment / refund rows with a unique `dedupe_key`. |
| `billing_match_decisions` | Audit of every approve/reject in the matching UI. |
| `billing_sync_jobs`, `billing_sync_items` | monday.com preview/apply runs and per-item outcome. |
| `billing_reminder_rules` | Configurable rules (trigger, offset, template, enabled). |
| `billing_reminders` | One per obligation and stage, unique on `(obligation_key, stage)`; state machine `eligible → draft → approved → queued → sent → delivered/read` with `failed`, `cancelled`, `suppressed`. |
| `billing_messages` | Outbound message history: provider, template, parameters, idempotency key (unique), attempts, provider message id, last error, `simulated`. |
| `billing_settings` | Key/value JSON: monday board + column map + write policy, business hours, defaults. |
| `billing_audit_events` | Who did what to which entity. |
| `billing_integration_checks` | Last connectivity check per provider. |

Money is stored as integer cents (`BIGINT`) and parsed from strings with a
decimal parser; no floating point touches a monetary value.

## 4. Import pipeline

1. `POST /api/billing/imports` (raw body, 15 MB cap, CSV/XLSX sniffed by
   signature, not by extension). Stored in `billing_import_jobs` with SHA-256.
   A hash already applied is reported as a duplicate of that job.
2. Parse → detect headers → propose a column mapping from aliases
   (`columnMapping.js`). Unknown headers are listed; the UI lets staff map them.
3. `POST /imports/:id/preview` with the confirmed mapping and declared report
   type → rows are normalised, validated, matched against existing clients and
   reconciled against current invoices. Everything is staged in
   `billing_import_rows`; nothing in `billing_invoices` changes.
4. The preview shows: recognised records, warnings (missing fields, bad money,
   duplicate ids within the file), match status per row, proposed action per
   row (insert / update / unchanged / needs review / skip).
5. `POST /imports/:id/approve` (admin) applies the staged actions in one
   transaction, writes revisions, payments, audit events, and cancels pending
   reminders for obligations the report shows as settled or re-dated.
6. Repeating the same file yields "unchanged" for every row: idempotent.

Report types: `invoice_summary`, `outstanding_only`, `payment_transactions`,
`mixed`. An invoice absent from a report is **never** changed by that report;
`invoice_summary` reports only mark absent invoices `not_in_latest_report` for
staff attention.

## 5. Matching

Hierarchy, in order, first hit wins:
1. Stored mapping (`billing_client_external_ids`).
2. Stable external id present in the row (eImmigration client id).
3. Other authorised unique identifiers both sides carry (phone / email, when
   the monday column map provides them).
4. Normalised name match → candidates only, status `ambiguous`/`unmatched`,
   never auto-approved. Normalisation strips diacritics, punctuation and
   case, tokenises, and compares token sets so "García Pérez, María" and
   "Maria Garcia Perez" score equally; duplicates within the board are
   surfaced as such.

Approving a candidate in the matching UI persists the mapping and re-matches
staged rows without another upload.

## 6. Reconciliation rules

- Void/cancelled source status → `void`, no reminders.
- Authoritative balance present: `0` → `paid`; `> 0` with payments → `partial`
  else `unpaid`; `overdue` only when the relevant due date (next unpaid
  instalment if a plan exists, else the invoice due date) is before the
  report date.
- No balance but total and paid present → computed balance, `balance_source =
  computed`, same status logic, surfaced in the UI.
- Insufficient data (no balance and no paid amount, unparsable money,
  contradictory figures) → `needs_review`, never `paid`.
- A later report with different figures updates the invoice and writes a
  revision; history is never lost.
- Payments are deduplicated by external id or by (invoice, date, amount,
  reference). Payment rows never change an invoice's status by themselves
  unless the report also supplies balances.

## 7. monday.com

`MondayApiProvider` uses the official GraphQL endpoint with a personal token
(`MONDAY_API_TOKEN`), configurable `MONDAY_API_VERSION`, pagination via
`items_page` / `next_items_page`, and `change_multiple_column_values` for
writes. Rate-limit/complexity errors are retried with bounded backoff; other
GraphQL errors are surfaced. Board and column ids are chosen in the settings
UI and stored in `billing_settings`; nothing is hard-coded. Sync is always
preview first; apply is a separate admin action and is dry-run unless
`MONDAY_WRITES_ENABLED=true`. Only the mapped columns are ever written.

## 8. WhatsApp

Webhook: reuse PR 36 as is. Extension points: status events update
`billing_messages`; inbound text from a known client number is surfaced in the
reminders view as "client responses requiring review" and `STOP`/`BAJA`-style
replies set the opt-out flag.

Sending: `MetaWhatsAppCloudProvider` posts template messages to
`https://graph.facebook.com/{WHATSAPP_GRAPH_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`.
Retry policy: a definite retryable provider error with no message id may be
retried (bounded); an unknown outcome (timeout after the request left) marks
the message `unknown` for manual review and is never re-sent automatically.

Reminders: rules evaluated by the scheduler create `eligible` reminders and
drafts only. Staff approve; approved reminders are queued inside business
hours in the client's time zone; the dispatcher sends through the configured
provider. Suppression: no opt-in, opted out, unmatched or ambiguous client,
invoice `needs_review`/`void`/stale, balance settled, due date changed, a
message for the same obligation and stage already exists.

## 9. Security

- All billing routes behind `requireAuth`; mutations behind `requireRole('admin')`.
- Upload: size cap, signature sniffing, no execution, stored in Postgres,
  never served publicly, purged after retention.
- Logs carry ids and counts, never names, phones, amounts or message bodies.
- Secrets only in env; `.env.example` documents them with placeholders.
- Audit events for imports, approvals, matching decisions, status changes,
  sync runs, message approvals and sends.
- Scheduler uses a Postgres advisory lock so two instances never run the same
  pass; apply/approve endpoints check job status inside the transaction.

## 10. Milestones and checklist

Legend: [x] done, [ ] pending, [~] partial (note says what is missing).

### Milestone A: architecture and billing data
- [x] Repository audit
- [x] Architecture plan (this document)
- [ ] Additive migrations (`server/db/billingSchema.js`, wired into `migrate.js`)
- [ ] Role column + `requireRole` middleware
- [ ] Billing provider interface + `FileImportBillingProvider`
- [ ] `EImmigrationApiProvider` boundary (config + not-configured status, no speculative calls)
- [ ] CSV parser (RFC 4180, BOM, delimiter sniffing)
- [ ] XLSX parser (zero dependency: zip + shared strings + styles for dates)
- [ ] Money and date parsing
- [ ] Column mapping with aliases and report-type detection
- [ ] Normalisation with issues
- [ ] Matching engine
- [ ] Reconciliation engine
- [ ] Import staging / preview / approve service
- [ ] Unit tests for all of the above

### Milestone B: admin billing interface
- [ ] `/billing` section in the portal + navigation from the inbox header
- [ ] Overview
- [ ] Invoice list + detail
- [ ] Import centre: upload, mapping, preview, approve, history, exception download
- [ ] Matching review
- [ ] Exception states (errors, empty, loading, role-denied)

### Milestone C: monday.com
- [ ] `MondayApiProvider` (GraphQL, pagination, retries)
- [ ] `MockMondayProvider` with synthetic board
- [ ] Board / column configuration UI + settings persistence
- [ ] Sync preview
- [ ] Controlled apply (dry-run by default)
- [ ] Sync history + tests

### Milestone D: WhatsApp
- [ ] Webhook reuse + status/inbound forwarding to billing
- [ ] Messaging provider abstraction, `MockWhatsAppProvider`, `MetaWhatsAppCloudProvider`
- [ ] EN/ES templates
- [ ] Reminder rules + engine + approval queue + dispatcher
- [ ] Delivery tracking + client responses view
- [ ] Tests

### Milestone E: production readiness
- [ ] End-to-end simulated flow test
- [ ] Security review pass (see section 9 and `docs/billing-automation.md`)
- [ ] Failure/retry tests
- [ ] Operator documentation + credential/activation checklist (`docs/billing-automation.md`)
- [ ] `.env.example` updated
- [ ] Build / test verification
