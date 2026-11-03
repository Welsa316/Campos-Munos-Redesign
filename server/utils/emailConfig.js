// Whether the API can send the firm's email (website alerts to the office,
// inbox replies to clients). Both depend on variables set on the API service
// itself; a missing one used to mean alerts were skipped without a trace,
// which is how they stopped after the site, portal and API became separate
// services. Never returns the key.

const PLACEHOLDER = /your_api_key/i

/** Names of the variables that stop email from working, in the order to fix them. */
export function emailConfigProblems(env = process.env) {
  const problems = []
  const key = (env.RESEND_API_KEY || '').trim()
  if (!key) problems.push('RESEND_API_KEY is not set')
  else if (PLACEHOLDER.test(key)) problems.push('RESEND_API_KEY is still the placeholder')
  if (!(env.ADMIN_EMAIL || '').trim()) problems.push('ADMIN_EMAIL is not set')
  return problems
}

export const emailConfigured = (env = process.env) => emailConfigProblems(env).length === 0

/** The Integrations card for email. */
export function emailCard(env = process.env) {
  const problems = emailConfigProblems(env)
  if (problems.length) {
    return {
      key: 'email', name: 'Email (Resend)', state: 'configuration_error',
      detail: `Website alerts and inbox replies are not being sent: ${problems.join('; ')} on the API service.`,
    }
  }
  return {
    key: 'email', name: 'Email (Resend)', state: 'unverified',
    detail: `Website alerts go to ${env.ADMIN_EMAIL.trim()}. Send a test message from the website to confirm it arrives.`,
  }
}

export default { emailConfigProblems, emailConfigured, emailCard }
