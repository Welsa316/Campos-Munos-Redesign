// A desktop notification when someone writes in through the website: to
// every account that may open Messages (browser push where it is on, and the desktop app's feed)
// (crm.view). Generic text only — no name, number or message: notifications
// show on screens others may see, and pass through the browser's push
// service. Clicking it opens that lead.
import { resolveCapabilities } from '../auth/capabilities.js'
import { sendPush } from './send.js'

export const LEAD_ALERT = Object.freeze({
  contact: { title: 'New form submission', body: 'Someone wrote in through the website. Open Messages to read it.' },
  chat: { title: 'New website chat', body: 'Someone started a chat on the website. Open Messages to reply.' },
})

/**
 * Active accounts holding a capability. All of them, not only those with
 * browser notifications on: the desktop app reads the same notifications
 * from its feed (push/feed.js).
 */
export async function accountsWith(db, capability) {
  const rows = (await db.query(
    'SELECT id, role, capability_grants, capability_revokes FROM admin_users WHERE disabled_at IS NULL'
  )).rows
  return rows
    .filter((r) => resolveCapabilities({ role: r.role, grants: r.capability_grants, revokes: r.capability_revokes }).has(capability))
    .map((r) => Number(r.id))
}

export async function notifyNewLead(db, { submissionId, source = 'contact' }, opts = {}) {
  const text = LEAD_ALERT[source === 'chat' ? 'chat' : 'contact']
  const accounts = await accountsWith(db, 'crm.view')
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
