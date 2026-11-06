// Soon imports after a call ends: only where the scheduled import runs, and
// once per delay however many calls end meanwhile.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { requestQuickSync, endsCall, cancelQuickSyncs } from './quickSync.js'

afterEach(cancelQuickSyncs)

test('nothing is scheduled where the call import does not run', () => {
  let ran = 0
  assert.equal(requestQuickSync({ env: { NODE_ENV: 'test' }, run: () => { ran++ } }), false)
  assert.equal(requestQuickSync({ env: { NODE_ENV: 'production', RINGCENTRAL_CALL_SYNC: 'false' }, run: () => { ran++ } }), false)
  assert.equal(ran, 0)
})

test('several calls ending close together share one import per delay', async () => {
  let ran = 0
  const env = { RINGCENTRAL_CALL_SYNC: 'true' }
  for (let i = 0; i < 5; i++) requestQuickSync({ env, run: () => { ran++ }, delays: [10, 30] })
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(ran, 2)
  requestQuickSync({ env, run: () => { ran++ }, delays: [10] })
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(ran, 3, 'a call ending later gets its own import')
})

test('only a party leaving the call asks for an import', () => {
  assert.equal(endsCall({ body: { parties: [{ status: { code: 'Proceeding' } }] } }), false)
  assert.equal(endsCall({ body: { parties: [{ status: { code: 'Disconnected' } }] } }), true)
  assert.equal(endsCall({}), false)
})
