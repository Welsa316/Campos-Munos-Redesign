import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createMondayApiProvider,
  listAllItems,
  MondayApiError,
  MONDAY_API_URL,
  DEFAULT_MONDAY_API_VERSION,
} from './api.js'

const TOKEN = 'tok_SECRET_abc123'

/** Fake fetch: each entry is a function(call) returning a Response, or throwing. */
function fakeFetch(handlers) {
  const calls = []
  const fn = async (url, init) => {
    const call = { url, init, body: JSON.parse(init.body) }
    calls.push(call)
    const h = handlers[Math.min(calls.length - 1, handlers.length - 1)]
    return h(call)
  }
  fn.calls = calls
  return fn
}
const json = (body, status = 200, headers = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const ok = (data) => json({ data })

function setup(handlers, opts = {}) {
  const fetchImpl = fakeFetch(handlers)
  const sleeps = []
  const logs = []
  const log = { info: (d) => logs.push(d), warn: (d) => logs.push(d) }
  const provider = createMondayApiProvider({ token: TOKEN, fetchImpl, sleep: async (ms) => sleeps.push(ms), log, ...opts })
  return { provider, fetchImpl, sleeps, logs }
}

const page = (ids, cursor) => ({
  cursor,
  items: ids.map((id) => ({
    id,
    name: `Item ${id}`,
    column_values: [
      { id: 'estado', text: 'Pagado', value: '{"index":1}' },
      { id: 'saldo', text: '12.50', value: '"12.50"' },
      { id: 'vacia', text: '', value: null },
    ],
  })),
})

test('GraphQL request shape: endpoint, headers, query fields, variables; token only in Authorization', async () => {
  const { provider, fetchImpl } = setup([ok({ boards: [{ items_page: page(['1'], 'c1') }] })])
  const res = await provider.listItems('42', { limit: 50 })
  const [call] = fetchImpl.calls
  assert.equal(call.url, MONDAY_API_URL)
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers.Authorization, TOKEN)
  assert.equal(call.init.headers['API-Version'], DEFAULT_MONDAY_API_VERSION)
  assert.equal(call.init.headers['Content-Type'], 'application/json')
  assert.match(call.body.query, /boards\(ids: \$ids\)/)
  assert.match(call.body.query, /items_page\(limit: \$limit\)/)
  assert.match(call.body.query, /column_values \{ id text value \}/)
  assert.match(call.body.query, /cursor/)
  assert.deepEqual(call.body.variables, { ids: ['42'], limit: 50 })
  assert.ok(!call.init.body.includes(TOKEN), 'token must not be in the body')
  const otherHeaders = Object.entries(call.init.headers).filter(([k]) => k !== 'Authorization')
  assert.ok(!JSON.stringify(otherHeaders).includes(TOKEN))
  assert.equal(res.cursor, 'c1')
  assert.deepEqual(res.items[0], {
    id: '1',
    name: 'Item 1',
    columns: {
      estado: { text: 'Pagado', value: { index: 1 } },
      saldo: { text: '12.50', value: '12.50' },
      vacia: { text: '', value: null },
    },
  })
})

test('apiVersion is configurable and limit is clamped to 500', async () => {
  const { provider, fetchImpl } = setup([ok({ boards: [{ items_page: page([], null) }] })], { apiVersion: '2026-04' })
  await provider.listItems('42', { limit: 10_000 })
  assert.equal(fetchImpl.calls[0].init.headers['API-Version'], '2026-04')
  assert.equal(fetchImpl.calls[0].body.variables.limit, 500)
})

test('listAllItems walks 3 pages through next_items_page with the returned cursors', async () => {
  const { provider, fetchImpl } = setup([
    ok({ boards: [{ items_page: page(['1', '2'], 'c1') }] }),
    ok({ next_items_page: page(['3', '4'], 'c2') }),
    ok({ next_items_page: page(['5'], null) }),
  ])
  const all = await listAllItems(provider, '42')
  assert.deepEqual(all.items.map((i) => i.id), ['1', '2', '3', '4', '5'])
  assert.equal(all.pages, 3)
  assert.equal(all.complete, true)
  assert.equal(fetchImpl.calls.length, 3)
  assert.match(fetchImpl.calls[1].body.query, /next_items_page\(cursor: \$cursor, limit: \$limit\)/)
  assert.equal(fetchImpl.calls[1].body.variables.cursor, 'c1')
  assert.equal(fetchImpl.calls[2].body.variables.cursor, 'c2')
  assert.equal(fetchImpl.calls[0].body.variables.limit, 500)
})

