# Calls: the RingCentral call log in the portal

**Portal → Calls** (`/calls`) lists the firm's phone calls in plain terms:
who called (by name when the number matches a client or a website lead),
the number, answered / missed / voicemail / outgoing, who answered, when, how
long, and for missed calls whether anyone called back. Counts across the top
filter the list; ranges are Today, Yesterday, 7 days and 30 days; search
takes a name or any part of a number. A matched website lead links straight
to it in the Inbox.

Read-only towards RingCentral: it never places calls or changes numbers,
routing, queues, extensions, greetings or voicemail. The number is a `tel:`
link, so clicking it opens whatever phone app the computer uses (usually the
RingCentral app).

## On Home

The **Missed calls in business hours** card counts incoming calls nobody
answered (missed, or sent to voicemail) during the firm's published hours,
Monday to Friday 9:00 to 17:00 New Orleans time, over the last 30 days, and
how many of them have not been called back (withheld numbers can't be, so
they are not counted there). Public holidays are not excluded. The hours are
`BUSINESS_HOURS` in `server/integrations/ringcentral/callLog.js`, taken from
the website's opening hours. Clicking the card opens Calls showing exactly
those calls (`/calls?range=month&filter=unanswered&hours=business`).
Calls marked as needing no callback (below) are not counted.

## Missed calls that need no callback

Some missed calls are not people waiting for the firm: a machine reading out
a verification code, someone from the firm ringing the line to test it, spam.
Anyone with `calls.exclude` (administrators, front desk, receptionist) can
press **No callback needed** on a missed call or voicemail and pick why:
verification code or automated call, someone from the firm, spam, or other
(with a note). Tick **every call from this number** for a number that keeps
calling, such as a staff member's mobile; that covers its past and future
calls. A number marked "someone from the firm" for every call is labelled
**Firm** on all its calls, answered and outgoing included, and is no longer
shown as a website lead even if that person once tried the contact form with
it.

A marked call leaves the Missed, Voicemail and Not called back counts, the
Unanswered view and the Home card. It stays in the log under **All calls**,
tagged with the reason, who marked it and when; the **excluded** link under
the counts lists them. **Count it again** removes the mark (for a number,
every call from it counts again). The marks are `rc_call_exclusions` (one
call) and `rc_ignored_numbers` (a number) in
`server/integrations/ringcentral/callExclusions.js`.

## Needs attention: one item per caller

**Calls → Needs attention** lists the people waiting for a call back, not
their calls. Consecutive open unanswered calls from one number are one
**callback episode**: "3 unanswered calls · first Mon 9:15 AM · last 10:05
AM", with a single Call back / Handled / ⋯. Opening it shows each call and
what RingCentral recorded for it. A single call reads as before.

What is left to do about a call is decided apart from what the call *was*.
The classification (`docs/ringcentral-call-classification.md`) and who a call
is attributed to never change; `followUpDecision()` in
`server/integrations/ringcentral/callLog.js` says what follows from it, in
this order:

| Decision | When |
|---|---|
| `not_actionable` | Outgoing; between extensions; a duplicate record of a call (not `is_primary`); withheld number; ended by the phone system; not classified yet |
| `confirmed_answered` | Answered by someone at the firm |
| `resolved` | Proven unanswered, or no recorded outcome, and since dealt with: a connected callback to the number, a later answered call from it, marked handled (or cleared), or no callback needed |
| `confirmed_unanswered` | Proven not answered by anyone (not answered, caller hung up, ended before ringing, voicemail) and still open: **Needs attention** |
| `review` | No recorded outcome (`unknown`) and still open: **Check if they still need help** |

The list's SQL (`needs_attention`, `needs_review`) is the same rules, and the
tests check every listed call against the function.

**Episodes.** Derived from the stored calls on every read; nothing extra is
stored. An episode ends when something closes its calls: a connected
callback or a later answered call (which closes every earlier call), or a
call marked handled, cleared or as needing no callback. A later unanswered
call then starts a new episode. A callback that did not connect closes
nothing: it is counted on the episode ("Tried 2×") and the episode moves to
*Try again* only when its first call is from today (episodes from earlier
days stay under *From earlier days*). Each episode is identified by its first
call, so its row keeps its place as later calls join it. Withheld numbers are
never grouped (and are not in Needs attention at all). A second RingCentral
record of the same call is not a second attempt.

**Marking an episode handled** marks each of its calls handled (one
`rc_call_resolutions` row per call, the calls the page listed); Undo reopens
exactly those. **No callback needed** from a caller's row applies to every
call of the episode, each marked on its own, so each can be counted again on
its own. From a call's own details card both still work on that one call.

