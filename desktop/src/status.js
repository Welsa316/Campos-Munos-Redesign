'use strict'
// What the tray, Dock and one-off alert say about the notification poller,
// kept free of Electron so it tests in plain Node. The poller reports
// 'ok' | 'signed-out' | 'error'; without this the app went quiet when a
// session ended and nobody could tell notifications had stopped.

// Consecutive failed checks before the tray says notifications are paused.
// One failure is usually a blip (Wi-Fi waking up); three is about 3.5 minutes.
const ERRORS_BEFORE_PAUSED = 3

/** Tray tooltip, the status line in its menu, and the Dock badge. */
function describe(state, appName) {
  if (state === 'signed-out') {
    return { tooltip: `${appName}: signed out, notifications paused`, label: 'Signed out: notifications paused', badge: '!' }
  }
  if (state === 'error') {
    return { tooltip: `${appName}: can't reach the portal, notifications paused`, label: "Can't reach the portal: notifications paused", badge: '!' }
  }
  return { tooltip: appName, label: null, badge: '' }
}

/**
 * Folds poller reports into the state worth showing, and says when to alert.
 * A sign-out alerts once, and only after the person had been signed in, so
 * the first launch (not signed in yet) stays quiet.
 */
function createStatus() {
  let shown = 'starting'
  let failures = 0

  return {
    get state() { return shown },
    /** Returns { state, changed, alert } for the poller's latest report. */
    report(polled) {
      const before = shown
      if (polled === 'error') {
        failures += 1
        // Keep showing the last state until failures stop looking like a blip.
        if (failures >= ERRORS_BEFORE_PAUSED) shown = 'error'
      } else {
        failures = 0
        shown = polled === 'signed-out' ? 'signed-out' : 'ok'
      }
      return {
        state: shown,
        changed: shown !== before,
        alert: shown === 'signed-out' && before === 'ok',
      }
    },
  }
}

module.exports = { describe, createStatus, ERRORS_BEFORE_PAUSED }
