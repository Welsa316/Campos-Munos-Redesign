// Keyboard behaviour that is pure logic: arrow keys inside a radio group or
// tab list, and when a navigation moves focus to the new page's heading.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rovingIndex, rovingTabindex } from '../src/utils/roving.js'
import { movesFocus } from '../src/utils/routeFocus.js'

test('arrow keys move through a group and wrap at both ends', () => {
  assert.equal(rovingIndex('ArrowRight', 0, 3), 1)
  assert.equal(rovingIndex('ArrowDown', 2, 3), 0, 'past the last wraps to the first')
  assert.equal(rovingIndex('ArrowLeft', 0, 3), 2, 'before the first wraps to the last')
  assert.equal(rovingIndex('ArrowUp', 1, 3), 0)
  assert.equal(rovingIndex('Home', 2, 3), 0)
  assert.equal(rovingIndex('End', 0, 3), 2)
})

test('other keys are left alone, and an empty group goes nowhere', () => {
  assert.equal(rovingIndex('Enter', 1, 3), null)
  assert.equal(rovingIndex('Tab', 1, 3), null)
  assert.equal(rovingIndex('ArrowRight', 0, 0), null)
})

test('from outside the group, the arrows land on an end', () => {
  assert.equal(rovingIndex('ArrowRight', -1, 4), 0)
  assert.equal(rovingIndex('ArrowLeft', -1, 4), 3)
})

test('exactly one item takes Tab: the selected one, or the first when none is', () => {
  const group = (picked) => [0, 1, 2].map((i) => rovingTabindex(i === picked, i, picked !== null))
  assert.deepEqual(group(1), [-1, 0, -1])
  assert.deepEqual(group(null), [0, -1, -1])
})

const route = (...paths) => ({ matched: paths.map((path) => ({ path })) })

test('focus moves to the new page only when the section changes', () => {
  assert.equal(movesFocus(route('/calls'), route('/')), true)
  assert.equal(movesFocus(route('/billing', '/billing/invoices'), route('/inbox')), true)
})

test('the first load, a tab inside a section and a changed query keep focus where it is', () => {
  assert.equal(movesFocus(route('/'), { matched: [] }), false, 'first load')
  assert.equal(movesFocus(route('/billing', '/billing/invoices'), route('/billing', '/billing')), false, 'billing tab')
  assert.equal(movesFocus(route('/whatsapp/:id(\\d+)?'), route('/whatsapp/:id(\\d+)?')), false, 'opening a conversation')
})
