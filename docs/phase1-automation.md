# Phase 1 automation

What the staff portal does on its own, with nobody signed in: acknowledge new
website leads, follow them up, text back a missed caller, move a lead's status
when something proves it, escalate what has waited too long, and approve the
payment reminders the firm marked to send automatically.

**Everything is off until it is switched on.** Deploying this code changes
nothing a client or a staff member would notice. Each automation has its own
variable on the API service, and can be paused in the portal.

Code: `server/automation/` (the worker), `server/integrations/ringcentral/sms.js`
(text messages), `server/billing/reminderService.js` (`autoApprove`),
`admin/src/modules/automation/` (the portal screens).

Deterministic throughout: no model writes, reads or decides anything, and no
client data goes to any AI provider.

---

## 1. What was there, and what this adds

| Already in the portal, reused as it is | What this adds on top |
|---|---|
| Website form and chat intake, duplicate check, honeypot | The lead's work is queued when it arrives; the site sends its language |
| Lead statuses, notes, replies by email (Resend) | Status changes on evidence, with the reason kept; an owner and a contact deadline |
| RingCentral call import, evidence-based classification, callback episodes, Needs attention, `episodeOpen` | A text-back and an escalation per open episode. No second classifier: the automation asks the same `episodeOpen` |
| Callback reminders and their worker (claim under row locks, a delivery row per attempt, backoff) | The same pattern as a general job queue |
| Push notifications and the desktop app's feed | Escalation and failure notices go through them |
| Activity log | The portal's own actions are written to it (source `system`) |
| Contact matching by phone number, decided by staff | A match is confirmed automatically only when phone and email both agree |
| Payment reminder engine: rules, drafts, approval, sending hours, cancellation, opt-out, unknown-delivery handling, scheduler with advisory lock | A per-rule automatic approval. Nothing else about it changes |

**Left out on purpose** (decided 2026-11-11): the eImmigration API sync and
its scheduler, the automatic monday.com payment-status sync, and the
management digest. The file import, and Monday's preview/apply, work as
before. See `DEFERRED.md`.

## 2. Architecture

```
index.js  ── every minute ──▶  automation/worker.js  runAutomation()
                                 │
                                 ├─ sweeps (one instance at a time: pg advisory lock)
                                 │    queue new leads the form request missed
                                 │    read text replies and STOPs          (if on)
                                 │    read the calendar for bookings       (if on)
                                 │    queue missed-caller texts/escalations
                                 │    act on new evidence about open leads
                                 │    confirm caller matches               (if on)
                                 │
                                 └─ jobs  run everything due in automation_jobs
                                          (any number of instances: each job is
                                           taken by exactly one)
```

- **No browser is involved.** Nothing uses a browser timer or storage; the
  portal only shows state and takes decisions.
- **Durable.** Work to do is a row in `automation_jobs`. A restart loses
  nothing: the row is still there.
- **Each step is on its own.** A step that fails is recorded
  (`automation_state`, shown on the Automation page) and the rest carry on. A
  failing calendar never stops an acknowledgment; a failing text never touches
  the call import, which is a separate timer.

### Idempotency

1. **Queueing.** Every job has an idempotency key (`lead-ack-email:42`,
   `lead-followup:42:followup_1`, `missed-call-sms:<episode id>`,
   `lead-sla:42:1`). The key is `UNIQUE`: queueing the same thing twice (a
   retried form, two instances, a restart) queues it once.
2. **Claiming.** A worker takes a job by moving it `pending → running` under
   `FOR UPDATE SKIP LOCKED`. Two workers never hold the same job.
3. **Sending.** Every send goes through `automation/messaging.js deliver()`,
   which writes the `automation_messages` row (keyed by the job's key) *before*
   calling the provider. If the process dies between the row and the
   provider's answer, the next run finds the row still `sending`:
   - **email** is sent again with the same Resend idempotency key, which
     Resend honours for 24 hours, so the person gets one email;
   - **text**: RingCentral has no such key, so the outcome is `unknown`. The
     job fails for a person to look at and is **never sent again by itself**.

### Retries

- A transient failure is tried again after 2, 10, 30, then 120 minutes; after
  the fourth attempt the job stays `failed`.
- A failure that cannot pass (a refused address, a refused number) fails at once.
- "Not now" (outside the texting hours, RingCentral asked us to slow down) puts
  the job back without counting as an attempt.
- A job left `running` by a crash goes back to `pending` after ten minutes.
- A failed job is shown under **Automation → Needs someone** and on the lead;
  an administrator can try it once more or dismiss it. An unconfirmed text has
  no "Try again": only a person who checked RingCentral should resend it.

## 3. The automations

### New-lead acknowledgment
`leads.js` — when a website lead is stored, its work is queued (and a lead the
form request did not get to is picked up within a minute).

- **Email** (Resend), from the firm's address, replies to the office inbox.
- **Text** (RingCentral), only with the person's agreement on the form (see
  "Consent"), inside the texting hours unless the firm allows otherwise.
