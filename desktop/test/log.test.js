'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createLog, originOnly } = require('../src/log')

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-log-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'app.log')
}
const lines = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('writes one line per event with short plain values only', (t) => {
  const file = tmp(t)
  const log = createLog(file, { now: () => new Date('2026-11-06T12:00:00Z') })
  log('feed-state', { state: 'error', failures: 2, item: { title: 'New missed call', body: 'a client' }, list: [1, 2] })
  log('load-failed', { code: -106, url: originOnly('https://admin.camulaw.com/inbox?lead=12'), text: 'x'.repeat(500) })
  const [a, b] = lines(file)
  assert.deepEqual(a, { at: '2026-11-06T12:00:00.000Z', event: 'feed-state', state: 'error', failures: 2 })
  assert.equal(b.url, 'https://admin.camulaw.com', 'no path or query')
  assert.equal(b.text.length, 200)
})

test('rotates to .1 past the size limit, keeping only one old file', (t) => {
  const file = tmp(t)
  const log = createLog(file, { maxBytes: 300 })
  for (let i = 0; i < 40; i++) log('tick', { i })
  assert.ok(fs.statSync(file).size < 300 + 80)
  assert.ok(fs.statSync(`${file}.1`).size < 300 + 80)
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['app.log', 'app.log.1'])
  assert.equal(lines(file).at(-1).i, 39)
})

test('an unwritable log does not throw', () => {
  const log = createLog('/dev/null/not-a-dir/app.log')
  assert.doesNotThrow(() => log('x', {}))
})

test('origins only: a bad URL says so instead of leaking it', () => {
  assert.equal(originOnly('https://api.camulaw.com/api/notifications/feed?after=5'), 'https://api.camulaw.com')
  assert.equal(originOnly('not a url'), 'invalid-url')
  assert.equal(originOnly('mailto:someone@example.test'), 'mailto:')
})
