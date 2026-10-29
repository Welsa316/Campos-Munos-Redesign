import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeColumnValue, buildProposedChanges, toColumnValues, validateColumnMap, MondayEncodeError } from './mondaySync.js'
import { createMockMondayProvider, SYNTHETIC_BOARD_ID } from './providers/monday/mock.js'
import { listAllItems } from './providers/monday/api.js'

const STATUS_SETTINGS = { labels: { 0: 'Pendiente', 1: 'Pagado', 2: 'Vencido', 3: 'Pago parcial', 4: 'Revisar', 5: 'Sin facturas' } }
const COLUMN_MAP = {
  status: {
    columnId: 'estado_pago',
    labels: { paid: 'Pagado', partial: 'Pago parcial', unpaid: 'Pendiente', overdue: 'Vencido', needs_review: 'Revisar', no_invoices: 'Sin facturas' },
  },
  outstanding: { columnId: 'saldo' },
  lastPaymentDate: { columnId: 'ultimo_pago' },
  nextDueDate: { columnId: 'proximo_venc' },
  lastSync: { columnId: 'ultima_sync' },
}
const MAPPED = new Set(['estado_pago', 'saldo', 'ultimo_pago', 'proximo_venc', 'ultima_sync'])
const SYNCED_AT = '2026-10-29T15:00:00.000Z'

const summary = (mondayItemId, over = {}) => ({
  mondayItemId,
  overallStatus: 'unpaid',
  outstandingCents: 0,
  lastPaymentDate: null,
  nextDueDate: null,
  syncedAt: SYNCED_AT,
  ...over,
})

async function loadBoard(provider) {
  return {
    boardColumns: await provider.getBoardColumns(SYNTHETIC_BOARD_ID),
    currentItems: (await listAllItems(provider, SYNTHETIC_BOARD_ID)).items,
  }
}

async function applyAll(provider, proposals) {
  for (const p of proposals) {
    if (!p.changes.length) continue
    const res = await provider.updateItemColumns(SYNTHETIC_BOARD_ID, p.itemId, toColumnValues(p.changes))
    assert.equal(res.ok, true, JSON.stringify(res))
  }
}

// A realistic batch touching most clients, including the duplicate-name pair.
const BATCH = [
  summary('1001', { overallStatus: 'paid', outstandingCents: 0, lastPaymentDate: '2026-09-15' }), // already matches
  summary('1002', { overallStatus: 'partial', outstandingCents: 100000, lastPaymentDate: '2026-10-20', nextDueDate: '2026-11-01' }),
  summary('1003', { overallStatus: 'partial', outstandingCents: 75050, lastPaymentDate: '2026-10-01', nextDueDate: '2026-11-15' }), // matches
  summary('1004', { overallStatus: 'paid', outstandingCents: 0, lastPaymentDate: '2026-10-25' }),
  summary('1006', { overallStatus: 'no_invoices' }),
  summary('1011', { overallStatus: 'overdue', outstandingCents: 120075, lastPaymentDate: '2026-06-01', nextDueDate: '2026-08-01' }), // matches
]

// encodeColumnValue ---------------------------------------------------------

test('encodeColumnValue: status uses an existing label', () => {
  assert.deepEqual(encodeColumnValue('status', 'Pagado', STATUS_SETTINGS), { label: 'Pagado' })
  assert.deepEqual(encodeColumnValue('status', 'Done', { labels: [{ id: 1, label: 'Done' }] }), { label: 'Done' })
})

test('encodeColumnValue: unknown status label is rejected', () => {
  assert.throws(() => encodeColumnValue('status', 'Cancelado', STATUS_SETTINGS), (e) => e instanceof MondayEncodeError && e.code === 'unknown_label')
  assert.throws(() => encodeColumnValue('status', 'Pagado', {}), { code: 'unknown_label' })
})

test('encodeColumnValue: numbers are cents rendered with 2 decimals', () => {
  assert.equal(encodeColumnValue('numbers', 12345), '123.45')
  assert.equal(encodeColumnValue('numbers', 5), '0.05')
  assert.equal(encodeColumnValue('numbers', 0), '0.00')
  assert.equal(encodeColumnValue('numbers', -250), '-2.50')
  assert.throws(() => encodeColumnValue('numbers', 12.5), { code: 'invalid_value' })
})

