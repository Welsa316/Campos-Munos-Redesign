// Website alerts are skipped when email is not configured on the API service.
// That went unnoticed after the split into separate services, so the problem
// is now named on the Integrations page and in the log.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailConfigProblems, emailCard } from './utils/emailConfig.js'

const KEY = 're_live_1234567890abcdef'

test('names each missing variable', () => {
  assert.deepEqual(emailConfigProblems({}), ['RESEND_API_KEY is not set', 'ADMIN_EMAIL is not set'])
  assert.deepEqual(emailConfigProblems({ RESEND_API_KEY: KEY }), ['ADMIN_EMAIL is not set'])
  assert.deepEqual(emailConfigProblems({ ADMIN_EMAIL: 'office@camulaw.com', RESEND_API_KEY: '  ' }), ['RESEND_API_KEY is not set'])
})

test('the example placeholder key counts as missing', () => {
  assert.deepEqual(
    emailConfigProblems({ RESEND_API_KEY: 're_your_api_key_here', ADMIN_EMAIL: 'office@camulaw.com' }),
    ['RESEND_API_KEY is still the placeholder'],
  )
})

test('card: configuration error says alerts are not being sent', () => {
  const c = emailCard({ ADMIN_EMAIL: 'office@camulaw.com' })
  assert.equal(c.key, 'email')
  assert.equal(c.state, 'configuration_error')
  assert.match(c.detail, /alerts and inbox replies are not being sent/)
  assert.match(c.detail, /RESEND_API_KEY/)
})

test('card: configured names where alerts go and never carries the key', () => {
  const c = emailCard({ RESEND_API_KEY: KEY, ADMIN_EMAIL: ' office@camulaw.com ' })
  assert.equal(c.state, 'unverified')
  assert.match(c.detail, /go to office@camulaw\.com\./)
  assert.ok(!JSON.stringify(c).includes(KEY))
})
