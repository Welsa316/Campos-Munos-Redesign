// The callback reminder email, and the mailer that sends it.
//
// Generic on purpose, like the desktop notification: no client's name,
// number, case or note, only that a follow-up is due and a button into the
// portal, where the details are shown once someone signs in. Sent from the
// same address as the office's website alerts, in the same styling.
//
// A mailer is { send({ to, subject, html, text, idempotencyKey }) } and
// answers { ok: true, id } or { ok: false, error, transient }. Tests and
// local runs use a fake one: createResendMailer refuses to start under
// NODE_ENV=test, and index.js only builds it when RESEND_API_KEY is set.
// Development must also set REMINDER_EMAIL_ALLOWLIST=tech@camulaw.com so a
// copy of real data can only ever email that one address.
import { Resend } from 'resend'
import { resolveNotifyFrom } from '../routes/submissions.js'
import { escapeHtml } from '../utils/sanitize.js'

export const REMINDER_EMAIL = Object.freeze({
  subject: 'Campos Muños — Callback reminder',
  overdueSubject: 'Campos Muños — Callback reminder (overdue)',
  body: 'You have a scheduled follow-up that is now due. Open the Campos Muños portal to review the contact and complete the follow-up.',
  overdueBody: 'A scheduled follow-up is past due and still open. Open the Campos Muños portal to review the contact and complete the follow-up.',
  button: 'Open follow-up',
})

/** Where the portal is: PORTAL_URL, else the first of ADMIN_ORIGINS / FRONTEND_URL, else admin.camulaw.com. */
export function portalBase(env = process.env) {
  const first = (v) => String(v || '').split(',').map((s) => s.trim()).find(Boolean)
  const base = (env.PORTAL_URL || '').trim() || first(env.ADMIN_ORIGINS) || first(env.FRONTEND_URL) || 'https://admin.camulaw.com'
  return base.replace(/\/+$/, '')
}

export function notifyFrom(env = process.env) {
  const name = env.RESEND_FROM_NAME || 'Campos Muños Law'
  const address = resolveNotifyFrom(env.RESEND_FROM_EMAIL || 'contact@camulaw.com', env.ADMIN_EMAIL, env.RESEND_NOTIFY_FROM_EMAIL)
  return `${name} <${address}>`
}

/** REMINDER_EMAIL_ALLOWLIST as a Set of lower-cased addresses, or null when unset (everyone). */
export function emailAllowlist(env = process.env) {
  const raw = (env.REMINDER_EMAIL_ALLOWLIST || '').trim()
  if (!raw) return null
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
}

export const looksLikeEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v)

/** Subject, HTML and text for one reminder. `path` is the portal path ('/calls?call=12'). */
export function renderReminderEmail({ path, overdue = false, env = process.env }) {
  const link = `${portalBase(env)}${path}`
  const body = overdue ? REMINDER_EMAIL.overdueBody : REMINDER_EMAIL.body
  const subject = overdue ? REMINDER_EMAIL.overdueSubject : REMINDER_EMAIL.subject
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0; color: #003F8D; font-size: 20px;">Callback reminder</h2>
      </div>
      <p style="font-size: 15px; line-height: 1.6;">${escapeHtml(body)}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(link)}" style="display: inline-block; background: #003F8D; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 22px; border-radius: 8px;">${escapeHtml(REMINDER_EMAIL.button)}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
      <p style="font-size: 12px; color: #6b7280;">You set this reminder in the Campos Muños portal, or a colleague assigned it to you.</p>
    </div>
  `
  const text = `${body}\n\n${REMINDER_EMAIL.button}: ${link}\n`
  return { subject, html, text, link }
}

// Resend's own error names that are worth another try; anything else (a
// rejected address, an unverified domain, a bad key) will fail the same way again.
const TRANSIENT = new Set(['rate_limit_exceeded', 'application_error', 'internal_server_error', 'concurrent_idempotent_requests'])

export function createResendMailer({ apiKey, env = process.env } = {}) {
  if (env.NODE_ENV === 'test') throw new Error('Refusing to create a real mailer under NODE_ENV=test')
  if (!apiKey) return null
  const resend = new Resend(apiKey)
  return {
    async send({ to, subject, html, text, idempotencyKey }) {
      try {
        // Resend answers { error } rather than throwing for API errors.
        const { data, error } = await resend.emails.send({ from: notifyFrom(env), to, subject, html, text }, { idempotencyKey })
        if (error) return { ok: false, error: `${error.name || 'error'}: ${String(error.message || '').slice(0, 160)}`, transient: TRANSIENT.has(error.name) }
        return { ok: true, id: data?.id || null }
      } catch (err) {
        // A network failure or timeout: the idempotency key makes the retry safe.
        return { ok: false, error: String(err?.name || err?.code || 'network_error').slice(0, 80), transient: true }
      }
    },
  }
}
