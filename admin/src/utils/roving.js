// One tab stop per group (tabs, radio groups): Tab enters and leaves the
// group, the arrow keys move inside it, Home and End jump to the ends. As in
// a native radio group, moving also selects (the item is clicked).

const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Where a key moves focus from `index` in a group of `count` (null: not a move key). */
export function rovingIndex(key, index, count) {
  if (!count) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEP[key]
  if (!step) return null
  if (index < 0 || index >= count) return step > 0 ? 0 : count - 1
  return (index + step + count) % count
}

/** The one item that takes Tab: the selected one, else the first. */
export const rovingTabindex = (selected, index, anySelected) => (selected || (!anySelected && index === 0) ? 0 : -1)

/** keydown handler for the group's container; `selector` matches its items. */
export function rovingKeydown(e, selector = '[role="radio"], [role="tab"]') {
  const items = [...e.currentTarget.querySelectorAll(selector)].filter((el) => !el.disabled)
  const current = items.indexOf(e.target.closest?.(selector))
  const next = rovingIndex(e.key, current, items.length)
  if (next === null) return
  e.preventDefault()
  items[next].focus()
  items[next].click()
}