- Says only that the message was received and that the team will be in touch,
  with the office phone and, when scheduling is on and a link is set, the
  booking link. Never legal advice.
- **Language**: the website now sends the language the form was written in
  (`language: es|en`). It is never guessed from a name. When it is not known,
  a short bilingual version goes out.
- Not sent: to an archived or spam lead, a lead already past New, an address
  that cannot receive, someone on the opt-out list, a lead older than 24
  hours, or the same person twice in a day.
- **It never changes the status.** An acknowledged lead is still New.

### Follow-up sequence
- Default: a text after **1** and **3** business days, then **No response**
  after **5**, all in settings.
- **Text only.** A client's reply to an email lands in the office inbox, where
  the portal cannot see it, so an email sequence could keep writing to someone
  who already answered. An email step is refused on save. (Inbound email is in
  `DEFERRED.md`.)
- Stops as soon as any of these is seen: a reply from the portal, a connected
  call back, an answered call from them, a text reply, a booking, or the lead
  being archived, marked Spam, moved out of New, or switched off by staff.
- Each step also looks at the lead again right before sending.

### Lead status from evidence
`leadStatus.js`

| Change | Only when |
|---|---|
| New → Contacted | staff replied from the portal; **or** an outgoing call to the lead's number connected; **or** a call from that number was answered (after the lead wrote in) |
| → Scheduled | a booking for the lead is on the calendar |
| New → No response | every follow-up went out and nothing came back |
| → Retained | **never automatically.** Nothing the portal can see proves a client was signed |

- A text reply stops the follow-ups and puts the lead under "needs someone";
  it only also moves New → Contacted if the firm switches that on (settings →
  The firm and its hours), since nobody at the firm has spoken to them yet.
- A call on a number two open leads share stops the texts for both and
  changes nobody's status.
- Every change keeps its reason (`status_reason`, `status_auto`), is in the
  activity log, and is undone by picking another status.

### Missed-call text-back
`missedCalls.js` — built on the call engine as it is. It reads the open
callback episodes that Needs attention lists and asks the same `episodeOpen`
again right before sending.

- One text per episode, a few minutes after the call (so RingCentral's final
  record is in). A caller who rings five times is texted once.
- One automatic text per number per 7 days.
- Never texted, because none of these is ever an open episode: answered,
  outgoing and internal calls; calls ended by the phone system; withheld
  numbers; numbers marked spam, verification or a colleague's phone; calls
  marked handled; the "check if they still need help" group.
- A call at night is texted in the morning, if nobody has dealt with it by then.

### Ownership and escalation
- A lead can have an owner (default owner in settings; changed on the lead).
- A new lead gets a contact deadline in **office time** (default 2 office hours).
- **Level 1**: the owner — or, with no owner, everyone who can work leads —
  gets a notification, and one email goes to the owner or the office inbox.
- **Level 2** (default 6 office hours later): everyone who can work it and the
  administrators, in the portal. An email goes out only if a second-level
  address was set; it is empty by default.
- The same for a caller still waiting for a call back.
- Never at night or at the weekend: a deadline that passed while the office
  was closed waits for it to open.
- Generic words only: no name, number or message in a notification or email.

### Leads that need a person
Derived from what is true now (`health.js leadAttention`), shown on Home
("My follow-ups") and on the lead: a text reply waiting, an automatic message
that failed, a cancelled booking, past the contact deadline, a possible vendor
message, a finished sequence with no answer.

### Vendor and spam rules
`spam.js` — deliberately narrow.

- A **sender address or domain an administrator listed** gets the existing
  Spam status (stored `closed`) and is archived. A public mail provider
  (gmail.com and the like) cannot be listed as a domain.
- A **listed phrase** only marks a lead "possible vendor message": it stays in
  the inbox, gets no automatic messages, and waits for someone to decide.
- "Not spam" puts a lead back in the inbox as New, and it is never marked again.

