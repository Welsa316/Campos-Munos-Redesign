/* Desktop notifications for the staff portal (Web Push).
 *
 * Registered only when someone clicks "Enable notifications" (see
 * src/utils/push.js). It does two things: show a notification when the API
 * pushes one, and open the portal when it is clicked.
 *
 * Deliberately no fetch handler and no caches: this worker never sits between
 * the portal and the network, so it cannot serve a stale build, break sign-in
 * or hold on to an asset. Served with Cache-Control: no-cache (admin/server.js),
 * so the browser picks up a new version on its next update check.
 *
 * The text shown comes from the payload, which the API keeps generic (no
 * client names, numbers or case details). A payload that is missing or
 * malformed still shows a plain notification, because Chrome and Edge show
 * their own "site updated in the background" message when a push shows none.
 */
'use strict'

var FALLBACK_TITLE = 'New update'
var FALLBACK_BODY = 'Open the staff portal to see what is new.'
// The same rule as the API's portalPath(): a path inside the portal only.
var PORTAL_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/

function scopeUrl() {
  return new URL(self.registration.scope)
}

/** A path inside the portal ('/calls'), or '/' for anything else. */
function portalPath(value) {
  if (typeof value !== 'string' || value.length > 300 || !PORTAL_PATH.test(value)) return '/'
  try {
    var scope = scopeUrl()
    var url = new URL(value.slice(1), scope)
    if (url.origin !== self.location.origin || url.pathname.indexOf(scope.pathname) !== 0) return '/'
  } catch (e) {
    return '/'
  }
  return value
}

/** Absolute address of an in-portal path, under the worker's scope. */
function portalHref(path) {
  return new URL(portalPath(path).slice(1), scopeUrl()).href
}

function text(value, max, fallback) {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : fallback
}

function readPayload(event) {
  try {
    var data = event.data ? event.data.json() : null
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch (e) {
    return {}
  }
}

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', function (event) {
  var data = readPayload(event)
  var tag = text(data.tag, 120, '')
  var options = {
    body: text(data.body, 240, FALLBACK_BODY),
    data: { path: portalPath(data.url) },
    icon: new URL('favicon-512.png', scopeUrl()).href,
  }
  // The same tag replaces the earlier notification instead of stacking.
  if (tag) {
    options.tag = tag
    options.renotify = true
  }
  event.waitUntil(
    self.registration.showNotification(text(data.title, 120, FALLBACK_TITLE), options).catch(function () {})
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var path = portalPath(event.notification.data && event.notification.data.path)
  event.waitUntil(openPortal(path).catch(function () {}))
})

// Focus a portal tab already open and move it in place (the app routes the
// message, so nothing reloads under a half-typed reply); else open one.
function openPortal(path) {
  var scope = self.registration.scope
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var win = null
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(scope) === 0) { win = list[i]; break }
    }
    if (!win) return self.clients.openWindow(portalHref(path))
    win.postMessage({ type: 'cm-push-open', path: path })
    return win.focus()
  })
}
