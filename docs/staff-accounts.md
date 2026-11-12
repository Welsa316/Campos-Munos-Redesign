# Staff accounts, roles and the shared WhatsApp inbox

Who can do what in the staff portal, how the administrator sets it up, what
the activity log records, and what the WhatsApp inbox will and will not send.
Accounts are managed on the portal's **Team** tab (administrators only), or
with `server/scripts/staff.js` from a shell with database access. Both apply
the same rules (`server/auth/team.js`) and every change lands in the
activity log.

## The accounts

| Account | Who | Role | Notes |
|---|---|---|---|
| `office@camulaw.com` | Front desk (Yoletty) | `admin`, unchanged | The existing login. **Nothing about it changes**: same password, same open sessions, same access to everything, and it stays the address that receives website notifications (`ADMIN_EMAIL`). |
| Receptionist | To be created | `receptionist` | Phones, WhatsApp, and the website intake inbox to **read**: the call log, the shared WhatsApp inbox, and website leads with their notes and replies. They cannot reply to, change, annotate or export leads; opening one does not mark it read for colleagues. No billing (not even payment status), no client consent records. |
| Billing paralegal | To be created | `billing_paralegal` | Their own email and password. See "Create the billing paralegal's account". |

**The `admin` role is meant for one person**, the developer who maintains the
portal: it alone has integrations, the monday.com board and column setup, the
Team tab and the activity log (see "Administrator only" below). Before
moving `office@camulaw.com` to `front_desk`, create your own administrator
account and sign in with it; the last enabled administrator cannot be
demoted or disabled. Moving it takes billing imports, sync, reminders and
reminder setup away from that login too: give the front desk the single
permissions they still need from the Team tab, or use `billing_paralegal`
for whoever runs billing.

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

| Capability | Lets the account | admin | front_desk | receptionist | billing_paralegal | staff (legacy) |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `crm.view` | Read website leads, their notes and email replies | ✓ | ✓ | ✓ |  | ✓ |
| `crm.manage` | Reply to leads by email, change status, mark read/archived, add notes | ✓ | ✓ |  |  | ✓ |
| `crm.export` | Download every lead as CSV | ✓ | ✓ |  |  | ✓ |
| `whatsapp.view` | Read WhatsApp conversations, internal notes, assignments | ✓ | ✓ | ✓ | ✓ |  |
| `whatsapp.send` | Reply on WhatsApp from the portal (rules below) | ✓ | ✓ | ✓ | ✓ |  |
| `whatsapp.manage` | Assign conversations, add internal notes, close/reopen | ✓ | ✓ | ✓ | ✓ |  |
| `whatsapp.contacts` | Client WhatsApp numbers and consent (opt in/out) | ✓ | ✓ |  | ✓ |  |
| `billing.status` | Read-only invoice list: status, balance, next due date | ✓ | ✓ |  | ✓ | ✓ |
| `billing.view` | All billing records: overview, invoice history, imports, sync runs, reminders | ✓ |  |  | ✓ | ✓ |
| `billing.import` | Upload, map, approve or cancel eImmigration imports | ✓ |  |  | ✓ |  |
| `billing.reconcile` | Link billing clients to monday.com items | ✓ |  |  | ✓ |  |
| `billing.sync` | Preview and apply the monday.com payment-status sync | ✓ |  |  | ✓ |  |
| `billing.reminders` | Draft, approve, cancel, retry and resolve payment reminders; client replies | ✓ |  |  | ✓ |  |
| `billing.configure` | Reminder rules, templates, sending hours | ✓ |  |  |  |  |
| `calls.view` | See the RingCentral call log (Calls) and refresh it (docs/ringcentral-call-log.md) | ✓ | ✓ | ✓ |  |  |
| `calls.place` | Call a number from the portal (RingCentral RingOut rings your own phone first, then the client) | ✓ | ✓ | ✓ |  |  |
| `calls.exclude` | Mark missed calls that need no callback (verification codes, test calls, spam) so they leave the missed-call counts | ✓ | ✓ | ✓ |  |  |
| `integrations.view` | Status of every connected service (Billing → Integrations) | ✓ |  |  |  |  |
| `integrations.manage` | Connect, check or disconnect the firm's RingCentral account (docs/ringcentral-oauth.md) | ✓ |  |  |  |  |
| `monday.configure` | monday.com board and column mapping, status labels, connection check | ✓ |  |  |  |  |
| `team.manage` | The Team tab: accounts, roles, single permissions, access, sessions, passwords | ✓ |  |  |  |  |
| `activity.view` | The activity log | ✓ |  |  |  |  |
| `forms.test` | The Test channel: test forms sent through the website that skip the inbox, lead counts and staff notifications | ✓ |  |  |  |  |

**Administrator only.** The last six rows, and `calls.clear`
(docs/ringcentral-call-log.md), (`ADMIN_ONLY` in
`server/auth/capabilities.js`) come with the `admin` role and nothing else:
no other role includes them, the Team tab and `staff.js grant` refuse to
hand one to a single account, and a grant written straight into the
database is ignored. Everyone else using the monday.com tab sees the sync
and its history but not the board and column setup.