test('encodeColumnValue: dates and clearing', () => {
  assert.deepEqual(encodeColumnValue('date', '2026-02-28'), { date: '2026-02-28' })
  assert.equal(encodeColumnValue('date', null), null)
  assert.throws(() => encodeColumnValue('date', '2026-02-30'), { code: 'invalid_value' })
  assert.throws(() => encodeColumnValue('date', '02/03/2026'), { code: 'invalid_value' })
})

test('encodeColumnValue: text, long_text and unsupported types', () => {
  assert.equal(encodeColumnValue('text', SYNCED_AT), SYNCED_AT)
  assert.equal(encodeColumnValue('long_text', 'hola'), 'hola')
  for (const t of ['phone', 'email', 'people', 'dropdown']) {
    assert.throws(() => encodeColumnValue(t, 'x'), { code: 'unsupported_column_type' })
  }
})

// buildProposedChanges -------------------------------------------------------

test('buildProposedChanges emits only real diffs, with from/to text', async () => {
  const p = createMockMondayProvider()
  const proposals = buildProposedChanges({ summaries: BATCH, columnMap: COLUMN_MAP, ...(await loadBoard(p)) })
  const byId = Object.fromEntries(proposals.map((x) => [x.itemId, x]))

  assert.deepEqual(byId['1001'].changes, [], 'unchanged client produces nothing (0 == 0.00)')
  assert.deepEqual(byId['1003'].changes, [])
  assert.deepEqual(byId['1011'].changes, [])

  const c2 = byId['1002'].changes
  assert.deepEqual(c2.map((c) => c.field), ['status', 'outstanding', 'lastPaymentDate', 'lastSync'])
  assert.deepEqual(c2[0], { field: 'status', columnId: 'estado_pago', columnTitle: 'Estado de pago', from: 'Pendiente', to: 'Pago parcial', value: { label: 'Pago parcial' } })
  assert.deepEqual(c2[1], { field: 'outstanding', columnId: 'saldo', columnTitle: 'Saldo pendiente', from: '1500', to: '1000.00', value: '1000.00' })
  assert.deepEqual(c2[2].value, { date: '2026-10-20' })
  assert.deepEqual(c2[3].value, 'Oct 29, 2026, 10:00 AM CT')

  const c4 = byId['1004'].changes
  assert.deepEqual(c4.map((c) => c.field), ['status', 'outstanding', 'lastPaymentDate', 'nextDueDate', 'lastSync'])
  assert.equal(c4[3].from, '2026-09-30')
  assert.equal(c4[3].to, '')
  assert.equal(c4[3].value, null, 'a due date that no longer applies is cleared')

  for (const prop of proposals) for (const c of prop.changes) assert.ok(MAPPED.has(c.columnId), c.columnId)
})

test('idempotency: apply proposed changes to the board, rebuild, get zero changes', async () => {
  const p = createMockMondayProvider()
  const first = buildProposedChanges({ summaries: BATCH, columnMap: COLUMN_MAP, ...(await loadBoard(p)) })
  assert.ok(first.reduce((n, x) => n + x.changes.length, 0) > 0)
  await applyAll(p, first)
  const writes = p.getWriteLog().length

  // Same billing data, a later sync time: nothing should be written.
  const later = BATCH.map((s) => ({ ...s, syncedAt: '2026-10-30T09:00:00.000Z' }))
  const second = buildProposedChanges({ summaries: later, columnMap: COLUMN_MAP, ...(await loadBoard(p)) })
  assert.equal(second.reduce((n, x) => n + x.changes.length, 0), 0, JSON.stringify(second.filter((x) => x.changes.length)))
  await applyAll(p, second)
  assert.equal(p.getWriteLog().length, writes)
})

