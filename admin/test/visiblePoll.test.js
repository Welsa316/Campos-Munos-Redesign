// The self-refresh every live screen uses (src/utils/visiblePoll.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVisiblePoll } from '../src/utils/visiblePoll.js'

function fakeDoc(state = 'visible') {
  const t = new EventTarget()
  t.visibilityState = state
  t.show = () => { t.visibilityState = 'visible'; t.dispatchEvent(new Event('visibilitychange')) }
  t.hide = () => { t.visibilityState = 'hidden'; t.dispatchEvent(new Event('visibilitychange')) }
  return t
}
function fakeTimers() {
  const live = new Map()
  let id = 0
  return {
    live,
    every: (fn) => { live.set(++id, fn); return id },
    cancel: (i) => live.delete(i),
    fire: async () => { for (const fn of [...live.values()]) await fn() },
  }
}
const flush = () => new Promise((r) => setImmediate(r))

test('runs on each tick while the tab is showing, and not while it is hidden', async () => {
  const doc = fakeDoc(); const t = fakeTimers(); let runs = 0
  const p = createVisiblePoll(async () => { runs++ }, 1000, { doc, ...t })
  p.start()
  await t.fire(); assert.equal(runs, 1)
  doc.hide()
  await t.fire(); assert.equal(runs, 1, 'hidden: skipped')
  p.stop()
})

test('a screen that asks to keeps polling while hidden', async () => {
  const doc = fakeDoc('hidden'); const t = fakeTimers(); let runs = 0
  const p = createVisiblePoll(async () => { runs++ }, 1000, { doc, whileHidden: true, ...t })
  p.start()
  await t.fire(); assert.equal(runs, 1)
  p.stop()
})

test('coming back to the tab runs at once, after onShow', async () => {
  const doc = fakeDoc('hidden'); const t = fakeTimers(); const seen = []
  const p = createVisiblePoll(async () => { seen.push('run') }, 1000, { doc, onShow: () => seen.push('show'), ...t })
  p.start()
  doc.show(); await flush()
  assert.deepEqual(seen, ['show', 'run'])
  p.stop()
})

test('one run at a time: a tick during a slow run is skipped', async () => {
  const doc = fakeDoc(); const t = fakeTimers(); let runs = 0; let release
  const p = createVisiblePoll(() => { runs++; return new Promise((r) => { release = r }) }, 1000, { doc, ...t })
  p.start()
  t.fire(); t.fire(); await flush()
  assert.equal(runs, 1)
  release(); await flush()
  t.fire(); await flush()
  assert.equal(runs, 2)
  p.stop()
})

test('a failed run is quiet and the next tick tries again', async () => {
  const doc = fakeDoc(); const t = fakeTimers(); let runs = 0
  const p = createVisiblePoll(async () => { runs++; throw new Error('offline') }, 1000, { doc, ...t })
  p.start()
  await t.fire(); await t.fire()
  assert.equal(runs, 2)
  p.stop()
})

test('start twice keeps one timer; stop removes the timer and the tab listener', async () => {
  const doc = fakeDoc(); const t = fakeTimers(); let runs = 0
  const p = createVisiblePoll(async () => { runs++ }, 1000, { doc, ...t })
  p.start(); p.start()
  assert.equal(t.live.size, 1)
  p.stop()
  assert.equal(t.live.size, 0)
  doc.hide(); doc.show(); await flush()
  assert.equal(runs, 0, 'no listener left behind')
})
