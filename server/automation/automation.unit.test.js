// The parts of the automation that need no database: office hours, the
// templates, opt-out words, the switches, the settings' own rules, and the
// two clients that talk to the outside (RingCentral texts, Google Calendar)
// against a recorded conversation. Nothing here touches the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import { firmInstant } from '../reminders/dueTime.js'
import { DEFAULT_HOURS, isBusinessTime, nextBusinessTime, addBusinessMinutes, addBusinessDays, businessMinutesBetween, normalizeHours, hoursProblem } from './businessHours.js'
import { DEFAULT_TEMPLATES, renderTemplate, templatesProblem, mergeTemplates, languageFor, safeFirstName, SMS_MAX } from './templates.js'
import { classifyInbound, addressKey } from './suppression.js'
import { FLAGS, resolveFlags } from './flags.js'
import { spamVerdict } from './spam.js'
import { testRecipients } from './messaging.js'
import { leadStop } from './leads.js'
import { smsCapability, sendSms, smsDelivery, listInboundSms, deliveryErrorKind, SMS_PATH, NUMBERS_PATH, STORE_PATH } from '../integrations/ringcentral/sms.js'
import { createGoogleCalendarProvider, loadGoogleCalendarConfig, normalizeEvent, signedAssertion, TOKEN_URL, SCOPE } from './scheduling/google.js'
import { phoneKey } from '../utils/phone.js'

// Mon 2026-11-09 … in New Orleans (CST); and a week across the March clock change.
const t = (d, h, mi = 0) => firmInstant(2026, 11, d, h, mi)
const iso = (x) => x.toISOString()

test('office hours: Monday to Friday, 9 to 5, in New Orleans', () => {
  assert.equal(isBusinessTime(t(9, 9, 0)), true)
  assert.equal(isBusinessTime(t(9, 8, 59)), false)
  assert.equal(isBusinessTime(t(9, 16, 59)), true)
  assert.equal(isBusinessTime(t(9, 17, 0)), false, 'closing time is closed')
  assert.equal(isBusinessTime(t(14, 12, 0)), false, 'Saturday')
  assert.equal(isBusinessTime(t(15, 12, 0)), false, 'Sunday')
  assert.equal(iso(nextBusinessTime(t(9, 12, 0))), iso(t(9, 12, 0)), 'open: now')
  assert.equal(iso(nextBusinessTime(t(9, 7, 0))), iso(t(9, 9, 0)))
  assert.equal(iso(nextBusinessTime(t(13, 17, 30))), iso(t(16, 9, 0)), 'Friday evening → Monday morning')
})

test('office time is counted, not wall time', () => {
  assert.equal(iso(addBusinessMinutes(t(9, 10, 30), 120)), iso(t(9, 12, 30)))
  assert.equal(iso(addBusinessMinutes(t(13, 16, 50), 30)), iso(t(16, 9, 20)), 'over the weekend')
  assert.equal(iso(addBusinessMinutes(t(9, 20, 0), 60)), iso(t(10, 10, 0)), 'from a closed hour: from the next opening')
  assert.equal(iso(addBusinessMinutes(t(9, 9, 0), 480)), iso(t(9, 17, 0)), 'exactly a day ends at closing')
  assert.equal(iso(addBusinessMinutes(t(9, 9, 0), 481)), iso(t(10, 9, 1)))
  assert.equal(iso(addBusinessDays(t(9, 10, 30), 1)), iso(t(10, 10, 30)))
  assert.equal(iso(addBusinessDays(t(12, 10, 30), 3)), iso(t(17, 10, 30)), 'Thursday + 3 → Tuesday')
  assert.equal(iso(addBusinessDays(t(13, 18, 5), 1)), iso(t(16, 17, 0)), 'Friday evening + 1 → a full office day from Monday’s opening: Monday at closing')
  assert.equal(businessMinutesBetween(t(9, 21, 0), t(10, 10, 0)), 60)
  assert.equal(businessMinutesBetween(t(9, 10, 0), t(9, 14, 0)), 240)
  assert.equal(businessMinutesBetween(t(13, 16, 0), t(16, 10, 0)), 120)
  assert.equal(businessMinutesBetween(t(9, 14, 0), t(9, 10, 0)), 0)
})

test('office time stays right across a clock change', () => {
  // Sunday 2026-03-08 the clocks go forward; Friday 4 PM + 2 office hours is Monday 10 AM local.
  const fri = firmInstant(2026, 3, 6, 16, 0)
  assert.equal(iso(addBusinessMinutes(fri, 120)), iso(firmInstant(2026, 3, 9, 10, 0)))
  assert.equal(firmInstant(2026, 3, 9, 10, 0).getTime() - fri.getTime(), (66 - 1) * 60 * 60 * 1000, 'an hour shorter in wall time')
})

