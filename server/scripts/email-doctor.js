// Resend diagnostic. Sends ONE test email using the same env vars the app uses,
// and prints Resend's full response — including the real error when a send is
// rejected (the app otherwise logs it, but this is a fast, isolated check).
//
// Usage (locally, if your .env has the real key):
//   node scripts/email-doctor.js you@example.com
// Usage (against production, recommended — uses the Railway env):
//   railway run node scripts/email-doctor.js you@example.com
//
// If no recipient is given it sends to ADMIN_EMAIL.
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

import { Resend } from 'resend'

const mask = (v) => (v ? v.slice(0, 6) + '…(' + v.length + ' chars)' : '(not set)')
const isPlaceholder = (process.env.RESEND_API_KEY || '').includes('your_api_key')

const to = process.argv[2] || process.env.ADMIN_EMAIL
const from = process.env.RESEND_FROM_EMAIL || 'contact@camulaw.com'

console.log('\n=== Resend configuration ===')
console.log('  RESEND_API_KEY   :', mask(process.env.RESEND_API_KEY), isPlaceholder ? '  <-- STILL THE PLACEHOLDER' : '')
console.log('  RESEND_FROM_EMAIL:', from)
console.log('  ADMIN_EMAIL      :', process.env.ADMIN_EMAIL || '(not set)')
console.log('  sending test to  :', to || '(none — pass one as an argument)')

if (!process.env.RESEND_API_KEY || isPlaceholder) {
  console.error('\nRESEND_API_KEY is missing or still the placeholder. Set the real key first.\n')
  process.exit(1)
}
if (!to) {
  console.error('\nNo recipient. Pass one: node scripts/email-doctor.js you@example.com\n')
  process.exit(1)
}

const resend = new Resend(process.env.RESEND_API_KEY)
const { data, error } = await resend.emails.send({
  from,
  to,
  subject: 'Campos Muños — Resend test',
  html: '<p>If you can read this, Resend is configured correctly. ✅</p>',
})

if (error) {
  console.error('\n❌ Resend REJECTED the send. This is why no email arrives:')
  console.error(JSON.stringify(error, null, 2))
  console.error('\nMost common cause: the "from" domain is not verified in Resend.')
  console.error(`"${from}" requires the domain "${from.split('@')[1]}" to be added AND verified`)
  console.error('(DKIM/SPF DNS records) in the Resend dashboard. Until then Resend only lets')
  console.error('you send from onboarding@resend.dev to your own account email.\n')
  process.exit(1)
}

console.log('\n✅ Resend ACCEPTED the send. Message id:', data && data.id)
console.log('Check the inbox for', to, '(also the spam folder).\n')
