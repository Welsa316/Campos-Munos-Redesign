// The portal's request path (src/utils/apiRequest.js): a refusal keeps the
// server's status, code and body; a 401 ends the session; once it has
// ended nothing more is sent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiFetch, ApiError, SESSION_ENDED } from '../src/utils/apiRequest.js'

const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })

test('a refusal keeps its status, code and body (a reminder clash carries the reminder)', async () => {
  const reminder = { id: 7, dueAt: '2026-11-07T15:00:00Z' }
  const apiFetch = createApiFetch({ send: async () => reply(409, { error: 'Already set', code: 'duplicate', reminder }) })
  await assert.rejects(apiFetch('/api/reminders', { method: 'POST' }), (e) => {
    assert.ok(e instanceof ApiError)
    assert.equal(e.message, 'Already set')
    assert.equal(e.status, 409)
    assert.equal(e.code, 'duplicate')
    assert.deepEqual(e.data.reminder, reminder)
    return true
  })
})

test('a refusal with no JSON body still says something', async () => {
  const apiFetch = createApiFetch({ send: async () => ({ status: 502, ok: false, json: async () => { throw new SyntaxError('html') } }) })
  await assert.rejects(apiFetch('/x'), (e) => e.status === 502 && e.code === null && e.message.length > 0)
})

test('a 401 ends the session, and nothing more is sent after it', async () => {
  let ended = false
  let sent = 0
  const apiFetch = createApiFetch({
    send: async () => { sent++; return reply(401, {}) },
    isEnded: () => ended,
    onEnded: () => { ended = true },
  })
  await assert.rejects(apiFetch('/a'), (e) => e.status === 401 && e.message === SESSION_ENDED)
  assert.equal(ended, true)
  await assert.rejects(apiFetch('/b'), (e) => e.status === 401)
  assert.equal(sent, 1, 'the second request never left')
})

test('a success returns the body', async () => {
  const apiFetch = createApiFetch({ send: async (path, opts) => reply(200, { path, method: opts.method }) })
  assert.deepEqual(await apiFetch('/api/push/subscriptions', { method: 'DELETE' }), { path: '/api/push/subscriptions', method: 'DELETE' })
})
