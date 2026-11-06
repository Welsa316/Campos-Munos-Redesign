// The portal's one toast queue (SwipeToast.vue shows it). Pure state, so the
// rules are tested apart from the page: a success says only what the server
// has confirmed (callers toast after the request resolves), an error stays
// until dismissed, at most three show at once, and Undo runs once.

export const MAX_TOASTS = 3
export const TOAST_MS = 6000

export function createToastQueue({ schedule = (fn, ms) => setTimeout(fn, ms), cancel = (t) => clearTimeout(t) } = {}) {
  const items = []
  const timers = new Map()
  let seq = 0
  const listeners = new Set()
  const changed = () => listeners.forEach((fn) => fn(items))

  function arm(t) {
    if (t.persistent) return
    cancel(timers.get(t.id))
    timers.set(t.id, schedule(() => dismiss(t.id), t.duration))
  }
  function show({ text, tone = 'success', undo = null, persistent = tone === 'error', duration = TOAST_MS } = {}) {
    if (!text) return null
    const t = { id: ++seq, text: String(text), tone, undo: typeof undo === 'function' ? undo : null, persistent, duration }
    items.push(t)
    // The oldest non-error toast makes room; an error is never pushed out.
    while (items.length > MAX_TOASTS) {
      const i = items.findIndex((x) => x.tone !== 'error')
      dismiss(items[i === -1 ? 0 : i].id)
    }
    arm(t)
    changed()
    return t.id
  }
  function dismiss(id) {
    const i = items.findIndex((t) => t.id === id)
    if (i === -1) return
    cancel(timers.get(id))
    timers.delete(id)
    items.splice(i, 1)
    changed()
  }
  // Hovering, focusing or dragging a toast holds it; letting go restarts its time.
  function hold(id) { cancel(timers.get(id)); timers.delete(id) }
  function release(id) { const t = items.find((x) => x.id === id); if (t) arm(t) }
  async function undo(id) {
    const t = items.find((x) => x.id === id)
    if (!t?.undo) return
    const fn = t.undo
    dismiss(id)
    await fn()
  }
  return { items, show, dismiss, hold, release, undo, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) } }
}
