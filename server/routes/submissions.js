import { Router } from 'express'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { body, param } from 'express-validator'
import { Resend } from 'resend'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import validate from '../middleware/validate.js'
import { stripHtml, escapeHtml, escapeCsvField } from '../utils/sanitize.js'

const router = Router()

// Sender identity for all outbound mail. The display name is what the client's
// inbox shows — without it, mail clients fall back to the address's local part
// ("office"), so replies looked like they came from "office" instead of the firm.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'contact@camulaw.com'
const FROM = `${process.env.RESEND_FROM_NAME || 'Campos Muños Law'} <${FROM_EMAIL}>`

const CONSULTATION_TYPES = [
  'greenCard', 'ciudadania', 'asilo', 'vawa', 'visaU', 'visaT', 'daca', 'tps',
  'tramiteConsular', 'visasPrometido', 'visasJovenes', 'peticionesFamiliares',
  'ead', 'defensaDeportacion', 'other',
]

// Country location validation — values are ISO 3166 alpha-2 codes from the
// frontend dropdown (site/src/data/countries.js). Accept any 2-letter
// uppercase code; we don't enumerate all 195 here, but the frontend dropdown
// is the only thing that can submit them in practice.
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const chatMessageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: { error: 'Too many chat messages. Please try again later.' },
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
  // Message is optional on the contact form but required for chat — a chat session without text is meaningless.
  body('message').if(body('source').equals('chat')).trim().notEmpty().withMessage('Message is required for chat'),
  body('message').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }).withMessage('Message too long (max 5000 chars)'),
  body('source').optional().isIn(['contact', 'chat']).withMessage('Invalid source'),
  body('consultationType').optional({ values: 'falsy' }).trim().isIn(CONSULTATION_TYPES).withMessage('Invalid consultation type'),
  body('location').optional({ values: 'falsy' }).trim().matches(COUNTRY_CODE_REGEX).withMessage('Invalid country'),
  validate,
  async (req, res) => {
    try {
      const firstName = stripHtml(req.body.firstName)
      const lastName = stripHtml(req.body.lastName)
      const email = req.body.email
      const phone = stripHtml(req.body.phone)
      // Optional fields on the contact form — coerce to the columns' NOT NULL defaults
      // ('' for message/location, 'other' for consultation_type per its CHECK constraint).
      const message = stripHtml(req.body.message || '')
      const source = req.body.source === 'chat' ? 'chat' : 'contact'
      const consultationType = req.body.consultationType || 'other'
      const location = stripHtml(req.body.location || '')
      const chatToken = source === 'chat' ? crypto.randomBytes(24).toString('base64url') : null

      const result = await getPool().query(
        `INSERT INTO submissions (first_name, last_name, email, phone, message, source, consultation_type, location, chat_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
        [firstName, lastName, email, phone, message, source, consultationType, location, chatToken]
      )

      // Return chat_token only when this is a chat session — the widget needs it to post follow-ups
      const responseBody = { id: result.rows[0].id, created_at: result.rows[0].created_at }
      if (chatToken) responseBody.chat_token = chatToken
      res.status(201).json(responseBody)

      // Notify admin via email (fire and forget)
      try {
        const adminEmail = process.env.ADMIN_EMAIL
        if (adminEmail && process.env.RESEND_API_KEY) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          const subjectPrefix = source === 'chat' ? 'New chat from' : 'New inquiry from'
          // Resend does NOT throw on API errors (unverified domain, bad key, etc.) —
          // it returns { error }. Check it, or the failure is silently swallowed.
          const { error: sendError } = await resend.emails.send({
            from: FROM,
            to: adminEmail,
            // Reply-To = the person who submitted, so hitting "Reply" in the
            // office inbox goes straight to the client, not back to our system.
            replyTo: email,
            subject: `${subjectPrefix} ${firstName} ${lastName}`,
            html: `
              <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
                  <h2 style="margin: 0; color: #003F8D; font-size: 20px;">New Contact Form Submission</h2>
                </div>
                <p style="font-size: 15px; line-height: 1.6;"><strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong> submitted a new inquiry.</p>
                <table style="font-size: 14px; line-height: 1.6; margin: 16px 0;">
                  <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Email:</td><td>${escapeHtml(email)}</td></tr>
                  <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Phone:</td><td>${escapeHtml(phone)}</td></tr>
                  <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Service:</td><td>${escapeHtml(consultationType)}</td></tr>
                  <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Location:</td><td>${escapeHtml(location)}</td></tr>
                </table>
                <div style="background: #f0f2f7; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message ? escapeHtml(message) : '<em style="color: #9ca3af;">(no message provided)</em>'}</div>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
                <p style="font-size: 12px; color: #6b7280;">Log in to the admin dashboard to reply.</p>
              </div>
            `,
          })
          if (sendError) req.log.error({ err: sendError }, 'Admin notification email rejected by Resend')
        }
      } catch (notifyErr) {
        req.log.error({ err: notifyErr }, 'Admin notification email failed')
      }
    } catch (err) {
      req.log.error({ err: err }, 'Submission error')
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

    const consultationType = req.query.consultationType
    if (consultationType && CONSULTATION_TYPES.includes(consultationType)) {
      params.push(consultationType)
      conditions.push(`consultation_type = $${params.length}`)
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    params.push(limit, offset)
    const limitClause = ` LIMIT $${params.length - 1} OFFSET $${params.length}`

    const where = ` WHERE ${conditions.join(' AND ')}`
    const query = `SELECT id, first_name, last_name, email, phone, message, is_read, is_archived, source, consultation_type, location, created_at FROM submissions${where} ORDER BY created_at DESC${limitClause}`

    const result = await getPool().query(query, params)
    res.json(result.rows)
  } catch (err) {
    req.log.error({ err: err }, 'List submissions error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin — get single submission with replies
router.get(
  '/:id',
  requireAuth,
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  validate,
  async (req, res) => {
    try {
      const [submissionResult, repliesResult, chatMessagesResult] = await Promise.all([
        getPool().query(
          'SELECT id, first_name, last_name, email, phone, message, is_read, is_archived, source, consultation_type, location, created_at FROM submissions WHERE id = $1',
          [req.params.id]
        ),
        getPool().query(
          'SELECT id, body, sent_at FROM replies WHERE submission_id = $1 ORDER BY sent_at ASC',
          [req.params.id]
        ),
        getPool().query(
          'SELECT id, body, sent_at FROM chat_messages WHERE submission_id = $1 ORDER BY sent_at ASC',
          [req.params.id]
        ),
      ])

      if (submissionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      res.json({
        ...submissionResult.rows[0],
        replies: repliesResult.rows,
        chat_messages: chatMessagesResult.rows,
      })
    } catch (err) {
      req.log.error({ err: err }, 'Get submission error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Public — append a follow-up chat message to an existing chat session
router.post(
  '/:id/chat-message',
  chatMessageLimiter,
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid session ID'),
  body('body').trim().notEmpty().isLength({ max: 5000 }).withMessage('Message is required (max 5000 chars)'),
  body('chatToken').isString().isLength({ min: 16, max: 64 }).withMessage('Valid chat token is required'),
  validate,
  async (req, res) => {
    const pool = getPool()
    let client
    try {
      client = await pool.connect()
      const submissionId = req.params.id
      const messageBody = stripHtml(req.body.body)
      const incomingToken = req.body.chatToken

      const subResult = await client.query(
        'SELECT id, first_name, last_name, email, chat_token FROM submissions WHERE id = $1 AND source = $2',
        [submissionId, 'chat']
      )

      if (subResult.rows.length === 0) {
        return res.status(404).json({ error: 'Chat session not found' })
      }

      const submission = subResult.rows[0]
      if (!submission.chat_token || submission.chat_token !== incomingToken) {
        return res.status(403).json({ error: 'Invalid chat session' })
      }

      // Wrap the INSERT + UPDATE so a partial failure can't leave the submission unread
      // without the new message present (or vice versa).
      await client.query('BEGIN')
      const result = await client.query(
        'INSERT INTO chat_messages (submission_id, body) VALUES ($1, $2) RETURNING id, body, sent_at',
        [submissionId, messageBody]
      )
      await client.query('UPDATE submissions SET is_read = FALSE WHERE id = $1', [submissionId])
      await client.query('COMMIT')

      res.status(201).json(result.rows[0])

      // Notify admin via email (fire and forget)
      try {
        const adminEmail = process.env.ADMIN_EMAIL
        if (adminEmail && process.env.RESEND_API_KEY) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          const { error: sendError } = await resend.emails.send({
            from: FROM,
            to: adminEmail,
            // Reply-To = the client, so the office can reply from its inbox directly.
            replyTo: submission.email,
            subject: `New chat message from ${submission.first_name} ${submission.last_name}`,
            html: `
              <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
                  <h2 style="margin: 0; color: #003F8D; font-size: 20px;">New Chat Message</h2>
                </div>
                <p style="font-size: 15px; line-height: 1.6;"><strong>${escapeHtml(submission.first_name)} ${escapeHtml(submission.last_name)}</strong> (${escapeHtml(submission.email)}) sent a new message in their chat.</p>
                <div style="background: #f0f2f7; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(messageBody)}</div>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
                <p style="font-size: 12px; color: #6b7280;">Log in to the admin dashboard to view the full thread.</p>
              </div>
            `,
          })
          if (sendError) req.log.error({ err: sendError }, 'Admin chat notification email rejected by Resend')
        }
      } catch (notifyErr) {
        req.log.error({ err: notifyErr }, 'Admin chat notification email failed')
      }
    } catch (err) {
      try { if (client) await client.query('ROLLBACK') } catch { /* ignore */ }
      req.log.error({ err: err }, 'Chat message error')
      res.status(500).json({ error: 'Failed to send message. Please try again.' })
    } finally {
      if (client) client.release()
    }
  }
)

// Admin — mark as read / unread. No body → mark read (the dashboard auto-calls
// this on open); an explicit { read: false } re-flags it as unread.
router.patch(
  '/:id/read',
  requireAuth,
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  body('read').optional().isBoolean({ strict: true }),
  validate,
  async (req, res) => {
    try {
      const read = typeof req.body?.read === 'boolean' ? req.body.read : true
      const result = await getPool().query(
        'UPDATE submissions SET is_read = $2 WHERE id = $1 RETURNING id, is_read',
        [req.params.id, read]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      res.json(result.rows[0])
    } catch (err) {
      req.log.error({ err: err }, 'Mark read error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — archive/unarchive submission. Accepts explicit `archived: boolean` to
// avoid the toggle race when the dashboard double-clicks or two tabs disagree.
router.patch(
  '/:id/archive',
  requireAuth,
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  body('archived').optional().isBoolean({ strict: true }),
  validate,
  async (req, res) => {
    try {
      const explicit = typeof req.body?.archived === 'boolean'
      const query = explicit
        ? 'UPDATE submissions SET is_archived = $2 WHERE id = $1 RETURNING id, is_archived'
        : 'UPDATE submissions SET is_archived = NOT is_archived WHERE id = $1 RETURNING id, is_archived'
      const params = explicit ? [req.params.id, req.body.archived] : [req.params.id]
      const result = await getPool().query(query, params)

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }

      res.json(result.rows[0])
    } catch (err) {
      req.log.error({ err: err }, 'Archive error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — export submissions as CSV. Streams rows directly from the DB cursor
// to the response, so a 50k-row inbox doesn't materialise the whole result set
// in memory before writing.
router.get('/export/csv', requireAuth, async (req, res) => {
  let client
  try {
    client = await getPool().connect()

    // pg's stream-result mode via the `rowMode: 'array'` + manual iteration
    // would need pg-query-stream; instead we batch with a server-side cursor.
    // Open the cursor and pull the FIRST batch before writing any response bytes:
    // if the DB errors here, we're still in the !headersSent branch and can return
    // a real 500, instead of a header-only CSV that looks like a successful export.
    await client.query('BEGIN')
    await client.query(
      `DECLARE submissions_csv_cursor CURSOR FOR
       SELECT first_name, last_name, email, phone, message, consultation_type, location, is_read, is_archived, created_at
       FROM submissions ORDER BY created_at DESC`
    )

    const BATCH = 500
    let batch = await client.query(`FETCH ${BATCH} FROM submissions_csv_cursor`)

    // First fetch succeeded — now commit to the response and stream.
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.write('First Name,Last Name,Email,Phone,Message,Service,Location,Read,Archived,Submitted\n')

    while (batch.rows.length > 0) {
      const chunk = batch.rows.map(r => {
        const date = new Date(r.created_at).toISOString()
        return `${escapeCsvField(r.first_name)},${escapeCsvField(r.last_name)},${escapeCsvField(r.email)},${escapeCsvField(r.phone)},${escapeCsvField(r.message)},${escapeCsvField(r.consultation_type)},${escapeCsvField(r.location)},${r.is_read},${r.is_archived},"${date}"`
      }).join('\n')
      res.write(chunk + '\n')
      if (batch.rows.length < BATCH) break
      batch = await client.query(`FETCH ${BATCH} FROM submissions_csv_cursor`)
    }

    await client.query('CLOSE submissions_csv_cursor')
    await client.query('COMMIT')
    res.end()
  } catch (err) {
    req.log.error({ err: err }, 'CSV export error')
    try { if (client) await client.query('ROLLBACK') } catch { /* ignore */ }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    } else {
      res.end()
    }
  } finally {
    if (client) client.release()
  }
})

// Admin — reply to submission
router.post(
  '/:id/reply',
  requireAuth,
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
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

        // Resend returns { error } on API-level failure (e.g. unverified domain);
        // it does not throw. Check the returned error, not just the catch block.
        const { error: sendError } = await resend.emails.send({
          from: FROM,
          to: submission.email,
          // Reply-To = the office inbox so a client's reply lands with the firm,
          // even when we send from a noreply-style RESEND_FROM_EMAIL.
          replyTo: process.env.ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL || 'contact@camulaw.com',
          subject: `Re: Your inquiry — Campos Muños Law`,
          html: `
            <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
              <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
                <h2 style="margin: 0; color: #003F8D; font-size: 20px;">Campos Muños Law</h2>
              </div>
              <div style="font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(replyBody)}</div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
              <p style="font-size: 12px; color: #6b7280; line-height: 1.5;">
                This is a reply to your inquiry submitted on ${submittedDate}.<br/>
                You can reply directly to this email or call us at (504) 910-6508.
              </p>
            </div>
          `,
        })
        if (sendError) {
          req.log.error({ err: sendError }, 'Resend reply email rejected')
          emailFailed = true
        }
      } catch (emailErr) {
        req.log.error({ err: emailErr }, 'Resend email failed')
        emailFailed = true
      }

      res.status(201).json({ ...reply, emailFailed })
    } catch (err) {
      req.log.error({ err: err }, 'Reply error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router
