// In-memory monday.com provider over a synthetic board. Same interface as
// api.js (see billing/model.js). It never touches the network: there is no
// fetch anywhere in this file. Every name, phone and email below is invented;
// phones use the fictional 555-01xx range and emails use example.com.

export const SYNTHETIC_BOARD_ID = '9000000001'

const PAYMENT_LABELS = { 0: 'Pendiente', 1: 'Pagado', 2: 'Vencido', 3: 'Pago parcial', 4: 'Revisar', 5: 'Sin facturas' }
const CASE_LABELS = { 0: 'Asilo', 1: 'DACA', 2: 'Ciudadanía', 3: 'VAWA', 4: 'Visa U' }

const status = (labels, label) => {
  const index = Object.entries(labels).find(([, l]) => l === label)?.[0]
  return { text: label, value: { index: Number(index) } }
}
const pay = (label) => status(PAYMENT_LABELS, label)
const kase = (label) => status(CASE_LABELS, label)
const num = (s) => ({ text: s, value: s })
const date = (d) => ({ text: d, value: { date: d } })
const text = (s) => ({ text: s, value: s })
const phone = (p) => ({ text: p, value: { phone: p, countryShortName: 'US' } })
const email = (e) => ({ text: e, value: { email: e, text: e } })
const empty = () => ({ text: '', value: null })

function client(id, name, { estado, saldo, ultimo, proximo, sync, tel, correo, notas, caso, eim }) {
  return {
    id,
    name,
    columns: {
      estado_pago: estado ? pay(estado) : empty(),
      saldo: saldo != null ? num(saldo) : empty(),
      ultimo_pago: ultimo ? date(ultimo) : empty(),
      proximo_venc: proximo ? date(proximo) : empty(),
      ultima_sync: sync ? text(sync) : empty(),
      telefono: tel ? phone(tel) : empty(),
      correo: correo ? email(correo) : empty(),
      notas: notas ? text(notas) : empty(),
      tipo_caso: caso ? kase(caso) : empty(),
      eim_id: eim ? text(eim) : empty(),
    },
  }
}

/** The synthetic seed. Exported so other tests can build fixtures from it. */
export const SYNTHETIC_SEED = Object.freeze({
  account: { id: '1', name: 'Synthetic account' },
  user: { id: '1', name: 'Mock User', email: 'mock.user@example.com' },
  boards: [
    {
      id: SYNTHETIC_BOARD_ID,
      name: 'Clientes (synthetic)',
      columns: [
        { id: 'name', title: 'Name', type: 'name', settings: {} },
        { id: 'estado_pago', title: 'Estado de pago', type: 'status', settings: { labels: PAYMENT_LABELS } },
        { id: 'saldo', title: 'Saldo pendiente', type: 'numbers', settings: { unit: { symbol: '$', direction: 'left' } } },
        { id: 'ultimo_pago', title: 'Último pago', type: 'date', settings: {} },
        { id: 'proximo_venc', title: 'Próximo vencimiento', type: 'date', settings: {} },
        { id: 'ultima_sync', title: 'Última sincronización', type: 'text', settings: {} },
        { id: 'telefono', title: 'Teléfono', type: 'phone', settings: {} },
        { id: 'correo', title: 'Correo', type: 'email', settings: {} },
        { id: 'notas', title: 'Notas', type: 'long_text', settings: {} },
        { id: 'tipo_caso', title: 'Case type', type: 'status', settings: { labels: CASE_LABELS } },
        // Holds the client's eImmigration ID on some items, so matching by a
        // stable identifier can be exercised against server/fixtures/billing.
        { id: 'eim_id', title: 'eImmigration ID', type: 'text', settings: {} },
      ],
      items: [
        client('1001', 'Ana Ficticia Núñez', { eim: 'EIM-C-0001', estado: 'Pagado', saldo: '0', ultimo: '2026-09-15', tel: '+1 555 0101', correo: 'ana.ficticia@example.com', caso: 'DACA' }),
        client('1002', 'Bruno Inventado Ríos', { eim: 'EIM-C-0002', estado: 'Pendiente', saldo: '1500', proximo: '2026-11-01', tel: '+1 555 0102', caso: 'Asilo' }),
        client('1003', 'Carmen Ejemplo Peña', { eim: 'EIM-C-0003', estado: 'Pago parcial', saldo: '750.5', ultimo: '2026-10-01', proximo: '2026-11-15', tel: '+1 555 0103', caso: 'VAWA', notas: 'Prefiere WhatsApp' }),
        // Same name as 1003: a different person. Matching must never merge them.
        client('1004', 'Carmen Ejemplo Peña', { estado: 'Vencido', saldo: '320', proximo: '2026-09-30', tel: '+1 555 0104', caso: 'Ciudadanía' }),
        // Family member of 1003 sharing her phone number.
        client('1005', 'Diego Ejemplo Peña', { estado: 'Pendiente', saldo: '900', tel: '+1 555 0103', caso: 'DACA' }),
        client('1006', 'Elena Simulada Gómez', { eim: 'EIM-C-0004', tel: '+1 555 0106', correo: 'elena.simulada@example.com', caso: 'Visa U' }),
        client('1007', 'Fabián Prueba Ibáñez', { estado: 'Revisar', saldo: '2000', caso: 'Asilo' }),
        client('1008', 'Gabriela Ficticia Toledo', { estado: 'Pagado', saldo: '0', ultimo: '2026-08-20', sync: '2026-10-01T12:00:00.000Z', caso: 'Ciudadanía' }),
        client('1009', 'Héctor Inventado Solís', { estado: 'Sin facturas', caso: 'DACA', correo: 'hector.inventado@example.com' }),
        client('1010', 'Inés Ejemplo Muñoz', { estado: 'Pendiente', saldo: '450', proximo: '2026-12-01', tel: '+1 555 0110', caso: 'VAWA' }),
        client('1011', 'Joaquín Simulado Lara', { estado: 'Vencido', saldo: '1200.75', ultimo: '2026-06-01', proximo: '2026-08-01', caso: 'Asilo' }),
        client('1012', 'Karla Prueba Ortíz', { tel: '+1 555 0112', caso: 'Visa U' }),
        // Name-only items mirroring fixture clients: never auto-linked.
        client('1013', 'Prueba Cinco', { caso: 'DACA' }),
        client('1014', 'Ana Ejemplo', { caso: 'Asilo' }),
        client('1015', 'Ana Ejemplo', { caso: 'VAWA' }),
      ],
    },
  ],
})

