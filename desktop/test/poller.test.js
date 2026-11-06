'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const { createPoller, NORMAL_MS, SIGNED_OUT_MS } = require('../src/poller')
const { createStore, cursorFor } = require('../src/store')

// Timers the test fires by hand, recording each requested delay.
function manualTimers() {
  const pending = []
  return {
    delays: [],
    setTimer(fn, ms) { const h = { fn, ms }; pending.push(h); this.delays.push(ms); return h },
    clearTimer(h) { const i = pending.indexOf(h); if (i !== -1) pending.splice(i, 1) },
    async fire() {
      const h = pending.shift()
      assert.ok(h, 'expected a scheduled poll')
      await h.fn()
      await settle()
    },
    get pending() { return pending.length },
  }
}
const settle = () => new Promise((r) => setImmediate(r))
const reply = (status, body) => ({ status, json: async () => body })
const memoryCursor = (value = null) => ({ value, get() { return this.value }, set(v) { this.value = v } })

function setup(responses, cursor = memoryCursor()) {
  const timers = manualTimers()
  const calls = []
  const shown = []
  const poller = createPoller({
    fetchFeed: async (after) => {
      calls.push(after)
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    },
    cursor,
    notify: (item) => shown.push(item),
    setTimer: timers.setTimer.bind(timers),
    clearTimer: timers.clearTimer.bind(timers),
  })
  return { poller, timers, calls, shown, cursor }
}

test('first call only takes the cursor; later items are shown and advance it', async () => {
  const { poller, timers, calls, shown, cursor } = setup([
    reply(200, { items: [{ id: '5', title: 'old, never shown' }], cursor: '9' }),
    reply(200, { items: [{ id: '10', title: 'New missed call', url: '/calls', tag: 'missed-call:3' }], cursor: '10' }),
  ])
  poller.start()
  await settle()
  assert.deepEqual(shown, [])
  assert.equal(cursor.get(), '9')
  await timers.fire()
  assert.deepEqual(calls, [null, '9'])
  assert.deepEqual(shown.map((i) => i.title), ['New missed call'])
  assert.equal(cursor.get(), '10')
  assert.equal(timers.delays.at(-1), NORMAL_MS)
  poller.stop()
})

test('signed out (401): nothing shown, polls every 60 s, cursor untouched', async () => {
  const { poller, timers, shown, cursor } = setup([reply(401, {}), reply(401, {})], memoryCursor('4'))
  poller.start()
  await settle()
  await timers.fire()
  assert.deepEqual(shown, [])
  assert.equal(cursor.get(), '4')
  assert.deepEqual(timers.delays, [SIGNED_OUT_MS, SIGNED_OUT_MS])
  poller.stop()
})

test('network errors back off 20 s, 60 s, 120 s, then 5 min, and reset on success', async () => {
  const boom = () => new Error('offline')
  const { poller, timers, shown } = setup([
    boom(), boom(), boom(), boom(), boom(), reply(500, {}), reply(200, 'not an object'),
    reply(200, { items: [], cursor: '1' }),
  ], memoryCursor('1'))
  poller.start()
  await settle()
  for (let i = 0; i < 7; i++) await timers.fire()
  assert.deepEqual(timers.delays, [20_000, 60_000, 120_000, 300_000, 300_000, 300_000, 300_000, NORMAL_MS])
  assert.equal(poller.failures, 0)
  assert.deepEqual(shown, [])
})

test('a full page of 50 asks again straight away for the rest', async () => {
  const page = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 2), title: `n${i}` }))
  const { poller, timers, calls, shown } = setup([
    reply(200, { items: page, cursor: '51' }),
    reply(200, { items: [{ id: '52', title: 'last' }], cursor: '52' }),
  ], memoryCursor('1'))
  poller.start()
  await settle()
  assert.equal(timers.delays[0], 0)
  await timers.fire()
  assert.deepEqual(calls, ['1', '51'])
  assert.equal(shown.length, 51)
  assert.equal(timers.delays[1], NORMAL_MS)
  poller.stop()
})

