// The emoji offered under a reply box, and the pure parts of inserting one:
// where it lands in the text, and how the arrow keys move around the grid.
//
// A short list chosen for writing to clients (thanks, confirmations,
// documents, dates, calls), not the whole Unicode set: every one is easy to
// find, and none needs a search box. Each has a name, which is what a
// screen reader announces and what a mouse shows on hover.

export const EMOJI = Object.freeze([
  { char: '👍', name: 'thumbs up' },
  { char: '🙏', name: 'thank you' },
  { char: '😊', name: 'smiling face' },
  { char: '🙂', name: 'slight smile' },
  { char: '😀', name: 'grinning face' },
  { char: '😉', name: 'wink' },
  { char: '👋', name: 'waving hand' },
  { char: '🤝', name: 'handshake' },
  { char: '✅', name: 'check mark' },
  { char: '❌', name: 'cross mark' },
  { char: '⚠️', name: 'warning' },
  { char: '❗', name: 'exclamation mark' },
  { char: '❓', name: 'question mark' },
  { char: '👉', name: 'pointing right' },
  { char: '👀', name: 'eyes' },
  { char: '🤔', name: 'thinking face' },
  { char: '📄', name: 'document' },
  { char: '📎', name: 'paperclip' },
  { char: '✍️', name: 'writing hand' },
  { char: '📝', name: 'memo' },
  { char: '📅', name: 'calendar' },
  { char: '⏰', name: 'alarm clock' },
  { char: '⏳', name: 'hourglass' },
  { char: '📍', name: 'location pin' },
  { char: '📞', name: 'telephone' },
  { char: '📱', name: 'mobile phone' },
  { char: '💬', name: 'speech bubble' },
  { char: '✉️', name: 'envelope' },
  { char: '🏢', name: 'office building' },
  { char: '⚖️', name: 'balance scale' },
  { char: '💼', name: 'briefcase' },
  { char: '🏠', name: 'house' },
  { char: '💳', name: 'credit card' },
  { char: '💵', name: 'dollar bill' },
  { char: '🧾', name: 'receipt' },
  { char: '🔒', name: 'lock' },
  { char: '🎉', name: 'party popper' },
  { char: '👏', name: 'clapping hands' },
  { char: '🙌', name: 'raised hands' },
  { char: '💪', name: 'flexed arm' },
  { char: '⭐', name: 'star' },
  { char: '❤️', name: 'red heart' },
  { char: '💙', name: 'blue heart' },
  { char: '😅', name: 'grinning with sweat' },
  { char: '😔', name: 'pensive face' },
  { char: '😢', name: 'crying face' },
  { char: '🇺🇸', name: 'flag: United States' },
  { char: '🇲🇽', name: 'flag: Mexico' },
])

export const GRID_COLUMNS = 8
export const RECENT_MAX = GRID_COLUMNS

const NAMES = new Map(EMOJI.map((e) => [e.char, e.name]))
export const emojiName = (char) => NAMES.get(char) || 'emoji'

/**
 * Put `emoji` into `value` where the caret is, replacing any selection.
 * Without a usable caret (the box was never focused) it goes at the end.
 * Returns { value, caret } with the caret just after the emoji, or null when
 * the result would pass `maxLength`. The limit counts UTF-16 units, as the
 * textarea's own maxlength does (most emoji are two, a flag is four), so a
 * box that refuses another typed letter refuses an emoji too, instead of
 * holding text the server will reject.
 */
export function insertEmoji(value, start, end, emoji, maxLength = Infinity) {
  const text = String(value ?? '')
  const valid = (n) => Number.isInteger(n) && n >= 0 && n <= text.length
  // A selection is only trusted whole: half of one is as good as none.
  let from = valid(start) ? start : text.length
  let to = valid(start) && valid(end) ? end : from
  if (to < from) [from, to] = [to, from]
  const next = text.slice(0, from) + emoji + text.slice(to)
  if (next.length > maxLength) return null
  return { value: next, caret: from + emoji.length }
}

/** A stored recent list made safe to show: only emoji still offered, no repeats, at most `max`. */
export function cleanRecent(list, max = RECENT_MAX) {
  return [...new Set(Array.isArray(list) ? list : [])].filter((e) => NAMES.has(e)).slice(0, max)
}

/** `list` with `emoji` moved to the front, without repeats, at most `max` long. */
export function pushRecent(list, emoji, max = RECENT_MAX) {
  return cleanRecent([emoji, ...(Array.isArray(list) ? list : []).filter((e) => e !== emoji)], max)
}

/**
 * Where an arrow key moves focus from `index` in a grid of `count` items laid
 * out `cols` wide (null: not a move key). Left and right run through the
 * whole list and wrap at the ends; up and down keep the column and stop at
 * the top and bottom rows; Home and End go to the first and last item.
 */
export function gridIndex(key, index, count, cols = GRID_COLUMNS) {
  if (!count) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (index < 0 || index >= count) return ['ArrowRight', 'ArrowDown'].includes(key) ? 0 : ['ArrowLeft', 'ArrowUp'].includes(key) ? count - 1 : null
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'ArrowDown') return index + cols < count ? index + cols : index
  if (key === 'ArrowUp') return index - cols >= 0 ? index - cols : index
  return null
}
