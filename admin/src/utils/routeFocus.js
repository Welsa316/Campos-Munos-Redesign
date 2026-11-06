// After moving to another section, focus goes to its heading, so a screen
// reader announces where it landed and Tab starts from the top of the new
// page instead of from the link that was clicked (which is gone).

/**
 * Whether this navigation moved to a different section. The first load, a
 * changed query (a filter, ?lead=) and a tab inside one section (Billing's
 * tabs, a WhatsApp conversation) leave focus where it is.
 */
export function movesFocus(to, from) {
  if (!from?.matched?.length || !to?.matched?.length) return false
  return to.matched[0].path !== from.matched[0].path
}

/** Focus the page's h1 (or the main region when it has none), without scrolling. */
export function focusMainHeading(doc = document) {
  const main = doc.getElementById('main')
  if (!main) return
  const target = main.querySelector('h1') || main
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.setAttribute('data-route-focus', '')
  target.focus({ preventScroll: true })
}
