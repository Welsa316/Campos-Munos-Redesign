// The server-side lead_created must carry the browser pixel's event id, or
// OpenAI counts every form lead twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendLeadConversion } from './utils/openaiConversions.js'

const EVENT_ID = '3fbeebcd-36a3-453e-80f8-33ecc0be1a57'
const env = { OPENAI_CONVERSIONS_API_KEY: 'test-key' }

function recordingFetch(status = 200) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    return { ok: status < 400, status, text: async () => 'nope' }
  }
  return { calls, fetchImpl }
}

test('sends the lead with the browser event id, pixel id and bearer key', async () => {
  const { calls, fetchImpl } = recordingFetch()
  const outcome = await sendLeadConversion({
    eventId: EVENT_ID, sourceUrl: 'https://camulaw.com/contacto', timestampMs: 1700000000000, env, fetchImpl,
  })

  assert.equal(outcome, 'sent')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://bzr.openai.com/v1/events?pid=NshoMD9T8va4mtuWzuZwPr')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key')
  assert.deepEqual(calls[0].body, {
    validate_only: false,
    events: [{
      id: EVENT_ID,
      type: 'lead_created',
      timestamp_ms: 1700000000000,
      source_url: 'https://camulaw.com/contacto',
      action_source: 'web',
      data: { type: 'customer_action' },
    }],
  })
})

test('sends nothing without an API key', async () => {
  const { calls, fetchImpl } = recordingFetch()
  const outcome = await sendLeadConversion({ eventId: EVENT_ID, sourceUrl: 'x', env: {}, fetchImpl })
  assert.equal(outcome, 'skipped:no_api_key')
  assert.equal(calls.length, 0)
})

test('sends nothing when the browser event id is missing or malformed', async () => {
  const { calls, fetchImpl } = recordingFetch()
  for (const eventId of [undefined, '', 'not-a-uuid', 42]) {
    assert.equal(await sendLeadConversion({ eventId, sourceUrl: 'x', env, fetchImpl }), 'skipped:no_event_id')
  }
  assert.equal(calls.length, 0)
})

test('a rejected or failed request is reported, never thrown', async () => {
  const rejected = recordingFetch(401)
  assert.equal(await sendLeadConversion({ eventId: EVENT_ID, sourceUrl: 'x', env, fetchImpl: rejected.fetchImpl }), 'failed:401')

  const throwing = async () => { throw new Error('offline') }
  assert.equal(await sendLeadConversion({ eventId: EVENT_ID, sourceUrl: 'x', env, fetchImpl: throwing }), 'failed:network')
})
