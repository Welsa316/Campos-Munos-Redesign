// The RingCentral webhook's front door: what it refuses before reading the
// body or asking the database, and how it rate limits. A fake database
// counts queries; the full flow with Postgres is in calls.flow.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createRingCentralWebhookRouter } from './ringcentralWebhook.js'
import { sha256Hex } from '../integrations/secretBox.js'

const TOKEN = 'our-verification-token-0123456789'

function fakeDb() {
  const queries = []
  return {
    queries,
    async query(sql) {
      queries.push(sql)
      if (/FROM rc_event_subscription/.test(sql)) return { rows: [{ subscription_id: 'sub-1', token_digest: sha256Hex(TOKEN) }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
  }
}

async function start(db) {
  const app = express()
  app.use('/webhooks/ringcentral', createRingCentralWebhookRouter({ db, onCallEnded: () => {} }))
  app.use((err, _req, res, _next) => res.status(err.status || 500).end())
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)) })
  const url = `http://127.0.0.1:${server.address().port}/webhooks/ringcentral`
  const hook = (headers, body = '{}') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  return { hook, close: () => { server.closeAllConnections(); return new Promise((r) => server.close(r)) } }
}

test('a delivery without our token header is refused before the body is read or the database asked', async () => {
  const db = fakeDb()
  const { hook, close } = await start(db)
  try {
    assert.equal((await hook({}, '{"uuid":"x","body":{}}')).status, 401)
    assert.equal((await hook({}, '{ not json')).status, 401, 'malformed JSON is never parsed')
    assert.equal((await hook({}, JSON.stringify({ pad: 'x'.repeat(300 * 1024) }))).status, 401, 'nor an oversized body')
    assert.equal(db.queries.length, 0)
    // With a token header it is checked against the stored digest.
    assert.equal((await hook({ 'Verification-Token': 'wrong' })).status, 401)
    assert.equal((await hook({ 'Verification-Token': TOKEN }, JSON.stringify({ subscriptionId: 'sub-1', uuid: 'n1', body: {} }))).status, 200)
  } finally { await close() }
})

test('refused deliveries are rate limited; our own never count toward it', async () => {
  const { hook, close } = await start(fakeDb())
  try {
    for (let i = 0; i < 320; i++) {
      assert.equal((await hook({ 'Verification-Token': TOKEN }, JSON.stringify({ subscriptionId: 'sub-1', uuid: `n${i}`, body: {} }))).status, 200)
    }
    for (let i = 0; i < 300; i++) assert.equal((await hook({ 'Verification-Token': 'guess' })).status, 401)
    assert.equal((await hook({ 'Verification-Token': 'guess' })).status, 429)
  } finally { await close() }
})
