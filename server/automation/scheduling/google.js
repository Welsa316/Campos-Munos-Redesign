// Google Calendar, read-only: the firm's consultation calendar as a list of
// events that changed. No Google library; one token call and one list call.
//
// Checked against Google's documentation (2026-11):
//   auth    a service account signs a JWT (RS256; iss = its email, scope,
//           aud = https://oauth2.googleapis.com/token, exp ≤ 1 hour) and
//           exchanges it at that address with
//           grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer.
//           The firm shares the one calendar with the service account's
//           address ("See event details"); no domain-wide delegation.
//   scope   https://www.googleapis.com/auth/calendar.events.readonly — the
//           narrowest that allows events.list on a shared calendar.
//   list    GET https://www.googleapis.com/calendar/v3/calendars/{id}/events
//           First a full sync (timeMin, singleEvents=true), then only what
//           changed (syncToken). With a syncToken, timeMin / updatedMin /
//           orderBy are not allowed and the other parameters must stay the
//           same. nextSyncToken comes only on the last page. 410 means the
//           token is no longer valid: start again with a full sync.
//           A cancelled event comes back with status 'cancelled' and
//           possibly nothing but its id.
//
// Not documented by Google, so NOT relied on until the firm has made one
// test booking and looked at the event (docs/phase1-automation.md,
// "Scheduling"): that a booking made on an appointment-schedule page lists
// the person who booked under `attendees` with the address they typed.
// Matching uses exactly that field, so if Google does otherwise nothing is
// matched and nothing is marked Scheduled.
//
// Configuration (API service):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL        the service account's address
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  its private key (PEM; \n as written
//                                       in the JSON key file is accepted)
//   the calendar ID is set in the portal (automation settings, 'scheduling')
//   or GOOGLE_CALENDAR_ID
import crypto from 'crypto'

export const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
export const EVENTS_URL = (calendarId) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
const MAX_RESULTS = 250
const MAX_PAGES = 20
const TIMEOUT_MS = 20_000

export class CalendarError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super(`Calendar error (${status ?? 'network'} ${code})`)
    this.name = 'CalendarError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

const b64url = (v) => Buffer.from(v).toString('base64url')

/** What is missing to read the calendar (names only), and the usable values. */
export function loadGoogleCalendarConfig(env = process.env, settings = null) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '').trim()
  const key = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim()
  const calendarId = String(settings?.scheduling?.calendarId || env.GOOGLE_CALENDAR_ID || '').trim()
  const problems = []
  if (!email) problems.push('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set')
  if (!key) problems.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set')
  else if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) problems.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not a PEM private key')
  if (!calendarId) problems.push('No calendar is chosen (automation settings, or GOOGLE_CALENDAR_ID)')
  return { configured: problems.length === 0, problems, email, key, calendarId }
}

export function signedAssertion({ email, key }, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))
  const signature = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(key).toString('base64url')
  return `${head}.${claims}.${signature}`
}

async function fetchJson(fetchImpl, url, init) {
  let res
  try {
    res = await fetchImpl(url, { ...init, signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined })
  } catch {
    throw new CalendarError('network_error', { retryable: true })
  }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (res.status >= 200 && res.status < 300) return json ?? {}
  // Codes only: Google's messages can echo the calendar ID.
  const reason = json?.error?.errors?.[0]?.reason || (typeof json?.error === 'string' ? json.error : json?.error?.status)
  const code = typeof reason === 'string' && /^[A-Za-z_]{1,40}$/.test(reason) ? reason : `http_${res.status}`
  throw new CalendarError(code, { status: res.status, retryable: res.status === 429 || res.status >= 500 })
}

/**
 * The provider (scheduling/index.js). Tokens are kept in memory until a
 * minute before they expire.
 */
export function createGoogleCalendarProvider(config, { fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  let token = null
  async function accessToken() {
    const t = now()
    if (token && token.expiresAt - t.getTime() > 60 * 1000) return token.value
    const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(config, t) })
    const json = await fetchJson(fetchImpl, TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    if (!json.access_token) throw new CalendarError('no_access_token')
    token = { value: json.access_token, expiresAt: t.getTime() + (Number(json.expires_in) || 3600) * 1000 }
    return token.value
  }

  return {
    kind: 'google_calendar',
    // What this provider can do. Availability and the booking itself are
    // Google's own booking page: the portal never creates or changes an event.
    capabilities: Object.freeze({ detectBookings: true, createBooking: false, availability: false, cancel: false }),
    describe: () => ({ kind: 'google_calendar', configured: Boolean(config.configured), problems: config.problems || [] }),

    /**
     * Events that changed since `syncToken`, or everything from `timeMin`
     * on a full sync. Returns { events, nextSyncToken, full }. Throws
     * CalendarError with code 'sync_token_invalid' on a 410.
     */
    async listChanges({ syncToken = null, timeMin = null } = {}) {
      const bearer = await accessToken()
      const events = []
      let pageToken = null
      let nextSyncToken = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(EVENTS_URL(config.calendarId))
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('maxResults', String(MAX_RESULTS))
        if (syncToken) url.searchParams.set('syncToken', syncToken)
        else if (timeMin) url.searchParams.set('timeMin', new Date(timeMin).toISOString())
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        let json
        try {
          json = await fetchJson(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } })
        } catch (err) {
          if (err instanceof CalendarError && err.status === 410) throw new CalendarError('sync_token_invalid', { status: 410 })
          throw err
        }
        for (const e of json.items || []) events.push(normalizeEvent(e))
        nextSyncToken = json.nextSyncToken || null
        pageToken = json.nextPageToken || null
        if (!pageToken) break
      }
      return { events: events.filter(Boolean), nextSyncToken, full: !syncToken }
    },
  }
}

const emailish = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v)

/** Only what the portal uses from an event: never its title or description. */
export function normalizeEvent(e) {
  if (!e || typeof e.id !== 'string' || !e.id) return null
  const at = (x) => { const d = x?.dateTime ? new Date(x.dateTime) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
  // The guests: not the calendar itself, not whoever organised it.
  const guests = (Array.isArray(e.attendees) ? e.attendees : [])
    .filter((a) => a && !a.self && !a.organizer && !a.resource && a.responseStatus !== 'declined' && emailish(a.email))
    .map((a) => a.email.trim().toLowerCase())
  return {
    id: e.id,
    cancelled: e.status === 'cancelled',
    startsAt: at(e.start),
    endsAt: at(e.end),
    guestEmails: [...new Set(guests)].slice(0, 20),
    updatedAt: e.updated ? new Date(e.updated) : null,
  }
}

export default { createGoogleCalendarProvider, loadGoogleCalendarConfig, normalizeEvent, signedAssertion }
