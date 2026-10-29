import jwt from 'jsonwebtoken'
import getPool from '../db/pool.js'
import { loadAccount, tokenMatches } from '../auth/account.js'

export default async function requireAuth(req, res, next) {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // Confirm the account still exists, is enabled, and the token version
    // matches the current one, so a password change or a sign-out-everywhere
    // invalidates older sessions.
    const account = await loadAccount(getPool(), decoded.id)
    if (!account) {
      return res.status(401).json({ error: 'Account no longer exists' })
    }
    if (account.disabled) {
      return res.status(401).json({ error: 'This account is disabled' })
    }
    if (!tokenMatches(decoded, account)) {
      return res.status(401).json({ error: 'Session expired, please sign in again' })
    }
    req.admin = decoded
    // Role and capabilities come from the database on every request, not from
    // the token, so a change takes effect immediately.
    req.adminRole = account.role
    req.account = account
    req.capabilities = account.capabilities
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
