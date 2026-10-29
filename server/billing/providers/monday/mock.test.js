import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createMockMondayProvider, SYNTHETIC_SEED, SYNTHETIC_BOARD_ID } from './mock.js'
import { listAllItems } from './api.js'

const realFetch = globalThis.fetch
let netCalls = 0
before(() => {
  globalThis.fetch = async () => {
    netCalls++
    throw new Error('mock provider must not use the network')
  }
})
after(() => {
  globalThis.fetch = realFetch
  assert.equal(netCalls, 0)
})

test('synthetic seed has the board, column types and edge-case clients', () => {
  const board = SYNTHETIC_SEED.boards[0]
  assert.equal(board.name, 'Clientes (synthetic)')
  const types = new Set(board.columns.map((c) => c.type))
  for (const t of ['status', 'numbers', 'date', 'text', 'phone', 'email', 'long_text']) assert.ok(types.has(t), t)
  assert.ok(board.columns.some((c) => c.title === 'Case type'))
  assert.ok(board.items.length >= 12)
  const names = board.items.map((i) => i.name)
  assert.ok(names.length - new Set(names).size >= 1, 'two clients share a name')
  assert.ok(names.some((n) => /[áéíóúñ]/i.test(n)), 'accented names present')
  const phones = board.items.map((i) => i.columns.telefono.text).filter(Boolean)
  assert.ok(phones.length - new Set(phones).size >= 1, 'a shared phone exists')
})

test('read API: connection, boards, columns, paginated items', async () => {
  const p = createMockMondayProvider()
  assert.equal(p.mode, 'mock')
  assert.equal((await p.validateConnection()).ok, true)
  assert.deepEqual(await p.listBoards(), [{ id: SYNTHETIC_BOARD_ID, name: 'Clientes (synthetic)', itemsCount: 15 }])
  const cols = await p.getBoardColumns(SYNTHETIC_BOARD_ID)
  assert.ok(cols.find((c) => c.id === 'estado_pago').settings.labels)
  const first = await p.listItems(SYNTHETIC_BOARD_ID, { limit: 5 })
  assert.equal(first.items.length, 5)
  assert.ok(first.cursor)
  const all = await listAllItems(p, SYNTHETIC_BOARD_ID, { limit: 5 })
  assert.equal(all.items.length, 15)
  assert.equal(all.pages, 3)
  await assert.rejects(p.getBoardColumns('nope'), { code: 'board_not_found' })
})

test('updateItemColumns mutates the board and records exactly the written columns', async () => {
  let n = 0
  const p = createMockMondayProvider({ now: () => `2026-10-29T00:00:0${n++}Z` })
  const res = await p.updateItemColumns(SYNTHETIC_BOARD_ID, '1002', {
    estado_pago: { label: 'Pagado' },
    saldo: '0.00',
    ultimo_pago: { date: '2026-10-20' },
    proximo_venc: null,
  })
  assert.deepEqual(res, { ok: true, itemId: '1002' })
  const item = (await listAllItems(p, SYNTHETIC_BOARD_ID)).items.find((i) => i.id === '1002')
  assert.equal(item.columns.estado_pago.text, 'Pagado')
  assert.equal(item.columns.saldo.text, '0.00')
  assert.deepEqual(item.columns.ultimo_pago.value, { date: '2026-10-20' })
  assert.equal(item.columns.proximo_venc.text, '')
  const log = p.getWriteLog()
  assert.deepEqual(log.map((w) => w.columnId), ['estado_pago', 'saldo', 'ultimo_pago', 'proximo_venc'])
  assert.equal(log[0].before.text, 'Pendiente')
  assert.equal(log[0].after.text, 'Pagado')
})

test('writes are atomic and validated: unknown label, missing column, missing item', async () => {
  const p = createMockMondayProvider()
  let r = await p.updateItemColumns(SYNTHETIC_BOARD_ID, '1002', { saldo: '1.00', estado_pago: { label: 'Cancelado' } })
  assert.equal(r.error.code, 'unknown_label')
  r = await p.updateItemColumns(SYNTHETIC_BOARD_ID, '1002', { saldo: '1.00', nope: 'x' })
  assert.equal(r.error.code, 'column_missing')
  r = await p.updateItemColumns(SYNTHETIC_BOARD_ID, '424242', { saldo: '1.00' })
  assert.equal(r.error.code, 'item_not_found')
  r = await p.updateItemColumns(SYNTHETIC_BOARD_ID, '1002', { telefono: '+1 555 0199' })
  assert.equal(r.error.code, 'unsupported_column_type')
  assert.deepEqual(p.getWriteLog(), [])
  const item = (await p.listItems(SYNTHETIC_BOARD_ID, { limit: 500 })).items.find((i) => i.id === '1002')
  assert.equal(item.columns.saldo.text, '1500', 'nothing partially written')
})

test('instances are isolated from each other and from the exported seed', async () => {
  const a = createMockMondayProvider()
  const b = createMockMondayProvider()
  await a.updateItemColumns(SYNTHETIC_BOARD_ID, '1001', { notas: 'cambiado' })
  const bItem = (await b.listItems(SYNTHETIC_BOARD_ID, { limit: 500 })).items.find((i) => i.id === '1001')
  assert.equal(bItem.columns.notas.text, '')
  assert.equal(SYNTHETIC_SEED.boards[0].items[0].columns.notas.text, '')
  assert.equal(b.getWriteLog().length, 0)
})