`staff` is the view-only role that existed before; it keeps exactly the
access it had. `billing.configure` is administrator-only by default: it
decides which reminders the firm sends and their wording. The paralegal sees
that setup read-only. To let them change it:
`node scripts/staff.js grant --email <paralegal> --capability billing.configure`.

The front desk role sees payment **status** (paid, partly paid, overdue,
balance, next due date) in the invoice list and beside a WhatsApp
conversation, but not invoice history, imports, reconciliation, monday.com
or integration settings.

## Home and profile pictures

Every account lands on **Home**: a greeting by its display name (set with
`set-name`), a card for each section it may open, and, for accounts with the
matching access, the missed-calls (`calls.view`) and unread-messages
(`crm.view`) figures. Each person picks their own picture there (a 3D animal
or an emoji on a colour); until then everyone gets a different default
animal. No setup is needed; the choice is saved per account.

**Themes.** The small *Themes* folder at the top right of Home opens six
colour palettes: Campos Muños Classic (the default), Midnight Executive,
Coastal Teal, Graphite Minimal, Modern Violet and Midnight Dark. Picking one
recolours the whole portal at once and is saved to that person's account
(`admin_users.theme`), so it follows them to any computer and never changes
what colleagues see. Red keeps meaning "needs attention" in every theme.
How it works: `admin/src/data/themes.js` is the single source of truth. Each
theme defines the same set of semantic tokens (surfaces, text, icons,
interactive, navigation bar, chart and status colours), and choosing a theme
writes those tokens onto the page as CSS variables. `admin/src/style.css` maps
every colour class the portal uses onto those tokens. The top navigation bars
use the theme's "sidebar" tokens. The last theme used on a computer is
remembered locally, so the page never flashes Classic before your own theme
loads. `admin/test/themes.test.js` checks that every theme defines the same
tokens and that text, focus rings and status badges meet WCAG AA contrast.
The server's list of allowed theme names is `server/auth/themes.js`.

## The Team tab

Administrators only (`team.manage`). One row per account: role (changed
from the dropdown, with a confirmation), whether access is active, and when
the activity log last saw them. **Manage** opens:

- **Revoke access / Restore access.** Revoking signs them out at once and
  stops sign-in; their notes, replies and history stay. Same as
  `staff.js disable`.
- **Reset password.** Their sessions end and you get a temporary password,
  shown once, to give them in person.
- **Sign out everywhere**, for a computer left signed in.
- **Rename**: the name colleagues see.
- **What they can do**: every permission, grouped by area, ticked where the
  role gives it. Untick or tick to change one permission for this person
  only; "Back to exactly what the role gives" clears those changes.

From the portal you cannot change your own role, revoke your own access or
sign yourself out everywhere, so one click can't lock the firm out; the
last enabled administrator can't be demoted or disabled from either place.

## Activity log

Administrators only (`activity.view`), at **Activity** in the header.
Every request that changes something is written to `staff_activity` as
its response finishes (`server/activity/recorder.js`): who (email and role
as they were then), what, which record, when, from which IP, and whether
it went through, was **refused** (their role doesn't allow it, or a revoked
account tried to sign in) or **failed**. Sign-ins are logged, including
wrong passwords (with the email typed, never the password). Changes made
with `staff.js` are logged as "command line". Reading and opening are not
logged, except downloads (the leads CSV, import exceptions); colour theme
changes are not logged.

What the portal does on its own (an acknowledgment sent, a follow-up
cancelled, a status changed on evidence, an escalation) is written to the
same log with the person shown as "The portal (automatic)" and the reason
beside it (`server/automation/events.js`, source `system`). The Person
filter has "The portal itself" for these. See `docs/phase1-automation.md`.

Details hold ids, statuses and counts only: never message or note text,
passwords, or full phone numbers (a placed call keeps the last four
digits). Each action's name lives in `server/activity/actions.js`;
`server/activity.test.js` fails when a route that changes something has
none, so new routes get a readable line. Filter by person, by
refused/failed, by date (firm days, Central time) or by text; the address
keeps the filters, so a filtered view can be bookmarked. Rows are never
updated or deleted by the app.

## Test channel

Administrators only (`forms.test`), at **Test channel** in the header. It
sends test forms and chats through the real website without them becoming
leads. **Get a test link** makes a link to the website (good for an hour)
whose address ends in `#cm-test=<token>`; the website takes the token out
of the address before any analytics tag loads, keeps it for that browser
tab, and shows a "Test mode" strip. Its contact form and chat then send the
token with the form (`site/src/utils/testMode.js`).

The API checks the form exactly as it checks a client's (validation, the
hidden spam field, the hourly limit, HTML stripping, the ten-minute
duplicate window), then checks the token: signed with the server's secret,
not expired, and the account still active, on the same password version
and holding `forms.test`. A good token stores the form in
`test_submissions` (chat follow-ups in `test_chat_messages`), never in
`submissions`, so nothing that reads leads (Messages, the unread badge, the
CSV, contacts, call matching, Home) can see it. No office email, no
OpenAI conversion, and the only notification goes to the administrator who
made the link, opening the Test channel. A token that does not check out
is refused with an "expired" message rather than stored as a lead. The
website does not count a test as a lead in Google Analytics or the ads
pixels either.

