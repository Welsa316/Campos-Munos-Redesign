// What an administrator can change about the automation without a deploy
// (automation_settings): office hours, timing, thresholds, templates, spam
// rules. Each section is one row; a missing or invalid row reads as the
// defaults below, so nothing depends on a row existing.
//
// Timing lives here and nowhere else: no other module carries a delay, a
// threshold or message text of its own.
import { DEFAULT_HOURS, normalizeHours, hoursProblem } from './businessHours.js'
import { DEFAULT_TEMPLATES, templatesProblem, mergeTemplates } from './templates.js'

export class SettingsError extends Error {
  constructor(message, status = 400, code = 'invalid_settings') {
    super(message)
    this.name = 'SettingsError'
    this.status = status
    this.code = code
  }
}

// Follow-ups go by text message only. An email follow-up is refused: a
// client's email reply lands in the office inbox, where the portal cannot
// see it, so an email sequence could keep writing to someone who already
// answered (docs/phase1-automation.md, "Why follow-ups are text only").
export const FOLLOWUP_CHANNELS = Object.freeze(['sms'])

export const DEFAULTS = Object.freeze({
  hours: DEFAULT_HOURS,
  firm: { name: 'Campos Muños Law', phone: '(504) 910-6508' },
  ack: {
    // A text needs the person's agreement on the form (submissions.sms_consent_at)
    // unless the firm decides an inquiry is itself consent.
    smsRequiresFormConsent: true,
    // An acknowledgment text outside the texting hours waits for them.
    smsOutsideHours: false,
    // Older than this and nobody is told "we just received your message".
    maxAgeHours: 24,
  },
  // When text messages may go out, in the firm's time: late enough for the
  // West Coast (10 AM Central is 8 AM Pacific), within office hours.
  // North American numbers only, unless more calling codes are listed.
  texting: { start: '10:00', end: '17:00', days: [1, 2, 3, 4, 5], perMinute: 10, countries: ['1'] },
  followup: {
    steps: [
      { key: 'followup_1', afterBusinessDays: 1, channel: 'sms', templateKey: 'lead_followup_1' },
      { key: 'followup_2', afterBusinessDays: 3, channel: 'sms', templateKey: 'lead_followup_2' },
    ],
    // After the last step, with still no reply, call or booking: No response.
    noResponseAfterBusinessDays: 5,
  },
  sla: {
    // Office minutes a new lead may wait for a person before its owner is told.
    newLeadMinutes: 120,
    // Office minutes after that before it goes up a level.
    newLeadSecondMinutes: 360,
    missedCallMinutes: 120,
    missedCallSecondMinutes: 360,
    // Second level: these accounts are notified in the portal (administrators
    // when empty). An email address is optional and empty by default, so
    // nothing is emailed to anyone outside the portal unless it is set.
    secondLevelEmail: '',
  },
  missedCall: {
    // Wait for RingCentral's final record of the call before deciding.
    settleMinutes: 3,
    // One automatic text per number in this many days.
    cooldownDays: 7,
    // A missed call older than this is not texted about.
    maxAgeMinutes: 120,
  },
  status: {
    // A text reply from the client stops the follow-ups and flags the lead
    // for a person. It only also moves New → Contacted when this is on:
    // nobody at the firm has spoken to them yet.
    contactedOnClientReply: false,
  },
  ownership: { defaultLeadOwnerId: null },
  spam: {
    // Exact sender addresses and whole domains an administrator listed: a
    // match is marked spam and archived (and can be put back).
    senders: [],
    domains: [],
    // Phrases that only ever mark a lead "possible spam" for review.
    phrases: [],
  },
  scheduling: { bookingUrl: '', calendarId: '', lookAheadDays: 90 },
  templates: DEFAULT_TEMPLATES,
})

export const SECTIONS = Object.freeze(Object.keys(DEFAULTS))

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max
const emailish = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v)
const domainish = (v) => typeof v === 'string' && v.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)
const list = (v, max) => Array.isArray(v) && v.length <= max

