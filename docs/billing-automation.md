# Billing automation: operator guide and activation checklist

Companion to `docs/billing-automation-plan.md` (architecture and checklist).
Everything below describes the code on branch `feat/billing-automation`, which
builds on the site/portal/API split (`docs/architecture-split.md`).

## 1. What works today, without any credentials

| Feature | Where | Notes |
|---|---|---|
| Import eImmigration exports (CSV, XLSX) | Portal → Billing → Imports | Upload, column mapping with sample values, report type, report date, staged preview, approve, cancel, history, exceptions CSV. Mappings are remembered per column layout. |
| Reconciliation | server/billing/reconcile.js | Paid / partial / unpaid / overdue / void / needs review, in integer cents. Payment plans use the next installment's date. Missing invoices are never marked paid. Older reports never overwrite newer data. Re-importing a file changes nothing. |
| Invoice list and detail | Billing → Invoices | Search, status filters, "not in latest report" filter, payments, change history, monday link. |
| Overview | Billing → Overview | Verified outstanding, counts by status, upcoming payments, needs-attention list, last import, last sync (simulated syncs are labelled). |
| Client matching | Billing → Client matching | Automatic only on an exact eImmigration ID in the mapped monday column; names are suggestions; manual links persist; one monday item per client. |
| monday.com sync against a simulated board | Billing → monday.com | Board/column/label mapping, preview with before/after, apply, history. The mock board is synthetic and resets on restart. |
| Integrations status | Billing → Integrations | Cards never turn green on environment variables alone. |
| Roles | `admin_users.role` | `admin` (existing accounts) can upload, approve, link, configure and sync; `staff` can view. Set with SQL: `UPDATE admin_users SET role = 'staff' WHERE email = '…'`. |
| Retention | server/index.js | Raw uploaded files are deleted after `BILLING_UPLOAD_RETENTION_DAYS` (30). |

| Payment reminders (simulated) | Billing → Reminders | Rules (switched off by default) create **drafts** only; staff approve each one; approved reminders go out inside sending hours; delivery and read receipts are tracked; pending reminders are cancelled automatically when a newer report shows payment, the due date moves, the invoice needs review or the client opts out. Sending goes to a simulator until Meta is set up. |
| WhatsApp contacts and consent | Billing → WhatsApp contacts | Number, language and first name per client; opt-in recorded with how the client agreed; a new number clears consent; a reply of only STOP/BAJA (and similar) opts the client out and cancels their pending reminders. |
| Client replies | Billing → Reminders → Client replies | Replies from known clients wait for a person. |

## 2. Daily workflow for staff

1. In eImmigration, export the invoice report (all invoices with balances is
   best; an outstanding-only export also works but cannot confirm payments of
   invoices it leaves out).
2. Billing → Imports → drop the file.
3. Check each column against the sample values. Fix any wrong guess. Choose
   what the report contains and the date it was generated.
4. Preview. Review the "Problems" rows: skipped rows (errors), invoices
   needing review, clients needing a match.
5. Approve. Download the exceptions CSV for anything to fix in eImmigration.
6. Billing → Client matching: link any new clients.
7. Billing → monday.com → Preview changes → Apply.

## 3. Activating monday.com

Needs: a monday.com account with access to the client board.

1. Create an API token: monday.com avatar → Developers → My access tokens
   (personal token). Prefer a dedicated integration user with access to only
   the client board, so the token cannot read or change anything else.
2. On the API service (Railway → Variables):
   - `MONDAY_PROVIDER=api`
   - `MONDAY_API_TOKEN=<token>`
   - `MONDAY_API_VERSION=2026-07` (current stable when this was written;
     check developer.monday.com/api-reference/docs/api-versioning)
   - leave `MONDAY_WRITES_ENABLED` unset for now
3. Billing → Integrations should show "Not verified". Billing → monday.com →
   Check connection. It should show the account and turn the card green.
