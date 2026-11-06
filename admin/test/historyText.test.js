// The words a contact's history uses for each event.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyLine, possibleMatch } from '../src/modules/contacts/historyText.js'

test('calls say what RingCentral recorded, and who answered only when known', () => {
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'answered', employee: 'Ciro Perez' }), 'Incoming call, answered by Ciro Perez')
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'answered' }), 'Incoming call, answered')
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'not_answered', employee: 'Ciro Perez' }), 'Incoming call, not answered')
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'unknown' }), 'Incoming call, not confirmed')
  assert.equal(historyLine({ type: 'call', direction: 'outbound', outcome: 'no_answer' }), 'Outgoing call, no answer')
})

test('website events, replies and notes', () => {
  assert.equal(historyLine({ type: 'submission', channel: 'form', consultationType: 'DACA' }), 'Website enquiry · DACA')
  assert.equal(historyLine({ type: 'submission', channel: 'chat' }), 'Website chat started')
  assert.equal(historyLine({ type: 'submission', consultationType: 'daca' }, (k) => (k === 'daca' ? 'DACA' : k)), 'Website enquiry · DACA', 'named, not the raw key')
  assert.equal(historyLine({ type: 'reply', employee: 'Yoletty' }), 'Email reply sent by Yoletty')
  assert.equal(historyLine({ type: 'call_note', employee: 'Yoletty' }), 'Call note by Yoletty')
  assert.equal(possibleMatch({ type: 'submission', match: 'possible' }), true)
  assert.equal(possibleMatch({ type: 'submission', match: 'confirmed' }), false)
})
