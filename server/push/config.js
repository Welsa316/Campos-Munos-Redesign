// Web Push (VAPID) configuration, read from the environment on each call.
//
//   VAPID_PUBLIC_KEY   base64url, the P-256 public key (65 bytes decoded)
//   VAPID_PRIVATE_KEY  base64url, its private key (32 bytes decoded)
//   VAPID_SUBJECT      mailto:someone@camulaw.com or an https:// URL, sent to
//                      the push services so they can reach us about abuse
//
// Generate a pair once with `npx web-push generate-vapid-keys` and set all
// three on the API service only. The private key never leaves the server and
// is never committed. Changing the pair later invalidates every computer's
// subscription (each person clicks Enable notifications again).
//
// Without all three (or with a malformed one) push is reported as not
// configured: the setting says so, nothing is sent, nothing else is affected.

const decodedLength = (v) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(v)) return -1
  return Buffer.from(v, 'base64url').length
}

export function pushConfig(env = process.env) {
  const publicKey = (env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim()
  const subject = (env.VAPID_SUBJECT || '').trim()
  const problems = []
  if (!publicKey) problems.push('VAPID_PUBLIC_KEY is not set')
  else if (decodedLength(publicKey) !== 65) problems.push('VAPID_PUBLIC_KEY is not a base64url P-256 public key')
  if (!privateKey) problems.push('VAPID_PRIVATE_KEY is not set')
  else if (decodedLength(privateKey) !== 32) problems.push('VAPID_PRIVATE_KEY is not a base64url P-256 private key')
  if (!subject) problems.push('VAPID_SUBJECT is not set')
  else if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) problems.push('VAPID_SUBJECT must be a mailto: address or an https:// URL')
  if (problems.length) return { configured: false, problems, publicKey: null }
  return { configured: true, problems: [], publicKey, vapidDetails: { subject, publicKey, privateKey } }
}