**Check if they still need help** sits at the bottom of Needs attention:
calls RingCentral recorded no outcome for, from a number that can be called
back (not internal, not the phone system, not a duplicate record), with no
later connected call or answered call from that number, not handled or
excluded, in the last 90 days. They are grouped by caller the same way, take
the same actions, are never attributed to anyone, and are not in the Needs
attention count or the tab badge.

**Clear the list** marks every open call in Needs attention handled. The
review group is left alone unless the administrator ticks *Also clear N calls
with no recorded outcome*; the confirmation counts calls and callers.

### What each number counts

| Number | Unit |
|---|---|
| Needs attention (KPI and tab badge), `kpis.needsAttention` = `kpis.openEpisodes` | Open episodes: people waiting for a call back |
| `kpis.openCalls`, `counts.attention` | The unanswered calls behind them (attempts) |
| `kpis.review` | Review-group episodes; in no other count |
| Handled today, Handled tab | Calls, each counted on its own: a caller with three calls marked handled counts three. The Handled tab lists calls, and the KPI opens it, so the two agree |
| Missed, Voicemail, Not called back, per-person "not answered by them" | Calls, exactly as before episodes. A call with no recorded outcome is never in them |

## Calling from the portal (RingOut)

Anyone with `calls.place` (administrators, front desk, receptionist) can call
a number from **Calls**: **New call**, or **Call / Call back** on any call
with a number. It is RingCentral's RingOut, placed through the firm's
connection:

1. The first time, the person saves **Ring me at**: their RingCentral direct
   number (rings their RingCentral app and desk phone) or a mobile.
2. They click **Call**. RingCentral rings *their* phone first.
3. They answer; RingCentral dials the client, who sees the connected
   extension's caller ID (or `RINGCENTRAL_RINGOUT_CALLER_ID` when set).
4. The window shows *Ringing your phone → Calling the client → Connected*,
   with **Cancel call** while it rings. The call then appears in the log.

Needs the **RingOut** permission on the RingCentral app (add it, then
**Connect again** on Integrations); without it the window says so. Calls are
placed and billed on the extension that made the connection. Numbers that
must never be dialled are refused before reaching RingCentral: anything
shorter than a full number (911, 411, short codes), invalid North American
area codes (0xx, 1xx), and premium-rate or satellite ranges (ITU 979,
881-883, 1-900 and 976, and the UK, German, French, Spanish and Mexican
premium prefixes; `server/utils/phone.js`). A number outside North America
needs its `+`. `RINGOUT_ALLOWED_COUNTRY_CODES` (e.g. `1,52,502`) limits both
legs to those calling codes; unset, every country is allowed. At most 30
calls per person per 10 minutes, and `RINGOUT_DAILY_LIMIT` (default 100) in
24 hours. A second click on **Call** while the first call is still ringing
returns that call instead of placing another. The audit trail keeps the last
4 digits only.

## How calls arrive

- The API imports RingCentral's call log every 5 minutes (production only
  by default, `RINGCENTRAL_CALL_SYNC`), and when someone presses **Refresh**
  (at most every 30 seconds). RingCentral adds a call to its log once the
  call has ended, so a call shows up a few minutes after it finishes. Live
  "phone is ringing" alerts are a separate, later step.
- The first import fetches the last 14 days (`RINGCENTRAL_CALL_BACKFILL_DAYS`).
  Each later run re-reads from 3 hours before the previous run ended (late
  entries); records are keyed by RingCentral's id, so nothing is duplicated.
- One import at a time across instances (Postgres advisory lock). The call
  log is in RingCentral's "Heavy" rate group, so pages are spaced ~6.5 s
  apart and a rate-limit answer just ends the run; the next one catches up.
- Calls older than `RINGCENTRAL_CALL_RETENTION_DAYS` (365) are deleted.
- RingCentral's full record for each call (`rc_calls.rc_raw`, minus
  recordings, voicemail and other links, and billing) and the portal's
  reading of it, kept separately. See `docs/ringcentral-call-classification.md`.
- Stored: time, direction, duration, RingCentral's result, the outside
  number and caller ID, the firm-side line or extension, who answered, and
  each step RingCentral recorded for the call (`rc_calls.legs`: who it rang,
  forwarded or transferred to, voicemail, and how each ended). Not stored:
  recordings, recording links, voicemail links, the raw RingCentral payload.
- Calls imported before steps were kept are read again once, over the
  backfill period (`rc_call_sync_state.legs_backfilled_at`); older ones show
  no path.

