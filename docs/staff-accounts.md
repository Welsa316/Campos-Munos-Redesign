# Staff accounts, roles and the shared WhatsApp inbox

Who can do what in the staff portal, how an administrator sets it up, and
what the WhatsApp inbox will and will not send. There is deliberately no
screen for managing accounts: changes are made by an administrator with
database access, using `server/scripts/staff.js`, and every change is audited.

## The accounts

| Account | Who | Role | Notes |
|---|---|---|---|
| `office@camulaw.com` | Front desk (Yoletty) | `admin`, unchanged | The existing login. **Nothing about it changes**: same password, same open sessions, same access to everything, and it stays the address that receives website notifications (`ADMIN_EMAIL`). |
| Billing paralegal | To be created | `billing_paralegal` | Their own email and password. See "Create the billing paralegal's account". |

The `front_desk` role exists for a receptionist login that should *not* have
administrator access. It is not applied to `office@camulaw.com`. If the firm
later decides that login should be limited to front-desk work, that is one
command (`set-role --role front_desk`), but it would take away billing
imports, monday.com and reminder setup from it, so make sure another enabled
administrator exists first.

## Roles and capabilities

Screens and API routes check **capabilities**, never role names. A role is a
named bundle of them (`server/auth/capabilities.js`), and one account can be
given or denied a single capability on top of its role. The API enforces
every capability on every request; the portal only hides what an account
cannot use. Changes take effect on the account's next click: there is no
need to sign out.

| Capability | Lets the account | admin | front_desk | billing_paralegal | staff (legacy) |
|---|---|:-:|:-:|:-:|:-:|
| `crm.view` | Read website leads, their notes and email replies | ✓ | ✓ | | ✓ |
| `crm.manage` | Reply to leads by email, change status, mark read/archived, add notes | ✓ | ✓ | | ✓ |
| `crm.export` | Download every lead as CSV | ✓ | ✓ | | ✓ |
| `whatsapp.view` | Read WhatsApp conversations, internal notes, assignments | ✓ | ✓ | ✓ | |
| `whatsapp.send` | Reply on WhatsApp from the portal (rules below) | ✓ | ✓ | ✓ | |
| `whatsapp.manage` | Assign conversations, add internal notes, close/reopen | ✓ | ✓ | ✓ | |
| `whatsapp.contacts` | Client WhatsApp numbers and consent (opt in/out) | ✓ | ✓ | ✓ | |
| `billing.status` | Read-only invoice list: status, balance, next due date | ✓ | ✓ | ✓ | ✓ |
| `billing.view` | All billing records: overview, invoice history, imports, sync runs, reminders, integration status | ✓ | | ✓ | ✓ |
| `billing.import` | Upload, map, approve or cancel eImmigration imports | ✓ | | ✓ | |
| `billing.reconcile` | Link billing clients to monday.com items | ✓ | | ✓ | |
| `billing.sync` | Preview and apply the monday.com payment-status sync | ✓ | | ✓ | |
| `billing.reminders` | Draft, approve, cancel, retry and resolve payment reminders; client replies | ✓ | | ✓ | |
| `billing.configure` | monday.com board mapping and connection check; reminder rules, templates, sending hours | ✓ | | | |

`staff` is the view-only role that existed before; it keeps exactly the
access it had. `billing.configure` is administrator-only by default: it
decides which reminders the firm sends and their wording. The paralegal sees
that setup read-only. To let them change it:
`node scripts/staff.js grant --email <paralegal> --capability billing.configure`.

The front desk role sees payment **status** (paid, partly paid, overdue,
balance, next due date) in the invoice list and beside a WhatsApp
conversation, but not invoice history, imports, reconciliation, monday.com
or integration settings.

## Running the script

`server/scripts/staff.js` runs wherever the API's environment is. On Railway,
open a shell inside the API service (it already has `DATABASE_URL`):

```bash
railway ssh
```

Then, inside it, from the `server/` directory (`cd server` first in the
single-service deployment, where the app root is the repository root):

```bash
node scripts/staff.js list
```

