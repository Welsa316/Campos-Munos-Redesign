// The header links (src/components/portal/sectionLinks.js). Every header
// asks SectionLinks where its labels start (label-at); a value it did not
// know once showed every label at once, which made the Messages header
// overflow onto itself. The Updates link's spoken name must say "new".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { labelClass, unlabelledClass, linkName, visibleSections, SECTIONS, LABEL_WIDTHS } from '../src/components/portal/sectionLinks.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const walk = (d) => fs.readdirSync(d).flatMap((n) => { const p = join(d, n); return fs.statSync(p).isDirectory() ? walk(p) : [p] })

test('a label shows from its width on, and only the dot shows below it', () => {
  assert.equal(labelClass('xl'), 'hidden xl:inline')
  assert.equal(unlabelledClass('xl'), 'xl:hidden')
  assert.equal(labelClass('2xl'), 'hidden 2xl:inline')
  assert.equal(labelClass('never'), 'hidden', 'never: icons only')
  assert.equal(unlabelledClass('never'), '', 'never: the dot always shows')
})

test('an unknown label-at shows icons only, never every label at once', () => {
  for (const v of ['md', '', undefined, 'constructor', 'toString']) {
    assert.equal(labelClass(v), 'hidden', String(v))
    assert.equal(unlabelledClass(v), '', String(v))
  }
})

test('every label-at a header uses is one the links know', () => {
  const used = new Set()
  for (const f of walk(SRC).filter((f) => f.endsWith('.vue'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/label-at="([^"]+)"/g)) used.add(m[1])
  }
  assert.ok(used.has('never'), 'the Messages header is found')
  for (const v of used) assert.ok(LABEL_WIDTHS.includes(v), `${v} is known`)
})

test('the Updates link is read as "Updates, new" while something is new', () => {
  const updates = SECTIONS.find((s) => s.key === 'updates')
  const calls = SECTIONS.find((s) => s.key === 'calls')
  assert.equal(linkName(updates, true), 'Updates, new')
  assert.equal(linkName(updates, false), 'Updates')
  assert.equal(linkName(calls, true), 'Calls', 'only Updates says new')
})

test('an account sees only what it may open, and not the section it is on', () => {
  const caps = new Set(['calls.view'])
  const canAny = (...c) => c.some((x) => caps.has(x))
  assert.deepEqual(visibleSections('calls', canAny).map((s) => s.key), ['home', 'updates'])
  assert.deepEqual(visibleSections('home', canAny).map((s) => s.key), ['updates', 'calls'])
})
