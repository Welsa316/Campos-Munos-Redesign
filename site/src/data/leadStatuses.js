// Lead pipeline shared by the inbox list, the detail pane and the filter bar so
// the labels and colours can never drift apart. Keys must match the CHECK
// constraint on submissions.status (see server/db/migrate.js).
export const LEAD_STATUSES = [
  { key: 'new', label: 'New', hint: 'Nobody has contacted them yet',
    pill: 'bg-brand-red/10 text-brand-red ring-brand-red/20', dot: 'bg-brand-red' },
  { key: 'contacted', label: 'Contacted', hint: 'Reached out — waiting to hear back',
    pill: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  { key: 'scheduled', label: 'Scheduled', hint: 'Consultation is booked',
    pill: 'bg-green-100 text-green-800 ring-green-200', dot: 'bg-green-600' },
  { key: 'retained', label: 'Retained', hint: 'Signed on as a client',
    pill: 'bg-brand-navy/10 text-brand-navy ring-brand-navy/20', dot: 'bg-brand-navy' },
  { key: 'closed', label: 'Closed', hint: 'Not moving forward',
    pill: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
]

export const STATUS_KEYS = LEAD_STATUSES.map(s => s.key)

const BY_KEY = Object.fromEntries(LEAD_STATUSES.map(s => [s.key, s]))

// Rows created before the status column existed come back without one.
export function statusMeta(key) {
  return BY_KEY[key] || BY_KEY.new
}
