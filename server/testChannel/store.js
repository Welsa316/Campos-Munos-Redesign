// Storing and reading test forms (db/testChannelSchema.js). The public form
// route calls storeTestSubmission after the same validation, honeypot and
// clean-up a real lead gets; nothing here emails the office or notifies
// staff. The only notification goes to the administrator who sent the test.
import crypto from 'crypto'
import { sendPush } from '../push/send.js'

// Same window as a real lead (routes/submissions.js), so a double click on
// a test behaves as it would for a client.
const DUPLICATE_WINDOW_MINUTES = 10

export const TEST_ALERT = Object.freeze({
  contact: { title: 'Test form received', body: 'Your test form came through the website. Open the Test channel to see it.' },
  chat: { title: 'Test chat received', body: 'Your test chat came through the website. Open the Test channel to see it.' },
})

export async function storeTestSubmission(db, fields, { sentBy }) {
  const { firstName, lastName, email, phone, message, source, consultationType, location } = fields
  const duplicate = (await db.query(
    `SELECT id, created_at, chat_token FROM test_submissions
      WHERE LOWER(email) = LOWER($1) AND message = $2 AND source = $3
        AND created_at > NOW() - make_interval(mins => $4)
      ORDER BY id DESC LIMIT 1`,
    [email, message, source, DUPLICATE_WINDOW_MINUTES]
  )).rows[0]
  if (duplicate) return { ...duplicate, duplicate: true }

  const chatToken = source === 'chat' ? crypto.randomBytes(24).toString('base64url') : null
  const row = (await db.query(
    `INSERT INTO test_submissions (first_name, last_name, email, phone, message, source, consultation_type, location, chat_token, sent_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, created_at, chat_token`,
    [firstName, lastName, email, phone, message, source, consultationType, location, chatToken, sentBy]
  )).rows[0]
  return { ...row, duplicate: false }
}

/** A notification for the administrator who sent the test, and nobody else. */
export function notifyTestSender(db, { accountId, testId, source = 'contact' }, opts = {}) {
  return sendPush(db, {
    accountId,
    eventKey: `test-lead:${testId}`,
    ...TEST_ALERT[source === 'chat' ? 'chat' : 'contact'],
    url: `/test-channel?test=${testId}`,
    tag: `cm-test-${testId}`,
  }, opts)
}

const COLUMNS = 'id, first_name, last_name, email, phone, message, source, consultation_type, location, created_at'

export async function listTestSubmissions(db) {
  return (await db.query(
    `SELECT t.id, t.first_name, t.last_name, t.email, t.phone, t.message, t.source, t.consultation_type, t.location, t.created_at,
        COALESCE(NULLIF(TRIM(u.display_name), ''), split_part(u.email, '@', 1)) AS sent_by_name,
        (SELECT COUNT(*) FROM test_chat_messages m WHERE m.test_submission_id = t.id)::int AS chat_message_count
       FROM test_submissions t LEFT JOIN admin_users u ON u.id = t.sent_by
      ORDER BY t.created_at DESC, t.id DESC LIMIT 200`
  )).rows
}

export async function getTestSubmission(db, id) {
  const row = (await db.query(`SELECT ${COLUMNS} FROM test_submissions WHERE id = $1`, [id])).rows[0]
  if (!row) return null
  const chat = (await db.query(
    'SELECT id, body, sent_at FROM test_chat_messages WHERE test_submission_id = $1 ORDER BY sent_at ASC, id ASC', [id]
  )).rows
  return { ...row, chat_messages: chat }
}