test('a full page that does not move the cursor does not spin', async () => {
  const page = Array.from({ length: 50 }, (_, i) => ({ id: String(i), title: 't' }))
  const { poller, timers } = setup([reply(200, { items: page, cursor: '1' })], memoryCursor('1'))
  poller.start()
  await settle()
  assert.equal(timers.delays[0], NORMAL_MS)
  poller.stop()
})

test('poke checks immediately and replaces the scheduled poll', async () => {
  const { poller, timers, calls } = setup([
    reply(200, { items: [], cursor: '1' }),
    reply(200, { items: [], cursor: '1' }),
  ], memoryCursor('1'))
  poller.start()
  await settle()
  assert.equal(timers.pending, 1)
  await poller.poke()
  await settle()
  assert.equal(calls.length, 2)
  assert.equal(timers.pending, 1, 'still exactly one poll scheduled')
  poller.stop()
  assert.equal(timers.pending, 0)
})

test('items without a title are skipped and a throwing notify does not stop the rest', async () => {
  const shown = []
  let first = true
  const timers = manualTimers()
  const poller = createPoller({
    fetchFeed: async () => reply(200, { items: [null, { id: '2' }, { id: '3', title: 'A' }, { id: '4', title: 'B' }], cursor: '4' }),
    cursor: memoryCursor('1'),
    notify: (item) => { if (first) { first = false; throw new Error('os said no') } shown.push(item.title) },
    setTimer: timers.setTimer.bind(timers),
    clearTimer: timers.clearTimer.bind(timers),
  })
  poller.start()
  await settle()
  assert.deepEqual(shown, ['B'])
  poller.stop()
})

// End to end against a real HTTP server shaped like the API's feed, with
// the cursor persisted to disk across a "restart".
test('against a mock feed server, a restart neither replays nor skips', async (t) => {
  let latest = 3
  const seen = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    seen.push({ after: url.searchParams.get('after'), origin: req.headers.origin, cookie: req.headers.cookie })
    if (req.headers.cookie !== 'token=abc') { res.writeHead(401).end('{}'); return }
    const after = url.searchParams.get('after')
    res.setHeader('content-type', 'application/json')
    if (after === null) { res.end(JSON.stringify({ items: [], cursor: String(latest) })); return }
    const items = []
    for (let id = Number(after) + 1; id <= latest; id++) items.push({ id: String(id), title: `item ${id}`, url: '/', tag: null })
    res.end(JSON.stringify({ items, cursor: items.length ? items.at(-1).id : after }))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-desktop-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')

  const run = (shown) => {
    const timers = manualTimers()
    const poller = createPoller({
      fetchFeed: (after) => fetch(`${base}/api/notifications/feed${after ? `?after=${after}` : ''}`, {
        headers: { Origin: 'http://localhost:5420', Cookie: 'token=abc' },
      }),
      cursor: cursorFor(createStore(file), base),
      notify: (item) => shown.push(item.id),
      setTimer: timers.setTimer.bind(timers),
      clearTimer: timers.clearTimer.bind(timers),
    })
    return { poller, timers }
  }

  const first = []
  const a = run(first)
  a.poller.start()
  await new Promise((r) => setTimeout(r, 50))
  latest = 5
  await a.timers.fire()
  await new Promise((r) => setTimeout(r, 50))
  a.poller.stop()
  assert.deepEqual(first, ['4', '5'])

  latest = 7 // two arrive while the app is quit
  const second = []
  const b = run(second)
  b.poller.start()
  await new Promise((r) => setTimeout(r, 50))
  b.poller.stop()
  assert.deepEqual(second, ['6', '7'])
  assert.equal(seen[0].origin, 'http://localhost:5420')
  assert.deepEqual(seen.map((s) => s.after), [null, '3', '5'])
})

// A store-backed cursor in a temp folder, so the per-account bookkeeping is real.
function diskCursor(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-cursor-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return cursorFor(createStore(path.join(dir, 'settings.json')), 'https://api.example.test')
}

