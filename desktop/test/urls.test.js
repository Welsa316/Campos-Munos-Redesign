'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveConfig, isPortalUrl, externalUrl, portalPathUrl, isReloadShortcut } = require('../src/urls')

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

test('an installed app ignores the environment overrides', () => {
  const env = { CM_PORTAL_URL: 'http://evil.example', CM_API_URL: 'https://api.evil.example' }
  assert.deepEqual(
    resolveConfig(env, { allowOverrides: false }),
    { portalOrigin: PORTAL, apiOrigin: 'https://api.camulaw.com' },
  )
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

test('links to this computer or the office network are not opened', () => {
  for (const bad of [
    'https://localhost/', 'https://app.localhost/', 'https://printer.local/', 'https://router.home.arpa/', 'https://db.internal/',
    'https://127.0.0.1/', 'https://10.0.0.5/', 'https://172.16.0.1/', 'https://172.31.255.1/', 'https://192.168.1.1/admin',
    'https://169.254.169.254/latest/meta-data', 'https://0.0.0.0/', 'https://100.64.0.1/',
    'https://[::1]/', 'https://[fe80::1]/', 'https://[fd00::1]/', 'https://[::ffff:127.0.0.1]/', 'https://localhost./',
  ]) {
    assert.equal(externalUrl(bad), null, bad)
  }
  // Public addresses, and names that only look similar, still open.
  for (const ok of ['https://172.32.0.1/', 'https://8.8.8.8/', 'https://localhost.camulaw.com/', 'https://local.example.com/']) {
    assert.equal(externalUrl(ok), ok, ok)
  }
})

test('a mailto link loses any attachment but keeps its subject and body', () => {
  assert.equal(
    externalUrl('mailto:office@camulaw.com?subject=Hola&attach=/etc/passwd&body=Gracias&Attachment=C:%5Cx&file=~/.ssh/id_rsa'),
    'mailto:office@camulaw.com?subject=Hola&body=Gracias',
  )
  assert.equal(externalUrl('mailto:office@camulaw.com?attach=/etc/passwd'), 'mailto:office@camulaw.com')
})

test('notification paths stay on the portal', () => {
  assert.equal(portalPathUrl('/calls', PORTAL), 'https://admin.camulaw.com/calls')
  assert.equal(portalPathUrl('/inbox?lead=12', PORTAL), 'https://admin.camulaw.com/inbox?lead=12')
  for (const bad of ['//evil.com/x', '/.//evil.com', '/a/..//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'calls', '', null, 42, '/' + 'a'.repeat(600)]) {
    assert.equal(portalPathUrl(bad, PORTAL), null, JSON.stringify(bad))
  }
})

test('the browser reload keys do nothing in the app; ordinary typing still does', () => {
  const key = (k, mods = {}) => ({ type: 'keyDown', key: k, ...mods })
  assert.equal(isReloadShortcut(key('r', { meta: true })), true, 'Cmd+R')
  assert.equal(isReloadShortcut(key('R', { meta: true, shift: true })), true, 'Cmd+Shift+R')
  assert.equal(isReloadShortcut(key('r', { control: true })), true, 'Ctrl+R on Windows')
  assert.equal(isReloadShortcut(key('F5')), true)
  assert.equal(isReloadShortcut(key('r')), false, 'typing r')
  assert.equal(isReloadShortcut(key('R', { shift: true })), false, 'typing R')
  assert.equal(isReloadShortcut(key('r', { meta: true, alt: true })), false)
  assert.equal(isReloadShortcut({ type: 'keyUp', key: 'r', meta: true }), false)
})