### Contact matching
`contactMatch.js` — a caller is confirmed as a website lead only when **every
lead on that number carries the same email address** *and* that phone-and-email
pair is on record at least twice (the person wrote in more than once, or
replied from that phone to a text sent to that lead). One lead on a number
stays a possible match for a person. Nothing is merged; a confirmation is one
row, marked as the system's, and is undone from Calls like any other. A match a
person decided is never touched.

### Consultation bookings
`scheduling/` — the firm keeps scheduling where it is. The portal **reads**
the firm's Google Calendar and links an event to a lead when a guest's email
address is exactly a lead's. Only matched events are kept, and only their time
and state. See "Scheduling setup".

### Automatic payment reminders
`billing/reminderService.js autoApprove` — a rule marked **Send
automatically** (Billing → Reminders → Rules & templates) has its drafts
approved by the scheduler instead of a person. It re-checks eligibility first
and then does exactly what a person's approval does. Unchanged: next
installment only, no invented amount, nothing for an invoice that needs
review, cancellation on payment or a moved due date, opt-outs, sending hours,
and an unknown delivery is never resent. `approved_by` stays empty and
`auto_approved` is true.

## 4. Feature flags

Two things must both be true: the variable is exactly `true`, and an
administrator has not paused it (**Integrations → Automation**).

| Variable (API service) | What it switches on | Also needs |
|---|---|---|
| `AUTOMATION_ENABLED` | the worker. Off: nothing below runs | |
| `LEAD_ACK_ENABLED` | new-lead acknowledgment | |
| `LEAD_ACK_EMAIL_ENABLED` | …by email | `LEAD_ACK_ENABLED` |
| `LEAD_ACK_SMS_ENABLED` | …by text | `LEAD_ACK_ENABLED`, `RINGCENTRAL_SMS_ENABLED` |
| `LEAD_FOLLOWUP_ENABLED` | follow-up texts | `RINGCENTRAL_SMS_ENABLED` |
| `LEAD_STATUS_AUTOMATION_ENABLED` | status changes on evidence | |
| `LEAD_SPAM_AUTOMATION_ENABLED` | vendor rules | |
| `CONTACT_AUTO_MATCH_ENABLED` | caller-match confirmation | |
| `SLA_ESCALATION_ENABLED` | escalation of leads and callers | |
| `RINGCENTRAL_SMS_ENABLED` | any automatic text at all | |
| `RINGCENTRAL_SMS_INBOUND_ENABLED` | reading replies and STOPs (read-only) | |
| `MISSED_CALL_SMS_ENABLED` | missed-call text-back | `RINGCENTRAL_SMS_ENABLED` |
| `SCHEDULING_ENABLED` | reading the calendar; the booking link in messages | |
| `BILLING_AUTO_REMINDERS_ENABLED` | automatic approval of marked rules | `BILLING_SCHEDULER_ENABLED`, `WHATSAPP_SENDING_ENABLED` |

Other variables:

| Variable | Purpose |
|---|---|
| `AUTOMATION_TEST_RECIPIENTS` | comma-separated emails and phone numbers. When set, automatic messages go **only** to these. Outside production nothing is sent to anyone else at all |
| `RINGCENTRAL_SMS_FROM` | the number texts come from. Must be one RingCentral lists as able to text for the connected extension |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | read-only calendar access |
| `GOOGLE_CALENDAR_ID` | the calendar, if not set in the portal |

Stopping the follow-ups when evidence appears does **not** depend on the
status flag: with `LEAD_STATUS_AUTOMATION_ENABLED` off, a connected call still
cancels the texts; only the status is left alone.

## 5. Settings (no deploy)

**Integrations → Automation → Settings**, stored in `automation_settings`:
message wording; follow-up days; contact deadlines; texting hours and pace;
the acknowledgment's consent and hour rules; missed-call delay and cooldown;
booking link and calendar; vendor rules; the firm's name, phone and office
hours; default owner. A change applies from the next run. Office hours live in
one place (`automation/businessHours.js`): Monday to Friday, 9:00–17:00, New
Orleans time, unless changed there.

### Templates
`automation/templates.js`. The defaults are **drafts for the firm to approve**.
Checked on save: Spanish, English and a bilingual version each; a text must
say STOP and fit 480 characters; only `{{firstName}}`, `{{firmName}}`,
`{{officePhone}}`, `{{bookingLink}}`; a line with the booking link is dropped
when there is no link. A first name is used only when it looks like a name.

Note for the firm: Spanish accented vowels (á, í, ó, ú) make a text use the
shorter 70-character segments, so a Spanish text costs more segments than its
length suggests.

## 6. Suppression and opt-out

One list (`automation_suppressions`), checked right before every automatic
message:

