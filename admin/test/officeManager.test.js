// The Office Manager role in the portal: the header links, the screens the
// router lets the account open, and the Updates it is shown, all driven by
// the capabilities the server gives the role (server/auth/capabilities.js).
// The API refuses the rest on its own (server/officeManager.test.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../src/router/routes.js'
import { visibleSections } from '../src/components/portal/sectionLinks.js'
import { UPDATES, visibleUpdates } from '../src/data/updates.js'
import { resolveCapabilities } from '../../server/auth/capabilities.js'

const holders = (caps) => (...any) => any.some((c) => caps.has(c))
const office = holders(resolveCapabilities({ role: 'office_manager' }))
const reception = holders(resolveCapabilities({ role: 'receptionist' }))

// Every named screen and whether the router lets the account stay on it
// (the guard in src/router/index.js: each matched level's capability).
function openable(canAny) {
  const allowed = (meta) => !meta?.capability || canAny(...[].concat(meta.capability))
  const out = []
  for (const r of routes) {
    if (!r.meta?.requiresAuth) continue
    for (const leaf of r.children?.length ? r.children : [r]) {
      if (leaf.name && allowed(r.meta) && allowed(leaf.meta)) out.push(leaf.name)
    }
  }
  return out.sort()
}

test('an Office Manager gets Messages, WhatsApp and Calls in the header, and nothing else', () => {
  assert.deepEqual(visibleSections('home', office).map((s) => s.key), ['updates', 'messages', 'whatsapp', 'calls'])
})

test('an Office Manager can open the lead, WhatsApp and call screens, and no billing or administrator screen', () => {
  const names = openable(office)
  for (const n of ['Inbox', 'WhatsApp', 'Calls', 'Home', 'Updates']) assert.ok(names.includes(n), `${n} opens`)
  for (const n of names) assert.ok(!n.startsWith('Billing'), `${n}: no billing`)
  for (const n of ['Team', 'Activity', 'Integrations', 'Automation', 'TestChannel']) assert.ok(!names.includes(n), `${n} stays closed`)
})

test('the receptionist portal is unchanged by the new role', () => {
  assert.deepEqual(visibleSections('home', reception).map((s) => s.key), ['updates', 'messages', 'whatsapp', 'calls'])
  assert.deepEqual(openable(reception), openable(office), 'the same screens; what differs is inside them')
})

test('the Office Manager update is shown to the administrator alone', () => {
  const entry = UPDATES.find((u) => u.id === 'office-manager-role')
  assert.ok(entry)
  assert.equal(visibleUpdates([entry], holders(resolveCapabilities({ role: 'admin' }))).length, 1)
  for (const role of ['office_manager', 'receptionist', 'front_desk', 'billing_paralegal', 'staff']) {
    assert.equal(visibleUpdates([entry], holders(resolveCapabilities({ role }))).length, 0, role)
  }
})
