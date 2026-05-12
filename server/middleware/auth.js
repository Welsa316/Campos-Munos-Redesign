import jwt from 'jsonwebtoken'
import getPool from '../db/pool.js'

export default async function requireAuth(req, res, next) {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // Confirm the admin still exists and the token version matches the current one.
    // This lets a password change invalidate all older sessions.
    const result = await getPool().query(
      'SELECT id, email, token_version FROM admin_users WHERE id = $1',
      [decoded.id]
    )
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists' })
    }
    // Tokens issued before token_version existed don't carry a `tv` claim — treat
    // them as version 1, the schema default. After the admin rotates their
    // password (which bumps token_version), the comparison will fail for those
    // older tokens and the user will be forced to sign back in.
    const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 1
    if (tokenVersion !== result.rows[0].token_version) {
      return res.status(401).json({ error: 'Session expired, please sign in again' })
    }
    req.admin = decoded
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