- **STOP** (and UNSUBSCRIBE, CANCEL, QUIT, END, ALTO, BAJA, …) texted to the
  firm's number puts the number on the list. Only when the whole message is
  the word: "please stop calling my husband" is a reply for a person.
- **START** lifts an opt-out the person sent themselves.
- A delivery failure that says the person opted out at the carrier
  (`SMS-…-413`) is recorded too; an unreachable number is listed as such.
- An administrator can add or remove a number or an address.
- A number that opted out of the firm's **WhatsApp** payment reminders is not
  texted either.
- Also never messaged: archived leads, Spam, leads past New, a lead staff
  switched off, an address that cannot receive.

The words of a text reply are **not stored**: only who, when and which kind.
Staff read and answer it in RingCentral.

## 7. Database changes

All additive and safe to run on every deploy (`server/db/automationSchema.js`,
applied last by `db/migrate.js`; tested by migrating twice).

New tables: `automation_settings`, `automation_state`, `automation_jobs`,
`automation_messages`, `automation_suppressions`, `rc_sms_inbound`,
`consultation_bookings`, `call_episode_escalations`.

New columns:
- `submissions`: `language`, `sms_consent_at`, `owner_id`, `assigned_at`,
  `sla_due_at`, `escalation_level`, `escalated_at`, `automation_paused`,
  `automation_started_at`, `spam_state`, `spam_reason`, `status_reason`,
  `status_auto`, `status_changed_at`
- `contact_links`: `decided_auto`, `evidence`
- `billing_reminder_rules.auto_approve`, `billing_reminders.auto_approved`

One constraint widened: `staff_activity.source` now also allows `system`.
Nothing is renamed or dropped. Finished jobs are purged after 180 days.

## 8. RingCentral SMS setup

Having RingOut does not mean texts can be sent. Before
`RINGCENTRAL_SMS_ENABLED`:

