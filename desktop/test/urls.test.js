'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveConfig, isPortalUrl, externalUrl, portalPathUrl } = require('../src/urls')

const PORTAL = 'https://admin.camulaw.com'

test('config defaults to production and accepts local overrides', () => {
  assert.deepEqual(resolveConfig({}), { portalOrigin: PORTAL, apiOrigin: 'https://api.camulaw.com' })
  assert.deepEqual(
    resolveConfig({ CM_PORTAL_URL: 'http://localhost:5420/', CM_API_URL: 'http://localhost:3410' }),
    { portalOrigin: 'http://localhost:5420', apiOrigin: 'http://localhost:3410' },
  )
  // A junk or non-web override falls back instead of loading something odd.
  assert.equal(resolveConfig({ CM_PORTAL_URL: 'file:///etc/passwd' }).portalOrigin, PORTAL)
  assert.equal(resolveConfig({ CM_PORTAL_URL: 'not a url' }).portalOrigin, PORTAL)
})

test('only the portal origin counts as in-app', () => {
  assert.equal(isPortalUrl('https://admin.camulaw.com/inbox?lead=1', PORTAL), true)
  assert.equal(isPortalUrl('https://admin.camulaw.com.evil.com/', PORTAL), false)
  assert.equal(isPortalUrl('http://admin.camulaw.com/', PORTAL), false)
  assert.equal(isPortalUrl('https://camulaw.com/', PORTAL), false)
  assert.equal(isPortalUrl('garbage', PORTAL), false)
})

test('external links: https, mailto and tel only', () => {
  assert.equal(externalUrl('https://camulaw.com/about'), 'https://camulaw.com/about')
  assert.equal(externalUrl('mailto:office@camulaw.com'), 'mailto:office@camulaw.com')
  assert.equal(externalUrl('tel:+15045551234'), 'tel:+15045551234')
  for (const bad of ['http://camulaw.com', 'file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share', 'ms-settings:', 'data:text/html,x', '', null]) {
    assert.equal(externalUrl(bad), null, String(bad))
  }
})

test('notification paths stay on the portal', () => {
  assert.equal(portalPathUrl('/calls', PORTAL), 'https://admin.camulaw.com/calls')
  assert.equal(portalPathUrl('/inbox?lead=12', PORTAL), 'https://admin.camulaw.com/inbox?lead=12')
  for (const bad of ['//evil.com/x', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'calls', '', null, 42, '/' + 'a'.repeat(600)]) {
    assert.equal(portalPathUrl(bad, PORTAL), null, JSON.stringify(bad))
  }
})