test('listAllItems stops at maxPages and reports incomplete', async () => {
  const { provider } = setup([
    ok({ boards: [{ items_page: page(['1'], 'c1') }] }),
    ok({ next_items_page: page(['2'], 'c2') }),
  ])
  const all = await listAllItems(provider, '42', { maxPages: 2 })
  assert.equal(all.pages, 2)
  assert.equal(all.complete, false)
})

test('complexity error with retry_in_seconds is retried after that wait, then succeeds', async () => {
  const { provider, fetchImpl, sleeps } = setup([
    json({
      errors: [{ message: 'Complexity budget exhausted', extensions: { code: 'COMPLEXITY_BUDGET_EXHAUSTED', status_code: 429, retry_in_seconds: 7 } }],
    }),
    ok({ boards: [{ items_page: page(['1'], null) }] }),
  ])
  const res = await provider.listItems('42')
  assert.equal(res.items.length, 1)
  assert.equal(fetchImpl.calls.length, 2)
  assert.deepEqual(sleeps, [7000])
})

test('legacy ComplexityException body is understood and its reset time honoured', async () => {
  const { provider, sleeps } = setup([
    json({ error_code: 'ComplexityException', status_code: 429, error_message: 'Complexity budget exhausted, reset in 12 seconds' }),
    ok({ me: { id: 1, name: 'x', email: 'x@example.com' }, account: { id: 2, name: 'acct' } }),
  ])
  const res = await provider.validateConnection()
  assert.equal(res.ok, true)
  assert.deepEqual(sleeps, [12000])
})

test('retry exhaustion throws a retryable MondayApiError after maxRetries + 1 attempts', async () => {
  const { provider, fetchImpl, sleeps } = setup([json({ errors: [{ message: 'Rate Limit Exceeded', extensions: { code: 'Rate Limit Exceeded' } }] }, 429)], {
    maxRetries: 2,
  })
  await assert.rejects(provider.getBoardColumns('42'), (err) => {
    assert.ok(err instanceof MondayApiError)
    assert.equal(err.retryable, true)
    assert.equal(err.status, 429)
    assert.equal(err.code, 'Rate Limit Exceeded')
    return true
  })
  assert.equal(fetchImpl.calls.length, 3)
  assert.deepEqual(sleeps, [500, 1000], 'exponential backoff without a server hint')
})

test('5xx is retried with Retry-After honoured', async () => {
  const { provider, fetchImpl, sleeps } = setup([
    json({ error_message: 'Internal Server Error' }, 500, { 'retry-after': '3' }),
    ok({ boards: [{ id: '42', name: 'b', items_count: 0, columns: [] }] }),
  ])
  await provider.getBoardColumns('42')
  assert.equal(fetchImpl.calls.length, 2)
  assert.deepEqual(sleeps, [3000])
})

for (const status of [401, 403]) {
  test(`HTTP ${status} is never retried`, async () => {
    const { provider, fetchImpl, sleeps } = setup([json({ errors: [{ message: 'nope', extensions: { code: 'UserUnauthorizedException', status_code: status } }] }, status)])
    await assert.rejects(provider.listBoards(), (err) => {
      assert.ok(err instanceof MondayApiError)
      assert.equal(err.status, status)
      assert.equal(err.retryable, false)
      return true
    })
    assert.equal(fetchImpl.calls.length, 1)
    assert.deepEqual(sleeps, [])
  })
}

test('DAILY_LIMIT_EXCEEDED is surfaced without retrying', async () => {
  const { provider, fetchImpl } = setup([json({ errors: [{ message: 'Daily limit', extensions: { code: 'DAILY_LIMIT_EXCEEDED', status_code: 429 } }] }, 429)])
  await assert.rejects(provider.listBoards(), { code: 'DAILY_LIMIT_EXCEEDED', retryable: false })
  assert.equal(fetchImpl.calls.length, 1)
})

test('network error is retried', async () => {
  const { provider, fetchImpl, sleeps } = setup([
    () => {
      throw new TypeError('fetch failed')
    },
    ok({ boards: [{ id: '42', name: 'b', items_count: 0, type: 'board' }] }),
  ])
  const boards = await provider.listBoards()
  assert.deepEqual(boards, [{ id: '42', name: 'b', itemsCount: 0 }])
  assert.equal(fetchImpl.calls.length, 2)
  assert.equal(sleeps.length, 1)
})