test('unrelated columns are never touched (verified through the mock write log)', async () => {
  const p = createMockMondayProvider()
  const before = await loadBoard(p)
  await applyAll(p, buildProposedChanges({ summaries: BATCH, columnMap: COLUMN_MAP, ...before }))
  const log = p.getWriteLog()
  assert.ok(log.length > 0)
  for (const w of log) assert.ok(MAPPED.has(w.columnId), `wrote unmapped column ${w.columnId}`)

  const after = await loadBoard(p)
  for (const item of before.currentItems) {
    const now = after.currentItems.find((i) => i.id === item.id)
    assert.equal(now.name, item.name)
    for (const [colId, value] of Object.entries(item.columns)) {
      if (!MAPPED.has(colId)) assert.deepEqual(now.columns[colId], value, `${item.id}.${colId} changed`)
    }
  }
  // Items with no summary are not written at all.
  const writtenItems = new Set(log.map((w) => w.itemId))
  for (const id of ['1005', '1007', '1008', '1009', '1010', '1012']) assert.ok(!writtenItems.has(id))
})

test('a partial column map never writes the unmapped fields', async () => {
  const p = createMockMondayProvider()
  const map = { outstanding: { columnId: 'saldo' } }
  const proposals = buildProposedChanges({ summaries: BATCH, columnMap: map, ...(await loadBoard(p)) })
  for (const prop of proposals) for (const c of prop.changes) assert.equal(c.columnId, 'saldo')
  const p2 = proposals.find((x) => x.itemId === '1002')
  assert.deepEqual(p2.skipped.map((s) => [s.field, s.reason]), [
    ['status', 'not_mapped'],
    ['lastPaymentDate', 'not_mapped'],
    ['nextDueDate', 'not_mapped'],
    ['lastSync', 'not_mapped'],
  ])
})

test('missing item and missing column are skipped with reasons', async () => {
  const p = createMockMondayProvider()
  const board = await loadBoard(p)
  const map = { ...COLUMN_MAP, nextDueDate: { columnId: 'deleted_col' } }
  const [missing, present] = buildProposedChanges({
    summaries: [summary('777777', { overallStatus: 'paid' }), summary('1002', { overallStatus: 'unpaid', outstandingCents: 150000, nextDueDate: '2026-12-01' })],
    columnMap: map,
    ...board,
  })
  assert.deepEqual(missing, { itemId: '777777', itemName: null, changes: [], skipped: [{ field: '_item', reason: 'item_not_found' }] })
  assert.ok(present.skipped.some((s) => s.field === 'nextDueDate' && s.reason === 'column_missing'))
  assert.ok(!present.changes.some((c) => c.columnId === 'deleted_col'))
})

test('unknown label and wrong column type are skipped, not written', async () => {
  const p = createMockMondayProvider()
  const map = {
    status: { columnId: 'estado_pago', labels: { ...COLUMN_MAP.status.labels, paid: 'Cancelado' } },
    outstanding: { columnId: 'notas' }, // long_text, not numbers
  }
  const [r] = buildProposedChanges({ summaries: [summary('1002', { overallStatus: 'paid', outstandingCents: 0 })], columnMap: map, ...(await loadBoard(p)) })
  assert.deepEqual(r.changes, [])
  assert.ok(r.skipped.some((s) => s.field === 'status' && s.reason === 'unknown_label'))
  assert.ok(r.skipped.some((s) => s.field === 'outstanding' && s.reason === 'wrong_column_type'))
})

test('lastSync only changes when another field changed for that item', async () => {
  const p = createMockMondayProvider()
  const board = await loadBoard(p)
  const [unchanged, changed] = buildProposedChanges({
    summaries: [
      summary('1008', { overallStatus: 'paid', outstandingCents: 0, lastPaymentDate: '2026-08-20' }), // all equal; ultima_sync is old
      summary('1010', { overallStatus: 'unpaid', outstandingCents: 40000, nextDueDate: '2026-12-01' }), // saldo 450 → 400.00
    ],
    columnMap: COLUMN_MAP,
    ...board,
  })
  assert.deepEqual(unchanged.changes, [])
  assert.ok(unchanged.skipped.some((s) => s.field === 'lastSync' && s.reason === 'no_other_changes'))
  assert.deepEqual(changed.changes.map((c) => c.field), ['outstanding', 'lastSync'])
})