4. Choose the client board. Map the columns. The board needs, created by a
   monday admin beforehand (the app never creates or restructures columns):
   - a **status** column whose labels cover: paid, partially paid, unpaid,
     overdue, needs review, no invoices (labels in any language)
   - a **numbers** column for the outstanding balance
   - two **date** columns (last payment, next due)
   - optionally a date or text column for "last billing sync"
   - ideally a **text** column holding each client's eImmigration client ID,
     so clients link automatically
5. Preview a sync. It is a dry run while writes are off. Check a few items
   against monday.com by hand.
6. When satisfied, set `MONDAY_WRITES_ENABLED=true` and redeploy. Apply a
   small sync first.

Rollback: unset `MONDAY_WRITES_ENABLED` (every apply becomes a dry run), or
set `MONDAY_PROVIDER=mock`.

## 3b. Activating WhatsApp sending

Needs: admin access to the firm's Meta Business account (Business Manager)
and the WhatsApp Business Account that holds the firm's number.

**Do not register the firm's existing number through the Cloud API
directly.** The firm already uses that number in the WhatsApp Business app;
registering it on the Cloud API the standard way moves it off the app.
Meta offers onboarding that keeps the Business app working alongside the
Cloud API ("coexistence"). Confirm in Meta Business Suite that the number is
eligible and follow that flow, or use a separate number for reminders. This
decision is the firm's, and it must be made before anything below.

1. In the Meta App Dashboard (the same app as the webhook): add the
   WhatsApp product, connect the WhatsApp Business Account, note the
   **Phone number ID** and **WhatsApp Business Account ID**.
2. Create a **system user** in Business Manager with access to the app and
   the WhatsApp account, and generate a permanent token with the
   `whatsapp_business_messaging` permission. Never use a personal or
   temporary token.
3. In WhatsApp Manager → Message templates, submit the templates from
   Billing → Reminders → Rules & templates, **word for word**, category
   **Utility**, in Spanish (`es`) and English (`en_US`), with the same
   placeholders in the same order. When Meta approves them, tick
   "Approved by Meta" in the portal. Edit the wording there first if the
   firm wants changes; Meta must approve the final text.