1. **App permissions** (RingCentral Developer Console → the firm's app): add
   **SMS** (to send) and **Read Messages** (to read replies), then **connect
   RingCentral again** on the Integrations page so the new permissions are
   granted.
2. **The number must be enabled for texting.** In the US a local number sends
   texts only once the firm's brand and an **approved TCR (10DLC) campaign**
   exist and the number is assigned to it (RingCentral Admin Portal → Phone
   System → Business SMS). A toll-free number must be verified instead.
   RingCentral's content policy asks that automated texts come from a number
   on a campaign registered for automated messaging, with consent on record.
3. **The number must belong to the connected extension.** A company number
   texts only from the one extension it is assigned to.
4. Set `RINGCENTRAL_SMS_FROM` if that extension has more than one number able
   to text. With several and none chosen, nothing is sent.
5. **Automation → Text messages → Ask RingCentral now** shows whether texts can
   be sent and from which number, or exactly why not.

Limits respected: 40 requests a minute at RingCentral; the portal sends at
most 10 texts a minute (settings), and when RingCentral answers 429 everything
waits for as long as it asks.

A 200 from RingCentral only means it accepted the text. The portal looks at
the message's record ten minutes later and records a failed delivery.

### Consent — decide before switching texts on
- **Leads.** By default a lead is texted only if the form carried their
  agreement (`smsConsent: true` → `sms_consent_at`). **The website forms do not
  ask for it yet**: adding that checkbox needs wording the firm approves. Until
  then no lead is texted, and each skipped text says why
  (`no_sms_consent`). The firm can instead decide that an inquiry is itself
  consent (settings → Timing).
- **Missed callers.** Nobody who merely called has agreed to a text. Whether
  an automatic text back is permitted is the firm's decision to take with
  counsel and against RingCentral's policy. It stays off until then.

## 9. Scheduling setup

1. In Google Calendar, the firm creates an **appointment schedule** (its
   booking page) on the calendar consultations go on.
2. In Google Cloud, create a service account, enable the Calendar API, and
   make a JSON key. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` on the API service.
3. Share that calendar with the service account's address, **"See event
   details"**. If the firm's Workspace limits outside sharing to free/busy, an
   administrator must allow details for this share, or the portal sees no
   guests and matches nothing.
4. In the portal: Automation → Settings → Booking link and calendar: the
   booking page's link and the calendar ID.
5. **Make one test booking** with the email address of a test lead, and
   confirm the lead becomes Scheduled. Google does not document that the
   person who booked is listed as a guest with the address they typed; the
   matching depends on exactly that, so it must be seen once before this is
   relied on. If Google does otherwise, nothing is matched and nothing is
   marked Scheduled (it fails safe).
6. Set `SCHEDULING_ENABLED=true`.

Read-only (`calendar.events.readonly`). The portal never creates, changes or
cancels an event. A booking made with a different address than the form's is
not matched; staff set Scheduled by hand, as today. A cancelled booking does
not un-schedule the lead; it asks a person to look.

## 10. Activation checklist

Each step is independent and can be undone by setting its variable back.

**Stage 1 — infrastructure, nothing sent**
1. Deploy. Confirm the migration ran and the portal works as before.
2. Set `AUTOMATION_TEST_RECIPIENTS` to the test address(es) and
   `AUTOMATION_ENABLED=true`.
3. Open Integrations → Automation: the worker says Running; "Messages can go
   to" says only the test addresses.

**Stage 2 — acknowledgment, escalation, scheduling**
4. The firm approves the acknowledgment wording (Settings → Messages).
5. `LEAD_ACK_ENABLED=true`, `LEAD_ACK_EMAIL_ENABLED=true`. Send a form from the
   test address; confirm one email, in the right language.
6. `SLA_ESCALATION_ENABLED=true`, `LEAD_STATUS_AUTOMATION_ENABLED=true`.
7. Scheduling setup above, then `SCHEDULING_ENABLED=true`.
8. Remove `AUTOMATION_TEST_RECIPIENTS` to go live for email.

**Stage 3 — texts**
9. RingCentral SMS setup and the consent decisions above.
10. `RINGCENTRAL_SMS_INBOUND_ENABLED=true` first (read-only), then
    `RINGCENTRAL_SMS_ENABLED=true` with the test number in
    `AUTOMATION_TEST_RECIPIENTS`.
11. `LEAD_ACK_SMS_ENABLED`, then `LEAD_FOLLOWUP_ENABLED`, then
    `MISSED_CALL_SMS_ENABLED`, one at a time.

**Stage 4 — payment reminders**
12. With `BILLING_SCHEDULER_ENABLED` and `WHATSAPP_SENDING_ENABLED` already on
    and templates approved by Meta: tick "Send automatically" on one rule,
    then `BILLING_AUTO_REMINDERS_ENABLED=true`.

## 11. Rollback

- **One automation**: pause it on the Automation page (immediate), or set its
  variable to `false`.
- **Everything**: `AUTOMATION_ENABLED=false`. The worker stops; queued jobs
  stay queued and are skipped as `switched_off` or `too_late` if it is turned
  on again later (a follow-up more than three days late is not sent).
- **Payment reminders**: `BILLING_AUTO_REMINDERS_ENABLED=false`; already
  approved reminders can be cancelled in Billing → Reminders.
- **The code**: revert the release. The new tables and columns are additive
  and are ignored by the previous version; nothing needs to be migrated back.
  (The widened `staff_activity.source` check stays, harmlessly.)

## 12. Troubleshooting

| Seen | Meaning |
|---|---|
| A switch says "Off" | its variable is not `true` on the API service |
| "Waiting" | its own switch is on, but one it needs is off (the row says which) |
| Message skipped: `not_production` / `not_a_test_recipient` | sending is limited to the test addresses, or this is not the live server |
| `no_sms_consent` | the form did not carry the person's agreement to be texted |
| `sms_unavailable` | RingCentral cannot send texts; "Ask RingCentral now" says why |
| `unknown_delivery` | a text may or may not have gone out; never resent automatically. Check RingCentral |
| `not_delivered` | RingCentral accepted the text and could not deliver it |
| Calendar "forbidden" | the calendar is not shared with the service account, or sharing is limited to free/busy |

Where to look: Automation page (state and failures) → the lead's page
("Automatic follow-up") → Activity, filtered to "The portal itself".

## 13. Production verification

After each stage, in the portal:
- Automation: worker Running; no failed step; the switch you set says On.
- Activity → "The portal itself": the action you expected, with its reason.
- For a send: exactly one message on the lead; the provider's own log
  (Resend / RingCentral) shows one.
- Pause the automation and confirm the next due job is skipped, then resume.

## 14. Tests

`server/automation.test.js` (the worker over a real Postgres, fake providers),
`server/automation/automation.unit.test.js` (hours, templates, opt-out words,
switches, the RingCentral and Google clients against recorded conversations),
`server/billing/autoReminders.test.js`, `admin/test/automation.test.js`.
Never run against production: each uses its own database, whose name must
contain `test` (`TEST_DATABASE_URL=postgres://localhost/camulaw_phase1_test`).
Each guard was broken on purpose once to confirm a test goes red for it.
