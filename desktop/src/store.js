'use strict'
// A small JSON settings file in the app's userData folder: window bounds,
// the feed cursor and the start-at-login choice. Written atomically (temp
// file then rename) so a crash mid-write cannot leave half a file.

const fs = require('node:fs')
const path = require('node:path')

function createStore(file) {
  let data = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed
  } catch { /* first run or unreadable: start empty */ }

  function save() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
      fs.renameSync(tmp, file)
    } catch { /* settings are a convenience; never crash over them */ }
  }

  return {
    get(key) { return data[key] },
    set(key, value) {
      data[key] = value
      save()
    },
  }
}

const UNKNOWN = '?'

/**
 * The feed cursor for one API origin, as the poller wants it, kept per
 * account: whoever signs in on this computer resumes from their own place,
 * never from someone else's. `account` is the feed's own answer of whose
 * feed it is: null until it first says (and after a reset), and for an API
 * too old to say, whose cursor is then kept under UNKNOWN.
 */
function cursorFor(store, apiOrigin) {
  const key = `feedCursors:${apiOrigin}`
  const read = () => {
    const v = store.get(key)
    const ok = v && typeof v === 'object' && v.byAccount && typeof v.byAccount === 'object' && !Array.isArray(v.byAccount)
    return ok ? { account: typeof v.account === 'string' ? v.account : null, byAccount: v.byAccount } : { account: null, byAccount: {} }
  }
  return {
    get() {
      const s = read()
      return s.byAccount[s.account ?? UNKNOWN] ?? null
    },
    set(value) {
      const s = read()
      store.set(key, { account: s.account, byAccount: { ...s.byAccount, [s.account ?? UNKNOWN]: value } })
    },
    account: () => read().account,
    switchTo(account) {
      const s = read()
      store.set(key, { account: String(account), byAccount: s.byAccount })
    },
    // Signed out: forget every cursor, so nothing about who used the app stays.
    reset() { store.set(key, { account: null, byAccount: {} }) },
  }
}

module.exports = { createStore, cursorFor }
