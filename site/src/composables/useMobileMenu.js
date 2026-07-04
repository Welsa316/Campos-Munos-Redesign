import { ref } from 'vue'

// Shared open/closed state for the mobile nav overlay. SiteHeader owns the
// toggle; MobileContactWidget reads it so the floating call/text pills can
// hide while the menu is open (they sit above the overlay otherwise and
// would intercept taps meant for the menu links).
const isOpen = ref(false)

export function useMobileMenu() {
  return { isOpen }
}
