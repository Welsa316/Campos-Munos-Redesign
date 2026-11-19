// Entry colours (server/colors/, routes/colors.js) over real HTTP and a real
// Postgres: setting and clearing a colour on a caller, a website lead and a
// reminder, where each one shows (every call from the number, the leads
// list and detail, reminders, Home's follow-ups), what is refused, who may,
// and the Calls page's change stamp. Synthetic people and 555-01xx numbers only.
//
// Own database: <TEST_DATABASE_URL's name>_colors (created if missing; must
// contain "test"; schema dropped, rebuilt and migrated twice). Run with
// TEST_DATABASE_URL=postgres://localhost/camulaw_colors_test.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { CLASSIFIER_VERSION } from './integrations/ringcentral/callEvidence.js'
import { ENTRY_COLORS } from './colors/palette.js'
import { describeRequest } from './activity/recorder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_colors`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

let server, base, db
const u = {}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'colors-test-secret-0123456789abcdef0123'
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
  // Twice: the schema must be safe to apply on every deploy.
  migrate()
  migrate()
  db = new pg.Pool({ connectionString: URL_ })

  const rows = (await db.query(
    `INSERT INTO admin_users (email, password_hash, role, display_name) VALUES
       ('desk@example.test', 'x', 'front_desk', 'Desk'),
       ('ciro@example.test', 'x', 'receptionist', 'Ciro'),
       ('leads@example.test', 'x', 'staff', 'Leads only'),
       ('para@example.test', 'x', 'billing_paralegal', 'Billing'),
       ('reader@example.test', 'x', 'staff', 'Reads leads only')
     RETURNING id, token_version, email`
  )).rows
  // Can read leads but not work them (no crm.manage, no calls.exclude).
  await db.query("UPDATE admin_users SET capability_revokes = '{crm.manage}' WHERE email = 'reader@example.test'")
  for (const r of rows) u[r.email.split('@')[0]] = { id: Number(r.id), cookie: `token=${jwt.sign({ id: r.id, email: r.email, tv: r.token_version }, process.env.JWT_SECRET)}` }

  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { addFallbackHandlers } = await import('./app.js')
  const { createColorsRouter } = await import('./routes/colors.js')
  const { createRemindersRouter } = await import('./routes/reminders.js')
  const { createCallsRouter } = await import('./routes/calls.js')
  const { createWorkQueueRouter } = await import('./routes/workQueue.js')
  const submissions = (await import('./routes/submissions.js')).default
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/colors', createColorsRouter({ db, writeLimit: 10000 }))
  app.use('/api/colors-limited', createColorsRouter({ db, writeLimit: 2 }))
  app.use('/api/reminders', createRemindersRouter({ db, writeLimit: 10000 }))
  app.use('/api/calls', createCallsRouter({ db, env: { NODE_ENV: 'test' } }))
  app.use('/api/work-queue', createWorkQueueRouter({ db }))
  app.use('/api/submissions', submissions)
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
  const { default: getPool } = await import('./db/pool.js')
  await getPool().end().catch(() => {})
})

