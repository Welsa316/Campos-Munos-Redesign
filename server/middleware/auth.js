import getPool from '../db/pool.js'
import { verifySession } from '../auth/session.js'

// Confirm the account still exists, is enabled, the token version matches
// the current one (a password change or a sign-out-everywhere invalidates
// older sessions) and this session was not signed out.
const REFUSALS = {
  invalid: 'Invalid or expired token',
  missing_account: 'Account no longer exists',
  disabled: 'This account is disabled',
  stale: 'Session expired, please sign in again',
  revoked: 'Session expired, please sign in again',
}

export default async function requireAuth(req, res, next) {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  let session
  try {
    session = await verifySession(getPool(), token)
  } catch {
    return res.status(401).json({ error: REFUSALS.invalid })
  }
  if (!session.ok) {
    return res.status(401).json({ error: REFUSALS[session.reason] || REFUSALS.invalid })
  }
  const { decoded, account } = session
  req.admin = decoded
  // Role and capabilities come from the database on every request, not from
  // the token, so a change takes effect immediately.
  req.adminRole = account.role
  req.account = account
  req.capabilities = account.capabilities
  next()
}
