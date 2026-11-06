// Every header asks SectionLinks where its labels start (label-at). A value
// the component does not know used to show every label at once, which made
// the Messages header overflow onto itself. Each value in use must be known,
// and an unknown one must fall back to icons only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const walk = (d) => fs.readdirSync(d).flatMap((n) => { const p = join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : [p] })
const links = fs.readFileSync(join(SRC, 'components', 'portal', 'SectionLinks.vue'), 'utf8')
const keysOf = (name) => {
  const m = links.match(new RegExp(`const ${name} = \\{([^}]*)\\}`))
  assert.ok(m, `${name} not found`)
  return new Set([...m[1].matchAll(/(?:'([^']+)'|(\w+))\s*:/g)].map((x) => x[1] || x[2]))
}

test('every label-at a header uses is one SectionLinks knows', () => {
  const used = new Set()
  for (const f of walk(SRC).filter((f) => f.endsWith('.vue'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/label-at="([^"]+)"/g)) used.add(m[1])
  }
  assert.ok(used.has('never'), 'the Messages header is found')
  const labels = keysOf('LABEL_AT')
  const dots = keysOf('UNLABELLED_AT')
  for (const v of used) {
    assert.ok(labels.has(v), `LABEL_AT has ${v}`)
    assert.ok(dots.has(v), `UNLABELLED_AT has ${v}`)
  }
})

test('an unknown label-at shows icons only', () => {
  assert.match(links, /const labelClass = \(at\) => LABEL_AT\[at\] \?\? LABEL_AT\.never/)
  assert.match(links, /never: 'hidden'/)
})
