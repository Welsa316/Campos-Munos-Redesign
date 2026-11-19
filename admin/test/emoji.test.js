// Inserting an emoji into a reply: where it lands, what it replaces, and
// that it never pushes a reply past the length the server accepts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMOJI, insertEmoji, pushRecent, cleanRecent, gridIndex, emojiName, GRID_COLUMNS } from '../src/utils/emoji.js'

test('an emoji lands at the caret and the caret moves past it', () => {
  assert.deepEqual(insertEmoji('Hola Ana', 4, 4, '👋'), { value: 'Hola👋 Ana', caret: 6 })
  assert.deepEqual(insertEmoji('', 0, 0, '👍'), { value: '👍', caret: 2 })
})

test('a selection is replaced, whichever way it was dragged', () => {
  assert.deepEqual(insertEmoji('Thanks!!!', 6, 9, '🙏'), { value: 'Thanks🙏', caret: 8 })
  assert.deepEqual(insertEmoji('Thanks!!!', 9, 6, '🙏'), { value: 'Thanks🙏', caret: 8 })
})

test('without a usable caret the emoji goes at the end, not the start', () => {
  for (const [start, end] of [[null, null], [undefined, undefined], [-1, -1], [99, 99], [Number.NaN, 2]]) {
    assert.deepEqual(insertEmoji('See you then', start, end, '📅'), { value: 'See you then📅', caret: 14 }, `start ${start}`)
  }
})

test('an emoji that would pass the box limit is refused, counting as the textarea does', () => {
  assert.equal(insertEmoji('abc', 3, 3, '👍', 4), null, 'a two-unit emoji does not fit one free unit')
  assert.deepEqual(insertEmoji('abc', 3, 3, '👍', 5), { value: 'abc👍', caret: 5 })
  assert.equal(insertEmoji('ab', 2, 2, '🇺🇸', 5), null, 'a flag is four units')
  assert.deepEqual(insertEmoji('abcde', 0, 5, '👍', 5), { value: '👍', caret: 2 }, 'replacing a selection frees its room')
})

test('recent emoji: newest first, no repeats, capped, and only ones still offered', () => {
  assert.deepEqual(pushRecent(['👍', '🙏'], '🙏'), ['🙏', '👍'])
  assert.deepEqual(pushRecent(null, '👍'), ['👍'], 'nothing stored yet')
  assert.deepEqual(pushRecent(['💩', '👍'], '🙏'), ['🙏', '👍'], 'a stored value no longer in the list is dropped')
  const full = EMOJI.slice(0, 12).map((e) => e.char)
  assert.equal(pushRecent(full, '🎉').length, GRID_COLUMNS)
  assert.equal(pushRecent(full, '🎉')[0], '🎉')
})

test('a stored recent list that was tampered with or is stale shows safely', () => {
  assert.deepEqual(cleanRecent('not a list'), [])
  assert.deepEqual(cleanRecent(['👍', '👍', '<b>', '🙏']), ['👍', '🙏'])
  assert.equal(cleanRecent(EMOJI.map((e) => e.char)).length, GRID_COLUMNS, 'one row at most')
})

test('arrow keys move around the grid: across with wrapping, down and up by a row', () => {
  const n = 20 // 8 wide: rows of 8, 8, 4
  assert.equal(gridIndex('ArrowRight', 0, n), 1)
  assert.equal(gridIndex('ArrowRight', n - 1, n), 0)
  assert.equal(gridIndex('ArrowLeft', 0, n), n - 1)
  assert.equal(gridIndex('ArrowDown', 2, n), 10)
  assert.equal(gridIndex('ArrowDown', 13, n), 13, 'no item below in the short last row: stay')
  assert.equal(gridIndex('ArrowUp', 10, n), 2)
  assert.equal(gridIndex('ArrowUp', 3, n), 3, 'top row: stay')
  assert.equal(gridIndex('Home', 7, n), 0)
  assert.equal(gridIndex('End', 0, n), n - 1)
  assert.equal(gridIndex('Enter', 3, n), null, 'Enter is the button’s own, to insert')
  assert.equal(gridIndex('ArrowDown', -1, n), 0, 'from outside the grid')
  assert.equal(gridIndex('ArrowRight', 0, 0), null)
})

test('every offered emoji is unique, named, and the grid fills whole rows', () => {
  const chars = EMOJI.map((e) => e.char)
  assert.equal(new Set(chars).size, chars.length)
  for (const e of EMOJI) assert.ok(e.name && e.name !== 'emoji', `${e.char} needs a name`)
  assert.equal(EMOJI.length % GRID_COLUMNS, 0)
  assert.equal(emojiName('👍'), 'thumbs up')
})
