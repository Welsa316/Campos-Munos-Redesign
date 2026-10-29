// The site's CSP must let the tags in index.html actually report. Every host
// below was refused by the browser on the live policy (DevTools console on
// /consulta, 2026-10-29), which silently dropped Google Ads conversions and
// remarketing (AW-16893588137) and the OpenAI pixel's configuration fetch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SITE_CSP } from './app.js'

const d = SITE_CSP.directives
const allows = (directive, host) => d[directive].includes(host)

test('Google Ads conversion + remarketing endpoints are allowed', () => {
  for (const host of ['https://www.google.com', 'https://google.com', 'https://googleads.g.doubleclick.net', 'https://ad.doubleclick.net', 'https://www.googleadservices.com']) {
    assert.ok(allows('connect-src', host), `connect-src ${host}`)
  }
  for (const host of ['https://www.google.com', 'https://googleads.g.doubleclick.net', 'https://ad.doubleclick.net']) {
    assert.ok(allows('img-src', host), `img-src ${host}`)
  }
  for (const host of ['https://googleads.g.doubleclick.net', 'https://www.googleadservices.com']) {
    assert.ok(allows('script-src-elem', host), `script-src-elem ${host}`)
    assert.ok(allows('script-src', host), `script-src ${host}`)
  }
  assert.ok(allows('frame-src', 'https://td.doubleclick.net'), 'frame-src td.doubleclick.net (Google Ads conversion iframe)')
})

test('the OpenAI pixel can fetch its configuration', () => {
  assert.ok(allows('connect-src', 'https://bzrcdn.openai.com'))
  assert.ok(allows('connect-src', 'https://bzr.openai.com'))
})

test('Google Maps framing stays path-scoped', () => {
  assert.ok(!allows('frame-src', 'https://www.google.com'), 'all of google.com must not become frameable')
  assert.ok(allows('frame-src', 'https://www.google.com/maps/'))
})
