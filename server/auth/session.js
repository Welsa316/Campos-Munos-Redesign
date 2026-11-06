// The staff session cookie: one signed JWT per sign-in. Every place that
// issues or reads one goes through here so the algorithm is pinned and the
// checks (account exists, enabled, token version, not signed out) are the
// same everywhere.
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { loadAccount, tokenMatches } from './account.js'

const ALGORITHM = 'HS256'
export const SESSION_TTL = '8h'

/** A new session token. The jti lets a sign-out revoke this one session only. */
export function signSession({ id, email, tokenVersion }, secret = process.env.JWT_SECRET) {
  return jwt.sign({ id, email, tv: tokenVersion }, secret, {
    algorithm: ALGORITHM,
    expiresIn: SESSION_TTL,
    jwtid: crypto.randomUUID(),
  })
}

/** The verified claims, or null. Only HS256 is accepted. */
export function decodeSession(token, secret = process.env.JWT_SECRET) {
  if (!token || !secret) return null
  try {
    return jwt.verify(token, secret, { algorithms: [ALGORITHM] })
  } catch {
    return null
  }
}

async function isRevoked(db, jti) {
  if (!jti) return false
  const { rowCount } = await db.query('SELECT 1 FROM revoked_sessions WHERE jti = $1', [String(jti)])
  return rowCount > 0
}

/**
 * Check a session token against the database.
 * Returns { ok: true, decoded, account } or { ok: false, reason } where reason
 * is one of 'invalid', 'missing_account', 'disabled', 'stale', 'revoked'.
 */
export async function verifySession(db, token, secret = process.env.JWT_SECRET) {
  const decoded = decodeSession(token, secret)
  if (!decoded) return { ok: false, reason: 'invalid' }
  const [account, revoked] = await Promise.all([loadAccount(db, decoded.id), isRevoked(db, decoded.jti)])
  if (!account) return { ok: false, reason: 'missing_account' }
  if (account.disabled) return { ok: false, reason: 'disabled' }
  if (!tokenMatches(decoded, account)) return { ok: false, reason: 'stale' }
  if (revoked) return { ok: false, reason: 'revoked' }
  return { ok: true, decoded, account }
}

/**
 * End one session. Tokens carry a jti, which is listed until the token would
 * have expired anyway. A token from before jtis existed can only be ended by
 * bumping the account's token version, which signs that account out
 * everywhere; those tokens are gone within 8 hours of the deploy.
 */
export async function revokeSession(db, decoded) {
  if (!decoded?.id) return
  if (decoded.jti) {
    const expiresAt = new Date((Number(decoded.exp) || Math.floor(Date.now() / 1000) + 8 * 3600) * 1000)
    await db.query(
      'INSERT INTO revoked_sessions (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING',
      [String(decoded.jti), expiresAt]
    )
    // Rows past their token's expiry prove nothing; clear them as we go.
    await db.query('DELETE FROM revoked_sessions WHERE expires_at < NOW()')
    return
  }
  const tv = typeof decoded.tv === 'number' ? decoded.tv : 1
  await db.query('UPDATE admin_users SET token_version = token_version + 1 WHERE id = $1 AND token_version = $2', [decoded.id, tv])
}
