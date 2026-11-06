// Desktop notifications on this computer (Web Push): the browser side of
// server/routes/push.js. Nothing here runs on sign-in or page load except
// reading state; the permission prompt only ever follows a click on
// "Enable notifications".

const BASE = import.meta.env?.BASE_URL ?? '/'
export const SW_URL = `${BASE}push-sw.js`
export const SW_SCOPE = BASE

/** 'ok', 'insecure' (not https) or 'unsupported'. */
export function pushSupport(win = globalThis) {
  if (!win || !win.isSecureContext) return 'insecure'
  if (!win.navigator?.serviceWorker || !('PushManager' in win) || !('Notification' in win)) return 'unsupported'
  return 'ok'
}

/** 'granted' | 'denied' | 'default' */
export function permissionState(win = globalThis) {
  return win.Notification?.permission ?? 'default'
}

/** The VAPID public key (base64url) as the bytes subscribe() wants. */
export function keyBytes(base64url) {
  const b64 = String(base64url).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function sameKey(buffer, bytes) {
  if (!buffer) return false
  const a = new Uint8Array(buffer)
  return a.length === bytes.length && a.every((v, i) => v === bytes[i])
}

/** This browser's subscription, without registering anything. */
export async function currentSubscription(win = globalThis) {
  if (pushSupport(win) !== 'ok') return null
  const reg = await win.navigator.serviceWorker.getRegistration(SW_SCOPE)
  return (await reg?.pushManager.getSubscription()) || null
}

/**
 * Subscribe this browser. Call from the click handler: the permission
 * request has to be the first thing awaited so it stays within the gesture.
 * Returns the subscription, or throws an Error with .code
 * ('unsupported' | 'insecure' | 'denied' | 'dismissed').
 */
export async function subscribeThisBrowser(publicKey, win = globalThis) {
  const support = pushSupport(win)
  if (support !== 'ok') throw Object.assign(new Error(support), { code: support })
  let permission = permissionState(win)
  if (permission === 'denied') throw Object.assign(new Error('denied'), { code: 'denied' })
  if (permission !== 'granted') permission = await win.Notification.requestPermission()
  if (permission === 'denied') throw Object.assign(new Error('denied'), { code: 'denied' })
  if (permission !== 'granted') throw Object.assign(new Error('dismissed'), { code: 'dismissed' })

  const sw = win.navigator.serviceWorker
  await sw.register(SW_URL, { scope: SW_SCOPE, updateViaCache: 'none' })
  const reg = await sw.ready
  const key = keyBytes(publicKey)
  const existing = await reg.pushManager.getSubscription()
  // Subscribed under an older server key: start again with the current one.
  if (existing && !sameKey(existing.options?.applicationServerKey, key)) await existing.unsubscribe()
  else if (existing) return existing
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
}

/** Where to allow notifications again, in plain words. */
export function blockedHelp(host) {
  return `Notifications are blocked for ${host}. To allow them, click the icon at the left of the address bar, open Site settings (Chrome) or Permissions for this site (Edge), set Notifications to Allow, then reload the portal.`
}

/**
 * A notification clicked while the portal is open asks the app to move there
 * (push-sw.js posts { type: 'cm-push-open', path }). Only in-portal paths.
 */
export function pushOpenPath(data) {
  if (!data || data.type !== 'cm-push-open' || typeof data.path !== 'string') return null
  const p = data.path
  if (p.length > 300 || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return null
  return p
}

export function listenForNotificationClicks(router, win = globalThis) {
  const sw = win.navigator?.serviceWorker
  if (!sw) return
  sw.addEventListener('message', (e) => {
    const path = pushOpenPath(e.data)
    if (path) router.push(path).catch(() => {})
  })
}
