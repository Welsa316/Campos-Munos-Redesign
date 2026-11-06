// Home's "My follow-ups" rows in words (GET /api/work-queue). Pure, tested in
// admin/test/workQueue.test.js.
import { formatDue, formatTime, toInputs } from './dueChoices.js'
import { phone } from '../calls/callLook.js'

const sameFirmDay = (a, b) => toInputs(a).date === toInputs(b).date

function when(item, now) {
  const at = new Date(item.at)
  if (item.group === 'overdue') return `Overdue since ${sameFirmDay(at, now) ? formatTime(at) : formatDue(at)}`
  if (item.group === 'due') return 'Due now'
  if (item.group === 'today') return `Today, ${formatTime(at)}`
  if (item.group === 'lead') return `Received ${sameFirmDay(at, now) ? formatTime(at) : formatDue(at)}`
  return formatDue(at)
}

/** { title, when, icon, tone } for one row. */
export function workItemText(item, now = Date.now()) {
  const who = item.name || (item.number ? phone(item.number) : null)
  const title = item.kind === 'callback' ? `Call back ${who || 'a caller'}`
    : item.kind === 'lead_followup' ? `Follow up with ${who || 'a website lead'}`
    : `${item.source === 'chat' ? 'New website chat' : 'New website message'}${who ? ` from ${who}` : ''}`
  const icon = item.kind === 'callback' ? 'phone' : item.kind === 'lead_followup' ? 'bell' : 'envelope-open-text'
  const tone = item.group === 'overdue' ? 'overdue' : item.group === 'due' ? 'due' : 'quiet'
  return { title, when: when(item, now), icon, tone }
}