// One validator per section: returns the cleaned value, or throws.
const VALIDATE = {
  hours(v) {
    const problem = hoursProblem(v)
    if (problem) throw new SettingsError(problem)
    return normalizeHours(v)
  },
  firm(v) {
    const name = String(v?.name ?? '').trim()
    const phone = String(v?.phone ?? '').trim()
    if (!name || name.length > 80) throw new SettingsError('The firm name is 1 to 80 characters')
    if (!/^[0-9+\-() .]{7,25}$/.test(phone)) throw new SettingsError('Enter the office phone number as it should appear in messages')
    return { name, phone }
  },
  ack(v) {
    if (typeof v?.smsRequiresFormConsent !== 'boolean' || typeof v?.smsOutsideHours !== 'boolean') throw new SettingsError('Choose yes or no for each acknowledgment option')
    if (!int(v.maxAgeHours, 1, 72)) throw new SettingsError('The acknowledgment age limit is 1 to 72 hours')
    return { smsRequiresFormConsent: v.smsRequiresFormConsent, smsOutsideHours: v.smsOutsideHours, maxAgeHours: v.maxAgeHours }
  },
  texting(v) {
    if (!HHMM.test(v?.start || '') || !HHMM.test(v?.end || '') || v.start >= v.end) throw new SettingsError('Texting hours must be times like 10:00, start before end')
    // 8 AM to 9 PM is the widest any automatic text may go out.
    if (v.start < '08:00' || v.end > '21:00') throw new SettingsError('Automatic texts may only go out between 8:00 AM and 9:00 PM')
    if (!list(v.days, 7) || !v.days.length || !v.days.every((d) => int(d, 0, 6))) throw new SettingsError('Choose at least one day for automatic texts')
    if (!int(v.perMinute, 1, 30)) throw new SettingsError('Texts per minute is 1 to 30')
    const countries = v.countries ?? ['1']
    if (!list(countries, 5) || !countries.length || !countries.every((c) => /^\d{1,3}$/.test(String(c)))) throw new SettingsError('Countries are calling codes like 1')
    return { start: v.start, end: v.end, days: [...new Set(v.days)].sort(), perMinute: v.perMinute, countries: countries.map(String) }
  },
  followup(v, all) {
    if (!list(v?.steps, 5)) throw new SettingsError('A follow-up sequence has at most 5 steps')
    const keys = new Set()
    let last = 0
    const steps = v.steps.map((s) => {
      if (typeof s?.key !== 'string' || !/^[a-z0-9_]{1,30}$/.test(s.key) || keys.has(s.key)) throw new SettingsError('Each follow-up step needs its own short name')
      keys.add(s.key)
      if (!FOLLOWUP_CHANNELS.includes(s.channel)) throw new SettingsError('Follow-ups can only be sent by text message: replies to an email follow-up cannot be seen by the portal')
      if (!int(s.afterBusinessDays, 1, 30) || s.afterBusinessDays <= last) throw new SettingsError('Each follow-up must come at least a business day after the one before it')
      last = s.afterBusinessDays
      const t = (all.templates || DEFAULT_TEMPLATES)[s.templateKey]
      if (!t || t.channel !== 'sms') throw new SettingsError(`Follow-up “${s.key}” needs a text message template`)
      return { key: s.key, afterBusinessDays: s.afterBusinessDays, channel: s.channel, templateKey: s.templateKey }
    })
    if (!int(v.noResponseAfterBusinessDays, 1, 60) || v.noResponseAfterBusinessDays <= last) throw new SettingsError('“No response” must come after the last follow-up')
    return { steps, noResponseAfterBusinessDays: v.noResponseAfterBusinessDays }
  },
  sla(v) {
    for (const k of ['newLeadMinutes', 'newLeadSecondMinutes', 'missedCallMinutes', 'missedCallSecondMinutes']) {
      if (!int(v?.[k], 15, 14 * 24 * 60)) throw new SettingsError('Each waiting time is between 15 minutes and 14 days')
    }
    const email = String(v.secondLevelEmail ?? '').trim()
    if (email && !emailish(email)) throw new SettingsError('The second-level email address is not valid')
    return { newLeadMinutes: v.newLeadMinutes, newLeadSecondMinutes: v.newLeadSecondMinutes, missedCallMinutes: v.missedCallMinutes, missedCallSecondMinutes: v.missedCallSecondMinutes, secondLevelEmail: email }
  },
  missedCall(v) {
    if (!int(v?.settleMinutes, 1, 30)) throw new SettingsError('Wait 1 to 30 minutes before texting a missed caller')
    if (!int(v.cooldownDays, 1, 90)) throw new SettingsError('The gap between texts to one number is 1 to 90 days')
    if (!int(v.maxAgeMinutes, 10, 24 * 60)) throw new SettingsError('A missed call is texted about within 10 minutes to 24 hours')
    return { settleMinutes: v.settleMinutes, cooldownDays: v.cooldownDays, maxAgeMinutes: v.maxAgeMinutes }
  },
  status(v) {
    if (typeof v?.contactedOnClientReply !== 'boolean') throw new SettingsError('Choose yes or no')
    return { contactedOnClientReply: v.contactedOnClientReply }
  },
  ownership(v) {
    const id = v?.defaultLeadOwnerId
    if (id != null && !int(id, 1, 2147483647)) throw new SettingsError('Choose a person, or nobody')
    return { defaultLeadOwnerId: id ?? null }
  },
  spam(v) {
    const lower = (xs) => [...new Set(xs.map((x) => String(x).trim().toLowerCase()).filter(Boolean))]
    if (!list(v?.senders, 500) || !list(v?.domains, 500) || !list(v?.phrases, 100)) throw new SettingsError('Too many rules')
    const senders = lower(v.senders)
    const domains = lower(v.domains)
    const phrases = lower(v.phrases)
    if (!senders.every(emailish)) throw new SettingsError('Each sender is a full email address')
    if (!domains.every(domainish)) throw new SettingsError('Each domain looks like example.com')
    // A whole mail provider would hide real clients.
    const shared = domains.find((d) => COMMON_MAIL_DOMAINS.has(d))
    if (shared) throw new SettingsError(`${shared} is a mail provider real clients use. List the sender’s full address instead.`)
    if (!phrases.every((p) => p.length >= 6 && p.length <= 80)) throw new SettingsError('Each phrase is 6 to 80 characters')
    return { senders, domains, phrases }
  },
  scheduling(v) {
    const url = String(v?.bookingUrl ?? '').trim()
    if (url) {
      let u
      try { u = new URL(url) } catch { throw new SettingsError('The booking link is not a valid address') }
      if (u.protocol !== 'https:') throw new SettingsError('The booking link must start with https://')
      if (url.length > 300) throw new SettingsError('The booking link is too long')
    }
    const calendarId = String(v?.calendarId ?? '').trim()
    if (calendarId.length > 200 || /\s/.test(calendarId)) throw new SettingsError('The calendar ID is not valid')
    if (!int(v?.lookAheadDays ?? 90, 7, 365)) throw new SettingsError('Look ahead 7 to 365 days')
    return { bookingUrl: url, calendarId, lookAheadDays: v?.lookAheadDays ?? 90 }
  },
  templates(v) {
    const problem = templatesProblem(v)
    if (problem) throw new SettingsError(problem)
    return mergeTemplates(v)
  },
}