The script prints which database it is about to change (host and name, never
credentials) before doing anything. Running it from a laptop with
`railway run` also works, but only with the database's public URL; never
point a laptop's `server/.env` at production for this.

Commands:

| Command | Does |
|---|---|
| `list` | Every account, its role, overrides and resulting capabilities |
| `roles` | Every role and capability with a one-line description |
| `create --email E --name N --role R` | New account. Prints a generated temporary password once |
| `set-role --email E --role R` | Change the role |
| `grant / revoke --email E --capability C` | Add or remove one capability for this account only |
| `clear-overrides --email E` | Back to exactly the role's capabilities |
| `set-name --email E --name N` | The name colleagues see beside messages and notes |
| `reset-password --email E` | New temporary password; signs out every open session |
| `sign-out --email E` | Ends every open session (password unchanged) |
| `disable / enable --email E` | A disabled account cannot sign in and its sessions stop working at once |

Passwords are never accepted as command-line arguments (they would land in
shell history). The script generates one and prints it once; to choose it
instead, set `STAFF_PASSWORD` for that single command. The person then
changes it with the **Password** button in the portal.

The script will not disable the last enabled administrator.

### Create the billing paralegal's account

```bash
node scripts/staff.js create --email <their email> --name <first name> --role billing_paralegal
```

Give them the temporary password in person (not by email or chat) and ask
them to change it on first sign-in. They land on Billing. Use the name they
go by: it is what colleagues see beside their replies and notes.

### When someone leaves

```bash
node scripts/staff.js disable --email <their email>
```

Their sessions end immediately. Their name stays on the messages and notes
they wrote. Re-enable with `enable`; nothing else is lost.

### What was changed, and by whom

Every account change made by the script, and every WhatsApp reply,
assignment and internal note made in the portal, is a row in
`billing_audit_events` (ids and outcomes only, never message text):

```bash
railway run psql "$DATABASE_URL" -c "select created_at, actor_id, action, entity_type, entity_id, details from billing_audit_events where entity_type in ('admin_user', 'conversation') order by id desc limit 30"
```

Script changes have no `actor_id` (no portal session made them); `details`
records the operating-system user that ran it.

## The shared WhatsApp inbox

**Portal → WhatsApp.** One conversation per client number, the same history
for everyone who can read WhatsApp: the client's messages (from the webhook,
see `docs/whatsapp-webhook.md`), staff replies with who sent each one,
payment reminders with who approved them, and delivery status. Conversations
are assigned to a person (replying to an unassigned conversation claims it),
can be closed and reopened, and carry internal notes that are never sent.
A conversation is linked to a billing client when the number matches the one
saved under Billing → WhatsApp contacts, including the two forms WhatsApp
uses for Mexican and Argentine mobiles (521…/52…, 549…/54…); an opt-out
recorded under either form stops replies.

A reply is sent only when **all** of these hold, checked on the server:

1. `WHATSAPP_SENDING_ENABLED=true`. This is the same switch that payment
   reminders obey, for real and simulated sending alike. **It is off in
   production and stays off until the firm authorises it**, after the
   WhatsApp Business account, number and access token are verified
   (`docs/billing-automation.md`, section 3b). While it is off,
   conversations can be read, assigned and noted, and the reply box says why
   it cannot send.
2. The client wrote within the last 24 hours. Outside WhatsApp's
   customer-service window only Meta-approved templates may be sent, and that
   is the reminders' job, not a chat box's.
3. The client has not opted out since they last wrote, and their last message
   is not itself STOP/BAJA or similar.

A double-click or a retried request sends once. A send whose outcome is
unknown (timeout after sending) is shown as such and is never retried
automatically. `WHATSAPP_PROVIDER=mock` (the default) sends to a simulator:
nothing reaches anyone, and the portal says so on every screen.

## Upgrading an existing deployment

Nothing to do by hand. `npm start` runs the migration on every deploy
(`server/db/staffSchema.js`). It adds columns and tables and widens the role
list, and changes no existing row: `office@camulaw.com` and any other
existing account keep their role, password and sessions.