const clone = (v) => structuredClone(v)

function labelsOf(settings) {
  const raw = settings?.labels
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'string' ? l : l?.label ?? l?.name)).filter(Boolean)
  return Object.values(raw).filter((l) => typeof l === 'string' && l !== '')
}

/** Turn one change_multiple_column_values value into { text, value } or throw { code }. */
function applyValue(column, input) {
  const bad = (code, message) => Object.assign(new Error(message), { code })
  switch (column.type) {
    case 'status': {
      if (input == null || input === '' || (typeof input === 'object' && !('label' in input) && !('index' in input))) {
        return { text: '', value: null }
      }
      const labels = column.settings?.labels || {}
      let label = typeof input === 'string' ? input : input.label
      if (label == null && input.index != null) label = labels[input.index]
      if (!labelsOf(column.settings).includes(label)) throw bad('unknown_label', `Label is not defined on column ${column.id}`)
      const index = Object.entries(labels).find(([, l]) => l === label)?.[0]
      return { text: label, value: { index: Number(index) } }
    }
    case 'numbers': {
      if (input == null || input === '') return { text: '', value: null }
      const s = String(input)
      if (!Number.isFinite(Number(s))) throw bad('invalid_value', `Not a number for column ${column.id}`)
      return { text: s, value: s }
    }
    case 'date': {
      if (input == null || input === '' || (typeof input === 'object' && !input.date)) return { text: '', value: null }
      const d = typeof input === 'string' ? input : input.date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw bad('invalid_value', `Not a date for column ${column.id}`)
      return { text: d, value: { date: d } }
    }
    case 'text':
    case 'long_text': {
      const s = input == null ? '' : typeof input === 'object' ? String(input.text ?? '') : String(input)
      return { text: s, value: s === '' ? null : s }
    }
    default:
      throw bad('unsupported_column_type', `Column ${column.id} of type ${column.type} is not writable here`)
  }
}

/**
 * @param {Object} [opts]
 * @param {Object} [opts.seed]  defaults to SYNTHETIC_SEED; always deep-cloned
 * @param {()=>string} [opts.now]
 */
export function createMockMondayProvider({ seed = SYNTHETIC_SEED, now = () => new Date().toISOString() } = {}) {
  const state = clone(seed)
  const writeLog = []
  const boardById = (id) => state.boards.find((b) => b.id === String(id))

  return {
    mode: 'mock',

    async validateConnection() {
      return { ok: true, account: clone(state.account), user: clone(state.user) }
    },

    async listBoards() {
      return state.boards.map((b) => ({ id: b.id, name: b.name, itemsCount: b.items.length }))
    },

    async getBoardColumns(boardId) {
      const board = boardById(boardId)
      if (!board) throw Object.assign(new Error(`Board ${boardId} not found`), { code: 'board_not_found' })
      return clone(board.columns)
    },

    async listItems(boardId, { cursor = null, limit = 100 } = {}) {
      const board = boardById(boardId)
      if (!board) throw Object.assign(new Error(`Board ${boardId} not found`), { code: 'board_not_found' })
      const lim = Math.max(1, Math.min(500, Math.trunc(Number(limit)) || 100))
      let offset = 0
      if (cursor) {
        const m = /^mock:(\d+)$/.exec(cursor)
        if (!m) throw Object.assign(new Error('Invalid cursor'), { code: 'invalid_cursor' })
        offset = Number(m[1])
      }
      const items = board.items.slice(offset, offset + lim)
      const next = offset + lim < board.items.length ? `mock:${offset + lim}` : null
      return { items: clone(items), cursor: next }
    },

    /** Atomic: either every column in columnValues is written or none is. */
    async updateItemColumns(boardId, itemId, columnValues) {
      const id = String(itemId)
      const error = (code, message) => ({ ok: false, itemId: id, error: { code, message, retryable: false } })
      const board = boardById(boardId)
      if (!board) return error('board_not_found', `Board ${boardId} not found`)
      const item = board.items.find((i) => i.id === id)
      if (!item) return error('item_not_found', `Item ${id} not found`)
      const values = typeof columnValues === 'string' ? JSON.parse(columnValues) : columnValues || {}

      const staged = []
      for (const [columnId, input] of Object.entries(values)) {
        const column = board.columns.find((c) => c.id === columnId)
        if (!column) return error('column_missing', `Column ${columnId} not found`)
        try {
          staged.push({ columnId, next: applyValue(column, input) })
        } catch (err) {
          return error(err.code || 'invalid_value', err.message)
        }
      }
      const at = now()
      for (const { columnId, next } of staged) {
        const before = item.columns[columnId] || { text: '', value: null }
        item.columns[columnId] = next
        writeLog.push({ boardId: board.id, itemId: id, columnId, before: clone(before), after: clone(next), at })
      }
      return { ok: true, itemId: id }
    },

    getWriteLog() {
      return clone(writeLog)
    },
    clearWriteLog() {
      writeLog.length = 0
    },
  }
}

export default createMockMondayProvider