Making a link, removing one test and clearing them all are in the activity
log. Code: `server/testChannel/`, `server/routes/testChannel.js`,
`server/testChannel.test.js`.

## Test automation mode

A rehearsal of the lead automation (`docs/phase1-automation.md`) on a test
form, in the same Test channel. Every screen, email and notice it produces
says **TEST MODE — NO PRODUCTION ACTIONS**. It needs none of the automation
switches and turns none of them on.

**Starting a test.** On the Test channel page, under "Automation test": a
first name, the email address the test should use, optionally a phone and
the form's language, then **Start the test**. Or tick "Also start one for
each test form I send from the website" and send a form through a test link
as before. Or open any received test form and press **Start the automation
test**.

**Timing.** *Accelerated*: the acknowledgment at once, then one step about
every minute: each follow-up, escalation level 1, level 2, "No response"
(about five minutes with the default two follow-ups). *Real timing*: the
business days and office hours a lead arriving now would get, from the same
function that schedules a lead (`automation/leads.js leadSchedule`);
**Run the next step now** moves it along. The accelerated minutes exist only
in `testChannel/automation.js` and are never read for a lead.

**What is real and what is only shown.** Two things can really leave, each
only when ticked for that test: the acknowledgment email and the text
messages. Both go only to the address and phone typed for the test.

| Step | In a test |
|---|---|
| Acknowledgment email | Really sent **only** when ticked, email is set up on the server and the address is not on the opt-out list; to the address typed for the test and nowhere else; subject starts `[TEST]`, a test notice sits above the message; a reply goes to the administrator, never to the office inbox. Otherwise shown on the page |
| Acknowledgment text, follow-up texts | Shown on the page. Really sent **only** when "Really text the messages" is ticked: to the test's phone and nowhere else, from the firm's RingCentral number, each starting `[TEST]`; at most three in a test (the acknowledgment and two follow-ups). Needs "agreed to texts" (skipped without it, as for a lead), a North American number, RingCentral able to text, and the number not on the opt-out list. A text RingCentral refused or did not confirm is never tried again. A real test text uses the firm's RingCentral connection, so it also appears in that extension's message history in RingCentral, and a reply to it lands there |
| Escalation (two levels) | Written to the test history. Nobody is notified, unless "Show me the escalation notice" is ticked: then one notice to the starting administrator's own account, titled `TEST:` |
| Status changes | The test's own status (`test_automation_runs.lead_status`). No lead's status is read or written |
| Client replied / Consultation booked / Mark contacted / Mark closed | Buttons that stand in for the client, the calendar and the staff. They stop what is left by the same rules a lead follows: a reply stops the follow-ups but not the escalation; a booking or a changed status stops everything |

The wording is the firm's own templates and settings, rendered by the code
that writes to clients. The booking link is included when one is set, as it
would be with scheduling on.

**An address or number someone real has.** A real email to an address a
lead has, or a real text to a number a lead or billing client has, needs a
one-time confirmation in the portal ("It is mine"), remembered for that
administrator. A test arriving from the website with such an address or
number is not refused: that email or those texts are held back and shown
instead.

**Test texts do not need the automation switches.** They work with
`RINGCENTRAL_SMS_ENABLED` and the rest unset: the tick on the test is the
switch. They are not held to the texting hours, and replies are not read
(the "Client replied" button stands in for a reply).

**History and reset.** Every step, message and button press is a row in
`test_automation_events`, shown per test and in "Test history" at the foot of
the page. None of it is in the staff activity log. **Reset test data** removes
every test form, automation test, waiting step and the history, leaving one
line that says so; **Remove** on one test does the same for that test.

**Isolation.** Test mode writes to `test_submissions` and
`test_automation_*` only. It never writes to `submissions`,
`automation_jobs`, `automation_messages`, reminders, billing or the activity
log, and the automation worker never reads the test tables. (Sending a real
test text makes RingCentral's client save what it learned about the
connection in `automation_state`, as any text does.)
`server/testAutomation.test.js` fingerprints every row of every other table
before and after a whole test and requires them identical.

**Where it runs.** A five-second tick in the API process
(`server/index.js`), separate from the automation worker. On in production;
elsewhere only with `TEST_AUTOMATION_ENABLED=true`, because a developer
machine may be pointed at the live database. `TEST_AUTOMATION_ENABLED=false`
switches it off everywhere. Outside production a real email goes only to an
address in `REMINDER_EMAIL_ALLOWLIST` or `AUTOMATION_TEST_RECIPIENTS`, and a
real text only to a number in `AUTOMATION_TEST_RECIPIENTS`. At
most ten tests run at once. A step cut off mid-way is marked failed and never
tried again, so a test email or text cannot go out twice.

Code: `server/testChannel/automation.js`, `server/routes/testChannel.js`,
`admin/src/modules/testChannel/`, `server/testAutomation.test.js`,
`admin/test/testAutomation.test.js`.

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
