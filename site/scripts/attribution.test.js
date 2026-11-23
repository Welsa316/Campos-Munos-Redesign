// Campaign links: an ad's link to a service page carries utm_ tags, and a
// form sent later (usually from another page, sometimes days later) has to
// say which campaign that was (src/utils/attribution.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campaignFromAddress, captureCampaign, currentCampaign, KEEP_MS } from '../src/utils/attribution.js'

// A browser's localStorage, as far as the module uses it.
const fakeStorage = (initial = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
  }
}
const blocked = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
const AD = '?utm_source=youtube&utm_medium=paid_video&utm_campaign=demand-gen-daca&utm_content=sitelink-daca'

test('a tagged link names its campaign and the page it landed on', () => {
  assert.deepEqual(campaignFromAddress(AD, '/servicios/daca'), {
    source: 'youtube', medium: 'paid_video', campaign: 'demand-gen-daca', content: 'sitelink-daca', landingPath: '/servicios/daca',
  })
})

test('a link with no tags, or with tags that name no campaign, is not a campaign link', () => {
  assert.equal(campaignFromAddress('', '/servicios/daca'), null)
  assert.equal(campaignFromAddress('?gclid=abc123&page=2', '/blog'), null)
  assert.equal(campaignFromAddress('?utm_content=banner&utm_term=abogado', '/'), null)
  assert.equal(campaignFromAddress('?utm_source=%20%20', '/'), null, 'blank is not a source')
})

test('tags are decoded, trimmed and cut to size', () => {
  const found = campaignFromAddress(`?utm_source=You%20Tube+Ads&utm_campaign=${'x'.repeat(400)}`, '/servicios/asilo')
  assert.equal(found.source, 'You Tube Ads')
  assert.equal(found.campaign.length, 150)
})

test('the form sent from another page, days later, still carries the campaign', () => {
  const storage = fakeStorage()
  const t0 = Date.UTC(2026, 10, 1)
  captureCampaign({ search: AD, path: '/servicios/daca', storage, now: t0 })
  // A later visit without tags (the contact page) leaves it alone.
  assert.equal(captureCampaign({ search: '', path: '/consulta', storage, now: t0 + 5000 }), null)
  assert.deepEqual(currentCampaign({ storage, now: t0 + 6 * 24 * 60 * 60 * 1000 }), {
    source: 'youtube', medium: 'paid_video', campaign: 'demand-gen-daca', content: 'sitelink-daca', landingPath: '/servicios/daca',
  })
})

test('a newer campaign link replaces an older one', () => {
  const storage = fakeStorage()
  const t0 = Date.UTC(2026, 10, 1)
  captureCampaign({ search: AD, path: '/servicios/daca', storage, now: t0 })
  captureCampaign({ search: '?utm_source=facebook&utm_campaign=vawa', path: '/servicios/vawa', storage, now: t0 + 1000 })
  assert.deepEqual(currentCampaign({ storage, now: t0 + 2000 }), { source: 'facebook', campaign: 'vawa', landingPath: '/servicios/vawa' })
})

test('after 30 days the campaign is forgotten', () => {
  const storage = fakeStorage()
  const t0 = Date.UTC(2026, 10, 1)
  captureCampaign({ search: AD, path: '/servicios/daca', storage, now: t0 })
  assert.ok(currentCampaign({ storage, now: t0 + KEEP_MS - 1 }), 'still there a moment before')
  assert.equal(currentCampaign({ storage, now: t0 + KEEP_MS }), null)
  assert.deepEqual(storage.data, {}, 'and removed from the browser')
})

test('with storage blocked the campaign still holds for this page load, and nothing throws', () => {
  const t0 = Date.UTC(2026, 10, 2)
  assert.doesNotThrow(() => captureCampaign({ search: '?utm_source=youtube&utm_campaign=blocked', path: '/servicios/tps', storage: blocked, now: t0 }))
  assert.deepEqual(currentCampaign({ storage: blocked, now: t0 + 1000 }), { source: 'youtube', campaign: 'blocked', landingPath: '/servicios/tps' })
  assert.equal(currentCampaign({ storage: blocked, now: t0 + KEEP_MS }), null)
})

test('what the browser stored is not trusted: junk is ignored', () => {
  const now = Date.UTC(2026, 10, 3) + KEEP_MS * 3
  for (const junk of ['not json', '42', '[]', '{"source":"youtube"}', JSON.stringify({ source: { a: 1 }, at: now })]) {
    assert.equal(currentCampaign({ storage: fakeStorage({ 'cm-campaign': junk }), now }), null, junk)
  }
})
