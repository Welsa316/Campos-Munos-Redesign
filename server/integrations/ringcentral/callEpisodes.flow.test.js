// Callback episodes and the quiet review group, over real HTTP and Postgres.
// Needs attention lists one item per person waiting for a call back; the
// per-call rows, counts and attribution underneath stay exactly as they are.
// Synthetic people and 555-01xx numbers only.
//
// Own database: <TEST_DATABASE_URL's name>_episodes (created if missing; must
// contain "test"; schema dropped and rebuilt).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { CLASSIFIER_VERSION } from './callEvidence.js'
import { followUpDecision } from './callLog.js'

// The JS follow-up rule applied to a call as the API presents it, so the
// SQL columns (needsAttention, needsReview) and the rule are held together.
const decisionOf = (c) => followUpDecision({
  direction: c.direction, is_internal: false, is_primary: true, classification: c.classification,
  counterpart_key: String(c.number || '').replace(/\D/g, ''),
  handled_at: c.handled?.at ?? null, excluded_kind: c.exclusion?.scope ?? null, connected_followup_at: c.connectedFollowUp?.at ?? null,
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_episodes`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

let server, base, db
// Wednesday Nov 4 2026, noon in New Orleans.
const clock = { t: new Date('2026-11-04T18:00:00Z') }
const users = {}

const CIRO = { kind: 'extension', extensionId: '9102', extension: '102', name: 'Ciro' }

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'episodes-test-secret-0123456789abcdef'
  process.env.NODE_ENV = 'test'
  const admin = new pg.Client({ connectionString: BASE_URL })
  await admin.connect()
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME])).rowCount) await admin.query(`CREATE DATABASE "${DB_NAME}"`)
  await admin.end()
  const c = new pg.Client({ connectionString: URL_ })
  await c.connect()
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await c.end()
  process.env.DATABASE_URL = URL_
  execFileSync(process.execPath, [join(__dirname, '..', '..', 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  db = new pg.Pool({ connectionString: URL_ })

  const rows = (await db.query(
    `INSERT INTO admin_users (email, password_hash, role) VALUES ('owner@example.test', 'x', 'admin'), ('desk@example.test', 'x', 'front_desk'), ('para@example.test', 'x', 'billing_paralegal')
     RETURNING id, token_version`
  )).rows
  const cookie = (u) => `token=${jwt.sign({ id: u.id, email: 'x', tv: u.token_version }, process.env.JWT_SECRET)}`
  ;[users.owner, users.desk, users.para] = rows.map((u) => ({ ...u, cookie: cookie(u) }))

  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('../../app.js')
  const { createCallsRouter } = await import('../../routes/calls.js')
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/calls', createCallsRouter({ db, env: { NODE_ENV: 'test' }, now: () => clock.t }))
  addFallbackHandlers(app)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (SKIP) return
  server?.closeAllConnections?.()
  server?.close()
  await db?.end()
  const { default: getPool } = await import('../../db/pool.js')
  await getPool().end().catch(() => {})
})

async function send(method, path, body, { cookie = users.owner.cookie } = {}) {
  const res = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}
const range = () => `from=${encodeURIComponent(new Date(clock.t.getTime() - 90 * 864e5).toISOString())}&to=${encodeURIComponent(new Date(clock.t.getTime() + 60e3).toISOString())}`
const attention = async (extra = '') => {
  const r = await send('GET', `/api/calls?${range()}&outcome=attention&kpis=1${extra}`)
  assert.equal(r.status, 200, r.text)
  return r.json
}
const allCalls = async (extra = '') => (await send('GET', `/api/calls?${range()}&outcome=all${extra}`)).json

// A stored call, already classified (the classifier has its own tests).
let seq = 0
async function addCall({ at, direction = 'inbound', cls = 'not_answered', number = '+15045550101', outcome, primary = true, session = null, evidence = null }) {
  const id = `ep-${++seq}`
  const out = outcome || (direction === 'outbound' ? 'connected' : cls === 'answered' ? 'answered' : 'missed')
  const ev = evidence || (direction === 'inbound' ? { offeredTo: [CIRO], notAnsweredBy: UNANSWERED.has(cls) ? [CIRO] : [] } : null)
  const r = await db.query(
    `INSERT INTO rc_calls (rc_record_id, telephony_session_id, direction, started_at, outcome, counterpart_number, counterpart_key, scope,
            classification, classification_evidence, classifier_version, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, cm_phone_key($6), $7, $8, $9, $10, $11) RETURNING id`,
    [id, session || `ts-${id}`, direction, at, out, number, primary ? 'account' : 'extension',
      direction === 'inbound' ? cls : null, ev ? JSON.stringify(ev) : null, CLASSIFIER_VERSION, primary]
  )
  return Number(r.rows[0].id)
}
const UNANSWERED = new Set(['not_answered', 'caller_hung_up', 'ended_before_ringing', 'voicemail'])
const snapshot = async () => (await db.query(
  `SELECT id, direction, started_at, outcome, classification, classification_evidence, is_primary, counterpart_key FROM rc_calls ORDER BY id`
)).rows
const iso = (d) => new Date(d).toISOString()
const episodeOf = (a, number) => a.episodes.filter((e) => e.number === number)

test('callback episodes', { skip: SKIP }, async (t) => {
  let maria = []

  await t.test('three unanswered calls from one number are one episode; the calls themselves are unchanged', async () => {
    maria = [
      await addCall({ at: '2026-11-02T15:15:00Z' }), // Mon 9:15 AM
      await addCall({ at: '2026-11-03T16:05:00Z', cls: 'voicemail' }), // Tue 10:05 AM
      await addCall({ at: '2026-11-04T15:30:00Z', cls: 'caller_hung_up' }),
    ]
    // A second RingCentral record of the second call (same session): not
    // another attempt, and not another episode.
    await addCall({ at: '2026-11-03T16:05:00Z', cls: 'voicemail', primary: false, session: 'ts-ep-2' })
    const rowsBefore = await snapshot()

    const a = await attention()
    assert.equal(a.episodes.length, 1)
    const ep = a.episodes[0]
    assert.equal(ep.id, maria[0], 'identified by its first call')
    assert.equal(ep.attempts, 3)
    assert.deepEqual(ep.callIds, maria)
    assert.equal(ep.latestCallId, maria[2])
    assert.equal(iso(ep.firstAt), '2026-11-02T15:15:00.000Z')
    assert.equal(iso(ep.lastAt), '2026-11-04T15:30:00.000Z')
    assert.equal(ep.callbackAttempts, 0)
    assert.equal(ep.attentionGroup, 'waiting', 'from the first attempt, on Monday')
    assert.deepEqual(ep.offeredTo.map((p) => p.name), ['Ciro'], 'offered-to across the calls, once each')

    // The calls list and its counts stay per call; the KPI counts people.
    assert.equal(a.calls.length, 3)
    assert.equal(a.counts.attention, 3)
    assert.equal(a.kpis.needsAttention, 1)
    assert.equal(a.kpis.needsAttention, 1)
    assert.equal(a.kpis.openCalls, 3)
    const all = await allCalls()
    assert.equal(all.counts.missed + all.counts.voicemail + all.counts.hung_up, 3, 'the missed counts are per call')
    assert.equal(all.counts.not_returned, 3)
    // Each call keeps who it is attributed to.
    for (const c of a.calls) assert.deepEqual(c.notAnsweredBy.map((p) => p.name), ['Ciro'])
    assert.deepEqual(await snapshot(), rowsBefore, 'grouping writes nothing')
  })

  await t.test('a callback that does not connect is counted on the episode and resolves nothing; one that connects resolves it', async () => {
    await addCall({ at: '2026-11-04T16:00:00Z', direction: 'outbound', outcome: 'no_answer' })
    let a = await attention()
    assert.equal(a.episodes.length, 1)
    assert.equal(a.episodes[0].attempts, 3, 'a callback attempt is not an unanswered call')
    assert.equal(a.episodes[0].callbackAttempts, 1)
    assert.equal(iso(a.episodes[0].lastCallbackAttemptAt), '2026-11-04T16:00:00.000Z')
    assert.equal(a.kpis.needsAttention, 1)

    await addCall({ at: '2026-11-04T17:00:00Z', direction: 'outbound', outcome: 'connected' })
    a = await attention()
    assert.deepEqual(a.episodes, [])
    assert.equal(a.kpis.needsAttention, 0)
    assert.equal(a.kpis.openCalls, 0)
    // All three calls show as dealt with, each on its own.
    const handled = (await send('GET', `/api/calls?${range()}&outcome=handled`)).json
    assert.deepEqual(handled.calls.map((c) => c.id).sort((x, y) => x - y), maria)
    assert.ok(handled.calls.every((c) => decisionOf(c) === 'resolved'))
  })

  await t.test('a new unanswered call after that starts a new episode', async () => {
    const later = await addCall({ at: '2026-11-04T17:30:00Z' })
    const a = await attention()
    assert.equal(a.episodes.length, 1)
    assert.equal(a.episodes[0].id, later)
    assert.equal(a.episodes[0].attempts, 1)
    assert.equal(a.episodes[0].callbackAttempts, 0, 'attempts before the episode are not counted on it')
    assert.equal(a.episodes[0].attentionGroup, 'new')
    // Out of the way for what follows.
    assert.equal((await send('POST', `/api/calls/${later}/handled`, {})).status, 200)
  })

  let jose = []
  await t.test('handling an episode handles every call in it; reopening restores it', async () => {
    jose = [
      await addCall({ at: '2026-11-03T15:00:00Z', number: '+15045550102' }),
      await addCall({ at: '2026-11-03T19:00:00Z', number: '+15045550102' }),
      await addCall({ at: '2026-11-04T14:00:00Z', number: '+15045550102', cls: 'voicemail' }),
    ]
    let a = await attention()
    assert.deepEqual(a.episodes.map((e) => e.callIds), [jose])
    const handledToday = a.kpis.handledToday
    const rowsBefore = await snapshot()

    // Same permission as marking one call; one number only.
    assert.equal((await send('POST', '/api/calls/episodes/handled', { callIds: jose }, { cookie: users.para.cookie })).status, 403)
    assert.equal((await send('POST', '/api/calls/episodes/handled', { callIds: [jose[0], maria[0]] })).status, 409)
    assert.equal((await send('POST', '/api/calls/episodes/handled', { callIds: [] })).status, 400)

    const h = await send('POST', '/api/calls/episodes/handled', { callIds: jose, note: 'Spoke on WhatsApp' }, { cookie: users.desk.cookie })
    assert.equal(h.status, 200, h.text)
    assert.deepEqual(h.json.callIds, jose)
    const marks = (await db.query(
      `SELECT r.note FROM rc_call_resolutions r JOIN rc_calls c ON c.call_key = r.call_key WHERE c.id = ANY($1::bigint[]) AND c.is_primary`, [jose]
    )).rows
    assert.deepEqual(marks.map((m) => m.note), ['Spoke on WhatsApp', 'Spoke on WhatsApp', 'Spoke on WhatsApp'], 'one mark per call')
    a = await attention()
    assert.deepEqual(a.episodes, [])
    assert.equal(a.kpis.needsAttention, 0)
    assert.equal(a.kpis.handledToday, handledToday + 3, 'handled today stays per call')
    assert.deepEqual(await snapshot(), rowsBefore, 'classification and attribution untouched')

    const r = await send('POST', '/api/calls/episodes/reopen', { callIds: jose }, { cookie: users.desk.cookie })
    assert.equal(r.json.removed, 3)
    a = await attention()
    assert.deepEqual(a.episodes.map((e) => [e.id, e.attempts]), [[jose[0], 3]], 'the same episode, same id')
    assert.equal(a.kpis.handledToday, handledToday)
  })

  await t.test('a call marked on its own ends the episode before it', async () => {
    // The middle call handled from its detail card: the call before it is
    // one episode, Wednesday's voicemail starts another.
    assert.equal((await send('POST', `/api/calls/${jose[1]}/handled`, {})).status, 200)
    let a = await attention()
    assert.deepEqual(a.episodes.map((e) => e.callIds).sort((x, y) => x[0] - y[0]), [[jose[0]], [jose[2]]])
    assert.equal(a.kpis.needsAttention, 2, 'the KPI agrees with the list')
    assert.equal((await send('DELETE', `/api/calls/${jose[1]}/handled`)).status, 200)
    a = await attention()
    assert.deepEqual(a.episodes.map((e) => e.callIds), [jose])
  })

  await t.test('no callback needed applies to every call of the episode, each counted again on its own', async () => {
    const x = await send('POST', `/api/calls/${jose[2]}/exclusion`, { reason: 'spam', callIds: jose }, { cookie: users.desk.cookie })
    assert.equal(x.status, 200, x.text)
    assert.deepEqual([...x.json.callIds].sort((p, q) => p - q), jose)
    let a = await attention()
    assert.deepEqual(a.episodes, [])
    assert.equal((await allCalls()).counts.excluded, 3)
    // Another number's call cannot ride along.
    assert.equal((await send('POST', `/api/calls/${jose[2]}/exclusion`, { reason: 'spam', callIds: [maria[0]] })).status, 409)
    for (const id of jose) assert.equal((await send('DELETE', `/api/calls/${id}/exclusion`)).status, 200)
    a = await attention()
    assert.deepEqual(a.episodes.map((e) => e.callIds), [jose])
  })

  let unknown = null
  await t.test('no recorded outcome: only in the review group, never anyone’s miss', async () => {
    const person = async () => (await allCalls('&person=9102')).counts
    const before = await person()
    const k = (await attention()).kpis
    // Offered to Ciro, but nothing shows how it ended.
    unknown = await addCall({ at: '2026-11-04T16:20:00Z', number: '+15045550103', cls: 'unknown' })
    const unknownSession = `ts-ep-${seq}`
    // Not for review: withheld, or the person got through afterwards.
    await addCall({ at: '2026-11-04T16:25:00Z', number: null, cls: 'unknown' })
    await addCall({ at: '2026-11-03T16:00:00Z', number: '+15045550104', cls: 'unknown' })
    await addCall({ at: '2026-11-03T16:30:00Z', number: '+15045550104', cls: 'answered' })
    // A second record of the same call is not a second item.
    await addCall({ at: '2026-11-04T16:20:00Z', number: '+15045550103', cls: 'unknown', primary: false, session: unknownSession })

    const a = await attention()
    assert.deepEqual(a.review.map((e) => e.callIds), [[unknown]])
    assert.equal(a.review[0].kind, 'review')
    assert.equal(a.review[0].attentionGroup, null)
    assert.ok(!a.calls.some((c) => c.id === unknown), 'not in Needs attention')
    assert.ok(!a.episodes.some((e) => e.callIds.includes(unknown)))
    assert.equal(a.kpis.needsAttention, k.needsAttention, 'not in the KPI or the tab badge')
    assert.equal(a.kpis.review, 1)
    const rc = a.reviewCalls.find((c) => c.id === unknown)
    assert.equal(rc.classification, 'unknown')
    assert.equal(decisionOf(rc), 'review')
    assert.equal(rc.needsReview, true)
    assert.deepEqual(rc.notAnsweredBy, [], 'never attributed to anyone')
    const after = await person()
    assert.equal(after.person_not_answered, before.person_not_answered, 'not counted against the person it was offered to')
    assert.equal(after.missed, before.missed)
    assert.equal(after.not_returned, before.not_returned)

    // Same actions as an open call: handled, and reopened.
    assert.equal((await send('POST', `/api/calls/episodes/handled`, { callIds: [unknown] })).status, 200)
    assert.deepEqual((await attention()).review, [])
    assert.equal((await send('POST', `/api/calls/episodes/reopen`, { callIds: [unknown] })).json.removed, 1)
    assert.equal((await attention()).review.length, 1)
  })

  await t.test('withheld numbers are never grouped', async () => {
    await addCall({ at: '2026-11-04T16:40:00Z', number: null })
    await addCall({ at: '2026-11-04T16:41:00Z', number: null })
    const a = await attention()
    assert.ok(a.episodes.every((e) => e.number), 'nobody to call back, so not in Needs attention at all')
    assert.ok(a.review.every((e) => e.number))
  })

  await t.test('every call’s follow-up decision matches the list it is in', async () => {
    const all = await allCalls()
    assert.ok(all.calls.length > 10)
    for (const c of all.calls) {
      assert.equal(decisionOf(c) === 'confirmed_unanswered', c.needsAttention, `call ${c.id}`)
      assert.equal(decisionOf(c) === 'review', c.needsReview, `call ${c.id}`)
    }
  })

  await t.test('clear the list: episodes counted as people; the review group stays unless asked', async () => {
    const a = await attention()
    const preview = (await send('GET', '/api/calls/handled/bulk')).json
    assert.deepEqual(preview, { count: a.kpis.openCalls, people: a.kpis.needsAttention, review: 1 })
    assert.deepEqual((await send('GET', '/api/calls/handled/bulk?review=1')).json, { count: a.kpis.openCalls + 1, people: a.kpis.needsAttention + 1, review: 1 })

    let out = await send('POST', '/api/calls/handled/bulk', { note: 'Routing fixed' })
    assert.equal(out.json.cleared, a.kpis.openCalls)
    let after = await attention()
    assert.deepEqual(after.episodes, [])
    assert.deepEqual(after.review.map((e) => e.callIds), [[unknown]], 'left for someone to check')
    await send('DELETE', `/api/calls/handled/bulk/${out.json.batch}`)

    out = await send('POST', '/api/calls/handled/bulk', { note: 'Routing fixed', review: true })
    assert.equal(out.json.cleared, a.kpis.openCalls + 1)
    after = await attention()
    assert.deepEqual(after.review, [])
    await send('DELETE', `/api/calls/handled/bulk/${out.json.batch}`)
    after = await attention()
    assert.equal(after.kpis.needsAttention, a.kpis.needsAttention)
    assert.equal(after.review.length, 1)
  })
})