test('hours from settings: used when valid, the defaults when not', () => {
  assert.deepEqual(normalizeHours({ days: [1, 2, 3, 4], start: '08:30', end: '16:00' }), { timeZone: 'America/Chicago', days: [1, 2, 3, 4], start: '08:30', end: '16:00' })
  assert.deepEqual(normalizeHours({ days: [], start: '9', end: '17' }).days, [...DEFAULT_HOURS.days])
  assert.equal(hoursProblem({ days: [1], start: '17:00', end: '09:00' }), 'The office must open before it closes')
  assert.equal(hoursProblem({ days: [], start: '09:00', end: '17:00' }), 'Choose at least one office day')
  assert.equal(hoursProblem({ days: [1, 2], start: '09:00', end: '17:00' }), null)
})

const VARS = { firstName: 'María', firmName: 'Campos Muños Law', officePhone: '(504) 910-6508', bookingLink: '' }

test('templates: the language asked for, the bilingual one otherwise, never from a name', () => {
  assert.equal(languageFor({ language: 'es' }), 'es')
  assert.equal(languageFor({ language: 'en' }), 'en')
  assert.equal(languageFor({ language: null, first_name: 'María' }), 'bi')
  assert.equal(languageFor({ language: 'fr' }), 'bi')
  const es = renderTemplate(DEFAULT_TEMPLATES, 'lead_ack_sms', 'es', VARS)
  assert.equal(es.channel, 'sms')
  assert.match(es.text, /^Campos Muños Law: recibimos su mensaje\. .*Oficina: \(504\) 910-6508\.\nResponda STOP para no recibir más mensajes\.$/)
  assert.equal(renderTemplate(DEFAULT_TEMPLATES, 'lead_ack_sms', 'xx', VARS).language, 'bi')
})

