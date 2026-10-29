import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMondayProvider, mondayWritesEnabled, MondayConfigError, DEFAULT_MONDAY_API_VERSION } from './index.js'

const okFetch = () => {
  const calls = []
  const fn = async (url, init) => {
    calls.push(init)
    return new Response(JSON.stringify({ data: { boards: [] } }), { status: 200 })
  }
  fn.calls = calls
  return fn
}

test('defaults to the mock provider', () => {
  assert.equal(createMondayProvider({}).mode, 'mock')
  assert.equal(createMondayProvider({ MONDAY_PROVIDER: 'mock' }).mode, 'mock')
})

test("'api' without MONDAY_API_TOKEN is a configuration error, not a fallback", () => {
  assert.throws(() => createMondayProvider({ MONDAY_PROVIDER: 'api' }), (err) => err instanceof MondayConfigError && err.code === 'monday_not_configured')
  assert.throws(() => createMondayProvider({ MONDAY_PROVIDER: 'api', MONDAY_API_TOKEN: '   ' }), MondayConfigError)
})

test('an unrecognised MONDAY_PROVIDER is rejected', () => {
  assert.throws(() => createMondayProvider({ MONDAY_PROVIDER: 'live' }), MondayConfigError)
})

test("'api' with a token builds the api provider with the configured version", async () => {
  const fetchImpl = okFetch()
  const p = createMondayProvider({ MONDAY_PROVIDER: 'api', MONDAY_API_TOKEN: 't', MONDAY_API_VERSION: '2026-04' }, { fetchImpl })
  assert.equal(p.mode, 'api')
  assert.equal(p.apiVersion, '2026-04')
  await p.listBoards()
  assert.equal(fetchImpl.calls[0].headers['API-Version'], '2026-04')
  assert.equal(createMondayProvider({ MONDAY_PROVIDER: 'api', MONDAY_API_TOKEN: 't' }, { fetchImpl }).apiVersion, DEFAULT_MONDAY_API_VERSION)
})

test('api writes are refused without a network call unless MONDAY_WRITES_ENABLED=true', async () => {
  const fetchImpl = okFetch()
  const p = createMondayProvider({ MONDAY_PROVIDER: 'api', MONDAY_API_TOKEN: 't' }, { fetchImpl })
  assert.equal(p.writesEnabled, false)
  const res = await p.updateItemColumns('1', '2', { saldo: '1.00' })
  assert.equal(res.ok, false)
  assert.equal(res.error.code, 'writes_disabled')
  assert.equal(fetchImpl.calls.length, 0)

  assert.equal(mondayWritesEnabled({}), false)
  assert.equal(mondayWritesEnabled({ MONDAY_WRITES_ENABLED: 'TRUE' }), true)
  const enabled = createMondayProvider({ MONDAY_PROVIDER: 'api', MONDAY_API_TOKEN: 't', MONDAY_WRITES_ENABLED: 'true' }, { fetchImpl })
  assert.equal(enabled.writesEnabled, true)
})
