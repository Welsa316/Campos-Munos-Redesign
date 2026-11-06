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
