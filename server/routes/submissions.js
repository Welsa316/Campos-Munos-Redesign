import { Router } from 'express'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { body, param } from 'express-validator'
import { Resend } from 'resend'
import getPool from '../db/pool.js'
import requireAuth from '../middleware/auth.js'
import requireCapability from '../middleware/requireCapability.js'
import validate from '../middleware/validate.js'
import { stripHtml, escapeHtml, escapeCsvField } from '../utils/sanitize.js'
import { sendLeadConversion } from '../utils/openaiConversions.js'
import { clientKey } from '../httpSecurity.js'
import { emailConfigProblems } from '../utils/emailConfig.js'
import { sha256Hex, digestsEqual } from '../integrations/secretBox.js'
import { notifyNewLead } from '../push/leadAlerts.js'
import { verifyTestToken } from '../testChannel/token.js'
import { storeTestSubmission, notifyTestSender } from '../testChannel/store.js'
import { closeResolvedReminders, reopenResolvedReminders } from '../reminders/reminders.js'
import { currentFlags } from '../automation/flags.js'
import { loadSettings } from '../automation/settings.js'
import { startLeadAutomation } from '../automation/leads.js'
import { stopLeadAutomation, MESSAGE_JOB_TYPES } from '../automation/leadStatus.js'
import { leadAutomationSummary, leadAttention } from '../automation/health.js'
import { setSpamState } from '../automation/spam.js'
import { markRepliesHandled } from '../automation/smsInbound.js'
import { canSeeKind } from '../reminders/reminders.js'
import { capsOfRow } from '../auth/account.js'

const UNARCHIVE_REOPEN_DAYS = 30

const router = Router()

// Sender identity for all outbound mail. The display name is what the client's
// inbox shows — without it, mail clients fall back to the address's local part
// ("office"), so replies looked like they came from "office" instead of the firm.
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Campos Muños Law'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'contact@camulaw.com'
const FROM = `${FROM_NAME} <${FROM_EMAIL}>`

// Staff alerts must NOT be sent from the same mailbox they are delivered to.
// Gmail reads a message whose From matches the recipient as likely spoofing and
// files it under Spam, so with RESEND_FROM_EMAIL === ADMIN_EMAIL the office was
// getting "delivered" in Resend while the inbox stayed empty.
//
// Any address on the verified domain can send, so when the two collide we fall
// back to website@<domain>. Nothing ever replies to it — staff alerts carry the
// client's address in Reply-To. Override with RESEND_NOTIFY_FROM_EMAIL.
export function resolveNotifyFrom(fromEmail, adminEmail, explicit) {
  if (explicit) return explicit
  if (adminEmail && fromEmail && adminEmail.trim().toLowerCase() === fromEmail.trim().toLowerCase()) {
    const domain = fromEmail.trim().split('@')[1]
    return domain ? `website@${domain.toLowerCase()}` : fromEmail
  }
  return fromEmail
}
const NOTIFY_FROM_EMAIL = resolveNotifyFrom(
  FROM_EMAIL,
  process.env.ADMIN_EMAIL,
  process.env.RESEND_NOTIFY_FROM_EMAIL
)
const NOTIFY_FROM = `${FROM_NAME} <${NOTIFY_FROM_EMAIL}>`

// Lead pipeline. 'new' is the default on insert; a reply sent from the inbox
// advances it to 'contacted' automatically (see the reply route).
export const LEAD_STATUSES = ['new', 'contacted', 'no_response', 'scheduled', 'retained', 'closed']

// CSV gets the human label, not the raw key: 'no_response' would otherwise
// land in the spreadsheet with an underscore. Matches the labels in
// site/src/data/leadStatuses.js for every key above.
const humanStatus = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s)

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
  keyGenerator: clientKey,
})

const chatMessageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: { error: 'Too many chat messages. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
})

// The same email and message again within this window is the same inquiry
// (a double click, a retry, a script): answered as before, stored and emailed
// once.
const DUPLICATE_WINDOW_MINUTES = 10