test('GraphQL errors inside a 200 response are surfaced, not swallowed and not retried', async () => {
  const { provider, fetchImpl } = setup([
    json({ data: null, errors: [{ message: 'Board not found', extensions: { code: 'InvalidBoardIdException', status_code: 200 } }] }),
  ])
  await assert.rejects(provider.getBoardColumns('999'), (err) => {
    assert.ok(err instanceof MondayApiError)
    assert.equal(err.code, 'InvalidBoardIdException')
    assert.equal(err.retryable, false)
    assert.match(err.message, /Board not found/)
    return true
  })
  assert.equal(fetchImpl.calls.length, 1)
})

test('error messages never contain the token, even when upstream echoes it', async () => {
  const cases = [
    json({ errors: [{ message: `Bad token ${TOKEN}`, extensions: { code: 'Unauthorized' } }] }, 401),
    () => {
      throw new Error(`connect failed with header ${TOKEN}`)
    },
    json({ errors: [{ message: `Parse error near ${TOKEN}` }] }),
  ]
  for (const handler of cases) {
    const { provider } = setup([handler], { maxRetries: 0 })
    const err = await provider.getBoardColumns('1').catch((e) => e)
    assert.ok(err instanceof MondayApiError)
    assert.ok(!err.message.includes(TOKEN), err.message)
    assert.ok(!JSON.stringify(err).includes(TOKEN))
    assert.ok(!String(err.stack).includes(TOKEN))
  }
})

test('getBoardColumns parses settings_str', async () => {
  const { provider, fetchImpl } = setup([
    ok({ boards: [{ id: '42', name: 'b', items_count: 3, columns: [{ id: 'estado', title: 'Estado', type: 'status', settings_str: '{"labels":{"1":"Pagado"}}' }] }] }),
  ])
  const cols = await provider.getBoardColumns('42')
  assert.deepEqual(cols, [{ id: 'estado', title: 'Estado', type: 'status', settings: { labels: { 1: 'Pagado' } } }])
  assert.match(fetchImpl.calls[0].body.query, /columns \{ id title type settings_str \}/)
  assert.deepEqual(fetchImpl.calls[0].body.variables, { ids: ['42'] })
})

test('validateConnection queries me and account; returns an error object on failure', async () => {
  const good = setup([ok({ me: { id: 7, name: 'Staff', email: 's@example.com' }, account: { id: 9, name: 'Firm' } })])
  const res = await good.provider.validateConnection()
  assert.deepEqual(res, { ok: true, account: { id: '9', name: 'Firm' }, user: { id: '7', name: 'Staff', email: 's@example.com' } })
  assert.match(good.fetchImpl.calls[0].body.query, /me \{ id name email \}/)
  assert.match(good.fetchImpl.calls[0].body.query, /account \{ id name \}/)

  const bad = setup([json({ errors: [{ message: 'Not Authenticated' }] }, 401)])
  const fail = await bad.provider.validateConnection()
  assert.equal(fail.ok, false)
  assert.equal(fail.error.status, 401)
  assert.equal(fail.error.retryable, false)
})

test('updateItemColumns sends column_values as a JSON string and logs ids/counts only', async () => {
  const { provider, fetchImpl, logs } = setup([ok({ change_multiple_column_values: { id: '555' } })])
  const values = { estado: { label: 'Pagado' }, saldo: '0.00' }
  const res = await provider.updateItemColumns('42', '555', values)
  assert.deepEqual(res, { ok: true, itemId: '555' })
  const { body } = fetchImpl.calls[0]
  assert.match(body.query, /change_multiple_column_values\(board_id: \$boardId, item_id: \$itemId, column_values: \$values\)/)
  assert.equal(typeof body.variables.values, 'string')
  assert.deepEqual(JSON.parse(body.variables.values), values)
  assert.equal(body.variables.boardId, '42')
  assert.equal(body.variables.itemId, '555')
  assert.ok(!JSON.stringify(logs).includes('Pagado'), 'values must not be logged')
})

test('updateItemColumns returns (does not throw) a structured error, and never fakes success', async () => {
  const { provider } = setup([json({ errors: [{ message: 'bad value', extensions: { code: 'ColumnValueException' } }] })])
  const res = await provider.updateItemColumns('42', '555', { saldo: 'x' })
  assert.equal(res.ok, false)
  assert.equal(res.error.code, 'ColumnValueException')
})

test('constructor refuses a missing token', () => {
  assert.throws(() => createMondayApiProvider({ fetchImpl: async () => {} }), { code: 'not_configured' })
})
