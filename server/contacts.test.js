// Contacts: a caller's history across Calls and the website inbox, and the
// internal notes written from a call. What matters: a note is kept with its
// author and time and follows the number; nobody sees a section's entries
// they could not open; one phone number shared by different people is
// shown as possible matches, never merged; leads themselves are untouched.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import express from 'express'
import cookieParser from 'cookie-parser'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { createContactsRouter } from './routes/contacts.js'
import getPool from './db/pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_contacts`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()

let server, base, db
const u = {}
const ids = {}

async function call(method, path, { as = u.desk, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { cookie: as.cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, json, text }
}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'contacts-test-secret-0123456789abcdef'
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
  execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })
  db = new pg.Pool({ connectionString: URL_ })

  const rows = (await db.query(
    `INSERT INTO admin_users (email, password_hash, role, display_name) VALUES
       ('owner@example.test', 'x', 'admin', 'Walid'),
       ('desk@example.test', 'x', 'receptionist', 'Yoletty'),
       ('ciro@example.test', 'x', 'receptionist', 'Ciro'),
       ('staff@example.test', 'x', 'staff', 'Leads only'),
       ('para@example.test', 'x', 'billing_paralegal', 'Billing'),
       ('callsonly@example.test', 'x', 'receptionist', 'Calls only')
     RETURNING id, token_version, email`
  )).rows
  await db.query(`UPDATE admin_users SET capability_revokes = '{crm.view}' WHERE email = 'callsonly@example.test'`)
  for (const r of rows) u[r.email.split('@')[0]] = { id: r.id, cookie: `token=${jwt.sign({ id: r.id, email: r.email, tv: r.token_version }, process.env.JWT_SECRET)}` }

  // One family phone, two people; a second number for one of them.
  const sub = async (first, email, phone, at) => (await db.query(
    `INSERT INTO submissions (first_name, last_name, email, phone, message, created_at) VALUES ($1, 'Lopez', $2, $3, 'Necesito ayuda', $4) RETURNING id`,
    [first, email, phone, at]
  )).rows[0].id
  ids.maria = await sub('Maria', 'maria@example.test', '(504) 555-0101', '2026-11-02T20:10:00Z')
  ids.jose = await sub('Jose', 'jose@example.test', '504.555.0101', '2026-11-03T15:00:00Z')
  ids.other = await sub('Ana', 'ana@example.test', '504-555-0199', '2026-11-03T16:00:00Z')
  await db.query(`INSERT INTO replies (submission_id, body, sent_at, sent_by) VALUES ($1, 'Hola Maria', '2026-11-02T20:15:00Z', $2)`, [ids.maria, u.desk.id])
  await db.query(`INSERT INTO lead_notes (submission_id, body, created_at, author_id) VALUES ($1, 'Wants a consultation', '2026-11-02T20:17:00Z', $2)`, [ids.maria, u.desk.id])

  const callRow = async (rec, at, number, classification, extra = {}) => (await db.query(
    `INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, classification, classifier_version, scope, counterpart_number, counterpart_key, is_primary)
     VALUES ($1, $2, $3, $4, $5, 99, 'account', $6, cm_phone_key($6), TRUE) RETURNING id`,
    [rec, extra.direction || 'inbound', at, extra.outcome || 'other', classification, number]
  )).rows[0].id
  ids.call1 = await callRow('r1', '2026-11-03T21:45:00Z', '+15045550101', 'answered')
  ids.call2 = await callRow('r2', '2026-11-04T17:22:00Z', '+15045550101', 'not_answered')
  ids.withheld = await callRow('r3', '2026-11-04T18:00:00Z', '', 'not_answered')
  ids.elsewhere = await callRow('r4', '2026-11-04T19:00:00Z', '+15045550199', 'not_answered')

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/contacts', createContactsRouter({ db }))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((r) => server.close(r))
  if (db) await db.end()
  // requireAuth reads accounts through the shared pool; close it so the run ends.
  await getPool().end().catch(() => {})
})

