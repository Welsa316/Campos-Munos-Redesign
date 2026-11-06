// The test channel is the administrator's alone: its screen, its Updates
// entry and the server capability behind both must never reach another
// role, nor an account given single extra permissions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../src/router/routes.js'
import { UPDATES, visibleUpdates } from '../src/data/updates.js'
import { ROLES, resolveCapabilities } from '../../server/auth/capabilities.js'

const route = routes.find((r) => r.path === '/test-channel')
const holders = (caps) => (...any) => any.some((c) => caps.has(c))
// Every role, and every role granted every capability there is.
const EVERY = resolveCapabilities({ role: 'admin' })
const accounts = Object.keys(ROLES).flatMap((role) => [
  { role, caps: resolveCapabilities({ role }) },
  { role: `${role} + grants`, caps: resolveCapabilities({ role, grants: [...EVERY] }) },
])

test('only an administrator may open the Test channel', () => {
  assert.ok(route, 'the route exists')
  const needs = [].concat(route.meta.capability)
  assert.ok(route.meta.requiresAuth)
  for (const a of accounts) {
    const may = needs.some((c) => a.caps.has(c))
    assert.equal(may, a.role === 'admin' || a.role === 'admin + grants', `${a.role}`)
  }
})

test('the Test channel update is shown to the administrator alone', () => {
  const entry = UPDATES.find((u) => u.id === 'test-channel')
  assert.ok(entry)
  for (const a of accounts) {
    const sees = visibleUpdates([entry], holders(a.caps)).length === 1
    assert.equal(sees, a.role.startsWith('admin'), a.role)
  }
})
