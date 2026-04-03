import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { body, param } from 'express-validator'
import { Resend } from 'resend'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import validate from '../middleware/validate.js'
import { stripHtml, escapeHtml, escapeCsvField } from '../utils/sanitize.js'

const router = Router()

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Public — contact form submission
router.post(
  '/',
  submitLimiter,
  body('firstName').trim().notEmpty().isLength({ max: 255 }).withMessage('First name is required (max 255 chars)'),
  body('lastName').trim().notEmpty().isLength({ max: 255 }).withMessage('Last name is required (max 255 chars)'),
  body('email').isEmail().normalizeEmail().isLength({ max: 255 }).withMessage('Valid email required'),
  body('phone').trim().notEmpty().isLength({ max: 50 }).matches(/^[0-9+\-() ]+$/).withMessage('Valid phone number required'),
  body('message').trim().notEmpty().isLength({ max: 5000 }).withMessage('Message is required (max 5000 chars)'),
  validate,
  async (req, res) => {
    try {
      const firstName = stripHtml(req.body.firstName)
      const lastName = stripHtml(req.body.lastName)
      const email = req.body.email
      const phone = stripHtml(req.body.phone)
      const message = stripHtml(req.body.message)

      const result = await getPool().query(
        `INSERT INTO submissions (first_name, last_name, email, phone, message) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [firstName, lastName, email, phone, message]
      )

      res.status(201).json({ id: result.rows[0].id, created_at: result.rows[0].created_at })

      // Notify admin via email (fire and forget)
      try {
        const adminEmail = process.env.ADMIN_EMAIL
        if (adminEmail && process.env.RESEND_API_KEY) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'contact@camulaw.com',
            to: adminEmail,
            subject: `New inquiry from ${firstName} ${lastName}`,
            html: `
              <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
                  <h2 style="margin: 0; color: #003F8D; font-size: 20px;">New Contact Form Submission</h2>
                </div>
                <p style="font-size: 15px; line-height: 1.6;"><strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong> submitted a new inquiry.</p>
                <table style="font-size: 14px; line-height: 1.6; margin: 16px 0;">
                  <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Email:</td><td>${escapeHtml(email)}</td></tr>
                  <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Phone:</td><td>${escapeHtml(phone)}</td></tr>
                </table>
                <div style="background: #f0f2f7; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
                <p style="font-size: 12px; color: #6b7280;">Log in to the admin dashboard to reply.</p>
              </div>
            `,
          })
        }
      } catch (notifyErr) {
        console.error('Admin notification email failed:', notifyErr)
      }
    } catch (err) {
      console.error('Submission error:', err)
      res.status(500).json({ error: 'Failed to submit. Please try again.' })
    }
  }
)

// Admin — list submissions
router.get('/', requireAuth, async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true'
    const archived = req.query.archived === 'true'
    const conditions = []
    const params = []

    params.push(archived)
    conditions.push(`is_archived = $${params.length}`)

    if (unreadOnly) {
      conditions.push('is_read = false')
    }

    const where = ` WHERE ${conditions.join(' AND ')}`
    const query = `SELECT id, first_name, last_name, email, phone, message, is_read, is_archived, created_at FROM submissions${where} ORDER BY created_at DESC`

    const result = await getPool().query(query, params)
    res.json(result.rows)
  } catch (err) {
    console.error('List submissions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin — get single submission with replies
router.get(
  '/:id',
  requireAuth,
  param('id').isInt().withMessage('Invalid submission ID'),
  validate,
  async (req, res) => {
    try {
      const [submissionResult, repliesResult] = await Promise.all([
        getPool().query(
          'SELECT id, first_name, last_name, email, phone, message, is_read, is_archived, created_at FROM submissions WHERE id = $1',
          [req.params.id]
        ),
        getPool().query(
          'SELECT id, body, sent_at FROM replies WHERE submission_id = $1 ORDER BY sent_at ASC',
          [req.params.id]
        ),
      ])

      if (submissionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      res.json({
        ...submissionResult.rows[0],
        replies: repliesResult.rows,
      })
    } catch (err) {
      console.error('Get submission error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — mark as read
router.patch(
  '/:id/read',
  requireAuth,
  param('id').isInt().withMessage('Invalid submission ID'),
  validate,
  async (req, res) => {
    try {
      const result = await getPool().query(
        'UPDATE submissions SET is_read = true WHERE id = $1 RETURNING id, is_read',
        [req.params.id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      res.json(result.rows[0])
    } catch (err) {
      console.error('Mark read error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — archive/unarchive submission
router.patch(
  '/:id/archive',
  requireAuth,
  param('id').isInt().withMessage('Invalid submission ID'),
  validate,
  async (req, res) => {
    try {
      const result = await getPool().query(
        'UPDATE submissions SET is_archived = NOT is_archived WHERE id = $1 RETURNING id, is_archived',
        [req.params.id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      res.json(result.rows[0])
    } catch (err) {
      console.error('Archive error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — export submissions as CSV
router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const result = await getPool().query(
      'SELECT first_name, last_name, email, phone, message, is_read, is_archived, created_at FROM submissions ORDER BY created_at DESC'
    )

    const header = 'First Name,Last Name,Email,Phone,Message,Read,Archived,Submitted\n'
    const rows = result.rows.map(r => {
      const date = new Date(r.created_at).toISOString()
      return `${escapeCsvField(r.first_name)},${escapeCsvField(r.last_name)},${escapeCsvField(r.email)},${escapeCsvField(r.phone)},${escapeCsvField(r.message)},${r.is_read},${r.is_archived},"${date}"`
    }).join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(header + rows)
  } catch (err) {
    console.error('CSV export error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin — reply to submission
router.post(
  '/:id/reply',
  requireAuth,
  param('id').isInt().withMessage('Invalid submission ID'),
  body('body').trim().notEmpty().isLength({ max: 10000 }).withMessage('Reply body is required (max 10000 chars)'),
  validate,
  async (req, res) => {
    try {
      // Fetch submission for recipient info
      const subResult = await getPool().query(
        'SELECT id, first_name, last_name, email, created_at FROM submissions WHERE id = $1',
        [req.params.id]
      )

      if (subResult.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      const submission = subResult.rows[0]
      const replyBody = stripHtml(req.body.body)

      // Save reply to DB first
      const replyResult = await getPool().query(
        'INSERT INTO replies (submission_id, body) VALUES ($1, $2) RETURNING id, body, sent_at',
        [submission.id, replyBody]
      )

      const reply = replyResult.rows[0]
      let emailFailed = false

      // Send email via Resend
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const submittedDate = new Date(submission.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'contact@camulaw.com',
          to: submission.email,
          subject: `Re: Your inquiry — Campos Muños Law`,
          html: `
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
              <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
                <h2 style="margin: 0; color: #003F8D; font-size: 20px;">Campos Muños Law</h2>
              </div>
              <p style="font-size: 15px; line-height: 1.6;">Dear ${escapeHtml(submission.first_name)},</p>
              <div style="font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(replyBody)}</div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
              <p style="font-size: 12px; color: #6b7280; line-height: 1.5;">
                This is a reply to your inquiry submitted on ${submittedDate}.<br/>
                Please do not reply to this email. To contact us, call (504) 910-6508 or visit our website.
              </p>
            </div>
          `,
        })
      } catch (emailErr) {
        console.error('Resend email failed:', emailErr)
        emailFailed = true
      }

      res.status(201).json({ ...reply, emailFailed })
    } catch (err) {
      console.error('Reply error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router
