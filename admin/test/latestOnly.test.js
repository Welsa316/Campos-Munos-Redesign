// Overlapping list loads: only the newest one may paint. A slow answer to an
// earlier filter, poll or "Show older" must not replace the newer one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestOnly } from '../src/utils/latestOnly.js'

const later = (ms, value, fail = false) => () => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(value)) : res(value)), ms))

test('a slow earlier load that finishes last is dropped', async () => {
  const latest = latestOnly()
  const [a, b] = await Promise.all([latest(later(30, 'old filter')), latest(later(5, 'new filter'))])
  assert.deepEqual(a, { current: false })
  assert.deepEqual(b, { current: true, value: 'new filter' })
})

test('a superseded load that fails is ignored; the current one’s failure still throws', async () => {
  const latest = latestOnly()
  const first = latest(later(20, 'boom', true))
  const second = latest(later(5, 'ok'))
  assert.deepEqual(await first, { current: false })
  assert.deepEqual(await second, { current: true, value: 'ok' })
  await assert.rejects(latest(later(1, 'down', true)), /down/)
})

test('cancel drops what is in flight, so a late answer after closing changes nothing', async () => {
  const latest = latestOnly()
  const inFlight = latest(later(10, 'ringing'))
  latest.cancel()
  assert.deepEqual(await inFlight, { current: false })
  // A failure that lands after cancel is dropped too, and later loads work again.
  const failing = latest(later(10, 'down', true))
  latest.cancel()
  assert.deepEqual(await failing, { current: false })
  assert.deepEqual(await latest(later(1, 'next call')), { current: true, value: 'next call' })
})

test('separate lists do not interfere', async () => {
  const calls = latestOnly()
  const inbox = latestOnly()
  const [c, i] = await Promise.all([calls(later(10, 'calls')), inbox(later(1, 'inbox'))])
  assert.equal(c.current, true)
  assert.equal(i.current, true)
})
