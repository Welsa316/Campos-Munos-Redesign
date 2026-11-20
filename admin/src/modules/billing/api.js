// Billing API client, and the formatting and lists shared by the billing
// views. Their words are in i18n/billing.js.
import { useApi, rawFetch, goToLogin } from '../../composables/useApi.js'

export function useBillingApi() {
  const { get, post, del, put } = useApi()
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

// Formatting lives in format.js (importable without the API client).
export { money, shortDate } from './format.js'

/** The report types an import can be, in the order the picker lists them. */
export const REPORT_TYPES = ['invoice_summary', 'outstanding_only', 'payment_transactions', 'mixed']

/** The importer's fields, in the order the mapping form lists them. */
export const FIELD_KEYS = [
  'externalClientId', 'clientName', 'clientPhone', 'externalInvoiceId',
  'invoiceDate', 'dueDate', 'totalAmount', 'paidAmount',
  'balanceAmount', 'invoiceStatus', 'paymentPlan',
  'nextInstallmentDate', 'nextInstallmentAmount',
  'lastPaymentDate', 'currency', 'reportDate',
  'externalPaymentId', 'paymentDate', 'paymentAmount',
  'paymentMethod', 'paymentReference', 'paymentType',
]