## Whose calls

The import first asks for the **company** call log. That needs the
connection (Integrations → Connect RingCentral) to have been made by a
RingCentral user allowed to read the company's calls, normally an account
administrator. If RingCentral refuses, it falls back to the calls of the user
who connected and the Calls page says so; reconnecting as an administrator
fixes it (rechecked daily). The RingCentral app needs the **Read Call Log**
permission; without it the page shows "RingCentral did not allow reading the
call log".

## Reading the list

| Shown | Means |
|---|---|
| Name + **Client** | The number matches a billing client's WhatsApp/phone contact (Billing → WhatsApp contacts) |
| Name + **Website lead** | The number matches a contact-form or chat lead; with several leads on one number, the latest is shown and the badge counts them |
| Name only | RingCentral's caller ID, when it is a name |
| Unknown caller · City, ST | No match; the carrier sent a location instead of a name |
| Private number | The caller withheld their number |
| Answered / Not answered / Caller hung up / Voicemail / Not confirmed | What RingCentral's own evidence proves about the call, never guessed from its result, the duration, or a step that is missing (`docs/ringcentral-call-classification.md`). **Not confirmed** is never counted as missed |
| Offered to … · no answer | The people a RingCentral step shows the call reaching, with what that step says happened. Search finds a call by their name |
| Details and evidence | Every step RingCentral recorded, in order: where it went (person, queue, IVR, forwarded phone ending in 4 digits), RingCentral's result, its reason and what RingCentral documents that reason to mean, and the length. Also RingCentral's own result for the call, kept apart from the portal's reading |
| Offered to: *person* | Only the calls a step proves were offered to that person, with how many they answered and how many they did not. Nobody is charged with a call someone else answered |
| Not called back | A call proven not answered (not answered, caller hung up, or voicemail) with no later outgoing call to that number and no later answered call from it, as far as RingCentral saw (a call back from a personal mobile is not in the log) |

Numbers are matched on their digits (last 10 for US/Canada), so
"(504) 555-0101", "504.555.0101" and "+1 504 555 0101" agree. Calls between
extensions inside the firm are left out.

## Who can see it

`calls.view`: administrators and the front desk role. Billing paralegal and
the legacy staff role do not have it; grant it to one account with
`node scripts/staff.js grant --email <email> --capability calls.view`.

## API

| Route | |
|---|---|
| `GET /api/calls?from&to&outcome&q&limit` | `outcome`: all, answered, missed, voicemail, unanswered, outgoing, not_returned, excluded. Returns calls, counts, connection and import status. |
| `POST /api/calls/:id/exclusion` | `{ reason, note, scope }`: mark a missed call or voicemail as needing no callback. `reason`: verification, staff_test, spam, other (note required); `scope`: call or number. `calls.exclude`. |
| `DELETE /api/calls/:id/exclusion` | Count it again: removes the call's mark and its number's, if any. `calls.exclude`. |
| `GET /api/calls?outcome=attention` | Also returns `episodes` (one per caller: `id`, `attempts`, `firstAt`, `lastAt`, `callbackAttempts`, `callIds`, `latestCallId`, `attentionGroup`, `offeredTo`), `review` (the review group's episodes) and `reviewCalls`. `calls` and `counts` stay per call. |
| `POST /api/calls/episodes/handled` | `{ callIds, note }`: every call of one episode handled; returns the ids it marked. `calls.exclude`. |
| `POST /api/calls/episodes/reopen` | `{ callIds }`: undo that. `calls.exclude`. |
| `POST /api/calls/:id/exclusion` with `callIds` | No callback needed for every call of the episode (scope `call`). |
| `GET\|POST /api/calls/handled/bulk` | Clear the list (`calls.clear`). `review=1` / `{ review: true }` includes the review group. The preview returns `{ count, people, review }`. |
| `POST /api/calls/sync` | Import now (skipped if one ran in the last 30 s) |

## Tests

`server/integrations/ringcentral/callLog.test.js` (reading records) and
`calls.flow.test.js` (with `TEST_DATABASE_URL`): permissions, before
connecting, paged import with faxes skipped, names from clients / leads /
caller ID, callbacks, counts, filters and search, overlap without duplicates,
updates, the 30-second guard, company → own-calls fallback, missing
permission, rate limiting, a token refreshed mid-import, one import at a
time, retention. `callEpisodes.flow.test.js` (with `TEST_DATABASE_URL`):
episodes, callback attempts, what resolves and what splits an episode,
handling and reopening an episode, the review group, Clear the list with and
without it, and every call's follow-up decision against the list it is in.
