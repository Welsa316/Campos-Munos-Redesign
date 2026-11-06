// Home's "My follow-ups" rows: what each says, in New Orleans time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workItemText } from '../src/modules/reminders/workQueueText.js'

const now = new Date('2026-11-06T16:00:00Z').getTime() // Fri 10:00 AM in New Orleans

test('a callback reminder says who to call and when', () => {
  assert.deepEqual(workItemText({ kind: 'callback', group: 'overdue', name: 'Maria Lopez', at: '2026-11-06T15:00:00Z' }, now),
    { title: 'Call back Maria Lopez', when: 'Overdue since 9:00 AM', icon: 'phone', tone: 'overdue' })
  assert.equal(workItemText({ kind: 'callback', group: 'overdue', name: null, number: '+15045550101', at: '2026-11-05T15:00:00Z' }, now).title, 'Call back (504) 555-0101')
  assert.equal(workItemText({ kind: 'callback', group: 'overdue', at: '2026-11-05T15:00:00Z' }, now).when, 'Overdue since Thu, Nov 5, 9:00 AM')
  assert.equal(workItemText({ kind: 'callback', group: 'due', name: 'A', at: '2026-11-06T15:59:00Z' }, now).when, 'Due now')
  assert.equal(workItemText({ kind: 'callback', group: 'due', name: 'A', at: '2026-11-06T15:59:00Z' }, now).tone, 'due')
  assert.equal(workItemText({ kind: 'callback', group: 'today', name: 'A', at: '2026-11-06T20:30:00Z' }, now).when, 'Today, 2:30 PM')
  assert.equal(workItemText({ kind: 'callback', group: 'later', name: 'A', at: '2026-11-09T15:00:00Z' }, now).when, 'Mon, Nov 9, 9:00 AM')
  assert.equal(workItemText({ kind: 'callback', group: 'later', at: '2026-11-09T15:00:00Z' }, now).title, 'Call back a caller')
})

test('a lead: a reminder on it, or a new message nobody has opened', () => {
  assert.equal(workItemText({ kind: 'lead_followup', group: 'today', name: 'Ana Prueba', at: '2026-11-06T20:00:00Z' }, now).title, 'Follow up with Ana Prueba')
  const fresh = workItemText({ kind: 'new_lead', group: 'lead', name: 'Ana Prueba', source: 'contact', at: '2026-11-06T14:12:00Z' }, now)
  assert.deepEqual(fresh, { title: 'New website message from Ana Prueba', when: 'Received 8:12 AM', icon: 'envelope-open-text', tone: 'quiet' })
  assert.equal(workItemText({ kind: 'new_lead', group: 'lead', name: 'Ana', source: 'chat', at: '2026-11-04T14:12:00Z' }, now).title, 'New website chat from Ana')
  assert.equal(workItemText({ kind: 'new_lead', group: 'lead', name: 'Ana', source: 'chat', at: '2026-11-04T14:12:00Z' }, now).when, 'Received Wed, Nov 4, 8:12 AM')
})
