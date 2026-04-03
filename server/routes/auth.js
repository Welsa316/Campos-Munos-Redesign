import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import getPool from '../db/pool.js'
import validate from '../middleware/validate.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
}

router.post(
  '/login',
  loginLimiter,
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body
      const result = await getPool().query(
        'SELECT id, email, password_hash FROM admin_users WHERE email = $1',
        [email]
      )

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const admin = result.rows[0]
      const valid = await bcrypt.compare(password, admin.password_hash)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' })
      }

      const token = jwt.sign(
        { id: admin.id, email: admin.email },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )

      res.cookie('token', token, COOKIE_OPTIONS)
      res.json({ authenticated: true, email: admin.email })
    } catch (err) {
      console.error('Login error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.post('/logout', (req, res) => {
  const { maxAge, ...clearOptions } = COOKIE_OPTIONS
  res.clearCookie('token', clearOptions)
  res.json({ ok: true })
})

router.get('/verify', (req, res) => {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ authenticated: false })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    res.json({ authenticated: true, email: decoded.email })
  } catch {
    return res.status(401).json({ authenticated: false })
  }
})

export default router
