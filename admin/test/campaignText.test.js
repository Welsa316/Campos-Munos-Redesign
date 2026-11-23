// The campaign line on a lead (components/messages/campaignText.js): which
// ad link brought them, in the order staff read it, and nothing at all for
// the leads that did not come by one. Its labels exist in both languages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campaignRows, campaignLine } from '../src/components/messages/campaignText.js'
import { MESSAGES } from '../src/i18n/messages.js'

const lead = (extra = {}) => ({ id: 1, first_name: 'Rosa', utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, landing_path: null, ...extra })

test('a lead from a campaign link: where it came from, the campaign, the ad and the page', () => {
  const row = lead({ utm_source: 'youtube', utm_medium: 'paid_video', utm_campaign: 'demand-gen-daca', utm_content: 'sitelink-daca', landing_path: '/servicios/daca' })
  assert.deepEqual(campaignRows(row), [
    { key: 'from', value: 'youtube / paid_video' },
    { key: 'campaign', value: 'demand-gen-daca' },
    { key: 'ad', value: 'sitelink-daca' },
    { key: 'page', value: '/servicios/daca' },
  ])
  assert.equal(campaignLine(row), 'youtube / paid_video · demand-gen-daca · sitelink-daca · /servicios/daca')
})

test('most leads have no campaign link, and show nothing', () => {
  assert.deepEqual(campaignRows(lead()), [])
  assert.deepEqual(campaignRows(null), [])
  assert.deepEqual(campaignRows(undefined), [])
  // A page or an ad name alone attributes the lead to nothing.
  assert.deepEqual(campaignRows(lead({ utm_content: 'banner', landing_path: '/servicios/daca' })), [])
  assert.equal(campaignLine(lead()), '')
})

test('only what the link carried is shown', () => {
  assert.deepEqual(campaignRows(lead({ utm_campaign: 'radio-spot' })), [{ key: 'campaign', value: 'radio-spot' }])
  assert.deepEqual(campaignRows(lead({ utm_source: 'facebook', utm_term: 'abogado' })), [
    { key: 'from', value: 'facebook' },
    { key: 'keyword', value: 'abogado' },
  ])
})

test('every line has its label in English and Spanish', () => {
  for (const key of ['from', 'campaign', 'ad', 'keyword', 'page']) {
    assert.ok(MESSAGES.en[`campaign.${key}`], `campaign.${key} in English`)
    assert.ok(MESSAGES.es[`campaign.${key}`], `campaign.${key} in Spanish`)
  }
})