test('phone numbers in any format are one contact (cm_phone_key, the key every lookup uses)', { skip: SKIP }, async () => {
  const key = async (raw) => (await db.query('SELECT cm_phone_key($1) AS k', [raw])).rows[0].k
  assert.equal(await key('(504) 555-0101'), '5045550101')
  assert.equal(await key('+1 504.555.0101'), '5045550101')
  assert.equal(await key('15045550101'), '5045550101')
  assert.equal(await key(''), '')
  assert.equal(await key('+52 55 1234 5678'), '525512345678')
})

test('a note written on a call is kept with its author and time, and follows the number', { skip: SKIP }, async () => {
  const added = await call('POST', '/api/contacts/notes', { body: { callId: ids.call2, body: '  Wants to speak to the attorney about her case. ' } })
  assert.equal(added.status, 201, added.text)
  assert.equal(added.json.body, 'Wants to speak to the attorney about her case.')
  assert.equal(added.json.authorId, u.desk.id)
  assert.ok(Date.parse(added.json.createdAt))
  // Seen from the caller's other call too, by a colleague.
  const fromOther = await call('GET', `/api/contacts/notes?callId=${ids.call1}`, { as: u.ciro })
  assert.equal(fromOther.status, 200)
  assert.deepEqual(fromOther.json.notes.map((n) => [n.body, n.author, n.mine]), [['Wants to speak to the attorney about her case.', 'Yoletty', false]])
  assert.equal((await call('GET', `/api/contacts/notes?callId=${ids.call1}`)).json.notes[0].mine, true, 'the author sees it as theirs')
  // Not on a different caller's call.
  assert.equal((await call('GET', `/api/contacts/notes?callId=${ids.elsewhere}`)).json.notes.length, 0)
  // A withheld number keeps its note on that call alone.
  assert.equal((await call('POST', '/api/contacts/notes', { body: { callId: ids.withheld, body: 'Hung up, no number' } })).status, 201)
  assert.deepEqual((await call('GET', `/api/contacts/notes?callId=${ids.withheld}`)).json.notes.map((n) => n.body), ['Hung up, no number'])
  assert.equal((await call('GET', `/api/contacts/notes?callId=${ids.call1}`)).json.notes.length, 1)
  // Empty notes are refused.
  assert.equal((await call('POST', '/api/contacts/notes', { body: { callId: ids.call2, body: '   ' } })).status, 400)
})

test('only the author edits a note; an administrator may delete any; every change is kept', { skip: SKIP }, async () => {
  const n = (await call('POST', '/api/contacts/notes', { body: { callId: ids.call2, body: 'Call back tomorrow afternoon' } })).json
  assert.equal((await call('PATCH', `/api/contacts/notes/${n.id}`, { as: u.ciro, body: { body: 'changed' } })).status, 403)
  assert.equal((await call('DELETE', `/api/contacts/notes/${n.id}`, { as: u.ciro })).status, 403)
  const edited = await call('PATCH', `/api/contacts/notes/${n.id}`, { body: { body: 'Call back tomorrow after 2' } })
  assert.equal(edited.status, 200)
  assert.equal(edited.json.body, 'Call back tomorrow after 2')
  assert.equal((await call('DELETE', `/api/contacts/notes/${n.id}`, { as: u.owner })).status, 200)
  const left = (await call('GET', `/api/contacts/notes?callId=${ids.call2}`)).json.notes.map((x) => x.body)
  assert.ok(!left.includes('Call back tomorrow after 2'))
  const revs = (await db.query('SELECT action, previous_body, changed_by FROM call_note_revisions WHERE note_id = $1 ORDER BY id', [n.id])).rows
  assert.deepEqual(revs.map((r) => [r.action, r.previous_body, Number(r.changed_by)]),
    [['edit', 'Call back tomorrow afternoon', u.desk.id], ['delete', 'Call back tomorrow after 2', u.owner.id]])
})

