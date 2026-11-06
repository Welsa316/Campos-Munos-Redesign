import { Router } from 'express'
import bcrypt from 'bcrypt'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import getPool from '../db/pool.js'
import validate from '../middleware/validate.js'
import requireAuth from '../middleware/auth.js'
import { clientKey, sessionCookieOptions } from '../httpSecurity.js'
import { loadAccount, profileJson } from '../auth/account.js'
import { signSession, verifySession, revokeSession } from '../auth/session.js'
import { PASSWORD_MAX_BYTES } from '../auth/team.js'
import { parseAvatar, AVATAR_COLORS } from '../auth/avatars.js'
import { THEMES } from '../auth/themes.js'
import { audit } from '../billing/audit.js'

const router = Router()

// A valid bcrypt hash compared against only when the submitted email is unknown,
// so login response time is the same whether or not an account exists. Without
// this, an early return on "no such email" skips bcrypt.compare and leaks
// account existence via timing. Computed once at boot.
const DUMMY_HASH = bcrypt.hashSync('cm-login-timing-guard', 12)

// The office signs in from one shared address, so only failures count:
// a morning of everyone signing in must not lock the office out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// Failures against one account, from any number of addresses. Keyed on the
// submitted email as typed (trimmed, lowercased), whether or not it exists.
const loginEmailKey = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  return email ? `email:${email}` : clientKey(req)
}

const loginEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginEmailKey,
})

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Too many password change attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// httpOnly, Lax (portal and API are same-site, so it travels; nothing
// cross-site can carry it), host-only on the API. See sessionCookieOptions().
const cookieOptions = (opts) => sessionCookieOptions(process.env, opts)

router.post(
  '/login',
  loginLimiter,
  loginEmailLimiter,
  // Do NOT normalizeEmail() here: it lowercases and strips Gmail dots/+tags, but
  // the admin row is stored verbatim from ADMIN_EMAIL, so a normalized login value
  // could never match. We match case-insensitively in the query instead.
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  body('remember').optional().isBoolean({ strict: true }).withMessage('remember must be true or false'),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body
      const result = await getPool().query(
        'SELECT id, email, password_hash, token_version FROM admin_users WHERE LOWER(email) = LOWER($1)',
        [email]
      )

      // Always run a bcrypt comparison — against DUMMY_HASH when the email is
      // unknown — so response timing doesn't reveal whether the account exists.
      const admin = result.rows[0]
      const valid = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH)
      // The activity log names the account only once the password is right.
      if (admin && valid) req.activityActor = await loadAccount(getPool(), admin.id)
      if (!admin || !valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      // Only someone who knows the password learns the account is disabled.
      const account = await loadAccount(getPool(), admin.id)
      if (!account || account.disabled) {
        return res.status(403).json({ error: 'This account is disabled. Ask the office administrator.' })
      }

      const remember = req.body.remember === true
      const token = signSession({ id: admin.id, email: admin.email, tokenVersion: admin.token_version, remember })

      res.cookie('token', token, cookieOptions({ remember }))
      res.json(profileJson(account))
    } catch (err) {
      req.log.error({ err: err }, 'Login error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.post('/logout', async (req, res) => {
  // The token itself stops working, not just the cookie: a copy taken before
  // sign-out would otherwise stay valid for the rest of its 8 hours.
  try {
    const session = await verifySession(getPool(), req.cookies?.token || '')
    // For the activity log: whose session this was, if it still is one.
    if (session.ok) {
      req.activityActor = session.account
      await revokeSession(getPool(), session.decoded)
    }
  } catch (err) {
    req.log?.error({ err }, 'Logout could not revoke the session')
  }
  const { maxAge, ...clearOptions } = cookieOptions()
  res.clearCookie('token', clearOptions)
  res.json({ ok: true })
})

router.post(
  '/change-password',
  passwordChangeLimiter,
  requireAuth,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 10 }).withMessage('New password must be at least 10 characters'),
  // bcrypt reads only the first 72 bytes; anything after would be ignored.
  body('newPassword').custom((v) => Buffer.byteLength(String(v), 'utf8') <= PASSWORD_MAX_BYTES)
    .withMessage('New password must be at most 72 characters (accented letters count as two)'),
  validate,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body
      const adminId = req.admin.id

      const result = await getPool().query(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [adminId]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' })
      }

      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash)
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' })
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from current password' })
      }

      const newHash = await bcrypt.hash(newPassword, 12)
      // Bump token_version so any other active sessions are invalidated immediately.
      const updated = await getPool().query(
        'UPDATE admin_users SET password_hash = $1, password_updated_at = NOW(), token_version = token_version + 1 WHERE id = $2 RETURNING token_version, email',
        [newHash, adminId]
      )

      // Re-issue this session's cookie with the new token_version so the admin stays logged in.
      // Kept signed in stays kept signed in.
      const remember = req.admin?.rm === true
      const newToken = signSession({ id: adminId, email: updated.rows[0].email, tokenVersion: updated.rows[0].token_version, remember })
      res.cookie('token', newToken, cookieOptions({ remember }))

      res.json({ ok: true })
    } catch (err) {
      req.log.error({ err: err }, 'Change password error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Any signed-in account sets its own profile picture (no capability needed).
// Only catalogue values are accepted (server/auth/avatars.js).
router.put(
  '/avatar',
  requireAuth,
  body('avatar').custom((v) => Boolean(parseAvatar(v))).withMessage('Choose one of the pictures offered'),
  body('bg').isIn(AVATAR_COLORS).withMessage('Choose one of the colours offered'),
  validate,
  async (req, res) => {
    try {
      await getPool().query('UPDATE admin_users SET avatar = $2, avatar_bg = $3 WHERE id = $1', [req.account.id, req.body.avatar, req.body.bg])
      await audit(getPool(), { actorId: req.account.id, action: 'admin_user.avatar_changed', entityType: 'admin_user', entityId: req.account.id, details: { kind: parseAvatar(req.body.avatar).kind } })
      const account = await loadAccount(getPool(), req.account.id)
      res.json(profileJson(account))
    } catch (err) {
      req.log?.error({ err }, 'Avatar update error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Any signed-in account sets its own colour theme; it follows the person to
// any computer they sign in on. Not audited: it changes nothing but colours.
router.put(
  '/theme',
  requireAuth,
  body('theme').isIn(THEMES).withMessage('Choose one of the themes offered'),
  validate,
  async (req, res) => {
    try {
      await getPool().query('UPDATE admin_users SET theme = $2 WHERE id = $1', [req.account.id, req.body.theme])
      res.json({ theme: req.body.theme })
    } catch (err) {
      req.log?.error({ err }, 'Theme update error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.get('/verify', async (req, res) => {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ authenticated: false })
  }

  try {
    // The same checks as requireAuth (server/auth/session.js), so a password
    // change or a sign-out ends the session here too instead of passing on
    // signature alone.
    const session = await verifySession(getPool(), token)
    if (!session.ok) {
      return res.status(401).json({ authenticated: false })
    }
    // The portal draws its navigation from these capabilities; the API
    // enforces them on every route regardless.
    res.json(profileJson(session.account))
  } catch {
    return res.status(401).json({ authenticated: false })
  }
})

export default router
