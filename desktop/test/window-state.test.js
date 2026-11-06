'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { restoreBounds, DEFAULT_SIZE, MIN_SIZE } = require('../src/window-state')

const laptop = [{ x: 0, y: 25, width: 1512, height: 920 }]

test('no saved bounds: default size, centred by the OS', () => {
  assert.deepEqual(restoreBounds(undefined, laptop), { ...DEFAULT_SIZE, maximized: false })
  assert.deepEqual(restoreBounds({ x: 'a' }, laptop), { ...DEFAULT_SIZE, maximized: false })
})

test('saved bounds on a connected screen are reused', () => {
  assert.deepEqual(
    restoreBounds({ x: 100, y: 80, width: 1200, height: 800, maximized: true }, laptop),
    { x: 100, y: 80, width: 1200, height: 800, maximized: true },
  )
})

test('bounds from an unplugged monitor keep the size but drop the position', () => {
  const r = restoreBounds({ x: 2600, y: 100, width: 1400, height: 900 }, laptop)
  assert.deepEqual(r, { width: 1400, height: 900, maximized: false })
})

test('a tiny saved size is raised to the minimum', () => {
  const r = restoreBounds({ x: 10, y: 30, width: 200, height: 100 }, laptop)
  assert.equal(r.width, MIN_SIZE.width)
  assert.equal(r.height, MIN_SIZE.height)
})

test('a window saved on a big monitor is cut down to fit the laptop it opens on', () => {
  // Saved at 2400×1500 on a 27" screen, now opened on the laptop alone.
  const r = restoreBounds({ x: 50, y: 40, width: 2400, height: 1500 }, laptop)
  assert.deepEqual(r, { x: 0, y: 25, width: 1512, height: 920, maximized: false })
})

test('a window hanging off the bottom-right edge is moved back fully on screen', () => {
  const r = restoreBounds({ x: 900, y: 500, width: 1000, height: 700 }, laptop)
  assert.deepEqual(r, { x: 512, y: 245, width: 1000, height: 700, maximized: false })
})

test('off-screen bounds keep a size that fits the screen it will open on', () => {
  const r = restoreBounds({ x: 5000, y: 100, width: 2400, height: 1500 }, laptop)
  assert.deepEqual(r, { width: 1512, height: 920, maximized: false })
})