test('permissions: no Calls access, no call notes; billing staff see nothing', { skip: SKIP }, async () => {
  assert.equal((await call('GET', `/api/contacts/notes?callId=${ids.call1}`, { as: u.staff })).status, 403)
  assert.equal((await call('POST', '/api/contacts/notes', { as: u.staff, body: { callId: ids.call1, body: 'x' } })).status, 403)
  assert.equal((await call('GET', `/api/contacts/history?callId=${ids.call1}`, { as: u.para })).status, 403)
  assert.equal((await call('GET', `/api/contacts/history?submissionId=${ids.maria}`, { as: u.para })).status, 403)
  // Leads-only staff may open a lead's history, not a call's.
  assert.equal((await call('GET', `/api/contacts/history?callId=${ids.call1}`, { as: u.staff })).status, 403)
})

test('history: calls, leads, replies and notes on one timeline, newest first', { skip: SKIP }, async () => {
  const h = await call('GET', `/api/contacts/history?callId=${ids.call2}`)
  assert.equal(h.status, 200, h.text)
  const types = h.json.events.map((e) => e.type)
  for (const t of ['call', 'submission', 'reply', 'lead_note', 'call_note']) assert.ok(types.includes(t), `has ${t}`)
  const times = h.json.events.map((e) => Date.parse(e.at))
  assert.deepEqual(times, [...times].sort((a, b) => b - a))
  // Another caller's call is not in it, nor the other number's lead.
  assert.ok(!h.json.events.some((e) => e.callId === ids.elsewhere || e.submissionId === ids.other))
  const reply = h.json.events.find((e) => e.type === 'reply')
  assert.equal(reply.employee, 'Yoletty')
  assert.equal(reply.submissionId, ids.maria)
})

test('a section you cannot open stays out of the history', { skip: SKIP }, async () => {
  const leadsOnly = await call('GET', `/api/contacts/history?submissionId=${ids.maria}`, { as: u.staff })
  assert.equal(leadsOnly.status, 200)
  assert.ok(leadsOnly.json.events.length > 0)
  assert.ok(!leadsOnly.json.events.some((e) => e.type === 'call'), 'no calls without calls.view')
})

test('without the website inbox, a call history has no leads, replies or lead notes', { skip: SKIP }, async () => {
  const h = await call('GET', `/api/contacts/history?callId=${ids.call1}`, { as: u.callsonly })
  assert.equal(h.status, 200, h.text)
  assert.ok(h.json.events.some((e) => e.type === 'call'))
  assert.ok(!h.json.events.some((e) => ['submission', 'reply', 'lead_note'].includes(e.type)), 'no lead entries')
  assert.deepEqual(h.json.matches, [], 'and no lead names')
})

test('one number, two people: possible matches, never merged; staff can confirm or set one aside', { skip: SKIP }, async () => {
  let h = (await call('GET', `/api/contacts/history?callId=${ids.call1}`)).json
  assert.deepEqual(h.matches.map((m) => m.name).sort(), ['Jose Lopez', 'Maria Lopez'])
  assert.ok(h.events.filter((e) => e.type === 'submission').every((e) => e.match === 'possible'))
  // Jose is someone else using the family phone: his lead leaves this history.
  assert.equal((await call('PUT', '/api/contacts/matches', { body: { callId: ids.call1, lead: ids.jose, state: 'rejected' } })).status, 200)
  assert.equal((await call('PUT', '/api/contacts/matches', { body: { callId: ids.call1, lead: ids.maria, state: 'confirmed' } })).status, 200)
  h = (await call('GET', `/api/contacts/history?callId=${ids.call1}`)).json
  const subs = h.events.filter((e) => e.type === 'submission')
  assert.deepEqual(subs.map((e) => [e.submissionId, e.match]), [[ids.maria, 'confirmed']])
  // A lead that does not use this number cannot be attached to it.
  assert.equal((await call('PUT', '/api/contacts/matches', { body: { callId: ids.call1, lead: ids.other, state: 'confirmed' } })).status, 404)
  // Billing staff cannot decide.
  assert.equal((await call('PUT', '/api/contacts/matches', { as: u.para, body: { callId: ids.call1, lead: ids.jose, state: 'possible' } })).status, 403)
  // Undecided again: Jose is back as a possible match.
  await call('PUT', '/api/contacts/matches', { body: { callId: ids.call1, lead: ids.jose, state: 'possible' } })
  h = (await call('GET', `/api/contacts/history?callId=${ids.call1}`)).json
  assert.ok(h.events.some((e) => e.submissionId === ids.jose && e.match === 'possible'))
  // The leads themselves are unchanged.
  const leads = (await db.query('SELECT first_name, phone FROM submissions ORDER BY id')).rows
  assert.deepEqual(leads, [{ first_name: 'Maria', phone: '(504) 555-0101' }, { first_name: 'Jose', phone: '504.555.0101' }, { first_name: 'Ana', phone: '504-555-0199' }])
})

