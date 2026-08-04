// Staff alerts must never be sent from the mailbox they're delivered to —
// Gmail files self-addressed mail as spam, which is why office@camulaw.com was
// showing "delivered" in Resend while the inbox stayed empty.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNotifyFrom } from './routes/submissions.js'

test('uses a different sender when From would equal the recipient', () => {
  assert.equal(
    resolveNotifyFrom('office@camulaw.com', 'office@camulaw.com', undefined),
    'website@camulaw.com'
  )
})

test('collision check ignores case and surrounding whitespace', () => {
  assert.equal(resolveNotifyFrom('Office@Camulaw.com', 'office@camulaw.com ', undefined), 'website@camulaw.com')
})

test('leaves the sender alone when it already differs from the recipient', () => {
  assert.equal(
    resolveNotifyFrom('noreply@camulaw.com', 'office@camulaw.com', undefined),
    'noreply@camulaw.com'
  )
})

test('an explicit override always wins', () => {
  assert.equal(
    resolveNotifyFrom('office@camulaw.com', 'office@camulaw.com', 'alerts@camulaw.com'),
    'alerts@camulaw.com'
  )
})

test('degrades safely on missing or malformed input', () => {
  assert.equal(resolveNotifyFrom('office@camulaw.com', '', undefined), 'office@camulaw.com')
  assert.equal(resolveNotifyFrom('office@camulaw.com', undefined, undefined), 'office@camulaw.com')
  // No domain to build a replacement from — better to send than to crash.
  assert.equal(resolveNotifyFrom('malformed', 'malformed', undefined), 'malformed')
})
