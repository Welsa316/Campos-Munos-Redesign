'use strict'
// After the page crashes the app reloads it, but not forever: a page that
// crashes again straight away would otherwise reload in a tight loop.

/**
 * @param {object} [opts]
 * @param {number} [opts.max]       reloads allowed within the window
 * @param {number} [opts.windowMs]
 * @param {() => number} [opts.now]
 * @returns {{ shouldReload: () => boolean }}  records a crash; true while under the limit
 */
function createCrashGuard({ max = 3, windowMs = 5 * 60 * 1000, now = Date.now } = {}) {
  let crashes = []
  return {
    shouldReload() {
      const t = now()
      crashes = crashes.filter((c) => t - c < windowMs)
      crashes.push(t)
      return crashes.length <= max
    },
  }
}

module.exports = { createCrashGuard }
