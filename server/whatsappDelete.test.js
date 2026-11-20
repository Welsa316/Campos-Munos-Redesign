// Deleting WhatsApp messages and chats from the portal, and hiding numbers
// (a coworker, a personal chat) so they stop appearing. Real HTTP and a real
// Postgres; synthetic people and numbers.
//
// Uses its own database (<TEST_DATABASE_URL's name>_wadelete, created if
// missing). The name must contain "test"; the schema is dropped and rebuilt.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import pg from 'pg'
import jwt from 'jsonwebtoken'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.TEST_DATABASE_URL || ''
const baseName = (() => { try { return new URL(BASE_URL).pathname.slice(1) } catch { return '' } })()
const SKIP = !BASE_URL ? 'set TEST_DATABASE_URL to run' : (!/test/i.test(baseName) ? 'TEST_DATABASE_URL must name a *test* database' : false)
const DB_NAME = `${baseName}_wadelete`
const URL_ = (() => { try { const u = new URL(BASE_URL); u.pathname = `/${DB_NAME}`; return u.toString() } catch { return '' } })()
// Every deploy runs this; it is also what would bring a deleted chat back.
const migrate = () => execFileSync(process.execPath, [join(__dirname, 'db', 'migrate.js')], { env: { ...process.env, DATABASE_URL: URL_, LOG_LEVEL: 'silent' }, stdio: 'pipe' })

let server, base, db
const cookies = {}

const sender = {
  mode: 'mock',
  describe: () => ({ mode: 'mock' }),
  sendTemplate: async () => { throw new Error('not used') },
  sendText: async () => ({ ok: true, providerMessageId: `wamid.T.${Math.random().toString(36).slice(2)}`, simulated: true }),
}

before(async () => {
  if (SKIP) return
  process.env.JWT_SECRET = 'wa-delete-test-secret-0123456789abcdef'
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
  migrate()
  db = new pg.Pool({ connectionString: URL_ })

  const staff = await import('./scripts/staff.js')
  const quiet = () => {}
  await staff.run(db, 'create', { email: 'front@example.test', name: 'Front', role: 'front_desk' }, quiet)
  await staff.run(db, 'create', { email: 'manager@example.test', name: 'Manager', role: 'office_manager' }, quiet)
  await staff.run(db, 'create', { email: 'nodelete@example.test', name: 'Nodelete', role: 'front_desk' }, quiet)
  await db.query(`UPDATE admin_users SET capability_revokes = '{whatsapp.delete}' WHERE email = 'nodelete@example.test'`)
  for (const [key, email] of [['front', 'front@example.test'], ['manager', 'manager@example.test'], ['nodelete', 'nodelete@example.test']]) {
    const u = (await db.query('SELECT id, token_version FROM admin_users WHERE email = $1', [email])).rows[0]
    cookies[key] = `token=${jwt.sign({ id: u.id, email, tv: u.token_version }, process.env.JWT_SECRET)}`
  }

  const express = (await import('express')).default
  const cookieParser = (await import('cookie-parser')).default
  const { createWhatsappInboxRouter } = await import('./routes/whatsappInbox.js')
  const app = express()
  app.use(cookieParser())
  app.use(express.json())
  app.use('/api/whatsapp', createWhatsappInboxRouter({ env: { WHATSAPP_SENDING_ENABLED: 'true' }, whatsappProvider: sender }))
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

async function call(method, path, { body, cookie = cookies.front } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { status: res.status, json }
}

// A message as the webhook stores it. Resolves true when it was stored new.
async function inbound(phone, text, { name = 'Coworker' } = {}) {
  const id = `wamid.IN.${phone}.${Math.random().toString(36).slice(2)}`
  const { recordEvent } = await import('./db/whatsappEvents.js')
  return recordEvent({
    key: `message:${id}`, kind: 'message', messageId: id, status: null, from: phone, contactName: name, recipient: null,
    messageType: 'text', phoneNumberId: null, displayPhoneNumber: null, wabaId: null,
    timestamp: new Date(), raw: { text: { body: text } },
  })
}

const listed = async (phone, cookie) => (await call('GET', '/api/whatsapp/conversations?view=open', { cookie })).json.find((c) => c.phone === phone)
const bodies = (detail) => detail.messages.map((m) => m.body)
// Whether any stored row still holds the text, anywhere WhatsApp keeps it.
async function textStored(text) {
  const { rows } = await db.query(
    `SELECT 1 FROM whatsapp_events WHERE payload::text LIKE $1
     UNION ALL SELECT 1 FROM wa_outbound_messages WHERE body LIKE $1
     UNION ALL SELECT 1 FROM wa_conversation_notes WHERE body LIKE $1`,
    [`%${text}%`]
  )
  return rows.length > 0
}

test('deleting one message removes it for everyone and erases what it said; the rest of the chat stays', { skip: SKIP }, async () => {
  const phone = '15045550101'
  await inbound(phone, 'Lunch at noon?')
  await inbound(phone, 'Nevermind, see you there')
  const conv = await listed(phone)
  const detail = (await call('GET', `/api/whatsapp/conversations/${conv.id}`)).json
  const target = detail.messages.find((m) => m.body === 'Nevermind, see you there')

  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}/messages/${target.key}`)).status, 200)

  // A colleague opening the chat no longer sees it, and the list preview moved back.
  const seen = (await call('GET', `/api/whatsapp/conversations/${conv.id}`, { cookie: cookies.manager })).json
  assert.deepEqual(bodies(seen), ['Lunch at noon?'])
  assert.equal((await listed(phone, cookies.manager)).preview, 'Lunch at noon?')
  assert.equal(await textStored('Nevermind'), false, 'the text is gone from the database, not just hidden')
  assert.equal(await textStored('Lunch at noon'), true)

  // Twice is a 404, not a second success.
  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}/messages/${target.key}`)).status, 404)
})