test('lastSync on a date column writes the date part', async () => {
  const p = createMockMondayProvider()
  const board = await loadBoard(p)
  const map = { ...COLUMN_MAP, lastPaymentDate: undefined, lastSync: { columnId: 'ultimo_pago' } }
  const [r] = buildProposedChanges({ summaries: [summary('1002', { outstandingCents: 1 })], columnMap: map, ...board })
  assert.deepEqual(r.changes.find((c) => c.field === 'lastSync').value, { date: '2026-10-29' })
})

test('duplicate summaries for one item are not double-applied', async () => {
  const p = createMockMondayProvider()
  const out = buildProposedChanges({ summaries: [summary('1002'), summary('1002', { overallStatus: 'paid' })], columnMap: COLUMN_MAP, ...(await loadBoard(p)) })
  assert.equal(out[1].changes.length, 0)
  assert.deepEqual(out[1].skipped, [{ field: '_item', reason: 'duplicate_summary' }])
})

test('toColumnValues builds the change_multiple_column_values object', () => {
  const values = toColumnValues([
    { columnId: 'estado_pago', value: { label: 'Pagado' } },
    { columnId: 'saldo', value: '0.00' },
    { columnId: 'proximo_venc', value: null },
  ])
  assert.deepEqual(values, { estado_pago: { label: 'Pagado' }, saldo: '0.00', proximo_venc: null })
  assert.throws(() => toColumnValues([{ columnId: 'a', value: 1 }, { columnId: 'a', value: 2 }]), { code: 'duplicate_column' })
})

// validateColumnMap ---------------------------------------------------------

test('validateColumnMap accepts the good map against the synthetic board', async () => {
  const cols = await createMockMondayProvider().getBoardColumns(SYNTHETIC_BOARD_ID)
  assert.deepEqual(validateColumnMap(COLUMN_MAP, cols), [])
  assert.deepEqual(validateColumnMap({}, cols), [])
})

test('validateColumnMap reports wrong types, missing columns, missing and unknown labels, duplicates', async () => {
  const cols = await createMockMondayProvider().getBoardColumns(SYNTHETIC_BOARD_ID)
  const errors = validateColumnMap(
    {
      status: { columnId: 'estado_pago', labels: { paid: 'Pagado', partial: 'Parcialito', unpaid: 'Pendiente', overdue: 'Vencido', needs_review: 'Revisar' } },
      outstanding: { columnId: 'ultima_sync' }, // text
      lastPaymentDate: { columnId: 'saldo' }, // numbers
      nextDueDate: { columnId: 'gone' },
      lastSync: { columnId: 'ultima_sync' }, // also used by outstanding
      bogus: { columnId: 'notas' },
    },
    cols,
  )
  const has = (field, code) => errors.some((e) => e.field === field && e.code === code)
  assert.ok(has('status', 'unknown_label'))
  assert.ok(errors.some((e) => e.code === 'missing_label' && e.status === 'no_invoices'))
  assert.ok(has('outstanding', 'wrong_column_type'))
  assert.ok(has('lastPaymentDate', 'wrong_column_type'))
  assert.ok(has('nextDueDate', 'column_missing'))
  assert.ok(has('lastSync', 'duplicate_column'))
  assert.ok(has('bogus', 'unknown_field'))
  // status mapped onto a non-status column
  assert.ok(validateColumnMap({ status: { columnId: 'saldo', labels: COLUMN_MAP.status.labels } }, cols).some((e) => e.code === 'wrong_column_type'))
})

test('last-sync values use the firm\'s Central-time calendar, not UTC', async () => {
  const { firmDate, firmStamp } = await import('./mondaySync.js')
  // 02:30 UTC on Oct 30 is still the evening of Oct 29 in New Orleans.
  assert.equal(firmDate('2026-10-30T02:30:00.000Z'), '2026-10-29')
  assert.equal(firmStamp('2026-10-30T02:30:00.000Z'), 'Oct 29, 2026, 9:30 PM CT')
})
