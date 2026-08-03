// Coverage for the Wix → new-site redirect resolver.
// Run: npm test   (node's built-in runner, no dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legacyTarget, LEGACY_MAP } from './legacyRedirects.js'

test('maps a legacy path to its new destination', () => {
  assert.equal(legacyTarget('/greencards'), '/servicios/green-card')
  assert.equal(legacyTarget('/asylum'), '/servicios/asilo')
  assert.equal(legacyTarget('/make-a-payment'), '/pago')
})

test('strips the /en prefix and maps to the same destination', () => {
  assert.equal(legacyTarget('/en/asylum'), '/servicios/asilo')
  assert.equal(legacyTarget('/en/services'), '/servicios')
  assert.equal(legacyTarget('/en'), '/')
})

test('ignores a trailing slash', () => {
  assert.equal(legacyTarget('/greencards/'), '/servicios/green-card')
  assert.equal(legacyTarget('/en/asylum/'), '/servicios/asilo')
})

test('collapses doubled slashes before matching', () => {
  assert.equal(legacyTarget('/en//asylum'), '/servicios/asilo')
  assert.equal(legacyTarget('//greencards'), '/servicios/green-card')
})

test('sends /en URLs for current routes to that route, not the homepage', () => {
  assert.equal(legacyTarget('/en/servicios'), '/servicios')
  assert.equal(legacyTarget('/en/servicios/asilo'), '/servicios/asilo')
  assert.equal(legacyTarget('/en/el-equipo/juan'), '/el-equipo/juan')
  assert.equal(legacyTarget('/en/pago'), '/pago')
  // Genuinely dead /en paths still fall back to home.
  assert.equal(legacyTarget('/en/some-dead-wix-page'), '/')
})

test('passes unmapped paths through (null = no redirect)', () => {
  assert.equal(legacyTarget('/servicios/asilo'), null)
  assert.equal(legacyTarget('/some-page-that-never-existed'), null)
})

test('does not redirect paths shared by both sites', () => {
  assert.equal(legacyTarget('/acerca-de'), null)
  assert.equal(legacyTarget('/consulta'), null)
})

test('still moves the /en twins of shared paths', () => {
  assert.equal(legacyTarget('/en/acerca-de'), '/acerca-de')
  assert.equal(legacyTarget('/en/consulta'), '/consulta')
})

test('honors the deliberate team-page mappings', () => {
  // The firm does not want a team index — these go to the about page.
  assert.equal(legacyTarget('/theteam'), '/acerca-de')
  assert.equal(legacyTarget('/attorney-profiles'), '/acerca-de')
  // A Wix duplicate that held Angenette's bio, not Juan's.
  assert.equal(legacyTarget('/copy-of-juan'), '/el-equipo/angenette')
})

test('every destination is a real route, never another mapped key', () => {
  // Guards against redirect chains: no target may itself be a redirecting key.
  for (const [slug, target] of Object.entries(LEGACY_MAP)) {
    const bare = target.replace(/^\//, '')
    const chained = LEGACY_MAP[bare]
    assert.ok(
      chained === undefined || chained === target,
      `${slug} -> ${target} would chain to ${chained}`
    )
  }
})