// The forms carry a hidden "website" field people never see or fill in. A
// bot that fills every field is told it worked and nothing is stored or sent.
const honeypot = (req, res, next) => {
  const trap = req.body?.website
  if (trap == null || trap === '' || (typeof trap === 'string' && !trap.trim())) return next()
  // Warn: if a real client's browser ever fills it, this line is the only trace.
  const domain = typeof req.body?.email === 'string' ? req.body.email.split('@')[1]?.toLowerCase().slice(0, 100) : undefined
  req.log?.warn({ emailDomain: domain || null, source: req.body?.source === 'chat' ? 'chat' : 'form' }, 'Submission with the hidden field filled in; ignored')
  return res.status(201).json({ created_at: new Date().toISOString() })
}

// A validated form body, cleaned the way it is stored.
function submittedFields(b) {
  return {
    firstName: stripHtml(b.firstName),
    lastName: stripHtml(b.lastName),
    email: b.email,
    phone: stripHtml(b.phone),
    // Optional fields on the contact form — coerce to the columns' NOT NULL defaults
    // ('' for message/location, 'other' for consultation_type per its CHECK constraint).
    message: stripHtml(b.message || ''),
    source: b.source === 'chat' ? 'chat' : 'contact',
    consultationType: b.consultationType || 'other',
    location: stripHtml(b.location || ''),
    // The website language the form was sent in. Never guessed: anything
    // else is stored as unknown, and messages then go out bilingual.
    language: b.language === 'es' || b.language === 'en' ? b.language : null,
    // True only when the form carried the person's agreement to be texted.
    smsConsent: b.smsConsent === true,
  }
}

// Queue the lead's automatic work (server/automation/leads.js). After the
// answer, and never able to fail the form: a lead this misses is picked up
// by the automation worker within a minute.
async function beginLeadAutomation(submissionId, log) {
  try {
    const flags = await currentFlags(getPool(), process.env)
    if (!flags.on('worker')) return
    await startLeadAutomation(getPool(), submissionId, { flags, settings: await loadSettings(getPool()), log })
  } catch (err) {
    log?.warn?.({ err: { name: err?.name, code: err?.code }, submissionId }, 'Lead automation could not be queued; the worker will pick it up')
  }
}

// A person acted on a lead: its pending automatic messages stop, and any
// text reply waiting for someone counts as seen to.
async function staffTookOver(submissionId, reason, accountId, log, { types = undefined } = {}) {
  try {
    await stopLeadAutomation(getPool(), submissionId, reason, { ...(types ? { types } : {}), log })
    await markRepliesHandled(getPool(), submissionId, accountId)
  } catch (err) {
    log?.warn?.({ err: { name: err?.name, code: err?.code }, submissionId }, 'Could not stop a lead’s automatic follow-ups')
  }
}

const TEST_LINK_INVALID = { error: 'This test link has expired or is not valid. Get a new one from the Test channel.', code: 'test_link_invalid' }

async function handleTestSubmission(req, res) {
  const account = await verifyTestToken(getPool(), req.body.testToken)
  if (!account) return res.status(400).json(TEST_LINK_INVALID)
  const fields = submittedFields(req.body)
  const stored = await storeTestSubmission(getPool(), fields, { sentBy: account.id })
  const out = { id: stored.id, created_at: stored.created_at, test: true }
  if (fields.source === 'chat' && stored.chat_token) out.chat_token = stored.chat_token
  res.status(201).json(out)
  if (stored.duplicate) return
  notifyTestSender(getPool(), { accountId: account.id, testId: stored.id, source: fields.source })
    .catch((err) => req.log.warn({ err, testId: stored.id }, 'Test form notification failed'))
}

async function handleTestChatMessage(req, res) {
  const account = await verifyTestToken(getPool(), req.body.testToken)
  if (!account) return res.status(400).json(TEST_LINK_INVALID)
  const sub = (await getPool().query(
    "SELECT id, chat_token FROM test_submissions WHERE id = $1 AND source = 'chat'", [req.params.id]
  )).rows[0]
  if (!sub) return res.status(404).json({ error: 'Chat session not found' })
  if (!sub.chat_token || !digestsEqual(sha256Hex(sub.chat_token), sha256Hex(req.body.chatToken))) {
    return res.status(403).json({ error: 'Invalid chat session' })
  }
  const row = (await getPool().query(
    'INSERT INTO test_chat_messages (test_submission_id, body) VALUES ($1, $2) RETURNING id, body, sent_at',
    [sub.id, stripHtml(req.body.body)]
  )).rows[0]
  res.status(201).json({ ...row, test: true })
}