export const COMMON_MAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'me.com',
  'protonmail.com', 'proton.me', 'yahoo.es', 'hotmail.es', 'outlook.es', 'yahoo.com.mx', 'comcast.net', 'att.net', 'bellsouth.net', 'cox.net',
])

// A stored row is used only when it still passes its validator.
function read(section, stored, all) {
  if (stored == null) return structuredClone(DEFAULTS[section])
  try { return VALIDATE[section](stored, all) } catch { return structuredClone(DEFAULTS[section]) }
}

/** Every section, each from its stored row or its default. */
export async function loadSettings(db) {
  const rows = (await db.query('SELECT key, value FROM automation_settings WHERE key = ANY($1::text[])', [SECTIONS])).rows
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const out = {}
  // Templates first: the follow-up validator reads them.
  out.templates = read('templates', stored.templates, {})
  for (const s of SECTIONS) if (s !== 'templates') out[s] = read(s, stored[s], out)
  return out
}

/** Save one section. Returns the cleaned value. */
export async function saveSection(db, section, value, { actorId = null } = {}) {
  if (!SECTIONS.includes(section)) throw new SettingsError('Unknown settings section', 404, 'not_found')
  const current = await loadSettings(db)
  const clean = VALIDATE[section](value, current)
  if (section === 'ownership' && clean.defaultLeadOwnerId != null) {
    const a = (await db.query('SELECT id FROM admin_users WHERE id = $1 AND disabled_at IS NULL', [clean.defaultLeadOwnerId])).rows[0]
    if (!a) throw new SettingsError('That account does not exist or has no access')
  }
  if (section === 'templates') {
    // A follow-up step must still have its template afterwards.
    for (const s of current.followup.steps) if (clean[s.templateKey]?.channel !== 'sms') throw new SettingsError(`The follow-up “${s.key}” uses the template ${s.templateKey}`)
  }
  await db.query(
    `INSERT INTO automation_settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [section, JSON.stringify(clean), actorId]
  )
  return clean
}

/** The hours automatic texts may go out, in the shape businessHours.js reads. */
export const textingHours = (settings) => ({ timeZone: settings.hours.timeZone, days: settings.texting.days, start: settings.texting.start, end: settings.texting.end })

export default { DEFAULTS, SECTIONS, loadSettings, saveSection, SettingsError, FOLLOWUP_CHANNELS }
