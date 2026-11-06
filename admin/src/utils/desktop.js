// Whether the portal is running inside the Campos Muños desktop app (its
// preload sets window.campos.desktop). The app shows notifications itself,
// from GET /api/notifications/feed, so the page must not show its own too.
import { isPortalPath } from './portalPath.js'

export const inDesktopApp =(w = typeof window !== 'undefined' ? window : undefined) => w?.campos?.desktop === true


/**
 * A notification clicked in the desktop app opens its screen in place, through
 * the router, instead of reloading the whole portal. The app calls back only
 * once this has registered; an older portal without it gets a full load.
 */
export function listenForDesktopNavigation(router, w = typeof window !== 'undefined' ? window : undefined) {
  if (!inDesktopApp(w) || typeof w.campos.onNavigate !== 'function') return false
  w.campos.onNavigate((path) => {
    if (isPortalPath(path)) router.push(path).catch(() => {})
  })
  return true
}

/**
 * The badge for the desktop app's own notifications, from what the app
 * reports (desktop/preload.js): 'desktop' (on), 'desktop_paused' (it cannot
 * reach the server right now) or 'desktop_blocked' (this computer will not
 * show them). An app too old to say counts as on.
 */
export async function desktopNotificationState(w = typeof window !== 'undefined' ? window : undefined) {
  const read = w?.campos?.notificationState
  if (typeof read !== 'function') return 'desktop'
  let s
  try { s = await read() } catch { return 'desktop' }
  if (!s || typeof s !== 'object') return 'desktop'
  if (s.supported === false) return 'desktop_blocked'
  if (s.feed === 'error' || s.feed === 'signed-out') return 'desktop_paused'
  return 'desktop'
}
