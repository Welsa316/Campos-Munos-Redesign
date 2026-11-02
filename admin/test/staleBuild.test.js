// A tab opened before a deploy asks for screen files that no longer exist.
// The portal must reload the page once, not leave the click doing nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reloadForStaleBuild, clearStaleBuildMark, isStaleBuildError } from '../src/router/staleBuild.js'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

// What Chrome, Firefox and Safari say when a lazy screen file is gone.
const BROWSER_ERRORS = [
  new TypeError('Failed to fetch dynamically imported module: https://admin.camulaw.com/assets/ActivityView-Old123.js'),
  new TypeError('error loading dynamically imported module: https://admin.camulaw.com/assets/ActivityView-Old123.js'),
  new TypeError('Importing a module script failed.'),
  new Error('Unable to preload CSS for /assets/ActivityView-Old123.css'),
]

test('a missing screen file after a deploy reloads the page at the destination, once', () => {
  for (const err of BROWSER_ERRORS) {
    const storage = memory()
    const went = []
    assert.equal(reloadForStaleBuild(err, '/activity', { storage, assign: (h) => went.push(h) }), true, err.message)
    assert.deepEqual(went, ['/activity'])
    // The fresh page fails the same way: not a stale tab, so no loop.
    assert.equal(reloadForStaleBuild(err, '/activity', { storage, assign: (h) => went.push(h) }), false)
    assert.deepEqual(went, ['/activity'])
    // Once a navigation works, the next deploy may reload again.
    clearStaleBuildMark(storage)
    assert.equal(reloadForStaleBuild(err, '/activity', { storage, assign: (h) => went.push(h) }), true)
  }
})

test('other navigation errors are left alone', () => {
  const went = []
  for (const err of [new Error('Request failed with status 500'), new TypeError('x is undefined'), null]) {
    assert.equal(isStaleBuildError(err), false)
    assert.equal(reloadForStaleBuild(err, '/activity', { storage: memory(), assign: (h) => went.push(h) }), false)
  }
  assert.deepEqual(went, [])
})

test('blocked storage still reloads', () => {
  const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
  const went = []
  assert.equal(reloadForStaleBuild(BROWSER_ERRORS[0], '/team', { storage: blocked, assign: (h) => went.push(h) }), true)
  assert.deepEqual(went, ['/team'])
  assert.doesNotThrow(() => clearStaleBuildMark(blocked))
})
