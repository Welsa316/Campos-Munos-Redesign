// Telling people when something has waited too long, without anyone having
// to open the portal to find out.
//
//   level 1  the person who owns it (or, with no owner, everyone who can
//            work it): a desktop notification, the desktop app's feed, and
//            one email — to the owner, or to the office inbox when nobody
//            owns it
//   level 2  everyone who can work it and the administrators, in the
//            portal; plus one email to the second-level address when an
//            administrator set one (settings 'sla'). It is empty by
//            default: nothing leaves the portal for anyone else unless the
//            firm asks for it.
//
// Generic words only, like every notification here: no name, number or
// message. Each level is sent once per lead or caller (the notification and
// the email both carry a key that makes a repeat a no-op).
import { sendPush } from '../push/send.js'
import { accountsWith } from '../auth/account.js'
import { portalBase, emailAllowlist, looksLikeEmail } from '../reminders/email.js'
import { isProductionEnv } from '../utils/productionEnv.js'
import { escapeHtml } from '../utils/sanitize.js'

export const ALERTS = Object.freeze({
  lead: {
    1: { title: 'A website lead is waiting', body: 'A new lead has not been contacted yet. Open Messages to follow up.', button: 'Open the lead' },
    2: { title: 'A website lead is still waiting', body: 'A lead has gone a long time without anyone contacting them. Open Messages.', button: 'Open the lead' },
  },
  caller: {
    1: { title: 'A caller is waiting for a call back', body: 'A missed caller has not been called back yet. Open Calls to see who.', button: 'Open Calls' },
    2: { title: 'A caller is still waiting', body: 'A missed caller has gone a long time without a call back. Open Calls.', button: 'Open Calls' },
  },
})

export function renderStaffAlert({ kind, level, path, env = process.env }) {
  const a = ALERTS[kind][level]
  const link = `${portalBase(env)}${path}`
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0; color: #003F8D; font-size: 20px;">${escapeHtml(a.title)}</h2>
      </div>
      <p style="font-size: 15px; line-height: 1.6;">${escapeHtml(a.body)}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(link)}" style="display: inline-block; background: #003F8D; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 22px; border-radius: 8px;">${escapeHtml(a.button)}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
      <p style="font-size: 12px; color: #6b7280;">Sent by the Campos Muños portal because this has waited longer than the firm’s limit.</p>
    </div>`
  return { subject: `Campos Muños — ${a.title}`, html, text: `${a.body}\n\n${a.button}: ${link}\n`, link }
}

// Staff email follows the callback reminders' rule: outside production only
// to REMINDER_EMAIL_ALLOWLIST, so a copy of real data cannot email the firm.
function mayEmail(env, to) {
  const allow = emailAllowlist(env)
  if (allow) return allow.has(to.toLowerCase())
  return isProductionEnv(env)
}

/**
 * Notify the right people about one waiting lead or caller.
 * Returns { accounts, emailed }.
 */
export async function notifyStaff(db, { kind, level, entityId, ownerId = null, capability, path }, ctx) {
  const { env = process.env, settings, staffMailer = null, pushOptions = {}, log = null } = ctx
  const text = ALERTS[kind][level]
  const able = await accountsWith(db, capability, { rows: true })
  const owner = ownerId != null ? able.find((a) => Number(a.id) === Number(ownerId)) : null
  let recipients
  if (level === 1) recipients = owner ? [owner] : able
  else {
    const admins = await accountsWith(db, 'team.manage', { rows: true })
    recipients = [...new Map([...able, ...admins].map((a) => [Number(a.id), a])).values()]
  }
  let accounts = 0
  for (const a of recipients) {
    try {
      await sendPush(db, { accountId: Number(a.id), eventKey: `${kind}-sla:${entityId}:${level}`, title: text.title, body: text.body, url: path, tag: `${kind}-sla:${entityId}` }, { env, ...pushOptions })
      accounts++
    } catch (err) {
      log?.warn?.({ err: { name: err?.name, code: err?.code } }, 'Escalation notification failed')
    }
  }
  // One email: the owner's, else the office inbox; level 2 only when an
  // address was set for it.
  const to = level === 1
    ? String(owner?.email || env.ADMIN_EMAIL || '').trim()
    : String(settings?.sla?.secondLevelEmail || '').trim()
  let emailed = false
  if (to && looksLikeEmail(to) && staffMailer && mayEmail(env, to)) {
    const msg = renderStaffAlert({ kind, level, path, env })
    try {
      const res = await staffMailer.send({ to, subject: msg.subject, html: msg.html, text: msg.text, idempotencyKey: `cm-esc-${kind}-${entityId}-${level}` })
      emailed = Boolean(res?.ok)
    } catch { emailed = false }
  }
  return { accounts, emailed }
}

export default { ALERTS, renderStaffAlert, notifyStaff }
