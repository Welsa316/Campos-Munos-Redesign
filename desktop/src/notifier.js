'use strict'
// Shows feed items as OS notifications. Items sharing a tag replace each other
// (closing the old one first), which neither macOS nor Windows does for us.
// References are kept on purpose: Electron drops a notification's click
// handler once the object is garbage collected.

const MAX_UNTAGGED = 20
// Each tag is its own caller or reminder, so a busy day adds up; the oldest
// go first (it only means a very old one is not replaced by a newer twin).
const MAX_TAGGED = 50

/**
 * @param {object} deps
 * @param {(opts: {title: string, body: string, silent: boolean}) => {on: Function, show: Function, close: Function}} deps.create
 * @param {(url: string|undefined) => void} deps.onClick
 */
function createNotifier({ create, onClick }) {
  const byTag = new Map()
  const untagged = []

  function forget(n, tag) {
    if (tag) {
      if (byTag.get(tag) === n) byTag.delete(tag)
    } else {
      const i = untagged.indexOf(n)
      if (i !== -1) untagged.splice(i, 1)
    }
  }

  function show(item) {
    const tag = typeof item.tag === 'string' && item.tag ? item.tag : null
    if (tag && byTag.has(tag)) {
      const old = byTag.get(tag)
      byTag.delete(tag)
      try { old.close() } catch { /* already gone */ }
    }

    const n = create({
      title: String(item.title),
      body: typeof item.body === 'string' ? item.body : '',
      silent: false,
    })
    n.on('click', () => {
      forget(n, tag)
      onClick(item.url)
    })
    n.on('close', () => forget(n, tag))

    if (tag) {
      byTag.set(tag, n)
      if (byTag.size > MAX_TAGGED) byTag.delete(byTag.keys().next().value)
    } else {
      untagged.push(n)
      if (untagged.length > MAX_UNTAGGED) untagged.shift()
    }
    n.show()
    return n
  }

  return { show, get size() { return byTag.size + untagged.length } }
}

module.exports = { createNotifier, MAX_TAGGED }