test('templates: a line that offers the booking link is there only with a link', () => {
  const without = renderTemplate(DEFAULT_TEMPLATES, 'lead_ack_email', 'en', VARS)
  assert.doesNotMatch(without.text, /pick a time|bookingLink|\{\{/)
  assert.doesNotMatch(without.text, /\n{3,}/, 'no gap left behind')
  const withLink = renderTemplate(DEFAULT_TEMPLATES, 'lead_ack_email', 'en', { ...VARS, bookingLink: 'https://calendar.app.google/x1' })
  assert.match(withLink.text, /pick a time for your consultation yourself: https:\/\/calendar\.app\.google\/x1/)
  assert.match(withLink.html, /<a href="https:\/\/calendar\.app\.google\/x1"/)
})

test('templates: a name is used only when it is a name; nothing a person typed becomes markup', () => {
  assert.equal(safeFirstName('María José'), 'María')
  assert.equal(safeFirstName("O'Brien"), "O'Brien")
  for (const bad of ['<b>x</b>', 'http://evil.example', '123', '', null, 'A'.repeat(60)]) assert.equal(safeFirstName(bad), '', String(bad))
  const m = renderTemplate(DEFAULT_TEMPLATES, 'lead_ack_email', 'es', { ...VARS, firstName: '<script>alert(1)</script>' })
  assert.match(m.text, /^Hola:/, 'greeted without the name')
  assert.doesNotMatch(m.html, /<script>/)
  const firm = renderTemplate(DEFAULT_TEMPLATES, 'lead_ack_email', 'en', { ...VARS, firmName: 'A & <B>' })
  assert.match(firm.html, /A &amp; &lt;B&gt;/)
})

test('every default template is short, stoppable, and promises nothing', () => {
  assert.equal(templatesProblem(DEFAULT_TEMPLATES), null)
  for (const [key, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
    for (const lang of ['es', 'en', 'bi']) {
      const m = renderTemplate(DEFAULT_TEMPLATES, key, lang, { ...VARS, bookingLink: 'https://calendar.app.google/abcdefgh' })
      assert.doesNotMatch(m.text, /\{\{|\}\}/, `${key} ${lang}: every placeholder filled`)
      assert.doesNotMatch(m.text, /eligible|elegible|califica|qualif|guarant|garantiz|accepted your case|aceptado su caso|attorney (has )?reviewed|abogado (ha )?revis/i, `${key} ${lang}`)
      if (tpl.channel === 'sms') {
        assert.ok(m.text.length <= SMS_MAX, `${key} ${lang}: ${m.text.length}`)
        assert.match(m.text, /STOP/, `${key} ${lang} says how to stop`)
        assert.match(m.text, /^Campos Muños Law:/, `${key} ${lang} says who it is from`)
      } else {
        assert.match(m.text, /No es asesoría legal|not legal advice/)
      }
    }
  }
})

test('saving templates: a text must say STOP, use only known placeholders, and fit', () => {
  const edit = (key, lang, body, subject) => ({ ...DEFAULT_TEMPLATES, [key]: { ...DEFAULT_TEMPLATES[key], languages: { ...DEFAULT_TEMPLATES[key].languages, [lang]: { ...(subject ? { subject } : {}), body } } } })
  assert.match(templatesProblem(edit('lead_ack_sms', 'en', 'We got your message.')), /must say how to stop them \(STOP\)/)
  assert.match(templatesProblem(edit('lead_ack_sms', 'en', 'Hi {{caseNumber}} STOP')), /\{\{caseNumber\}\} is not something a message can include/)
  assert.match(templatesProblem(edit('lead_ack_sms', 'es', `STOP ${'x'.repeat(500)}`)), /at most 480 characters/)
  assert.match(templatesProblem(edit('lead_ack_sms', 'bi', '   ')), /the text is empty/)
  assert.match(templatesProblem(edit('lead_ack_email', 'en', 'Body', 'Two\nlines')), /the subject is one line/)
  assert.match(templatesProblem({ nope: {} }), /Unknown template/)
  assert.equal(templatesProblem(edit('lead_ack_sms', 'en', 'Campos Muños Law: got it. Reply STOP to opt out.')), null)
  // What is saved is only what a template has; anything else is dropped.
  const merged = mergeTemplates({ lead_ack_sms: { channel: 'email', extra: 1, languages: { en: { body: 'New STOP', subject: 'ignored' } } } })
  assert.deepEqual(merged.lead_ack_sms.languages.en, { body: 'New STOP' })
  assert.equal(merged.lead_ack_sms.channel, 'sms')
  assert.equal(merged.lead_ack_sms.languages.es.body, DEFAULT_TEMPLATES.lead_ack_sms.languages.es.body)
})

test('opt-out words: only when the whole message is one', () => {
  for (const s of ['STOP', 'stop', ' Stop. ', 'STOP!', '"stop"', 'unsubscribe', 'CANCEL', 'alto', 'BAJA', 'No más', 'opt out', 'QUIT', 'END']) assert.equal(classifyInbound(s), 'opt_out', s)
  for (const s of ['START', 'unstop', 'Resume', 'YES']) assert.equal(classifyInbound(s), 'opt_in', s)
  for (const s of ['HELP', 'ayuda', 'Info']) assert.equal(classifyInbound(s), 'help', s)
  // A sentence is for a person to read, never an opt-out the system acts on.
  for (const s of ['please stop calling my husband', 'No puedo parar de pensar en mi caso', 'stop by tomorrow?', 'Sí, gracias', '', null, 'cancel my appointment']) assert.equal(classifyInbound(s), 'reply', String(s))
})

test('addresses are compared the same however they were typed', () => {
  assert.equal(addressKey('sms', '+1 (504) 555-0101'), '5045550101')
  assert.equal(addressKey('sms', '504.555.0101'), '5045550101')
  assert.equal(addressKey('sms', '+52 55 1234 5678'), '525512345678')
  assert.equal(addressKey('email', '  Ana@Example.TEST '), 'ana@example.test')
  assert.equal(phoneKey(null), '')
})

test('switches: off unless exactly true, off when paused, off when what it needs is off', () => {
  const none = resolveFlags({})
  for (const key of Object.keys(FLAGS)) assert.equal(none.on(key), false, `${key} is off by default`)
  for (const v of ['1', 'yes', 'on', 'TRUE ', ' true', 'True']) {
    const f = resolveFlags({ LEAD_ACK_ENABLED: v })
    assert.equal(f.on('lead_ack'), ['TRUE ', ' true', 'True'].includes(v), JSON.stringify(v))
  }
  const env = { LEAD_ACK_ENABLED: 'true', LEAD_ACK_SMS_ENABLED: 'true', MISSED_CALL_SMS_ENABLED: 'true', LEAD_FOLLOWUP_ENABLED: 'true' }
  const noSms = resolveFlags(env)
  assert.equal(noSms.on('lead_ack_sms'), false, 'needs text sending switched on too')
  assert.equal(noSms.why('lead_ack_sms'), 'needs:sms_sending')
  assert.equal(noSms.on('missed_call_sms'), false)
  assert.equal(noSms.on('lead_followup'), false)
  const withSms = resolveFlags({ ...env, RINGCENTRAL_SMS_ENABLED: 'true' })
  assert.equal(withSms.on('lead_ack_sms'), true)
  const paused = resolveFlags({ ...env, RINGCENTRAL_SMS_ENABLED: 'true' }, { sms_sending: { at: 'x' } })
  assert.equal(paused.on('sms_sending'), false)
  assert.equal(paused.why('sms_sending'), 'paused')
  assert.equal(paused.on('lead_ack_sms'), false, 'pausing sending pauses everything that texts')
  assert.equal(paused.on('missed_call_sms'), false)
  assert.equal(resolveFlags({}).why('worker'), 'switched_off')
  assert.equal(resolveFlags({}).on('not_a_flag'), false)
  // Every switch that sends has its own variable, and no two share one.
  const vars = Object.values(FLAGS).map((f) => f.env)
  assert.equal(new Set(vars).size, vars.length)
})

test('spam rules: a listed sender or domain is spam; a phrase is only "possible"', () => {
  const rules = { senders: ['sales@vendor.example'], domains: ['seo-agency.example'], phrases: ['boost your google ranking'] }
  assert.deepEqual(spamVerdict({ email: 'SALES@vendor.example', message: 'hi' }, rules), { state: 'spam', reason: 'sender_rule' })
  assert.deepEqual(spamVerdict({ email: 'x@SEO-agency.example', message: 'hi' }, rules), { state: 'spam', reason: 'domain_rule' })
  assert.deepEqual(spamVerdict({ email: 'x@gmail.com', message: 'We can Boost your Google ranking!' }, rules), { state: 'possible', reason: 'phrase_rule' })
  assert.equal(spamVerdict({ email: 'maria@gmail.com', message: 'Necesito ayuda con mi asilo' }, rules), null)
  // A subdomain, or a lookalike, is not the listed domain.
  assert.equal(spamVerdict({ email: 'x@mail.seo-agency.example', message: '' }, rules), null)
  assert.equal(spamVerdict({ email: 'x@notseo-agency.example', message: '' }, rules), null)
  assert.equal(spamVerdict({ email: 'x@vendor.example', message: '' }, { senders: [], domains: [], phrases: [] }), null)
})

test('who may be written to: a test list limits it, and outside production nobody else', () => {
  assert.equal(testRecipients({}), null)
  const r = testRecipients({ AUTOMATION_TEST_RECIPIENTS: ' Tech@Camulaw.com , +1 (504) 555-0182,,' })
  assert.deepEqual([...r.emails], ['tech@camulaw.com'])
  assert.deepEqual([...r.phones], ['5045550182'])
})

test('a lead that should get nothing more', () => {
  const ok = { status: 'new', is_archived: false, spam_state: null, automation_paused: false }
  assert.equal(leadStop(ok), null)
  assert.equal(leadStop({ ...ok, spam_state: 'cleared' }), null, 'a person said it is not spam')
  assert.equal(leadStop(null), 'lead_gone')
  assert.equal(leadStop({ ...ok, is_archived: true }), 'archived')
  assert.equal(leadStop({ ...ok, spam_state: 'possible' }), 'spam')
  assert.equal(leadStop({ ...ok, automation_paused: true }), 'stopped_by_staff')
  for (const st of ['contacted', 'no_response', 'scheduled', 'retained', 'closed']) assert.equal(leadStop({ ...ok, status: st }), `status_${st}`)
})

// --- RingCentral texts, against a recorded conversation ------------------------------

const CONFIG = { configured: true, serverUrl: 'https://platform.ringcentral.com' }
// automation_state for one key, in memory.
function stateDb() {
  let details = {}
  return {
    details: () => details,
    async query(sql, params) {
      if (/^\s*SELECT details/.test(sql)) return { rows: [{ details }] }
      if (/INSERT INTO automation_state/.test(sql)) { details = { ...details, ...JSON.parse(params[1]) }; return { rowCount: 1, rows: [] } }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`)
    },
  }
}
function rc(routes) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const u = new URL(url)
    calls.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization })
    const hit = routes[`${init.method} ${u.pathname}`]
    const r = typeof hit === 'function' ? hit(calls[calls.length - 1]) : hit
    if (!r) return { status: 404, headers: new Map(), text: async () => '{"errors":[{"errorCode":"CMN-102"}]}' }
    if (r.throw) throw new Error('socket hang up')
    return { status: r.status ?? 200, headers: new Map(Object.entries(r.headers || {})), text: async () => JSON.stringify(r.body ?? {}) }
  }
  return { calls, deps: { fetchImpl, getToken: async () => 'tok-123' } }
}
const numbers = (...recs) => ({ [`GET ${NUMBERS_PATH}`]: { body: { records: recs } } })
const now = new Date('2026-11-09T16:30:00Z')

test('texts: only from a number RingCentral lists with SmsSender, and never a guess', async () => {
  // RingOut-only numbers do not count.
  let c = rc(numbers({ phoneNumber: '+15045550100', features: ['CallerId'] }, { phoneNumber: '+15045550101', features: ['CallerId', 'A2PSmsSender'] }))
  assert.deepEqual(await smsCapability(stateDb(), CONFIG, { env: {}, deps: c.deps, now }).then((x) => [x.available, x.reason]), [false, 'no_sms_number'])
  // Exactly one that can: that one.
  c = rc(numbers({ phoneNumber: '+15045550100', features: ['CallerId', 'SmsSender'] }, { phoneNumber: '+15045550101', features: ['CallerId'] }))
  assert.deepEqual(await smsCapability(stateDb(), CONFIG, { env: {}, deps: c.deps, now }).then((x) => [x.available, x.sender]), [true, '+15045550100'])
  // Several and none chosen: nothing is sent rather than picking one.
  const two = numbers({ phoneNumber: '+15045550100', features: ['SmsSender'] }, { phoneNumber: '+15045550101', features: ['SmsSender'] })
  c = rc(two)
  assert.deepEqual(await smsCapability(stateDb(), CONFIG, { env: {}, deps: c.deps, now }).then((x) => [x.available, x.reason]), [false, 'sender_ambiguous'])
  c = rc(two)
  assert.deepEqual(await smsCapability(stateDb(), CONFIG, { env: { RINGCENTRAL_SMS_FROM: '(504) 555-0101' }, deps: c.deps, now }).then((x) => [x.available, x.sender]), [true, '+15045550101'])
  // A configured sender RingCentral does not allow is refused, not replaced.
  c = rc(two)
  assert.deepEqual(await smsCapability(stateDb(), CONFIG, { env: { RINGCENTRAL_SMS_FROM: '+15045550199' }, deps: c.deps, now }).then((x) => [x.available, x.sender, x.reason]), [false, null, 'sender_not_allowed'])
  // Missing permission, said plainly.
  c = rc({ [`GET ${NUMBERS_PATH}`]: { status: 403, body: { errors: [{ errorCode: 'CMN-408', permissionName: 'ReadUserPhoneNumbers' }] } } })
  assert.equal((await smsCapability(stateDb(), CONFIG, { env: {}, deps: c.deps, now })).reason, 'user_permission_missing')
  c = rc({ [`GET ${NUMBERS_PATH}`]: { status: 403, body: { errors: [{ errorCode: 'CMN-401' }] } } })
  assert.equal((await smsCapability(stateDb(), CONFIG, { env: {}, deps: c.deps, now })).reason, 'app_permission_missing')
  assert.equal((await smsCapability(stateDb(), { configured: false }, { env: {}, now })).reason, 'not_configured')
})

test('texts: RingCentral is asked which numbers can send at most every ten minutes', async () => {
  const db = stateDb()
  const c = rc(numbers({ phoneNumber: '+15045550100', features: ['SmsSender'] }))
  await smsCapability(db, CONFIG, { env: {}, deps: c.deps, now })
  await smsCapability(db, CONFIG, { env: {}, deps: c.deps, now: new Date(now.getTime() + 5 * 60 * 1000) })
  assert.equal(c.calls.length, 1)
  await smsCapability(db, CONFIG, { env: {}, deps: c.deps, now: new Date(now.getTime() + 11 * 60 * 1000) })
  assert.equal(c.calls.length, 2)
  // Changing the configured sender asks again at once.
  await smsCapability(db, CONFIG, { env: { RINGCENTRAL_SMS_FROM: '+15045550100' }, deps: c.deps, now: new Date(now.getTime() + 12 * 60 * 1000) })
  assert.equal(c.calls.length, 3)
})

test('texts: sent as RingCentral documents it, and every answer read for what it proves', async () => {
  let c = rc({ [`POST ${SMS_PATH}`]: { body: { id: 8031152018338946000, messageStatus: 'Queued' } } })
  let r = await sendSms(stateDb(), CONFIG, { from: '+15045550100', to: '(504) 555-0142', text: 'Hola' }, { deps: c.deps, now })
  assert.equal(r.ok, true)
  assert.deepEqual(c.calls[0].body, { from: { phoneNumber: '+15045550100' }, to: [{ phoneNumber: '+15045550142' }], text: 'Hola' })
  assert.equal(c.calls[0].auth, 'Bearer tok-123')
  // Refused outright: definitely not sent, and not worth trying again.
  c = rc({ [`POST ${SMS_PATH}`]: { status: 403, body: { errors: [{ errorCode: 'MSG-242' }] } } })
  assert.deepEqual(await sendSms(stateDb(), CONFIG, { from: '+15045550100', to: '+15045550142', text: 'Hola' }, { deps: c.deps, now }), { ok: false, outcome: 'failed', code: 'MSG-242', retryable: false })
  // Slow down: not sent, try later, and everything waits meanwhile.
  const db = stateDb()
  c = rc({ [`POST ${SMS_PATH}`]: { status: 429, headers: { 'retry-after': '45' }, body: { errors: [{ errorCode: 'CMN-301' }] } } })
  r = await sendSms(db, CONFIG, { from: '+15045550100', to: '+15045550142', text: 'Hola' }, { deps: c.deps, now })
  assert.deepEqual(r, { ok: false, outcome: 'failed', code: 'CMN-301', retryable: true, retryAfterMs: 45000 })
  assert.equal(db.details().backoffUntil, new Date(now.getTime() + 45000).toISOString())
  // No answer, or a server error: it may have gone out.
  c = rc({ [`POST ${SMS_PATH}`]: { throw: true } })
  assert.deepEqual(await sendSms(stateDb(), CONFIG, { from: '+15045550100', to: '+15045550142', text: 'Hola' }, { deps: c.deps, now }), { ok: false, outcome: 'unknown', code: 'network_error' })
  c = rc({ [`POST ${SMS_PATH}`]: { status: 503, body: {} } })
  assert.equal((await sendSms(stateDb(), CONFIG, { from: '+15045550100', to: '+15045550142', text: 'Hola' }, { deps: c.deps, now })).outcome, 'unknown')
  // Accepted but already failed (the person opted out at the carrier).
  c = rc({ [`POST ${SMS_PATH}`]: { body: { id: 77, messageStatus: 'SendingFailed', deliveryErrorCode: 'SMS-RC-413' } } })
  assert.deepEqual(await sendSms(stateDb(), CONFIG, { from: '+15045550100', to: '+15045550142', text: 'Hola' }, { deps: c.deps, now }), { ok: false, outcome: 'failed', code: 'SMS-RC-413', retryable: false, id: '77' })
  // Never called at all for a number or a text that cannot be sent.
  c = rc({})
  for (const bad of [{ to: '555-0100', text: 'x' }, { to: '+15045550142', text: '' }, { to: '+15045550142', text: 'x'.repeat(1001) }, { to: '911', text: 'x' }]) {
    assert.equal((await sendSms(stateDb(), CONFIG, { from: '+15045550100', ...bad }, { deps: c.deps, now })).ok, false)
  }
  assert.equal(c.calls.length, 0)
})

test('texts: what a delivery failure means for the number', () => {
  assert.equal(deliveryErrorKind('SMS-RC-413'), 'opt_out')
  assert.equal(deliveryErrorKind('SMS-UP-413'), 'opt_out')
  assert.equal(deliveryErrorKind('SMS-CAR-413'), 'opt_out')
  assert.equal(deliveryErrorKind('SMS-RC-410'), 'invalid')
  assert.equal(deliveryErrorKind('SMS-CAR-411'), 'invalid')
  assert.equal(deliveryErrorKind('SMS-CAR-430'), null, 'spam-filtered says nothing about the number')
  assert.equal(deliveryErrorKind(null), null)
})

test('texts: the delivery record and the inbound list are read as documented', async () => {
  let c = rc({ [`GET ${STORE_PATH}/9001`]: { body: { id: 9001, messageStatus: 'DeliveryFailed', deliveryErrorCode: 'SMS-CAR-411', subject: 'the text' } } })
  assert.deepEqual(await smsDelivery(stateDb(), CONFIG, '9001', { deps: c.deps }), { status: 'DeliveryFailed', deliveryErrorCode: 'SMS-CAR-411' })
  assert.equal(await smsDelivery(stateDb(), CONFIG, '../account', { deps: c.deps }), null, 'only a message id is ever put in the path')
  // Two pages of inbound; numbers come formatted or not; other kinds are ignored.
  c = rc({
    [`GET ${STORE_PATH}`]: (call) => (call.query.page === '1'
      ? { body: { paging: { totalPages: 2 }, records: [
        { id: 2, type: 'SMS', direction: 'Inbound', from: { phoneNumber: '(504) 555-0116' }, subject: 'Sí, gracias', creationTime: '2026-11-09T21:00:00Z' },
        { id: 3, type: 'Fax', direction: 'Inbound', from: { phoneNumber: '+15045550117' }, subject: '', creationTime: '2026-11-09T21:01:00Z' },
        { id: 4, type: 'SMS', direction: 'Outbound', from: { phoneNumber: '+15045550100' }, subject: 'ours', creationTime: '2026-11-09T21:02:00Z' },
      ] } }
      : { body: { paging: { totalPages: 2 }, records: [
        { id: 1, type: 'SMS', direction: 'Inbound', from: { phoneNumber: '15045550117' }, subject: 'STOP', creationTime: '2026-11-09T20:00:00Z' },
        { id: 5, type: 'SMS', direction: 'Inbound', from: {}, subject: 'no number', creationTime: '2026-11-09T20:30:00Z' },
      ] } }),
  })
  const list = await listInboundSms(stateDb(), CONFIG, { dateFrom: new Date('2026-11-09T00:00:00Z'), deps: c.deps })
  assert.deepEqual(list.map((m) => [m.id, m.fromKey, m.text]), [['1', '5045550117', 'STOP'], ['2', '5045550116', 'Sí, gracias']])
  assert.deepEqual(c.calls[0].query, { messageType: 'SMS', direction: 'Inbound', dateFrom: '2026-11-09T00:00:00.000Z', perPage: '100', page: '1' })
})

// --- Google Calendar, against a recorded conversation -------------------------------

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' })
const GCFG = { configured: true, problems: [], email: 'portal@project.iam.gserviceaccount.com', key: PEM, calendarId: 'office@example.test' }

test('calendar: configuration names what is missing, never a value', () => {
  assert.deepEqual(loadGoogleCalendarConfig({}, null).problems, ['GOOGLE_SERVICE_ACCOUNT_EMAIL is not set', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set', 'No calendar is chosen (automation settings, or GOOGLE_CALENDAR_ID)'])
  const bad = loadGoogleCalendarConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'a@b.c', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not a key', GOOGLE_CALENDAR_ID: 'x' })
  assert.deepEqual(bad.problems, ['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not a PEM private key'])
  // The key as it is written in Google's JSON file (\n as two characters).
  const ok = loadGoogleCalendarConfig({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'a@b.c', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') }, { scheduling: { calendarId: 'from-settings@example.test' } })
  assert.equal(ok.configured, true)
  assert.equal(ok.key, PEM.trim())
  assert.equal(ok.calendarId, 'from-settings@example.test', 'the portal’s choice wins over the variable')
})

test('calendar: the signed request is what Google documents, for the read-only scope', () => {
  const at = new Date('2026-11-09T16:30:00Z')
  const [h, c, sig] = signedAssertion(GCFG, at).split('.')
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' })
  const claims = JSON.parse(Buffer.from(c, 'base64url'))
  assert.deepEqual(claims, { iss: GCFG.email, scope: 'https://www.googleapis.com/auth/calendar.events.readonly', aud: TOKEN_URL, iat: 1794241800, exp: 1794245400 })
  assert.equal(SCOPE, claims.scope)
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')), 'verifies with the public key')
})

function google(pages, { tokenStatus = 200 } = {}) {
  const calls = []
  let i = 0
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url)
    calls.push({ url: `${u.origin}${u.pathname}`, query: Object.fromEntries(u.searchParams), method: init.method || 'GET', body: init.body || null, auth: init.headers?.Authorization || null })
    if (url === TOKEN_URL) return { status: tokenStatus, text: async () => JSON.stringify(tokenStatus === 200 ? { access_token: `ya29.${calls.length}`, expires_in: 3600, token_type: 'Bearer' } : { error: 'invalid_grant' }) }
    const page = pages[i++] || { status: 200, body: { items: [] } }
    return { status: page.status ?? 200, text: async () => JSON.stringify(page.body ?? {}) }
  }
  return { calls, fetchImpl }
}

test('calendar: a full read, then only what changed; one token for the hour', async () => {
  let clock = new Date('2026-11-09T16:30:00Z')
  const g = google([
    { body: { items: [{ id: 'a', status: 'confirmed', start: { dateTime: '2026-11-11T15:00:00-06:00' }, end: { dateTime: '2026-11-11T15:30:00-06:00' } }], nextPageToken: 'p2' } },
    { body: { items: [{ id: 'b', status: 'confirmed', start: { dateTime: '2026-11-12T10:00:00-06:00' } }], nextSyncToken: 'sync-1' } },
    { body: { items: [{ id: 'a', status: 'cancelled' }], nextSyncToken: 'sync-2' } },
  ])
  const p = createGoogleCalendarProvider(GCFG, { fetchImpl: g.fetchImpl, now: () => clock })
  assert.deepEqual(p.capabilities, { detectBookings: true, createBooking: false, availability: false, cancel: false })
  const first = await p.listChanges({ timeMin: new Date('2026-11-08T16:30:00Z') })
  assert.deepEqual([first.events.map((e) => e.id), first.nextSyncToken, first.full], [['a', 'b'], 'sync-1', true])
  assert.equal(g.calls[0].url, TOKEN_URL)
  assert.match(g.calls[0].body, /^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/)
  assert.deepEqual(g.calls[1].query, { singleEvents: 'true', maxResults: '250', timeMin: '2026-11-08T16:30:00.000Z' })
  assert.equal(g.calls[1].url, 'https://www.googleapis.com/calendar/v3/calendars/office%40example.test/events')
  assert.deepEqual(g.calls[2].query, { singleEvents: 'true', maxResults: '250', timeMin: '2026-11-08T16:30:00.000Z', pageToken: 'p2' })
  // Next time: the token only, with the same other parameters and no timeMin.
  clock = new Date(clock.getTime() + 5 * 60 * 1000)
  const next = await p.listChanges({ syncToken: 'sync-1', timeMin: new Date() })
  assert.deepEqual(g.calls[3].query, { singleEvents: 'true', maxResults: '250', syncToken: 'sync-1' })
  assert.deepEqual([next.events, next.nextSyncToken, next.full], [[{ id: 'a', cancelled: true, startsAt: null, endsAt: null, guestEmails: [], updatedAt: null }], 'sync-2', false])
  assert.equal(g.calls.filter((c) => c.url === TOKEN_URL).length, 1, 'the access token is reused')
  // An hour on, a new one.
  clock = new Date(clock.getTime() + 61 * 60 * 1000)
  await p.listChanges({ syncToken: 'sync-2' })
  assert.equal(g.calls.filter((c) => c.url === TOKEN_URL).length, 2)
})

test('calendar: 410 means start again; other failures are codes, never Google’s words', async () => {
  let g = google([{ status: 410, body: { error: { errors: [{ reason: 'fullSyncRequired' }], message: 'Sync token is no longer valid for office@example.test' } } }])
  let p = createGoogleCalendarProvider(GCFG, { fetchImpl: g.fetchImpl })
  await assert.rejects(p.listChanges({ syncToken: 'old' }), (e) => e.code === 'sync_token_invalid' && !/office@example/.test(e.message))
  g = google([{ status: 403, body: { error: { errors: [{ reason: 'forbidden' }], message: 'Forbidden for office@example.test' } } }])
  p = createGoogleCalendarProvider(GCFG, { fetchImpl: g.fetchImpl })
  await assert.rejects(p.listChanges({}), (e) => e.code === 'forbidden' && e.retryable === false && !/office@example/.test(e.message))
  g = google([], { tokenStatus: 400 })
  p = createGoogleCalendarProvider(GCFG, { fetchImpl: g.fetchImpl })
  await assert.rejects(p.listChanges({}), (e) => e.code === 'invalid_grant')
})

test('calendar: only the time, the state and the guests are taken from an event', () => {
  const e = normalizeEvent({
    id: 'ev1', status: 'confirmed', summary: 'Consulta — asilo (CONFIDENCIAL)', description: 'Caso de María, A-number 123', htmlLink: 'https://calendar.google.com/x',
    start: { dateTime: '2026-11-11T15:00:00-06:00' }, end: { dateTime: '2026-11-11T15:30:00-06:00' }, updated: '2026-11-09T18:00:00Z',
    attendees: [
      { email: 'office@example.test', self: true, organizer: true },
      { email: 'Maria.Client@Example.test', responseStatus: 'accepted' },
      { email: 'room-3@resource.calendar.google.com', resource: true },
      { email: 'declined@example.test', responseStatus: 'declined' },
      { email: 'not an email' }, { displayName: 'no address' },
    ],
  })
  assert.deepEqual(e, { id: 'ev1', cancelled: false, startsAt: new Date('2026-11-11T21:00:00Z'), endsAt: new Date('2026-11-11T21:30:00Z'), guestEmails: ['maria.client@example.test'], updatedAt: new Date('2026-11-09T18:00:00Z') })
  assert.doesNotMatch(JSON.stringify(e), /CONFIDENCIAL|A-number|htmlLink/)
  // An all-day event has no time to book; a cancelled one may be only an id.
  assert.equal(normalizeEvent({ id: 'd', start: { date: '2026-11-11' } }).startsAt, null)
  assert.deepEqual(normalizeEvent({ id: 'c', status: 'cancelled' }), { id: 'c', cancelled: true, startsAt: null, endsAt: null, guestEmails: [], updatedAt: null })
  assert.equal(normalizeEvent({ status: 'confirmed' }), null)
})
