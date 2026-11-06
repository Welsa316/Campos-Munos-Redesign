'use strict'
// Polls the notification feed. Electron cannot receive Web Push, so while the
// app runs it asks the API every 20 seconds for anything new since the last
// item it saw. No Electron imports: fetching, storage, timers and showing
// notifications are all passed in, which is what lets the tests drive it.

const NORMAL_MS = 20_000
const SIGNED_OUT_MS = 60_000
// After consecutive failures: 20 s, 60 s, 120 s, then every 5 minutes.
const BACKOFF_MS = [20_000, 60_000, 120_000, 300_000]
// The server returns at most this many items per call; a full page means
// there is more waiting, so ask again straight away.
const PAGE_SIZE = 50

function backoffDelay(failures) {
  if (failures <= 0) return NORMAL_MS
  return BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1]
}

function validItem(item) {
  return !!item && typeof item === 'object' && typeof item.title === 'string' && item.title.length > 0
}

/**
 * @param {object} deps
 * @param {(after: string|number|null) => Promise<{status: number, json: () => Promise<any>}>} deps.fetchFeed
 * @param {{ get: () => any, set: (cursor: any) => void }} deps.cursor
 * @param {(item: object) => void} deps.notify
 * @param {(fn: Function, ms: number) => any} [deps.setTimer]
 * @param {(handle: any) => void} [deps.clearTimer]
 * @param {(state: string) => void} [deps.onState]  'ok' | 'signed-out' | 'error'
 */
function createPoller({ fetchFeed, cursor, notify, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {} }) {
  let timer = null
  let running = false
  let inFlight = null
  let again = false
  let failures = 0

  function schedule(ms) {
    if (timer) clearTimer(timer)
    timer = running ? setTimer(() => { timer = null; tick() }, ms) : null
  }

  // One request at a time. A poke during a request runs one more right after.
  function tick() {
    if (!running) return Promise.resolve()
    if (inFlight) {
      again = true
      return inFlight
    }
    inFlight = once()
      .then((delay) => {
        inFlight = null
        if (again) {
          again = false
          return tick()
        }
        schedule(delay)
      })
    return inFlight
  }

  async function once() {
    let res
    try {
      res = await fetchFeed(cursor.get() ?? null)
    } catch {
      return fail()
    }
    if (res.status === 401) {
      failures = 0
      onState('signed-out')
      return SIGNED_OUT_MS
    }
    if (res.status !== 200) return fail()

    let body
    try {
      body = await res.json()
    } catch {
      return fail()
    }
    if (!body || typeof body !== 'object') return fail()

    const before = cursor.get() ?? null
    // Without a stored cursor this is the first call: take the server's
    // latest id and show nothing, so history is never replayed.
    if (before !== null && Array.isArray(body.items)) {
      for (const item of body.items) {
        if (!validItem(item)) continue
        try { notify(item) } catch { /* one bad notification must not stop the rest */ }
      }
    }
    const next = body.cursor !== undefined && body.cursor !== null ? body.cursor : before
    if (next !== before) cursor.set(next)
    failures = 0
    onState('ok')
    // Only chase the next page when the cursor moved, so a misbehaving
    // server cannot spin this into a tight loop.
    const full = before !== null && Array.isArray(body.items) && body.items.length >= PAGE_SIZE
    return full && next !== before ? 0 : NORMAL_MS
  }

  function fail() {
    failures += 1
    onState('error')
    return backoffDelay(failures)
  }

  return {
    start() {
      if (running) return
      running = true
      tick()
    },
    stop() {
      running = false
      if (timer) clearTimer(timer)
      timer = null
    },
    // Resume from sleep, network back, window focus, sign-in: check now.
    poke() {
      if (!running) return Promise.resolve()
      if (timer) clearTimer(timer)
      timer = null
      return tick()
    },
    get failures() { return failures },
  }
}

module.exports = { createPoller, backoffDelay, NORMAL_MS, SIGNED_OUT_MS, BACKOFF_MS, PAGE_SIZE }