test('a reply sent from the portal can be deleted too', { skip: SKIP }, async () => {
  const phone = '15045550102'
  await inbound(phone, 'Are you in today?')
  const conv = await listed(phone)
  assert.equal((await call('POST', `/api/whatsapp/conversations/${conv.id}/messages`, { body: { body: 'Yes, until 5', clientKey: 'reply-0000001' } })).status, 201)
  const reply = (await call('GET', `/api/whatsapp/conversations/${conv.id}`)).json.messages.find((m) => m.direction === 'out')

  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}/messages/${reply.key}`)).status, 200)
  assert.deepEqual(bodies((await call('GET', `/api/whatsapp/conversations/${conv.id}`)).json), ['Are you in today?'])
  assert.equal(await textStored('until 5'), false)
})

test('a message cannot be deleted through another chat, and payment reminders stay', { skip: SKIP }, async () => {
  const a = '15045550103'
  const b = '15045550104'
  await inbound(a, 'Message in chat A')
  await inbound(b, 'Message in chat B')
  const convA = await listed(a)
  const convB = await listed(b)
  const keyA = (await call('GET', `/api/whatsapp/conversations/${convA.id}`)).json.messages[0].key

  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${convB.id}/messages/${keyA}`)).status, 404)
  assert.deepEqual(bodies((await call('GET', `/api/whatsapp/conversations/${convA.id}`)).json), ['Message in chat A'])

  const rem = await call('DELETE', `/api/whatsapp/conversations/${convA.id}/messages/rem-1`)
  assert.equal(rem.status, 409)
  assert.equal(rem.json.code, 'reminder')
  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${convA.id}/messages/drop-table`)).status, 400)
})

test('deleting a chat removes it, its notes and replies; the next message starts an empty chat, and a deploy does not bring it back', { skip: SKIP }, async () => {
  const phone = '15045550105'
  await inbound(phone, 'Old private thing')
  const conv = await listed(phone)
  await call('POST', `/api/whatsapp/conversations/${conv.id}/notes`, { body: { body: 'Note about the old thing' } })

  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}`)).status, 200)
  assert.equal(await listed(phone), undefined)
  assert.equal((await call('GET', `/api/whatsapp/conversations/${conv.id}`)).status, 404)
  assert.equal(await textStored('Old private thing'), false)
  assert.equal(await textStored('Note about the old thing'), false)

  migrate()
  assert.equal(await listed(phone), undefined, 'the deploy backfill skips deleted messages')

  await inbound(phone, 'Something new')
  const again = await listed(phone)
  assert.ok(again && again.id !== conv.id)
  assert.deepEqual(bodies((await call('GET', `/api/whatsapp/conversations/${again.id}`)).json), ['Something new'])
  assert.deepEqual((await call('GET', '/api/whatsapp/hidden-numbers')).json.map((h) => h.phone).filter((p) => p === phone), [], 'not hidden unless asked')
})

test('a hidden number stays out of the portal, stores nothing it says, and can be let back in', { skip: SKIP }, async () => {
  const phone = '15045550106'
  await inbound(phone, 'Personal: dinner Friday?')
  const conv = await listed(phone)

  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}?hide=true`)).status, 200)
  assert.equal(await listed(phone), undefined)

  // New messages from the number: recognised (a redelivery stays a no-op),
  // but no chat and no text.
  assert.equal(await inbound(phone, 'Personal: and bring the kids'), true)
  assert.equal(await listed(phone), undefined)
  assert.equal(await textStored('bring the kids'), false)
  migrate()
  assert.equal(await listed(phone), undefined, 'a deploy does not bring a hidden number back')

  const hidden = (await call('GET', '/api/whatsapp/hidden-numbers')).json
  const row = hidden.find((h) => h.phone === phone)
  assert.ok(row)
  assert.equal(row.hiddenBy, 'Front')

  assert.equal((await call('DELETE', `/api/whatsapp/hidden-numbers/${phone}`)).status, 200)
  assert.equal((await call('DELETE', `/api/whatsapp/hidden-numbers/${phone}`)).status, 404)
  await inbound(phone, 'Back again')
  const back = await listed(phone)
  assert.ok(back)
  assert.deepEqual(bodies((await call('GET', `/api/whatsapp/conversations/${back.id}`)).json), ['Back again'], 'what was deleted stays deleted')
})

test('only accounts with whatsapp.delete may delete or manage hidden numbers', { skip: SKIP }, async () => {
  const phone = '15045550107'
  await inbound(phone, 'Keep me')
  const conv = await listed(phone)
  const key = (await call('GET', `/api/whatsapp/conversations/${conv.id}`)).json.messages[0].key
  const nd = { cookie: cookies.nodelete }

  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}/messages/${key}`, nd)).status, 403)
  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}?hide=true`, nd)).status, 403)
  assert.equal((await call('GET', '/api/whatsapp/hidden-numbers', nd)).status, 403)
  assert.equal((await call('DELETE', `/api/whatsapp/hidden-numbers/${phone}`, nd)).status, 403)
  assert.deepEqual(bodies((await call('GET', `/api/whatsapp/conversations/${conv.id}`, nd)).json), ['Keep me'])

  // The office manager (manages, never replies) may.
  assert.equal((await call('DELETE', `/api/whatsapp/conversations/${conv.id}/messages/${key}`, { cookie: cookies.manager })).status, 200)
})
