// Keyboard behaviour for a panel that is modal: Tab and Shift+Tab stay
// inside it, and focus goes back to where it came from when it closes.
// Same rules as ChangePasswordModal's trap, shared by the slide-over panels.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Keep Tab inside `container` (a keydown handler for Tab). */
export function trapTab(container, e) {
  if (e.key !== 'Tab' || !container) return
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
    e.preventDefault()
    first.focus()
  }
}

/** Remember what had focus before a panel opened; `restore()` puts it back. */
export function rememberFocus() {
  const before = typeof document !== 'undefined' ? document.activeElement : null
  return { restore: () => { if (before && typeof before.focus === 'function' && document.contains(before)) before.focus() } }
}
