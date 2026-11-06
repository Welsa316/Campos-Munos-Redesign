// Fetching section code ahead: only the sections this account may open, and
// never the sign-in page, the not-found page or the unlinked demo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefetchable } from '../src/router/prefetch.js'

const loader = (name) => Object.assign(() => name, { label: name })
const routes = [
  { path: '/login', component: loader('login') },
  { path: '/', component: loader('home'), meta: { requiresAuth: true } },
  { path: '/calls', component: loader('calls'), meta: { requiresAuth: true, capability: 'calls.view' } },
  { path: '/team', component: loader('team'), meta: { requiresAuth: true, capability: 'team.manage' } },
  { path: '/billing', component: loader('billing'), meta: { requiresAuth: true }, children: [
    { path: '', component: loader('overview'), meta: { capability: 'billing.view' } },
    { path: 'monday', component: loader('monday'), meta: { capability: 'team.manage' } },
  ] },
  { path: '/demo/operations', component: loader('demo'), meta: {} },
  { path: '/admin', redirect: '/' },
  { path: '/:pathMatch(.*)*', component: loader('notfound') },
]

test('only sections the account may open are fetched ahead', () => {
  const caps = new Set(['calls.view', 'billing.view'])
  const allowed = (meta) => [].concat(meta.capability).some((c) => caps.has(c))
  assert.deepEqual(prefetchable(routes, allowed).map((l) => l.label), ['home', 'calls', 'billing', 'overview'])
})

test('an account with every section gets every signed-in section', () => {
  assert.deepEqual(prefetchable(routes, () => true).map((l) => l.label), ['home', 'calls', 'team', 'billing', 'overview', 'monday'])
})
