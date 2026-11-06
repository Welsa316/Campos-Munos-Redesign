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

/** The feed cursor for one API origin, as the poller wants it. */
function cursorFor(store, apiOrigin) {
  const key = `feedCursor:${apiOrigin}`
  return {
    get: () => store.get(key) ?? null,
    set: (value) => store.set(key, value),
  }
}

module.exports = { createStore, cursorFor }
