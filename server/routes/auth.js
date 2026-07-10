import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import getPool from '../db/pool.js'
import validate from '../middleware/validate.js'
import requireAuth from '../middleware/auth.js'

const router = Router()

// A valid bcrypt hash compared against only when the submitted email is unknown,
// so login response time is the same whether or not an account exists. Without
// this, an early return on "no such email" skips bcrypt.compare and leaks
// account existence via timing. Computed once at boot.
const DUMMY_HASH = bcrypt.hashSync('cm-login-timing-guard', 12)

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password change attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Lax, not None: the SPA and API share an origin (one Railway service), so the
  // cookie doesn't need to travel cross-site. None would leave the body-less
  // POST /logout forgeable cross-site (logout-CSRF) for no benefit.
  sameSite: 'lax',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
}

router.post(
  '/login',
  loginLimiter,
  // Do NOT normalizeEmail() here: it lowercases and strips Gmail dots/+tags, but
  // the admin row is stored verbatim from ADMIN_EMAIL, so a normalized login value
  // could never match. We match case-insensitively in the query instead.
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
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
      if (!admin || !valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const token = jwt.sign(
        { id: admin.id, email: admin.email, tv: admin.token_version },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )

      res.cookie('token', token, COOKIE_OPTIONS)
      res.json({ authenticated: true, email: admin.email })
    } catch (err) {
      req.log.error({ err: err }, 'Login error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.post('/logout', (req, res) => {
  const { maxAge, ...clearOptions } = COOKIE_OPTIONS
  res.clearCookie('token', clearOptions)
  res.json({ ok: true })
})

router.post(
  '/change-password',
  passwordChangeLimiter,
  requireAuth,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 10, max: 200 }).withMessage('New password must be at least 10 characters'),
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
      const newToken = jwt.sign(
        { id: adminId, email: updated.rows[0].email, tv: updated.rows[0].token_version },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )
      res.cookie('token', newToken, COOKIE_OPTIONS)

      res.json({ ok: true })
    } catch (err) {
      req.log.error({ err: err }, 'Change password error')
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // Mirror requireAuth: confirm the admin still exists and the token version
    // matches, so a password change (which bumps token_version) invalidates
    // older sessions here too instead of passing on signature alone.
    const result = await getPool().query(
      'SELECT id, email, token_version FROM admin_users WHERE id = $1',
      [decoded.id]
    )
    if (result.rows.length === 0) {
      return res.status(401).json({ authenticated: false })
    }
    // Tokens issued before token_version existed carry no `tv` claim — treat
    // them as version 1, the schema default.
    const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 1
    if (tokenVersion !== result.rows[0].token_version) {
      return res.status(401).json({ authenticated: false })
    }
    res.json({ authenticated: true, email: result.rows[0].email })
  } catch {
    return res.status(401).json({ authenticated: false })
  }
})

export default router
