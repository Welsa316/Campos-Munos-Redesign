// One notification per new caller waiting for a call back: a callback
// episode (Calls → Needs attention) that opened in the last couple of hours.
// Not per call — a repeat call joins the caller's open episode and says
// nothing new — and never twice for one episode (its event key). The window
// keeps a first run, or a long outage, from announcing the whole backlog.
// Generic text only: who called is for the portal, once signed in.
import { queryCalls, ATTENTION_DAYS } from '../integrations/ringcentral/callLog.js'
import { accountsWith } from './leadAlerts.js'
import { sendPush } from './send.js'
import { purgeOldNotifications } from './feed.js'

export const MISSED_CALL = Object.freeze({ title: 'New missed call', body: 'Someone is waiting for a call back. Open Calls to see who.' })
export const MISSED_CALL_WINDOW_MINUTES = 120

export async function notifyNewMissedCallers(db, { now = new Date(), windowMinutes = MISSED_CALL_WINDOW_MINUTES } = {}, opts = {}) {
  const res = await queryCalls(db, {
    from: new Date(now.getTime() - ATTENTION_DAYS * 24 * 60 * 60 * 1000),
    to: new Date(now.getTime() + 60 * 1000),
    outcome: 'attention',
    limit: 1000,
    now,
  })
  const since = now.getTime() - windowMinutes * 60 * 1000
  const fresh = (res.episodes || []).filter((e) => new Date(e.firstAt).getTime() >= since)
  if (!fresh.length) return []
  const accounts = await accountsWith(db, 'calls.view')
  const sent = []
  for (const e of fresh) {
    for (const accountId of accounts) {
      await sendPush(db, { accountId, eventKey: `missed-call:${e.id}`, ...MISSED_CALL, url: '/calls', tag: `missed-call:${e.id}` }, opts)
    }
    sent.push(e.id)
  }
  await purgeOldNotifications(db)
  return sent
}
