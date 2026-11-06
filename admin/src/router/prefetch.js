// Section code is split per route and fetched on first visit, which used to
// add a round trip to the first click on every section. Once signed in, the
// sections this account may open are fetched while the browser is idle, so
// the first visit to each is as quick as the second.

/**
 * The lazy loaders worth fetching ahead: signed-in sections (and their tabs)
 * the account may open. Sign-in, not-found and the unlinked demo are left out.
 */
export function prefetchable(routes, allowed) {
  const out = []
  const walk = (list, signedIn) => {
    for (const r of list) {
      if (r.meta?.capability && !allowed(r.meta)) continue
      const inside = signedIn || Boolean(r.meta?.requiresAuth)
      if (inside && typeof r.component === 'function') out.push(r.component)
      if (r.children) walk(r.children, inside)
    }
  }
  walk(routes, false)
  return out
}

let done = false
/** Fetch them one after another in idle time. Once per page load. */
export function prefetchSections(routes, allowed, { idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 200)) } = {}) {
  if (done) return
  done = true
  const queue = prefetchable(routes, allowed)
  const next = () => {
    const load = queue.shift()
    if (!load) return
    Promise.resolve().then(load).catch(() => {}).finally(() => idle(next))
  }
  idle(next)
}
