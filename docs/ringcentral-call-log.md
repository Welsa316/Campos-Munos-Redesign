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
- Stored: time, direction, duration, RingCentral's result, the outside
  number and caller ID, the firm-side line or extension, who answered. Not
  stored: recordings, recording links, the raw RingCentral payload.

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
| Not called back | A missed call or voicemail with no later outgoing call to that number and no later answered call from it, as far as RingCentral saw (a call back from a personal mobile is not in the log) |

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
| `GET /api/calls?from&to&outcome&q&limit` | `outcome`: all, answered, missed, voicemail, outgoing, not_returned. Returns calls, counts, connection and import status. |
| `POST /api/calls/sync` | Import now (skipped if one ran in the last 30 s) |

## Tests

`server/integrations/ringcentral/callLog.test.js` (reading records) and
`calls.flow.test.js` (with `TEST_DATABASE_URL`): permissions, before
connecting, paged import with faxes skipped, names from clients / leads /
caller ID, callbacks, counts, filters and search, overlap without duplicates,
updates, the 30-second guard, company → own-calls fallback, missing
permission, rate limiting, a token refreshed mid-import, one import at a
time, retention.
