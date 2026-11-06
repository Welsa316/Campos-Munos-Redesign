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
// Items older than this (the app was quit, the computer asleep, someone was
// away) are not worth a notification each: one summary says how many.
const STALE_MS = 24 * 60 * 60 * 1000

function backoffDelay(failures) {
  if (failures <= 0) return NORMAL_MS
  return BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1]
}

function validItem(item) {
  return !!item && typeof item === 'object' && typeof item.title === 'string' && item.title.length > 0
}

function isStale(item, now) {
  const at = Date.parse(item.createdAt)
  return Number.isFinite(at) && now - at > STALE_MS
}

function awaySummary(count) {
  return {
    title: count === 1 ? '1 notification while you were away' : `${count} notifications while you were away`,
    body: 'Open Campos Muños to catch up.',
    url: '/',
    tag: 'cm-while-away',
  }
}

/**
 * @param {object} deps
 * @param {(after: string|number|null) => Promise<{status: number, json: () => Promise<any>}>} deps.fetchFeed
 * @param {{ get: () => any, set: (cursor: any) => void, account?: () => string|null, switchTo?: (account: string) => void }} deps.cursor
 *   With `account`/`switchTo`, cursors are kept per account (store.js).
 * @param {(item: object) => void} deps.notify
 * @param {(fn: Function, ms: number) => any} [deps.setTimer]
 * @param {(handle: any) => void} [deps.clearTimer]
 * @param {(state: string) => void} [deps.onState]  'ok' | 'signed-out' | 'error'
 * @param {() => number} [deps.now]
 */
function createPoller({ fetchFeed, cursor, notify, setTimer = setTimeout, clearTimer = clearTimeout, onState = () => {}, now = Date.now }) {
  let timer = null
  let running = false
  let inFlight = null
  let again = false
  let failures = 0
  let state = 'starting'
  // Stale items counted across the pages of one catch-up, announced once.
  let away = 0
  let switched = false

  function setState(s) {
    state = s
    onState(s)
  }

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
    const sent = cursor.get() ?? null
    let res
    try {
      res = await fetchFeed(sent)
    } catch {
      return fail()
    }
    if (res.status === 401) {
      failures = 0
      setState('signed-out')
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

    // Someone else signed in: this answer was read against another person's
    // cursor. Switch to theirs (or none) and ask again, once, straight away.
    const account = typeof body.account === 'string' && body.account ? body.account : null
    if (account !== null && cursor.switchTo && cursor.account() !== account) {
      cursor.switchTo(account)
      if ((cursor.get() ?? null) !== sent) {
        failures = 0
        setState('ok')
        if (switched) return NORMAL_MS
        switched = true
        return 0
      }
    }
    switched = false

    const before = sent
    // Without a stored cursor this is the first call: take the server's
    // latest id and show nothing, so history is never replayed.
    if (before !== null && Array.isArray(body.items)) {
      const at = now()
      for (const item of body.items) {
        if (!validItem(item)) continue
        if (isStale(item, at)) { away += 1; continue }
        try { notify(item) } catch { /* one bad notification must not stop the rest */ }
      }
    }
    const next = body.cursor !== undefined && body.cursor !== null ? body.cursor : before
    if (next !== before) cursor.set(next)
    failures = 0
    setState('ok')
    // Only chase the next page when the cursor moved, so a misbehaving
    // server cannot spin this into a tight loop.
    const full = before !== null && Array.isArray(body.items) && body.items.length >= PAGE_SIZE
    if (full && next !== before) return 0
    if (away > 0) {
      const count = away
      away = 0
      try { notify(awaySummary(count)) } catch { /* the OS refused it; nothing else to do */ }
    }
    return NORMAL_MS
  }

  function fail() {
    failures += 1
    setState('error')
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
    // 'starting' until the first answer, then 'ok' | 'signed-out' | 'error'.
    get state() { return state },
  }
}

module.exports = { createPoller, backoffDelay, NORMAL_MS, SIGNED_OUT_MS, BACKOFF_MS, PAGE_SIZE, STALE_MS }
