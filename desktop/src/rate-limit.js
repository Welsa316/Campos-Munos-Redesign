'use strict'
// Opening links in the browser is rate limited: a page (or a bug in one)
// calling window.open in a loop must not open a hundred browser tabs.

/**
 * @param {object} [opts]
 * @param {number} [opts.gapMs]      minimum time between two
 * @param {number} [opts.perMinute]  most within any minute
 * @param {() => number} [opts.now]
 */
function createRateLimit({ gapMs = 1000, perMinute = 6, now = Date.now } = {}) {
  let recent = []
  return {
    /** True (and counted) when another one may go now. */
    allow() {
      const t = now()
      recent = recent.filter((r) => t - r < 60_000)
      if (recent.length && t - recent[recent.length - 1] < gapMs) return false
      if (recent.length >= perMinute) return false
      recent.push(t)
      return true
    },
  }
}

module.exports = { createRateLimit }
