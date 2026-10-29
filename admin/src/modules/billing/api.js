// Billing API client + formatting shared by the billing views.
import { useApi, rawFetch, goToLogin } from '../../composables/useApi.js'

export function useBillingApi() {
  const { get, post, del } = useApi()
  const put = async (path, body) => {
    const res = await rawFetch(path, { method: 'PUT', body: JSON.stringify(body) })
    if (res.status === 401) { goToLogin(); throw new Error('Unauthorized') }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }
  return {
    overview: () => get('/api/billing/overview'),
    invoices: (params = {}) => get(`/api/billing/invoices?${new URLSearchParams(params)}`),
    invoice: (id) => get(`/api/billing/invoices/${id}`),
    imports: () => get('/api/billing/imports'),
    importJob: (id, filter = '') => get(`/api/billing/imports/${id}${filter ? `?filter=${filter}` : ''}`),
    preview: (id, body) => post(`/api/billing/imports/${id}/preview`, body),
    approve: (id) => post(`/api/billing/imports/${id}/approve`, {}),
    cancel: (id) => post(`/api/billing/imports/${id}/cancel`, {}),
    matching: () => get('/api/billing/matching'),
    link: (clientId, mondayItemId) => post(`/api/billing/matching/${clientId}`, { mondayItemId }),
    unlink: (clientId, itemId) => del(`/api/billing/matching/${clientId}/${encodeURIComponent(itemId)}`),
    monday: () => get('/api/billing/monday'),
    mondayCheck: () => post('/api/billing/monday/check', {}),
    mondayBoards: () => get('/api/billing/monday/boards'),
    mondayColumns: (boardId) => get(`/api/billing/monday/boards/${encodeURIComponent(boardId)}/columns`),
    saveMondayConfig: (cfg) => put('/api/billing/monday/config', cfg),
    syncPreview: () => post('/api/billing/monday/sync/preview', {}),
    syncApply: (jobId) => post(`/api/billing/monday/sync/${jobId}/apply`, {}),
    syncJob: (jobId) => get(`/api/billing/monday/sync/${jobId}`),
    integrations: () => get('/api/billing/integrations'),
  }
}

/** Upload a report file as raw bytes (no multipart dependency). */
export async function uploadReport(file) {
  const res = await rawFetch('/api/billing/imports', {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
  })
  if (res.status === 401) { goToLogin(); throw new Error('Unauthorized') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
/** Integer cents → "$1,234.56". Division happens once, for display only. */
export function money(cents) {
  if (cents == null) return '—'
  return usd.format(Number(cents) / 100)
}

export function shortDate(value) {
  if (!value) return '—'
  const s = String(value)
  // DATE values arrive as 'YYYY-MM-DD'; format without a time zone shift.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10))
  if (m && s.length <= 10) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export const REPORT_TYPE_LABELS = {
  invoice_summary: 'All invoices with balances',
  outstanding_only: 'Outstanding invoices only',
  payment_transactions: 'Payment transactions',
  mixed: 'Invoices and payments mixed',
}

export const FIELD_LABELS = {
  externalClientId: 'eImmigration client ID', clientName: 'Client name', externalInvoiceId: 'Invoice ID',
  invoiceDate: 'Invoice date', dueDate: 'Due date', totalAmount: 'Invoice total', paidAmount: 'Amount paid',
  balanceAmount: 'Balance due', invoiceStatus: 'Invoice status', paymentPlan: 'Payment plan',
  nextInstallmentDate: 'Next installment due', nextInstallmentAmount: 'Next installment amount',
  lastPaymentDate: 'Last payment date', currency: 'Currency', reportDate: 'Report generated',
  externalPaymentId: 'Payment ID', paymentDate: 'Payment date', paymentAmount: 'Payment amount',
  paymentMethod: 'Payment method', paymentReference: 'Payment reference', paymentType: 'Transaction type',
}
