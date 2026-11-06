# Calls: how each incoming call is classified, and on what evidence

The Calls page labels an incoming call **answered**, **not answered**,
**caller hung up**, **voicemail**, **handled by the phone system**, or
**not confirmed**. The labels are used to judge how staff handle calls, so a
wrong one is worse than none. The rule is:

> A call gets a label only when a field whose meaning RingCentral documents
> says so. Otherwise it is **not confirmed**, and not confirmed is never
> counted as missed, or against anyone.

Code: `server/integrations/ringcentral/callEvidence.js` (rules),
`reasonMeanings.js` (RingCentral's wording), `extensionDirectory.js` (who is
a person), `callLog.js` (import, re-reading, counts). Tests:
`callEvidence.test.js`, and `calls.flow.test.js` for import and counts.

## What RingCentral documents, and what it does not

These come from RingCentral's API specification (`rc-platform.yml` 1.0.58)
and its developer guides.

- **`reason`** (on each call record and each leg) has a documented meaning
  for every value. For example, `Accepted` is "The call was connected to and
  accepted by this number". `No Answer` is "You did not answer the call".
  `Hang Up` is "The caller hung up before the call was answered". These
  meanings are what the classifier relies on. They are copied verbatim into
  `reasonMeanings.js` and shown on the page.
- **`result`** (`Missed`, `Rejected`, `Abandoned`, `Voicemail` and so on)
  has **no documented per-value meaning**, and neither does **`legType`**.
  Both are kept and shown as RingCentral's own result, but no conclusion
  rests on them. A call RingCentral calls "Missed" with no backing `reason`
  is not confirmed.
- **`reasonDescription`** is free text. It is shown and never parsed.
- **A missing leg proves nothing.** No document says an extension without a
  leg was never alerted.
- **Extension type** (person, call queue, IVR menu, voicemail box and so on)
  is not in the call log. It comes from the extension directory
  (`GET /account/~/extension`, Read Accounts permission), read once a day.
- **Several records per call.** RingCentral says to use the session id to
  group the call logs of one call. Records that share a telephony session
  are read together and counted once (`rc_calls.call_key`, `is_primary`).

## The rules, in order

The rules use each leg's `reason`, plus whether a voicemail message is
attached.
- **A person** is an extension the directory types `User`, `DigitalUser`,
  `VirtualUser` or `FlexibleUser`.
- **Extensions are identified by id only.** Extension numbers get reused, so
  a leg that names only a number, or an id no longer in the directory, is
  never matched to whoever holds that number now. Such a leg is an
  unconfirmed extension.
- **Incoming records only.** A session that also holds an outgoing record
  (a transfer out) is read from its incoming records.

1. **Answered.** A leg to a person has reason `Accepted`. A leg that carries
   a voicemail message is the voicemail taking the call, not the person.
2. **Not confirmed, because someone else may have answered:**
   - an extension the directory cannot place accepted it;
   - a phone the call was forwarded to accepted it. That is either the
     person or that phone's own voicemail, and the call log cannot tell
     which.
3. **Voicemail.** A voicemail message is attached to the call.
4. **Not confirmed, when an attempt was `Stopped`.** The spec says `Stopped`
   means "the call was answered by another phone". With no answer recorded
   anywhere, that contradicts both a hang-up and "nobody answered".
5. **Caller hung up.** A record or leg has reason `Hang Up`. Whether anyone
   was rung first is only stated when a leg shows it. Otherwise the page says
   "no record of anyone being rung", never "before ringing".
6. **Not answered.** A leg to a person has reason `No Answer`,
   `Not Answered` or `Line Busy`, and nothing else accepted the call. If a
   queue or IVR menu accepted it, it may have been passed to someone the log
   doesn't show, so the call is **not confirmed**.
7. **Handled by the phone system.** A refusal or failure reason (`Number
   Blocked`, `Calls Not Accepted`, `Call Loop`, network errors) and no person
   offered the call. No callback is needed.
8. **Not confirmed.** Anything else, with the reason why: no reason given,
   no legs, an extension of unknown type, or the directory unavailable.

**Per person.**
- *Offered to* lists only people a leg shows the call reaching, with that
  leg's reason. These attempts are left out of *offered to*:
  - one their voicemail took;
  - one that never reached a device (an offline desk phone: `No Digital
    Line`).
- *Not answered by* someone is recorded only on calls proven not answered by
  anyone (not answered, caller hung up, voicemail), from their own
  `No Answer`, `Not Answered` or `Line Busy` legs. On a call that is answered
  or not confirmed, nobody is charged.
- **Names.** Each portal account can be linked to its extension on the Team
  tab. The page then shows the person's portal name (RingCentral calls 101
  "Office CML"), and keeps RingCentral's own name in the call's details.

## What can be established from the call log, and what cannot

