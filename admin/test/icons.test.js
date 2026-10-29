// FontAwesome renders an unregistered icon as an empty placeholder, silently.
// Every fa-* icon a template uses must be in src/icons.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const NOT_ICONS = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-spin', 'fa-fw', 'fa-lg'])

function walk(dir) {
  return fs.readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return fs.statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const toName = (camel) => camel.replace(/^fa/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase()

test('every <i class="fa-…"> icon in a template is registered', () => {
  const registry = fs.readFileSync(join(SRC, 'icons.js'), 'utf8')
  // What is actually handed to library.add: the ICONS array.
  const list = registry.slice(registry.indexOf('export const ICONS = ['), registry.indexOf(']', registry.indexOf('export const ICONS = [')))
  const registered = new Set([...list.matchAll(/\bfa([A-Z]\w+)/g)].map((m) => `fa-${toName(m[1])}`))
  assert.ok(registered.size > 20, 'could not read the ICONS array')

  const used = new Set()
  for (const file of walk(SRC).filter((f) => f.endsWith('.vue'))) {
    const text = fs.readFileSync(file, 'utf8')
    // Only class attributes: the demo imports icon objects directly instead.
    for (const m of text.matchAll(/class="[^"]*"/g)) {
      for (const icon of m[0].match(/fa-[a-z0-9-]+/g) || []) if (!NOT_ICONS.has(icon)) used.add(icon)
    }
    for (const m of text.matchAll(/'(fa-[a-z0-9-]+)'/g)) if (!NOT_ICONS.has(m[1])) used.add(m[1])
  }
  const missing = [...used].filter((i) => !registered.has(i)).sort()
  assert.deepEqual(missing, [])
  assert.ok(used.size > 20, `found ${used.size} icons; the scan is not finding templates`)
})
