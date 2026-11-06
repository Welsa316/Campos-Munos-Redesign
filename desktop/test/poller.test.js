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
