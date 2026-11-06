'use strict'
// A small log in the app's userData folder, for working out what happened
// when someone says "the app stopped": state changes, load failures, crashes.
// Never payloads. Each line is one JSON object; only short plain values are
// written, and URLs only by origin, since a path or query can name a client.
// When the file passes maxBytes it becomes <file>.1 (the previous .1 is
// dropped), so the two together stay under twice that.

const fs = require('node:fs')
const path = require('node:path')

const MAX_VALUE = 200

/** Just scheme and host: "/inbox?lead=12" would say who someone looked at. */
function originOnly(url) {
  try {
    const u = new URL(String(url))
    return u.origin === 'null' ? u.protocol : u.origin
  } catch {
    return 'invalid-url'
  }
}

function clean(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, MAX_VALUE)
    // objects, arrays, errors with stacks: not logged
  }
  return out
}

function createLog(file, { maxBytes = 256 * 1024, now = () => new Date() } = {}) {
  function rotateIfNeeded() {
    try {
      if (fs.statSync(file).size < maxBytes) return
      fs.renameSync(file, `${file}.1`)
    } catch { /* no file yet */ }
  }

  return function log(event, fields) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      rotateIfNeeded()
      fs.appendFileSync(file, JSON.stringify({ at: now().toISOString(), event: String(event).slice(0, 60), ...clean(fields) }) + '\n')
    } catch { /* a log must never take the app down */ }
  }
}

module.exports = { createLog, originOnly }