| Classification | Call log alone | Needs Telephony Session events |
|---|---|---|
| Answered by a person | **Yes**: `reason: Accepted` on a person's leg | — |
| Answered on a forwarded phone | No. The person or that phone's voicemail would both read `Accepted` | Not reliably either |
| Not answered by a person | **Yes**: `No Answer`, `Not Answered` or `Line Busy` on their leg, when nothing else accepted the call | — |
| Ring timeout specifically | No. "Not answered" says it was not answered, not why | Partly: `status.reason` such as `Timeout` exists but is not documented |
| Caller hung up before an answer | **Yes**: `reason: Hang Up` | — |
| Hung up **while** a named person was rung | Yes when the `Hang Up` is on that person's leg | Corroborated by their party reaching `Proceeding` |
| Hung up / ended **before anyone was alerted** | **No.** A missing leg is not evidence | **Yes**, from live events: seen to the end, no person's phone ever `Proceeding` |
| Employee rejected / declined | **No.** `Rejected` and `Declined` results are undocumented; `Stopped` is ambiguous | `status.reason: Rejected` exists but is not documented |
| Voicemail | **Yes**: an attached voicemail message | `status.code: VoiceMail` is documented |
| IVR / auto-receptionist handled it | No field says so | Partly |
| Phone system refused it | **Yes**: documented refusal or failure reasons | — |

## Live call events (Telephony Sessions)

From the moment an administrator registers them (Integrations → **Live call
events** → **Register**), RingCentral reports each call as it happens.

**How it's set up**
- **Subscription.** Account Telephony Sessions,
  `/restapi/v1.0/account/~/telephony/sessions`, delivered by webhook to
  `https://api.camulaw.com/webhooks/ringcentral`.
- **Permission and lifetime.** It needs the **Call Control** permission. It
  lasts 10 years and a daily check renews it a month before it would end.
  **Remove** deletes it. It changes nothing in RingCentral's routing, phones
  or settings.
- **Receiver** (`routes/ringcentralWebhook.js`):
  - answers RingCentral's address check by echoing `Validation-Token`;
  - after that, accepts only deliveries carrying the verification token set
    at registration, kept as a SHA-256 digest, that name our subscription.
  - Each party's state change is stored in `rc_telephony_events` (kept 400
    days), and the call is re-read when its events arrive.
- **Where it shows.** Each call's details in Calls, under "What happened
  live": each phone, queue or greeting, its states in order, and how long
  each person's phone rang.

**What the events are allowed to prove** (RingCentral's documented meanings):
- **A person's phone was offered the call.** Their party reached
  `Proceeding`, "The call is being forwarded to an endpoint". Ring time runs
  from there to their next state.
- **Answered.** A person's party (on the side facing their phone,
  `direction: Inbound`) reached `Answered`, "answered on a target endpoint and
  media is established". `Answered` on the phone system's side only means the
  call reached the firm, and is shown as "taken by the phone system".
- **Ended before anyone was rung.** The call was followed to its end (every
  party seen reached `Disconnected` or `Gone`), no person's phone ever
  reached `Proceeding`, and no call-log step reached a person. Who ended it,
  the caller or the system, is not stated. It counts as unanswered (it may
  need a callback), never against anyone.
- **When a caller who hung up left.** With the call log's `Hang Up`, the
  stage becomes *before anyone was rung* or *while ringing Yoletty (18 s)*.

**What they are not used for**
- **RingCentral's `missedCall` flag** is shown on the phone it was set for,
  never charged to anyone. RingCentral doesn't document what sets it.
- **Charges.** Not answering is still charged only from the call log's
  documented `No Answer` / `Not Answered` / `Line Busy` on that person's
  leg, and only on calls proven not answered by anyone.

**Limits.**
- The events depend on RingCentral delivering them. A party that isn't part
  of the account (the caller's own phone) is never reported, and deliveries
  can arrive out of order; they're read by `sequence`.
- Calls before registration have no events.

## Stored data and re-reading

- **`rc_calls.rc_raw`**: RingCentral's record as sent, minus recordings,
  voicemail links, other links and billing. Every label can be redone from
  it.
- **`classification`, `classification_evidence`, `classifier_version`**: the
  derived reading, kept apart from RingCentral's own `result_raw`.
- **When calls are re-read:**
  - on every import, calls whose rules version differs from the current
    `CLASSIFIER_VERSION` (that is, after a change to the rules);
  - every call, when the extension directory changes;
  - each call imported in that run.
- **The one-time 90-day re-read.** When this shipped, the import read 90
  days of RingCentral's log once (`raw_backfilled_at`), so recent calls have
  their full record. Older calls, and any beyond the import's page limit in
  that run, stay **not confirmed** ("imported before RingCentral's full
  record was kept").
- **If the extension list cannot be read** (no Read Accounts permission),
  nothing can be confirmed as a person. The page says so, and those calls
  are not confirmed until it can be read.