// Public — contact form submission
router.post(
  '/',
  submitLimiter,
  honeypot,
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
  // Shared with the browser pixel so OpenAI deduplicates the two lead_created events.
  body('conversionEventId').optional({ values: 'falsy' }).isUUID().withMessage('Invalid conversion event id'),
  // The website's current language, and (when the form asks) agreement to be texted.
  body('language').optional({ values: 'falsy' }).isIn(['es', 'en']).withMessage('Invalid language'),
  body('smsConsent').optional({ values: 'null' }).isBoolean({ strict: true }).withMessage('Invalid consent'),
  // The administrator's test link (testChannel/token.js). Checked after all
  // of the above, so a test goes through the same validation as a lead.
  body('testToken').optional({ values: 'falsy' }).isString().isLength({ max: 200 }).withMessage('Invalid test link'),
  validate,
  async (req, res) => {
    try {
      // A test form: kept in the test channel, never in the inbox; no office
      // email, no staff notification, no conversion. A token that does not
      // check out is refused rather than stored as a lead, so a stale test
      // link never turns into one.
      if (req.body.testToken) return await handleTestSubmission(req, res)

      const { firstName, lastName, email, phone, message, source, consultationType, location, language, smsConsent } = submittedFields(req.body)

      const duplicate = (await getPool().query(
        `SELECT id, created_at, chat_token FROM submissions
          WHERE LOWER(email) = LOWER($1) AND message = $2 AND source = $3
            AND created_at > NOW() - make_interval(mins => $4)
          ORDER BY id DESC LIMIT 1`,
        [email, message, source, DUPLICATE_WINDOW_MINUTES]
      )).rows[0]
      if (duplicate) {
        req.log.info({ submissionId: duplicate.id }, 'Duplicate submission; answered with the first one')
        const again = { id: duplicate.id, created_at: duplicate.created_at }
        if (source === 'chat' && duplicate.chat_token) again.chat_token = duplicate.chat_token
        return res.status(201).json(again)
      }

      const chatToken = source === 'chat' ? crypto.randomBytes(24).toString('base64url') : null

      const result = await getPool().query(
        `INSERT INTO submissions (first_name, last_name, email, phone, message, source, consultation_type, location, chat_token, language, sms_consent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $11::boolean THEN NOW() END) RETURNING id, created_at`,
        [firstName, lastName, email, phone, message, source, consultationType, location, chatToken, language, smsConsent]
      )

      // Return chat_token only when this is a chat session — the widget needs it to post follow-ups
      const responseBody = { id: result.rows[0].id, created_at: result.rows[0].created_at }
      if (chatToken) responseBody.chat_token = chatToken
      res.status(201).json(responseBody)

      // The acknowledgment, follow-ups and escalation for this lead, when
      // those are switched on. A duplicate never reaches here, so a repeated
      // form is acknowledged once.
      beginLeadAutomation(responseBody.id, req.log)

      // A desktop notification for staff who turned them on and may read
      // leads (push/leadAlerts.js). After the answer, so the website never waits.
      notifyNewLead(getPool(), { submissionId: responseBody.id, source })
        .then((r) => { if (r.length) req.log.info({ submissionId: responseBody.id, accounts: r.length }, 'New lead notification sent') })
        .catch((err) => req.log.warn({ err, submissionId: responseBody.id }, 'New lead notification failed'))

      // Server-side copy of the pixel's lead_created (fire and forget). Contact
      // form only, matching the pixel.
      if (source === 'contact') {
        sendLeadConversion({
          eventId: req.body.conversionEventId,
          sourceUrl: req.get('referer') || 'https://camulaw.com/',
          log: req.log,
        }).then((outcome) => req.log.info({ outcome, submissionId: responseBody.id }, 'OpenAI conversion'))
      }

      // Notify admin via email (fire and forget)
      try {
        const adminEmail = process.env.ADMIN_EMAIL
        const problems = emailConfigProblems()
        if (problems.length) req.log.warn({ problems }, 'Admin notification email skipped: email is not configured')
        if (adminEmail && process.env.RESEND_API_KEY) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          const subjectPrefix = source === 'chat' ? 'New chat from' : 'New inquiry from'
          // Resend does NOT throw on API errors (unverified domain, bad key, etc.) —
          // it returns { error }. Check it, or the failure is silently swallowed.
          const { error: sendError } = await resend.emails.send({
            from: NOTIFY_FROM,
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
router.get('/', requireAuth, requireCapability('crm.view'), async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true'
    const archived = req.query.archived === 'true'
    const conditions = []
    const params = []

    // The Contacts view works the whole book of leads, so it opts out of the
    // inbox/archived split entirely.
    if (req.query.scope !== 'all') {
      params.push(archived)
      conditions.push(`s.is_archived = $${params.length}`)
    }

    if (unreadOnly) {
      conditions.push('s.is_read = false')
    }

    const consultationType = req.query.consultationType
    if (consultationType && CONSULTATION_TYPES.includes(consultationType)) {
      params.push(consultationType)
      conditions.push(`s.consultation_type = $${params.length}`)
    }

    const status = req.query.status
    if (status && LEAD_STATUSES.includes(status)) {
      params.push(status)
      conditions.push(`s.status = $${params.length}`)
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const filterParams = [...params]

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    params.push(limit, offset)
    const limitClause = ` LIMIT $${params.length - 1} OFFSET $${params.length}`

    const query = `SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.message, s.is_read,
        s.is_archived, s.source, s.consultation_type, s.location, s.status, s.created_at,
        s.owner_id, s.spam_state, s.escalation_level, s.status_auto,
        (SELECT COUNT(*) FROM lead_notes n WHERE n.submission_id = s.id)::int AS note_count,
        (SELECT n.body FROM lead_notes n WHERE n.submission_id = s.id ORDER BY n.created_at DESC LIMIT 1) AS latest_note
      FROM submissions s${where} ORDER BY s.created_at DESC${limitClause}`

    // withTotal=1: { rows, total }, total counting every lead the filters
    // match, so the inbox can say how many there are beyond this page.
    // Without it, the bare array the Dashboard and other callers expect.
    if (req.query.withTotal === '1') {
      const [result, count] = await Promise.all([
        getPool().query(query, params),
        getPool().query(`SELECT COUNT(*)::int AS total FROM submissions s${where}`, filterParams),
      ])
      return res.json({ rows: result.rows, total: count.rows[0].total })
    }

    const result = await getPool().query(query, params)
    res.json(result.rows)
  } catch (err) {
    req.log.error({ err: err }, 'List submissions error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin — how many inbox leads are unread, and since when. Polled by the
// portal for its badge; cheaper than listing.
router.get('/unread-count', requireAuth, requireCapability('crm.view'), async (req, res) => {
  try {
    const { rows } = await getPool().query(
      'SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest FROM submissions WHERE is_read = false AND is_archived = false'
    )
    res.json({ count: rows[0].count, oldest: rows[0].oldest ? new Date(rows[0].oldest).toISOString() : null })
  } catch (err) {
    req.log.error({ err }, 'Unread count error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin — the leads that need a person now, and why (automation/health.js):
// a text reply waiting, a message that failed, past the contact deadline,
// possible spam, a finished sequence with no answer. The signed-in person's
// own leads first.
router.get('/attention', requireAuth, requireCapability('crm.view'), async (req, res) => {
  try {
    res.json({ items: await leadAttention(getPool(), { ownerId: req.account.id }) })
  } catch (err) {
    req.log.error({ err }, 'Lead attention error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin — get single submission with replies
router.get(
  '/:id',
  requireAuth,
  requireCapability('crm.view'),
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  validate,
  async (req, res) => {
    try {
      const [submissionResult, repliesResult, chatMessagesResult, notesResult] = await Promise.all([
        getPool().query(
          'SELECT id, first_name, last_name, email, phone, message, is_read, is_archived, source, consultation_type, location, status, created_at FROM submissions WHERE id = $1',
          [req.params.id]
        ),
        getPool().query(
          `SELECT r.id, r.body, r.sent_at, COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1)) AS sent_by_name
           FROM replies r LEFT JOIN admin_users u ON u.id = r.sent_by
          WHERE r.submission_id = $1 ORDER BY r.sent_at ASC`,
          [req.params.id]
        ),
        getPool().query(
          'SELECT id, body, sent_at FROM chat_messages WHERE submission_id = $1 ORDER BY sent_at ASC',
          [req.params.id]
        ),
        getPool().query(
          `SELECT n.id, n.body, n.created_at, COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1)) AS author_name
             FROM lead_notes n LEFT JOIN admin_users u ON u.id = n.author_id
            WHERE n.submission_id = $1 ORDER BY n.created_at DESC`,
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
        notes: notesResult.rows,
        // What the portal did and will do on its own for this lead.
        automation: await leadAutomationSummary(getPool(), req.params.id),
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
  body('testToken').optional({ values: 'falsy' }).isString().isLength({ max: 200 }).withMessage('Invalid test link'),
  validate,
  async (req, res) => {
    // A follow-up in a test chat: the id is a test channel id, not a lead's.
    if (req.body.testToken) {
      try {
        return await handleTestChatMessage(req, res)
      } catch (err) {
        req.log.error({ err }, 'Test chat message error')
        return res.status(500).json({ error: 'Failed to send message. Please try again.' })
      }
    }
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
      // Compared as digests so the check takes the same time however much matches.
      if (!submission.chat_token || !digestsEqual(sha256Hex(submission.chat_token), sha256Hex(incomingToken))) {
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
        const problems = emailConfigProblems()
        if (problems.length) req.log.warn({ problems }, 'Admin notification email skipped: email is not configured')
        if (adminEmail && process.env.RESEND_API_KEY) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          const { error: sendError } = await resend.emails.send({
            from: NOTIFY_FROM,
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
  requireCapability('crm.manage'),
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
  requireCapability('crm.manage'),
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
      // An archived lead needs nobody: its callback reminders close. Taken
      // out of the archive, the ones that closed come back (archiving is the
      // only thing that closes a lead's reminder as resolved; a month back
      // at most, so a long-forgotten one does not fire out of nowhere).
      if (result.rows[0].is_archived) {
        // Nothing automatic goes to an archived lead.
        await staffTookOver(result.rows[0].id, 'archived', req.account.id, req.log)
        await closeResolvedReminders(getPool(), { submissionId: result.rows[0].id })
          .catch((err) => req.log.warn({ err: { name: err?.name, code: err?.code } }, 'Closing reminders on an archived lead failed'))
      } else {
        await reopenResolvedReminders(getPool(), { submissionId: result.rows[0].id, since: new Date(Date.now() - UNARCHIVE_REOPEN_DAYS * 864e5) })
          .catch((err) => req.log.warn({ err: { name: err?.name, code: err?.code } }, 'Reopening reminders on a restored lead failed'))
      }

      res.json(result.rows[0])
    } catch (err) {
      req.log.error({ err: err }, 'Archive error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — set the lead's pipeline status
router.patch(
  '/:id/status',
  requireAuth,
  requireCapability('crm.manage'),
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  body('status').isIn(LEAD_STATUSES).withMessage('Invalid status'),
  validate,
  async (req, res) => {
    try {
      const result = await getPool().query(
        `UPDATE submissions SET status = $2, status_reason = 'set_by_staff', status_auto = FALSE, status_changed_at = NOW()
          WHERE id = $1 RETURNING id, status`,
        [req.params.id, req.body.status]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }
      // A person decided where this lead stands. Anything but New ends its
      // automatic follow-ups; putting it back to New starts none.
      if (req.body.status !== 'new') await staffTookOver(result.rows[0].id, `status_${req.body.status}`, req.account.id, req.log)
      res.json(result.rows[0])
    } catch (err) {
      req.log.error({ err }, 'Update status error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — append an internal note to the lead's log
router.post(
  '/:id/notes',
  requireAuth,
  requireCapability('crm.manage'),
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  body('body').trim().notEmpty().isLength({ max: 5000 }).withMessage('Note is required (max 5000 chars)'),
  validate,
  async (req, res) => {
    try {
      const exists = await getPool().query('SELECT id FROM submissions WHERE id = $1', [req.params.id])
      if (exists.rows.length === 0) {
        return res.status(404).json({ error: 'Submission not found' })
      }
      const result = await getPool().query(
        'INSERT INTO lead_notes (submission_id, body, author_id) VALUES ($1, $2, $3) RETURNING id, body, created_at',
        [req.params.id, stripHtml(req.body.body), req.account.id]
      )
      res.status(201).json({ ...result.rows[0], author_name: req.account.name })
    } catch (err) {
      req.log.error({ err }, 'Add note error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — remove a note from the lead's log
router.delete(
  '/:id/notes/:noteId',
  requireAuth,
  requireCapability('crm.manage'),
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  param('noteId').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid note ID'),
  validate,
  async (req, res) => {
    try {
      // Scope the delete to the submission so a note can't be removed via a
      // mismatched lead id.
      const result = await getPool().query(
        'DELETE FROM lead_notes WHERE id = $1 AND submission_id = $2 RETURNING id',
        [req.params.noteId, req.params.id]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Note not found' })
      }
      res.json({ ok: true, id: result.rows[0].id })
    } catch (err) {
      req.log.error({ err }, 'Delete note error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Admin — export submissions as CSV. Streams rows directly from the DB cursor
// to the response, so a 50k-row inbox doesn't materialise the whole result set
// in memory before writing.
router.get('/export/csv', requireAuth, requireCapability('crm.export'), async (req, res) => {
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
       SELECT s.first_name, s.last_name, s.email, s.phone, s.message, s.consultation_type, s.location,
              s.status, s.is_read, s.is_archived, s.created_at,
              COALESCE((
                SELECT string_agg(
                  to_char(n.created_at, 'YYYY-MM-DD') || ': ' || n.body,
                  E'\n' ORDER BY n.created_at
                )
                FROM lead_notes n WHERE n.submission_id = s.id
              ), '') AS notes
       FROM submissions s ORDER BY s.created_at DESC`
    )

    const BATCH = 500
    let batch = await client.query(`FETCH ${BATCH} FROM submissions_csv_cursor`)

    // First fetch succeeded — now commit to the response and stream.
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.write('First Name,Last Name,Email,Phone,Message,Service,Location,Status,Notes,Read,Archived,Submitted\n')

    while (batch.rows.length > 0) {
      const chunk = batch.rows.map(r => {
        const date = new Date(r.created_at).toISOString()
        return `${escapeCsvField(r.first_name)},${escapeCsvField(r.last_name)},${escapeCsvField(r.email)},${escapeCsvField(r.phone)},${escapeCsvField(r.message)},${escapeCsvField(r.consultation_type)},${escapeCsvField(r.location)},${escapeCsvField(humanStatus(r.status))},${escapeCsvField(r.notes)},${r.is_read},${r.is_archived},"${date}"`
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
  requireCapability('crm.manage'),
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID'),
  body('body').trim().notEmpty().isLength({ max: 10000 }).withMessage('Reply body is required (max 10000 chars)'),
  body('clientKey').optional({ values: 'null' }).isUUID().withMessage('clientKey must be a UUID'),
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

      // Save reply to DB first. With a clientKey, a repeat of a send that
      // already happened inserts nothing and gets the first reply back
      // (200, duplicate: true) without emailing the client again.
      const clientKey = req.body.clientKey ?? null
      const replyResult = await getPool().query(
        `INSERT INTO replies (submission_id, body, sent_by, client_key) VALUES ($1, $2, $3, $4)
         ON CONFLICT (submission_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
         RETURNING id, body, sent_at`,
        [submission.id, replyBody, req.account.id, clientKey]
      )
      if (!replyResult.rows.length) {
        const existing = (await getPool().query(
          `SELECT r.id, r.body, r.sent_at, COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1)) AS sent_by_name, s.status
             FROM replies r JOIN submissions s ON s.id = r.submission_id LEFT JOIN admin_users u ON u.id = r.sent_by
            WHERE r.submission_id = $1 AND r.client_key = $2`,
          [submission.id, clientKey]
        )).rows[0]
        // In the activity log, so a repeat does not read as a second email.
        req.activityDetails = { duplicate: true }
        return res.status(200).json({ ...existing, duplicate: true })
      }

      const reply = { ...replyResult.rows[0], sent_by_name: req.account.name }
      let emailFailed = false

      // Replying from the inbox IS making contact, so move the lead to
      // 'contacted' automatically. Only from the two states that mean "not
      // reached yet" — a lead already further along (scheduled, retained,
      // closed) must not be dragged backwards.
      let status = null
      try {
        const advanced = await getPool().query(
          `UPDATE submissions SET status = 'contacted', status_reason = 'staff_replied', status_auto = FALSE, status_changed_at = NOW()
            WHERE id = $1 AND status IN ('new', 'no_response') RETURNING status`,
          [submission.id]
        )
        if (advanced.rows.length) status = advanced.rows[0].status
        // A person wrote to them: the automatic follow-ups are over.
        await staffTookOver(submission.id, 'staff_replied', req.account.id, req.log)
      } catch (statusErr) {
        // A status bump must never fail the reply itself.
        req.log.error({ err: statusErr }, 'Auto-advance status failed')
      }

      // Send email via Resend
      try {
        const problems = emailConfigProblems()
        if (problems.length) req.log.warn({ problems }, 'Reply email cannot be sent: email is not configured')
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

      res.status(201).json({ ...reply, emailFailed, status })
    } catch (err) {
      req.log.error({ err: err }, 'Reply error')
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// --- what the portal does on its own for a lead (server/automation/) ---------------

const leadId = param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Invalid submission ID')

// Admin — stop (or allow again) automatic messages to this lead. Stopping
// cancels what is queued; allowing again queues nothing new.
router.patch('/:id/automation', requireAuth, requireCapability('crm.manage'), leadId,
  body('paused').isBoolean({ strict: true }).withMessage('Say whether to stop or allow automatic messages'), validate,
  async (req, res) => {
    try {
      const r = await getPool().query('UPDATE submissions SET automation_paused = $2 WHERE id = $1 RETURNING id, automation_paused', [req.params.id, req.body.paused])
      if (!r.rowCount) return res.status(404).json({ error: 'Submission not found' })
      if (req.body.paused) await stopLeadAutomation(getPool(), r.rows[0].id, 'stopped_by_staff', { types: MESSAGE_JOB_TYPES, log: req.log })
      res.json({ id: r.rows[0].id, paused: r.rows[0].automation_paused })
    } catch (err) {
      req.log.error({ err }, 'Lead automation switch error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

// Admin — who follows this lead up (null: the front desk as a whole).
router.put('/:id/owner', requireAuth, requireCapability('crm.manage'), leadId,
  body('ownerId').optional({ values: 'null' }).isInt({ min: 1, max: 2147483647 }).withMessage('Choose a person, or nobody'), validate,
  async (req, res) => {
    try {
      const ownerId = req.body.ownerId ?? null
      if (ownerId != null) {
        const a = (await getPool().query('SELECT id, role, capability_grants, capability_revokes, disabled_at FROM admin_users WHERE id = $1', [ownerId])).rows[0]
        if (!a || a.disabled_at || !canSeeKind(capsOfRow(a), 'submission')) return res.status(400).json({ error: 'That person cannot open website leads', code: 'invalid_owner' })
      }
      const r = await getPool().query(
        'UPDATE submissions SET owner_id = $2, assigned_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END WHERE id = $1 RETURNING id, owner_id', [req.params.id, ownerId]
      )
      if (!r.rowCount) return res.status(404).json({ error: 'Submission not found' })
      res.json({ id: r.rows[0].id, ownerId: r.rows[0].owner_id })
    } catch (err) {
      req.log.error({ err }, 'Lead owner error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

// Admin — "Not spam" (back to the inbox, never marked again) or "Spam".
router.post('/:id/spam', requireAuth, requireCapability('crm.manage'), leadId,
  body('state').isIn(['cleared', 'spam']).withMessage('Choose spam or not spam'), validate,
  async (req, res) => {
    try {
      const row = await setSpamState(getPool(), req.params.id, req.body.state)
      if (!row) return res.status(404).json({ error: 'Submission not found' })
      if (req.body.state === 'spam') await staffTookOver(row.id, 'spam', req.account.id, req.log)
      res.json({ id: row.id, spamState: row.spam_state, is_archived: row.is_archived, status: row.status })
    } catch (err) {
      req.log.error({ err }, 'Lead spam mark error')
      res.status(500).json({ error: 'Internal server error' })
    }
  })

// Admin — the lead's text replies have been seen to (answered in
// RingCentral, or they needed nothing).
router.post('/:id/text-replies/handled', requireAuth, requireCapability('crm.manage'), leadId, validate, async (req, res) => {
  try {
    res.json({ handled: await markRepliesHandled(getPool(), req.params.id, req.account.id) })
  } catch (err) {
    req.log.error({ err }, 'Text replies handled error')
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