async function send(method, path, body, as = u.desk) {
  const res = await fetch(base + path, { method, headers: { Cookie: as.cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json, text }
}
const color = (kind, id, c, as) => send('PUT', '/api/colors', { kind, id, color: c }, as)

let seq = 0
async function addCall({ minutesAgo, number, cls = 'not_answered' }) {
  const id = `col-${++seq}`
  const r = await db.query(
    `INSERT INTO rc_calls (rc_record_id, telephony_session_id, direction, started_at, outcome, counterpart_number, counterpart_key, scope,
            classification, classification_evidence, classifier_version, is_primary)
     VALUES ($1, $2, 'inbound', NOW() - make_interval(mins => $3), 'missed', $4, cm_phone_key($4), 'account', $5, $6, $7, TRUE) RETURNING id`,
    [id, `ts-${id}`, minutesAgo, number, cls, JSON.stringify({ offeredTo: [], notAnsweredBy: [] }), CLASSIFIER_VERSION]
  )
  return Number(r.rows[0].id)
}
const newLead = async () => Number((await db.query(
  "INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ('Ana', 'Prueba', 'ana@example.test', '504-555-0177', 'Necesito ayuda') RETURNING id"
)).rows[0].id)
const listCalls = async (outcome = 'all', as = u.desk) => {
  const from = new Date(Date.now() - 2 * 864e5).toISOString()
  const to = new Date(Date.now() + 60e3).toISOString()
  return send('GET', `/api/calls?from=${from}&to=${to}&outcome=${outcome}&limit=500`, undefined, as)
}
const stamp = async () => (await send('GET', '/api/calls/changes')).json.stamp

test('a caller colour shows on every call from the number, in every tab, and clears', { skip: SKIP }, async () => {
  const number = '+15045550141'
  const other = '+15045550142'
  const a = await addCall({ minutesAgo: 30, number })
  const b = await addCall({ minutesAgo: 20, number })
  const c = await addCall({ minutesAgo: 10, number: other })

  const set = await color('caller', a, 'teal')
  assert.equal(set.status, 200, set.text)
  assert.deepEqual(set.json, { kind: 'caller', id: a, color: 'teal' })

  const all = (await listCalls()).json
  const byId = new Map(all.calls.map((x) => [x.id, x]))
  assert.equal(byId.get(a).color, 'teal')
  assert.equal(byId.get(b).color, 'teal', 'the colour belongs to the number, not the one call')
  assert.equal(byId.get(c).color, null, 'another number keeps no colour')

  // Needs attention: the caller's episode and its calls carry it.
  const att = (await listCalls('attention')).json
  const ep = att.episodes.find((e) => e.callIds.includes(a))
  assert.ok(ep, 'the caller waits in Needs attention')
  assert.equal(ep.color, 'teal')
  assert.equal(att.episodes.find((e) => e.callIds.includes(c)).color, null)

  // One call on its own (a reminder's link).
  assert.equal((await send('GET', `/api/calls/${b}`)).json.call.color, 'teal')

  // Set through the other call: still one colour for the number.
  assert.equal((await color('caller', b, 'red')).status, 200)
  assert.equal((await listCalls()).json.calls.find((x) => x.id === a).color, 'red')
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM entry_colors WHERE kind = 'caller'")).rows[0].n, 1)

  // Handled: still coloured in the Handled tab.
  assert.equal((await send('POST', '/api/calls/episodes/handled', { callIds: [a, b] })).status, 200)
  const handled = (await listCalls('handled')).json
  assert.ok(handled.calls.length, 'the calls are in Handled')
  for (const x of handled.calls.filter((y) => [a, b].includes(y.id))) assert.equal(x.color, 'red')

  // No colour.
  const cleared = await color('caller', a, null)
  assert.equal(cleared.status, 200, cleared.text)
  assert.equal(cleared.json.color, null)
  assert.equal((await listCalls()).json.calls.find((x) => x.id === b).color, null)
})

test('the Calls page change stamp moves when a caller or reminder colour is set or cleared', { skip: SKIP }, async () => {
  const id = await addCall({ minutesAgo: 5, number: '+15045550143' })
  const s0 = await stamp()
  assert.equal(await stamp(), s0, 'nothing changed: the stamp holds')
  await color('caller', id, 'yellow')
  const s1 = await stamp()
  assert.notEqual(s1, s0, 'setting moves it')
  await color('caller', id, null)
  const s2 = await stamp()
  assert.notEqual(s2, s1, 'clearing moves it too')
  const r = await send('POST', '/api/reminders', { target: { kind: 'call', id }, dueAt: 'in_60' })
  assert.equal(r.status, 201, r.text)
  const s3 = await stamp()
  await color('reminder', r.json.reminder.id, 'pink')
  assert.notEqual(await stamp(), s3, 'a reminder colour shows on the call row chip, so it moves the stamp')
})

test('a lead colour is in the leads list and the lead detail', { skip: SKIP }, async () => {
  const lead = await newLead()
  const other = await newLead()
  assert.equal((await color('lead', lead, 'purple')).status, 200)
  const list = (await send('GET', '/api/submissions?withTotal=1')).json.rows
  assert.equal(list.find((s) => s.id === lead).color, 'purple')
  assert.equal(list.find((s) => s.id === other).color, null)
  assert.equal((await send('GET', `/api/submissions/${lead}`)).json.color, 'purple')
  // The bare-array form the Dashboard uses carries it too.
  assert.equal((await send('GET', '/api/submissions')).json.find((s) => s.id === lead).color, 'purple')
  assert.equal((await color('lead', lead, null)).status, 200)
  assert.equal((await send('GET', `/api/submissions/${lead}`)).json.color, null)
})

test('a reminder colour is in every reminder list and on Home’s follow-ups', { skip: SKIP }, async () => {
  const call = await addCall({ minutesAgo: 3, number: '+15045550144' })
  const lead = await newLead()
  const rc = (await send('POST', '/api/reminders', { target: { kind: 'call', id: call }, dueAt: 'in_30' })).json.reminder
  const rl = (await send('POST', '/api/reminders', { target: { kind: 'submission', id: lead }, dueAt: 'in_60' })).json.reminder
  assert.equal(rc.color, null)
  assert.equal((await color('reminder', rc.id, 'green')).status, 200)
  assert.equal((await color('reminder', rl.id, 'orange')).status, 200)

  assert.equal((await send('GET', '/api/reminders?kind=call')).json.reminders.find((r) => r.id === rc.id).color, 'green')
  assert.equal((await send('GET', `/api/reminders?call=${call}`)).json.reminders[0].color, 'green')
  assert.equal((await send('GET', `/api/reminders?lead=${lead}`)).json.reminders[0].color, 'orange')
  assert.equal((await send('GET', `/api/reminders/${rc.id}`)).json.reminder.color, 'green')
  const mine = (await send('GET', '/api/reminders/mine')).json.reminders
  assert.equal(mine.find((r) => r.id === rl.id).color, 'orange')
  const queue = (await send('GET', '/api/work-queue')).json.items
  const item = queue.find((i) => i.reminderId === rc.id)
  assert.ok(item, 'the reminder is on Home')
  assert.equal(item.color, 'green')
  // The reminder's colour is its own: the caller has none.
  assert.equal((await listCalls()).json.calls.find((x) => x.id === call).color, null)
})

test('a bad kind, colour or id is refused and nothing is stored', { skip: SKIP }, async () => {
  const call = await addCall({ minutesAgo: 2, number: '+15045550145' })
  const before = (await db.query('SELECT COUNT(*)::int AS n FROM entry_colors')).rows[0].n
  const cases = [
    [{ kind: 'caller', id: call, color: 'magenta' }, 400, 'invalid_color'],
    [{ kind: 'caller', id: call, color: '#ff0000' }, 400, 'invalid_color'],
    [{ kind: 'caller', id: call, color: ['red'] }, 400, 'invalid_color'],
    [{ kind: 'caller', id: call }, 400, 'invalid_color'],
    [{ kind: 'number', id: call, color: 'red' }, 400, 'invalid_kind'],
    [{ kind: 'caller', id: 'abc', color: 'red' }, 400, 'invalid_id'],
    [{ kind: 'caller', id: -1, color: 'red' }, 400, 'invalid_id'],
    [{ kind: 'caller', id: true, color: 'red' }, 400, 'invalid_id'],
    [{ kind: 'caller', id: 99999999, color: 'red' }, 404, 'not_found'],
    [{ kind: 'lead', id: 99999999, color: 'red' }, 404, 'not_found'],
    [{ kind: 'lead', id: 9999999999, color: 'red' }, 404, 'not_found'],
    [{ kind: 'reminder', id: 99999999, color: 'red' }, 404, 'not_found'],
  ]
  for (const [body, status, code] of cases) {
    const r = await send('PUT', '/api/colors', body)
    assert.equal(r.status, status, `${JSON.stringify(body)}: ${r.text}`)
    assert.equal(r.json.code, code, JSON.stringify(body))
  }
  // A withheld number has no caller to colour.
  const withheld = Number((await db.query(
    `INSERT INTO rc_calls (rc_record_id, direction, started_at, outcome, counterpart_number, counterpart_key, scope, is_primary)
     VALUES ('col-withheld', 'inbound', NOW(), 'missed', NULL, '', 'account', TRUE) RETURNING id`
  )).rows[0].id)
  const w = await color('caller', withheld, 'red')
  assert.equal(w.status, 400, w.text)
  assert.equal(w.json.code, 'no_number')
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM entry_colors')).rows[0].n, before)
  // The database refuses a colour outside the palette too.
  await assert.rejects(db.query("INSERT INTO entry_colors (kind, key, color) VALUES ('lead', '1', 'magenta')"))
  await assert.rejects(db.query("INSERT INTO entry_colors (kind, key, color) VALUES ('number', '1', 'red')"))
  // Every palette key is accepted.
  for (const c of ENTRY_COLORS) assert.equal((await color('caller', call, c)).status, 200, c)
})

test('a caller cannot be coloured by phone key: the key always comes from the call', { skip: SKIP }, async () => {
  const number = '+15045550146'
  const call = await addCall({ minutesAgo: 1, number })
  const key = (await db.query('SELECT counterpart_key FROM rc_calls WHERE id = $1', [call])).rows[0].counterpart_key
  // The phone key in place of an id is not a call id.
  const r = await send('PUT', '/api/colors', { kind: 'caller', id: key, color: 'red' })
  assert.notEqual(r.status, 200, r.text)
  // Extra fields naming a key are ignored: the colour lands on the call's own number.
  const other = '+15045550147'
  const otherCall = await addCall({ minutesAgo: 1, number: other })
  const otherKey = (await db.query('SELECT counterpart_key FROM rc_calls WHERE id = $1', [otherCall])).rows[0].counterpart_key
  const s = await send('PUT', '/api/colors', { kind: 'caller', id: call, key: otherKey, phone: other, color: 'blue' })
  assert.equal(s.status, 200, s.text)
  const stored = (await db.query("SELECT key, color FROM entry_colors WHERE kind = 'caller' AND key = ANY($1::text[])", [[key, otherKey]])).rows
  assert.deepEqual(stored, [{ key, color: 'blue' }])
})

test('each kind needs the capability to work that entry', { skip: SKIP }, async () => {
  const call = await addCall({ minutesAgo: 1, number: '+15045550148' })
  const lead = await newLead()
  const rCall = (await send('POST', '/api/reminders', { target: { kind: 'call', id: call }, dueAt: 'in_30' })).json.reminder
  const rLead = (await send('POST', '/api/reminders', { target: { kind: 'submission', id: lead }, dueAt: 'in_30' })).json.reminder

  // Billing paralegal: no calls, no leads.
  for (const [kind, id] of [['caller', call], ['lead', lead], ['reminder', rCall.id], ['reminder', rLead.id]]) {
    const r = await color(kind, id, 'red', u.para)
    assert.equal(r.status, 403, `${kind}: ${r.text}`)
    assert.equal(r.json.code, 'forbidden')
  }
  // Reads leads without working them: no lead colours.
  assert.equal((await color('lead', lead, 'red', u.reader)).status, 403)
  assert.equal((await color('reminder', rLead.id, 'red', u.reader)).status, 403)
  // Staff (leads only, no calls.exclude): leads and lead reminders, not callers or caller reminders.
  assert.equal((await color('caller', call, 'red', u.leads)).status, 403)
  assert.equal((await color('reminder', rCall.id, 'red', u.leads)).status, 403)
  assert.equal((await color('lead', lead, 'red', u.leads)).status, 200)
  assert.equal((await color('reminder', rLead.id, 'red', u.leads)).status, 200)
  // Receptionist: crm.view without crm.manage, but calls.exclude: all three.
  assert.equal((await color('caller', call, 'green', u.ciro)).status, 200)
  assert.equal((await color('lead', lead, 'green', u.ciro)).status, 200)
  assert.equal((await color('reminder', rCall.id, 'green', u.ciro)).status, 200)
  // The refused ones changed nothing.
  assert.equal((await send('GET', `/api/reminders?call=${call}`)).json.reminders[0].color, 'green')
  // Signed out: 401.
  const anon = await fetch(`${base}/api/colors`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'lead', id: lead, color: 'red' }) })
  assert.equal(anon.status, 401)
})

test('who set it is recorded, the activity log names it, and the per-account limit holds', { skip: SKIP }, async () => {
  const lead = await newLead()
  assert.equal((await color('lead', lead, 'brown', u.ciro)).status, 200)
  const row = (await db.query("SELECT set_by, color FROM entry_colors WHERE kind = 'lead' AND key = $1", [String(lead)])).rows[0]
  assert.deepEqual(row, { set_by: u.ciro.id, color: 'brown' })

  const entry = describeRequest(
    { method: 'PUT', baseUrl: '/api/colors', route: { path: '/' }, body: { kind: 'lead', id: lead, color: null }, account: { id: 1, email: 'a@example.test', role: 'front_desk' }, params: {} },
    { statusCode: 200 },
  )
  assert.equal(entry.action, 'colors.set')
  assert.deepEqual(entry.details, { kind: 'lead', id: lead, color: 'none' })

  const lim = (c) => send('PUT', '/api/colors-limited', { kind: 'lead', id: lead, color: c })
  assert.equal((await lim('red')).status, 200)
  assert.equal((await lim('blue')).status, 200)
  const third = await lim('gray')
  assert.equal(third.status, 429)
  assert.equal(third.json.code, 'too_many_changes')
})