4. On the API service (Railway → Variables):
   - `WHATSAPP_PROVIDER=meta`
   - `WHATSAPP_ACCESS_TOKEN=<system user token>`
   - `WHATSAPP_PHONE_NUMBER_ID=<id>`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID=<id>`
   - `WHATSAPP_GRAPH_API_VERSION` only if the pinned default (`v26.0`) is retired
   - leave `WHATSAPP_SENDING_ENABLED` unset for now
5. The webhook (already deployed, `docs/whatsapp-webhook.md`) must be
   subscribed to the `messages` field; that is how delivery receipts, replies
   and STOP opt-outs arrive.
6. Record a staff member's phone as a test "client" with consent, create a
   reminder for a synthetic invoice, approve it, set
   `WHATSAPP_SENDING_ENABLED=true`, send, and confirm it arrives and shows
   "Read". Then switch on the rules the firm wants.

Rollback: unset `WHATSAPP_SENDING_ENABLED` (approved reminders wait), or
`WHATSAPP_PROVIDER=mock`.

What happens on failure: a definite failure (wrong number, template not
approved) shows under Delivery problems and can be retried. If Meta does not
confirm whether a message went out (a timeout), the reminder is marked
"Unconfirmed" and is **never resent automatically**; staff check the WhatsApp
app and mark it "It arrived" or "It did not".

## 4. Activating the real eImmigration export

The column names the importer recognises are educated guesses
(`ALIASES_VERIFIED = false` in `server/billing/columnMapping.js`). Before
relying on imports:

1. Get one real export of each type the firm will use (see section 6).
2. Import each into a **staging** deployment or a local copy, never straight
   into production. Check every column mapping and every derived status
   against eImmigration's own screen for 10 or so invoices, including a paid
   one, a partial one, an overdue one, a voided one and one on a payment plan.
3. Add the real header names to `HEADER_ALIASES`, add a fixture with the real
   layout (with synthetic values only), set `ALIASES_VERIFIED = true`, and run
   the tests.

## 5. Activating the eImmigration API (later)

The adapter boundary is `server/billing/providers/billing/index.js`. No
network calls exist. When the firm has API credentials and the Swagger
documentation:

1. Implement `fetchInvoices()` against the verified schema (read-only
   endpoints only; never `POST /InvoicePayment`).
2. Map fields into `NormalizedInvoice` / `NormalizedPayment`
   (`server/billing/model.js`).
3. Feed them to the same preview → approve pipeline with
   `source = 'eimmigration_api'`.
4. Verify pagination and incremental sync; compare a full API pull with a
   file import of the same day: every invoice should come back unchanged.
5. Set `EIMMIGRATION_API_BASE_URL`, `EIMMIGRATION_TENANT` and the credential
   variables on the API service only.

## 6. Questions for Juan and the paralegals

eImmigration exports
1. Which eImmigration report(s) do you use to see who owes what? Can you export
   one as CSV or Excel (with fake or redacted data if possible) so we can match
   its columns exactly?
2. Does the report include a client ID, an invoice number, the invoice total,
   amount paid and balance due on every row?
3. Does it list every invoice (including paid ones) or only open ones?
4. How are payment plans shown: next installment date and amount, or only a
   description?
5. How are voided invoices, credits, refunds and write-offs shown?
6. Is there a "generated on" date in the file, or should staff enter it?

monday.com
7. Which board holds the clients, and is it one item per client or one per case?
8. Which existing columns should show payment status, balance, last payment and
   next due date? Do those columns exist yet? What are the exact status labels?
9. Can the board get a column with each client's eImmigration client ID? (This
   is what lets clients link automatically instead of by hand.)
10. Who should be able to approve imports and syncs (admin) and who should only
    view (staff)? Which email addresses?

WhatsApp
11. Who has admin access to the firm's Meta Business account and the WhatsApp
    Business Account behind the office number?
12. Should reminders come from the existing office number (which needs Meta's
    coexistence onboarding so the WhatsApp Business app keeps working) or
    from a separate number?
13. How do clients currently agree to WhatsApp contact (intake form,
    verbally)? Is it written down anywhere we can point to?
14. Which reminders does the firm want (days before / after the due date),
    and in which hours may they go out?
15. Any changes to the example message wording (Spanish and English)?

Policy
16. Should an invoice count as overdue the day after its due date, or after a
    grace period?
17. How long should uploaded reports be kept? (Default: 30 days, then the file
    is deleted and only the record stays.)

## 7. Security notes

- Every billing route requires a signed-in portal session; changes require the
  `admin` role, checked on the server on every request.
- Uploads are capped at 15 MB, identified by content (not extension), parsed
  without executing anything, stored only in Postgres and never served back.
  Legacy .xls and PDF are refused. XLSX parsing caps decompressed size and
  entry count.
- Logs and audit events carry ids and counts, never client names, amounts or
  message text.
- monday.com writes go only to mapped columns, only after a preview, only by an
  admin, only once per preview, and only when `MONDAY_WRITES_ENABLED=true` for
  the real API. A failed real call is an error, never mock data.
- The monday token is server-only and is scrubbed from error messages.
- Never upload real client exports to a local or staging database that is not
  as protected as production. Test fixtures in `server/fixtures/billing` are
  synthetic.

## 8. Tests

Reminder tests (engine, providers, webhook hook, and a 16-step end-to-end
flow: consent, drafts, approval gate, send, receipts, cancellation when a
newer report shows payment, STOP opt-out, definite vs unconfirmed failures,
the live-sending switch) run with the same command.


```bash
cd server && npm test
```

Runs the parsers, mapping, normalisation, reconciliation, matching, monday
providers and sync builder (234 tests). The end-to-end flow (22 steps over the
real HTTP API and Postgres) runs when a test database is given:

```bash
createdb camulaw_billing_test
cd server && TEST_DATABASE_URL=postgresql://localhost:5432/camulaw_billing_test npm test
```

It drops and rebuilds that database's schema; it refuses any database whose
name does not contain "test".