test('history pages back through older events, none skipped or repeated when several share a time', { skip: SKIP }, async () => {
  // Three notes written in the same instant (microseconds apart from nothing):
  // a page boundary falls among them.
  const key = (await db.query('SELECT counterpart_key FROM rc_calls WHERE id = $1', [ids.call1])).rows[0].counterpart_key
  const tied = []
  for (const body of ['tie one', 'tie two', 'tie three']) {
    tied.push((await db.query(
      `INSERT INTO call_notes (phone_key, call_key, body, author_id, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, '2026-11-03T18:00:00.123456Z', '2026-11-03T18:00:00.123456Z') RETURNING id`,
      [key, body, u.desk.id]
    )).rows[0].id)
  }
  try {
    const all = (await call('GET', `/api/contacts/history?callId=${ids.call1}&limit=100`)).json.events.map((e) => e.id)
    assert.ok(tied.every((id) => all.includes(`call_note:${id}`)))

    // Following `next`: every event exactly once, in the same order.
    const seen = []
    let cursor = ''
    for (let i = 0; i < 50; i++) {
      const page = (await call('GET', `/api/contacts/history?callId=${ids.call1}&limit=2${cursor}`)).json
      seen.push(...page.events.map((e) => e.id))
      if (!page.more) { assert.equal(page.next, null); break }
      assert.ok(page.next)
      cursor = `&cursor=${encodeURIComponent(page.next)}`
    }
    assert.deepEqual(seen, all)

    // What the portal does today: `before` = the last event's time, keeping
    // the ones it has not got yet. With pages of four the first ends among
    // the three tied notes; nothing is skipped. (The portal pages 20 at a
    // time; this needs fewer than a page sharing one millisecond.)
    const kept = []
    let before = ''
    for (let i = 0; i < 50; i++) {
      const page = (await call('GET', `/api/contacts/history?callId=${ids.call1}&limit=4${before}`)).json
      const fresh = page.events.filter((e) => !kept.some((k) => k.id === e.id))
      kept.push(...fresh)
      if (!page.more || !fresh.length) break
      before = `&before=${encodeURIComponent(kept[kept.length - 1].at)}`
    }
    assert.deepEqual(kept.map((e) => e.id).sort(), [...all].sort())

    // A cursor that is not ours is ignored: the first page.
    const junk = (await call('GET', `/api/contacts/history?callId=${ids.call1}&limit=2&cursor=bm9wZQ`)).json
    assert.deepEqual(junk.events.map((e) => e.id), all.slice(0, 2))
  } finally {
    await db.query('DELETE FROM call_notes WHERE id = ANY($1::bigint[])', [tied])
  }
})

test('a withheld number has no history to match on', { skip: SKIP }, async () => {
  const h = (await call('GET', `/api/contacts/history?callId=${ids.withheld}`)).json
  assert.equal(h.hasNumber, false)
  assert.deepEqual(h.events, [])
})
