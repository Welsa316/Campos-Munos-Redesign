'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createNotifier } = require('../src/notifier')

function fakeOs() {
  const all = []
  const create = (opts) => {
    const n = new EventEmitter()
    n.opts = opts
    n.shown = false
    n.closed = false
    n.show = () => { n.shown = true }
    n.close = () => { n.closed = true; n.emit('close') }
    all.push(n)
    return n
  }
  return { all, create, visible: () => all.filter((n) => n.shown && !n.closed) }
}

test('a newer item with the same tag replaces the older notification', () => {
  const os = fakeOs()
  const notifier = createNotifier({ create: os.create, onClick: () => {} })
  notifier.show({ title: 'New missed call', body: 'one', tag: 'missed-call:7' })
  notifier.show({ title: 'New missed call', body: 'two', tag: 'missed-call:7' })
  notifier.show({ title: 'Callback reminder', body: 'x', tag: 'callback-reminder:7' })
  const visible = os.visible()
  assert.deepEqual(visible.map((n) => n.opts.body), ['two', 'x'])
  assert.equal(os.all[0].closed, true)
})

test('untagged items never replace each other', () => {
  const os = fakeOs()
  const notifier = createNotifier({ create: os.create, onClick: () => {} })
  notifier.show({ title: 'A', body: '' })
  notifier.show({ title: 'B', body: '' })
  assert.equal(os.visible().length, 2)
})

test('clicking passes the item url and shows the plain title/body, not silent', () => {
  const os = fakeOs()
  const clicked = []
  const notifier = createNotifier({ create: os.create, onClick: (u) => clicked.push(u) })
  notifier.show({ title: 'New form submission', body: 'Someone wrote in', url: '/inbox?lead=3', tag: 'cm-submission-3' })
  assert.deepEqual(os.all[0].opts, { title: 'New form submission', body: 'Someone wrote in', silent: false })
  os.all[0].emit('click')
  assert.deepEqual(clicked, ['/inbox?lead=3'])
  assert.equal(notifier.size, 0)
})

test('a stale close event from the replaced notification does not drop the new one', () => {
  const os = fakeOs()
  const notifier = createNotifier({ create: os.create, onClick: () => {} })
  notifier.show({ title: 'T', tag: 'cm-test-notification' })
  notifier.show({ title: 'T', tag: 'cm-test-notification' })
  os.all[0].emit('close') // arrives late
  // A third one must still find and close the second.
  notifier.show({ title: 'T', tag: 'cm-test-notification' })
  assert.equal(os.all[1].closed, true)
  assert.equal(os.visible().length, 1)
})
