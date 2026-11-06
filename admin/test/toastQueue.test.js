// The shared toast queue: successes leave on their own, errors stay until
// dismissed, no more than three show, an error is never pushed out, Undo
// runs once, and holding a toast stops its clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createToastQueue, MAX_TOASTS } from '../src/composables/toastQueue.js'

function fakeClock() {
  let now = 0
  const timers = new Map()
  let id = 0
  return {
    schedule: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id },
    cancel: (t) => timers.delete(t),
    advance(ms) {
      now += ms
      for (const [k, t] of [...timers]) if (t.at <= now) { timers.delete(k); t.fn() }
    },
  }
}

test('a success leaves after its time; an error stays until dismissed', () => {
  const c = fakeClock()
  const q = createToastQueue(c)
  q.show({ text: 'Note saved.' })
  const err = q.show({ text: 'Could not save the note.', tone: 'error' })
  c.advance(6000)
  assert.deepEqual(q.items.map((t) => t.text), ['Could not save the note.'])
  c.advance(60 * 60 * 1000)
  assert.equal(q.items.length, 1)
  q.dismiss(err)
  assert.equal(q.items.length, 0)
})

test('at most three show, and an error is never pushed out by a success', () => {
  const q = createToastQueue(fakeClock())
  q.show({ text: 'error', tone: 'error' })
  for (let i = 0; i < 5; i++) q.show({ text: `ok ${i}` })
  assert.equal(q.items.length, MAX_TOASTS)
  assert.ok(q.items.some((t) => t.text === 'error'))
  assert.deepEqual(q.items.slice(1).map((t) => t.text), ['ok 3', 'ok 4'])
})

test('holding a toast stops its clock; letting go starts it again', () => {
  const c = fakeClock()
  const q = createToastQueue(c)
  const id = q.show({ text: 'Reminder set.' })
  c.advance(5000)
  q.hold(id)
  c.advance(30000)
  assert.equal(q.items.length, 1, 'held')
  q.release(id)
  c.advance(5999)
  assert.equal(q.items.length, 1)
  c.advance(1)
  assert.equal(q.items.length, 0)
})

test('Undo runs once and removes the toast', async () => {
  const q = createToastQueue(fakeClock())
  let runs = 0
  const id = q.show({ text: 'Marked handled.', undo: async () => { runs++ } })
  await q.undo(id)
  await q.undo(id)
  assert.equal(runs, 1)
  assert.equal(q.items.length, 0)
})

test('an action (Open) runs once, removes the toast, and a persistent one waits for it', async () => {
  const c = fakeClock()
  const q = createToastQueue(c)
  let opened = 0
  const id = q.show({ text: 'A callback reminder is due', tone: 'info', persistent: true, action: { label: 'Open', run: () => { opened++ } } })
  c.advance(60 * 60 * 1000)
  assert.equal(q.items.length, 1, 'still there an hour later')
  assert.equal(q.items[0].action.label, 'Open')
  await q.act(id)
  await q.act(id)
  assert.equal(opened, 1)
  assert.equal(q.items.length, 0)
  // Without a label or a function there is no button.
  const bare = q.show({ text: 'x', action: { label: 'Open' } })
  assert.equal(q.items.find((t) => t.id === bare).action, null)
})
