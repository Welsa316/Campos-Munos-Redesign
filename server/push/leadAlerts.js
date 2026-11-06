// A desktop notification when someone writes in through the website: to
// every account that turned notifications on and may open Messages
// (crm.view). Generic text only — no name, number or message: notifications
// show on screens others may see, and pass through the browser's push
// service. Clicking it opens that lead.
import { resolveCapabilities } from '../auth/capabilities.js'
import { sendPush } from './send.js'

export const LEAD_ALERT = Object.freeze({
  contact: { title: 'New form submission', body: 'Someone wrote in through the website. Open Messages to read it.' },
  chat: { title: 'New website chat', body: 'Someone started a chat on the website. Open Messages to reply.' },
})

/** Accounts with notifications on that may read website leads. */
export async function leadAlertAccounts(db) {
  const rows = (await db.query(
    `SELECT DISTINCT u.id, u.role, u.capability_grants, u.capability_revokes
       FROM admin_users u JOIN push_subscriptions s ON s.account_id = u.id
      WHERE u.disabled_at IS NULL`
  )).rows
  return rows
    .filter((r) => resolveCapabilities({ role: r.role, grants: r.capability_grants, revokes: r.capability_revokes }).has('crm.view'))
    .map((r) => Number(r.id))
}

export async function notifyNewLead(db, { submissionId, source = 'contact' }, opts = {}) {
  const text = LEAD_ALERT[source === 'chat' ? 'chat' : 'contact']
  const accounts = await leadAlertAccounts(db)
  const results = []
  for (const accountId of accounts) {
    results.push(await sendPush(db, {
      accountId,
      eventKey: `lead:${submissionId}`,
      ...text,
      url: `/inbox?lead=${submissionId}`,
      // The same tag as the Messages page's own notification, so the two replace each other.
      tag: `cm-submission-${submissionId}`,
    }, opts))
  }
  return results
}
