// Pure planning for the monday.com sync: no I/O, no clock, no provider.
// Turns ClientBillingSummary[] (billing/model.js) plus the admin's column map
// and the board's current state into a reviewable list of column changes.
//
// Value formats follow the change_multiple_column_values column JSON:
//   status      { label: 'Pagado' }      (label must already exist on the column)
//   numbers     '123.45'                 (string)
//   date        { date: 'YYYY-MM-DD' }   (null clears)
//   text        'plain string'
// https://developer.monday.com/api-reference/reference/column-types-reference

export const SYNC_FIELDS = ['status', 'outstanding', 'lastPaymentDate', 'nextDueDate', 'lastSync']
export const SUMMARY_STATUSES = ['paid', 'partial', 'unpaid', 'overdue', 'needs_review', 'no_invoices']

/** Column types each field may be mapped to (for the settings UI and validation). */
export const FIELD_COLUMN_TYPES = Object.freeze({
  status: ['status'],
  outstanding: ['numbers'],
  lastPaymentDate: ['date'],
  nextDueDate: ['date'],
  lastSync: ['date', 'text', 'long_text'],
})

export class MondayEncodeError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'MondayEncodeError'
    this.code = code
  }
}

/** Status labels defined on a column, from its parsed settings_str. */
export function statusLabels(settings) {
  const raw = settings?.labels
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'string' ? l : l?.label ?? l?.name)).filter(Boolean)
  return Object.values(raw).filter((l) => typeof l === 'string' && l !== '')
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
function isCalendarDate(s) {
  const m = typeof s === 'string' && DATE_RE.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

// The firm works in Central time. A sync at 8 pm in New Orleans is already
// tomorrow in UTC, so dates and stamps are rendered in the firm's zone.
const FIRM_TZ = 'America/Chicago'
export function firmDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FIRM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
export function firmStamp(iso) {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: FIRM_TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  return `${s} CT`
}

export function centsToDecimalString(cents) {
  if (!Number.isSafeInteger(cents)) throw new MondayEncodeError('invalid_value', 'Amount must be integer cents')
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Encode one value for change_multiple_column_values. Throws MondayEncodeError
 * with code 'unknown_label' | 'invalid_value' | 'unsupported_column_type'.
 */
export function encodeColumnValue(columnType, value, columnSettings = {}) {
  switch (columnType) {
    case 'status': {
      if (typeof value !== 'string' || value === '') throw new MondayEncodeError('invalid_value', 'Status label required')
      if (!statusLabels(columnSettings).includes(value)) {
        throw new MondayEncodeError('unknown_label', 'Label is not defined on the status column')
      }
      return { label: value }
    }
    case 'numbers':
      if (value == null) return ''
      return centsToDecimalString(value)
    case 'date':
      if (value == null || value === '') return null
      if (!isCalendarDate(value)) throw new MondayEncodeError('invalid_value', 'Date must be YYYY-MM-DD')
      return { date: value }
    case 'text':
    case 'long_text':
      return value == null ? '' : String(value)
    default:
      throw new MondayEncodeError('unsupported_column_type', `Column type ${columnType} is not supported`)
  }
}

// Text the board will show after the write, and the comparable form of both sides.
function displayText(columnType, encoded) {
  if (encoded == null) return ''
  if (columnType === 'status') return encoded.label
  if (columnType === 'date') return encoded.date
  return String(encoded)
}

function sameValue(columnType, current, encoded) {
  const curText = String(current?.text ?? '').trim()
  switch (columnType) {
    case 'status':
      return curText === (encoded?.label ?? '')
    case 'numbers': {
      if (encoded === '') return curText === ''
      if (curText === '') return false
      const n = Number(curText.replace(/[^0-9.\-]/g, ''))
      return Number.isFinite(n) && Math.round(n * 100) === Math.round(Number(encoded) * 100)
    }
    case 'date': {
      const curDate = (current?.value && typeof current.value === 'object' && current.value.date) || curText.slice(0, 10)
      return (curDate || '') === (encoded?.date ?? '')
    }
    default:
      return curText === String(encoded ?? '').trim()
  }
}

function targetFor(field, summary, entry, column) {
  switch (field) {
    case 'status': {
      const label = entry.labels?.[summary.overallStatus]
      if (!label) return { skip: 'label_not_mapped' }
      return { raw: label }
    }
    case 'outstanding':
      return { raw: summary.outstandingCents }
    case 'lastPaymentDate':
      return { raw: summary.lastPaymentDate ?? null }
    case 'nextDueDate':
      return { raw: summary.nextDueDate ?? null }
    case 'lastSync':
      if (!summary.syncedAt) return { skip: 'invalid_value' }
      return { raw: column.type === 'date' ? firmDate(summary.syncedAt) : firmStamp(summary.syncedAt) }
    default:
      return { skip: 'unknown_field' }
  }
}

/**
 * @param {Object} input
 * @param {import('./model.js').ClientBillingSummary[]} input.summaries
 * @param {Object} input.columnMap
 * @param {{id,title,type,settings}[]} input.boardColumns
 * @param {{id,name,columns}[]} input.currentItems
 * @returns {{itemId, itemName, changes: Object[], skipped: {field, reason}[]}[]}
 */
export function buildProposedChanges({ summaries = [], columnMap = {}, boardColumns = [], currentItems = [] }) {
  const columnsById = new Map(boardColumns.map((c) => [c.id, c]))
  const itemsById = new Map(currentItems.map((i) => [String(i.id), i]))
  const seen = new Set()
  const out = []

  for (const summary of summaries) {
    const itemId = String(summary.mondayItemId)
    const item = itemsById.get(itemId)
    if (!item) {
      out.push({ itemId, itemName: null, changes: [], skipped: [{ field: '_item', reason: 'item_not_found' }] })
      continue
    }
    if (seen.has(itemId)) {
      out.push({ itemId, itemName: item.name, changes: [], skipped: [{ field: '_item', reason: 'duplicate_summary' }] })
      continue
    }
    seen.add(itemId)

    const changes = []
    const skipped = []
    const usedColumns = new Set()

    const consider = (field) => {
      const entry = columnMap?.[field]
      if (!entry?.columnId) return skipped.push({ field, reason: 'not_mapped' })
      const column = columnsById.get(entry.columnId)
      if (!column) return skipped.push({ field, reason: 'column_missing' })
      if (!FIELD_COLUMN_TYPES[field].includes(column.type)) return skipped.push({ field, reason: 'wrong_column_type' })
      if (usedColumns.has(column.id)) return skipped.push({ field, reason: 'duplicate_column' })
      const target = targetFor(field, summary, entry, column)
      if (target.skip) return skipped.push({ field, reason: target.skip })
      let encoded
      try {
        encoded = encodeColumnValue(column.type, target.raw, column.settings)
      } catch (err) {
        if (!(err instanceof MondayEncodeError)) throw err
        return skipped.push({ field, reason: err.code })
      }
      usedColumns.add(column.id)
      const current = item.columns?.[column.id]
      if (sameValue(column.type, current, encoded)) return
      changes.push({
        field,
        columnId: column.id,
        columnTitle: column.title,
        from: String(current?.text ?? ''),
        to: displayText(column.type, encoded),
        value: encoded,
      })
    }

    for (const field of ['status', 'outstanding', 'lastPaymentDate', 'nextDueDate']) consider(field)
    // The sync stamp only moves when something real changed, so re-running a
    // sync over unchanged billing data writes nothing.
    if (changes.length) consider('lastSync')
    else if (columnMap?.lastSync?.columnId) skipped.push({ field: 'lastSync', reason: 'no_other_changes' })
    else skipped.push({ field: 'lastSync', reason: 'not_mapped' })

    out.push({ itemId, itemName: item.name, changes, skipped })
  }
  return out
}

/** The column_values object for change_multiple_column_values, for one item. */
export function toColumnValues(changes) {
  const values = {}
  for (const change of changes || []) {
    if (Object.prototype.hasOwnProperty.call(values, change.columnId)) {
      throw new MondayEncodeError('duplicate_column', `Column ${change.columnId} appears twice`)
    }
    values[change.columnId] = change.value
  }
  return values
}

/**
 * Check an admin's column map against the board. Returns [] when usable.
 * @returns {{field: string, code: string, message: string}[]}
 */
export function validateColumnMap(columnMap, boardColumns = []) {
  const errors = []
  const columnsById = new Map(boardColumns.map((c) => [c.id, c]))
  const usedBy = new Map()
  for (const [field, entry] of Object.entries(columnMap || {})) {
    if (!SYNC_FIELDS.includes(field)) {
      errors.push({ field, code: 'unknown_field', message: `"${field}" is not a sync field` })
      continue
    }
    if (!entry) continue
    if (!entry.columnId) {
      errors.push({ field, code: 'column_required', message: 'Choose a column or remove this field' })
      continue
    }
    const column = columnsById.get(entry.columnId)
    if (!column) {
      errors.push({ field, code: 'column_missing', message: `Column ${entry.columnId} is not on the board` })
      continue
    }
    if (usedBy.has(column.id)) {
      errors.push({ field, code: 'duplicate_column', message: `Column "${column.title}" is already used for ${usedBy.get(column.id)}` })
    } else usedBy.set(column.id, field)
    const allowed = FIELD_COLUMN_TYPES[field]
    if (!allowed.includes(column.type)) {
      errors.push({ field, code: 'wrong_column_type', message: `Column "${column.title}" is ${column.type}; ${field} needs ${allowed.join(' or ')}` })
      continue
    }
    if (field === 'status') {
      const defined = statusLabels(column.settings)
      for (const status of SUMMARY_STATUSES) {
        const label = entry.labels?.[status]
        if (!label) errors.push({ field, code: 'missing_label', status, message: `No label chosen for "${status}"` })
        else if (!defined.includes(label)) {
          errors.push({ field, code: 'unknown_label', status, message: `Label "${label}" does not exist on column "${column.title}"` })
        }
      }
    }
  }
  return errors
}

export default { encodeColumnValue, buildProposedChanges, toColumnValues, validateColumnMap }