test('someone else signing in starts from their own place, never from the last person’s', async (t) => {
  const cursor = diskCursor(t)
  const { poller, timers, calls, shown } = setup([
    reply(200, { items: [], cursor: '40', account: '7' }), // Yoletty, first run
    reply(200, { items: [{ id: '41', title: 'for Yoletty', createdAt: new Date().toISOString() }], cursor: '41', account: '7' }),
    // Ciro signs in on the same computer. This answer was read against
    // Yoletty's cursor, so it is thrown away, not shown.
    reply(200, { items: [{ id: '55', title: 'read against the wrong cursor' }], cursor: '55', account: '9' }),
    reply(200, { items: [], cursor: '60', account: '9' }), // Ciro's own first call
    reply(200, { items: [{ id: '61', title: 'for Ciro', createdAt: new Date().toISOString() }], cursor: '61', account: '9' }),
    // Yoletty again: picks up where she left off.
    reply(200, { items: [], cursor: '61', account: '7' }),
    reply(200, { items: [{ id: '42', title: 'for Yoletty, while Ciro used it', createdAt: new Date().toISOString() }], cursor: '42', account: '7' }),
  ], cursor)
  poller.start()
  await settle()
  for (let i = 0; i < 6; i++) await timers.fire()
  assert.deepEqual(calls, [null, '40', '41', null, '60', '61', '41'])
  assert.deepEqual(shown.map((i) => i.title), ['for Yoletty', 'for Ciro', 'for Yoletty, while Ciro used it'])
  assert.equal(cursor.account(), '7')
  assert.equal(cursor.get(), '42')
  poller.stop()
})

test('an answer that keeps flipping accounts does not spin', async (t) => {
  const cursor = diskCursor(t)
  cursor.switchTo('2'); cursor.set('8')
  cursor.switchTo('1'); cursor.set('5')
  const as = (a) => reply(200, { items: [], cursor: '9', account: a })
  const { poller, timers, calls } = setup([as('2'), as('1'), as('2'), as('1')], cursor)
  poller.start()
  await settle()
  await timers.fire()
  await timers.fire()
  // One immediate retry after a switch; while it keeps switching, the normal pace.
  assert.deepEqual(calls, ['5', '8', '5'])
  assert.deepEqual(timers.delays, [0, NORMAL_MS, NORMAL_MS])
  poller.stop()
})

test('signing out forgets every cursor', async (t) => {
  const cursor = diskCursor(t)
  cursor.switchTo('7')
  cursor.set('41')
  cursor.reset()
  assert.equal(cursor.account(), null)
  assert.equal(cursor.get(), null)
  cursor.switchTo('7')
  assert.equal(cursor.get(), null, 'not kept under the account either')
})

test('items older than a day become one "while you were away" notification', async () => {
  const NOW = Date.parse('2026-11-06T12:00:00Z')
  const ago = (h) => new Date(NOW - h * 60 * 60 * 1000).toISOString()
  const old = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 2), title: `old ${i}`, createdAt: ago(48) }))
  const timers = manualTimers()
  const shown = []
  const responses = [
    reply(200, { items: old, cursor: '51' }),
    reply(200, { items: [{ id: '52', title: 'old too', createdAt: ago(25) }, { id: '53', title: 'fresh', createdAt: ago(2) }, { id: '54', title: 'no date' }], cursor: '54' }),
  ]
  const poller = createPoller({
    fetchFeed: async () => responses.shift(),
    cursor: memoryCursor('1'),
    notify: (item) => shown.push(item),
    setTimer: timers.setTimer.bind(timers),
    clearTimer: timers.clearTimer.bind(timers),
    now: () => NOW,
  })
  poller.start()
  await settle()
  await timers.fire()
  assert.deepEqual(shown.map((i) => i.title), ['fresh', 'no date', '51 notifications while you were away'])
  assert.equal(shown.at(-1).url, '/')
  poller.stop()
})

test('the state starts as starting and follows each answer', async () => {
  const { poller, timers } = setup([reply(401, {}), new Error('offline'), reply(200, { items: [], cursor: '1' })], memoryCursor('1'))
  assert.equal(poller.state, 'starting')
  poller.start()
  await settle()
  assert.equal(poller.state, 'signed-out')
  await timers.fire()
  assert.equal(poller.state, 'error')
  await timers.fire()
  assert.equal(poller.state, 'ok')
  poller.stop()
})
