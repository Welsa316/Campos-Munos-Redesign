// The Updates list: each account sees what changed for the parts of the
// portal it can open, "New" lasts 48 hours from going live, and every entry
// is well formed (a typo in a capability would hide an entry from everyone).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { UPDATES, SECTIONS, NEW_FOR_MS, visibleUpdates, isNew, hasNew } from '../src/data/updates.js'

const HOUR = 60 * 60 * 1000
const holding = (...caps) => (...any) => any.some((c) => caps.includes(c))
const entry = (over) => ({ id: 'x', at: '2026-11-06T06:00:00Z', section: 'calls', any: ['calls.view'], title: 't', summary: 's', points: [], ...over })

test('each account sees the updates for what it can open, and everyone sees portal-wide ones', () => {
  const list = [
    entry({ id: 'calls', any: ['calls.view'] }),
    entry({ id: 'all', section: 'everyone', any: [] }),
    entry({ id: 'admin', any: ['calls.clear'] }),
    entry({ id: 'billing', section: 'billing', any: ['billing.view', 'billing.status'] }),
  ]
  const ids = (can) => visibleUpdates(list, can).map((u) => u.id)
  // The receptionist: Calls, not billing, not the administrator's tools.
  assert.deepEqual(ids(holding('calls.view', 'crm.view')), ['calls', 'all'])
  // Billing staff: billing and the portal-wide one.
  assert.deepEqual(ids(holding('billing.status')), ['all', 'billing'])
  assert.deepEqual(ids(holding('calls.view', 'calls.clear', 'billing.view')), ['calls', 'all', 'admin', 'billing'])
})

test('"New" lasts 48 hours from going live, then the entry stays without it', () => {
  const u = entry({ at: '2026-11-06T06:00:00Z' })
  const at = Date.parse(u.at)
  assert.equal(isNew(u, at), true)
  assert.equal(isNew(u, at + 47 * HOUR), true)
  assert.equal(isNew(u, at + NEW_FOR_MS), false)
  assert.equal(isNew(u, at + 30 * 24 * HOUR), false)
  // Written ahead of the deploy: not new until it goes live.
  assert.equal(isNew(u, at - HOUR), false)
  assert.equal(NEW_FOR_MS, 48 * HOUR)
})

test('the Updates link says New only for updates this account can see', () => {
  const at = Date.parse('2026-11-06T06:00:00Z')
  const list = [entry({ any: ['calls.clear'] }), entry({ id: 'old', any: [], at: '2026-10-01T00:00:00Z' })]
  assert.equal(hasNew(list, holding('calls.view'), at + HOUR), false, 'an administrator-only change is not new for the receptionist')
  assert.equal(hasNew(list, holding('calls.clear'), at + HOUR), true)
  assert.equal(hasNew(list, holding('calls.clear'), at + NEW_FOR_MS + HOUR), false)
})

test('every entry is well formed, newest first, and names real capabilities', () => {
  const catalog = fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'auth', 'capabilities.js'), 'utf8')
  const known = new Set([...catalog.slice(catalog.indexOf('export const CAPABILITIES'), catalog.indexOf('export const ADMIN_ONLY')).matchAll(/^\s+'([a-z]+\.[a-z_]+)':/gm)].map((m) => m[1]))
  assert.ok(known.size > 10, 'could not read the capability catalog')
  const ids = new Set()
  let previous = Infinity
  for (const u of UPDATES) {
    assert.ok(!ids.has(u.id), `duplicate id ${u.id}`)
    ids.add(u.id)
    const at = Date.parse(u.at)
    assert.ok(Number.isFinite(at) && /Z|[+-]\d\d:\d\d$/.test(u.at), `${u.id}: "at" needs a time and a time zone`)
    assert.ok(at <= previous, `${u.id} is out of order (newest first)`)
    previous = at
    assert.ok(SECTIONS[u.section], `${u.id}: unknown section ${u.section}`)
    assert.ok(Array.isArray(u.any), `${u.id}: "any" must be a list`)
    for (const c of u.any) assert.ok(known.has(c), `${u.id}: unknown capability ${c}`)
    assert.ok(u.title && u.summary && Array.isArray(u.points), `${u.id}: needs a title, summary and points`)
  }
})
