<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <router-link :to="{ name: 'BillingImports' }" class="inline-flex items-center gap-2 text-xs font-ui text-gray-500 hover:text-brand-navy">
      <i class="fa-solid fa-arrow-left text-[10px]" aria-hidden="true"></i> All imports
    </router-link>

    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <p v-if="loading && !job" class="py-12 text-center text-sm text-gray-500 font-ui">Loading…</p>

    <template v-if="job">
      <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 class="font-heading text-xl text-gray-900 break-all">{{ job.filename }}</h2>
        <span class="text-xs font-ui text-gray-500">Import #{{ job.id }} · uploaded {{ shortDate(job.created_at) }}</span>
        <span class="text-xs font-ui font-semibold" :class="stateTone">{{ stateLabel }}</span>
      </header>

      <p v-if="job.duplicateOf" class="text-sm font-ui bg-amber-50 text-amber-900 rounded-lg px-4 py-3">
        This exact file was already applied (import #{{ job.duplicateOf.id }}, {{ shortDate(job.duplicateOf.applied_at) }}). Re-importing it is safe: every row will come back unchanged.
      </p>
      <p v-if="job.raw_purged_at && job.status !== 'applied'" class="text-sm font-ui bg-gray-100 text-gray-700 rounded-lg px-4 py-3">
        The uploaded file was deleted after the retention period. Upload it again to continue.
      </p>

      <!-- Step 1: mapping (until applied) -->
      <section v-if="editable" class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="map-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h3 id="map-h" class="text-sm font-ui font-semibold text-gray-900">1 · What does each column mean?</h3>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            Columns were matched by their names. The real eImmigration export layout has not been verified yet, so check each one against the sample values.
            Your choices are remembered for files with the same columns.
          </p>
        </header>
        <div class="p-5 grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
          <div v-for="f in FIELD_ORDER" :key="f" class="form-group">
            <label :for="`map-${f}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ FIELD_LABELS[f] }}</label>
            <select :id="`map-${f}`" v-model="mapping[f]"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/10">
              <option :value="null">Not in this report</option>
              <option v-for="h in job.headers" :key="h" :value="h" :disabled="usedElsewhere(h, f)">{{ h }}</option>
            </select>
            <p v-if="mapping[f] && samples(mapping[f]).length" class="mt-1 text-[10px] font-ui text-gray-500 truncate" :title="samples(mapping[f]).join(' · ')">
              e.g. {{ samples(mapping[f]).join(' · ') }}
            </p>
          </div>
        </div>
        <div class="px-5 pb-5 grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-4">
          <div>
            <label for="report-type" class="text-[11px] font-ui font-semibold text-gray-700">What does this report contain?</label>
            <select id="report-type" v-model="reportType"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/10">
              <option v-for="(label, key) in REPORT_TYPE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
            <p class="mt-1 text-[10px] font-ui text-gray-500 leading-snug">{{ REPORT_TYPE_HELP[reportType] }}</p>
          </div>
          <div>
            <label for="report-date" class="text-[11px] font-ui font-semibold text-gray-700">Report generated on</label>
            <input id="report-date" v-model="reportDate" type="date" :max="today"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/10" />
            <p class="mt-1 text-[10px] font-ui text-gray-500 leading-snug">Required. Overdue is judged as of this date, and an older report never overwrites a newer one. Leave it empty only if the file has a report-date column.</p>
          </div>
        </div>
        <div v-if="canImport" class="px-5 pb-5 flex flex-wrap items-center gap-3">
          <button @click="runPreview" :disabled="busy || Boolean(job.raw_purged_at)"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50 transition-colors">
            <FaIcon v-if="busy === 'preview'" name="spinner" spin class="text-xs" />
            {{ job.status === 'previewed' ? 'Preview again' : 'Preview import' }}
          </button>
          <button @click="cancel" :disabled="Boolean(busy)" class="px-3 py-2 rounded-lg text-sm font-ui text-gray-600 hover:text-brand-red hover:bg-red-50 transition-colors">Cancel import</button>
        </div>
      </section>

      <!-- Missing-field problems -->
      <section v-if="fieldWarnings.length" class="bg-white rounded-xl ring-1 ring-gray-200 p-5" aria-label="Column problems">
        <ul class="space-y-1.5 text-xs font-ui">
          <li v-for="w in fieldWarnings" :key="w.field + w.message" class="flex gap-2">
            <FaIcon :name="w.severity === 'error' ? 'circle-exclamation' : 'triangle-exclamation'" :class="w.severity === 'error' ? 'text-brand-red' : 'text-amber-600'" class="mt-0.5" />
            <span :class="w.severity === 'error' ? 'text-brand-red' : 'text-gray-700'">{{ w.message }}</span>
          </li>
        </ul>
      </section>

      <!-- Step 2: preview -->
      <section v-if="job.stats" class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="preview-h">
        <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div>
            <h3 id="preview-h" class="text-sm font-ui font-semibold text-gray-900">{{ job.status === 'applied' ? 'What was applied' : '2 · Review the proposed changes' }}</h3>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ REPORT_TYPE_LABELS[job.report_type] }} · as of {{ shortDate(job.report_date) || 'upload date' }}</p>
          </div>
          <a :href="exceptionsUrl" class="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-ui font-semibold text-brand-navy hover:bg-brand-surface">
            <i class="fa-solid fa-download text-[10px]" aria-hidden="true"></i> Exceptions (CSV)
          </a>
        </header>

        <div class="p-5 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <div v-for="t in tiles" :key="t.label" class="rounded-lg bg-brand-light ring-1 ring-gray-100 px-3 py-2.5">
            <p class="text-[10px] font-ui text-gray-600 leading-tight">{{ t.label }}</p>
            <p :class="t.count && t.tone ? t.tone : 'text-gray-900'" class="font-ui text-xl font-light tabular-nums mt-1">{{ t.count }}</p>
          </div>
        </div>

        <p v-if="job.report_type === 'outstanding_only'" class="mx-5 mb-4 text-[11px] font-ui text-gray-600 bg-brand-surface rounded-lg px-3 py-2">
          Outstanding-only report: invoices that are not in this file are left exactly as they are. Missing from this report does not mean paid.
        </p>
        <p v-if="job.stats.counts.absent" class="mx-5 mb-4 text-[11px] font-ui text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
          {{ job.stats.counts.absent }} invoice(s) we already have are not in this full report. They will be flagged for review, not marked paid.
        </p>

        <div class="px-5 pb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter rows">
          <button v-for="f in ROW_FILTERS" :key="f.key" @click="setRowFilter(f.key)" :aria-pressed="rowFilter === f.key"
            :class="rowFilter === f.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
            class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap">{{ f.label }}</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs font-ui min-w-[760px]">
            <thead>
              <tr class="text-[10px] uppercase tracking-[0.1em] text-gray-500 border-y border-gray-100">
                <th scope="col" class="text-left font-semibold px-5 py-2">Row</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">Record</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">Client</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">Result</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">monday.com</th>
                <th scope="col" class="text-left font-semibold px-5 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!job.rows.length"><td colspan="6" class="px-5 py-6 text-center text-gray-500">No rows in this view.</td></tr>
              <tr v-for="r in job.rows" :key="r.kind + r.row_number" class="border-b border-gray-50 align-top">
                <td class="px-5 py-2.5 tabular-nums text-gray-500">{{ r.row_number }}</td>
                <td class="px-2 py-2.5 text-gray-800 whitespace-nowrap">
                  <span class="text-[9px] uppercase tracking-wider text-gray-400 mr-1">{{ r.kind }}</span>
                  {{ r.kind === 'invoice' ? r.record.input.externalInvoiceId : (r.record.input.externalPaymentId || r.record.input.externalInvoiceId) }}
                  <span v-if="r.kind === 'payment'" class="block text-gray-500 tabular-nums">{{ money(r.record.input.amountCents) }} · {{ r.record.input.paymentType }}</span>
                </td>
                <td class="px-2 py-2.5 text-gray-800">{{ r.record.input.clientName || '—' }}<span class="block text-[10px] text-gray-500">{{ r.record.input.externalClientId || 'no client ID' }}</span></td>
                <td class="px-2 py-2.5">
                  <span :class="ACTION[r.action]?.tone" class="inline-block text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded">{{ ACTION[r.action]?.label || r.action }}</span>
                  <div v-if="r.record.proposed" class="mt-1"><StatusPill :status="r.record.proposed.status" /></div>
                </td>
                <td class="px-2 py-2.5 text-gray-600 whitespace-nowrap">{{ MATCH[r.match_status] || r.match_status }}</td>
                <td class="px-5 py-2.5 text-gray-700 max-w-[28rem]">
                  <p v-for="i in r.issues" :key="i.code + i.field" :class="i.severity === 'error' ? 'text-brand-red' : 'text-amber-700'">{{ i.message }}</p>
                  <p v-if="r.record.reason && !r.issues.length" class="text-gray-600">{{ r.record.reason }}</p>
                  <p v-if="r.record.proposed?.reviewReason" class="text-violet-800">{{ r.record.proposed.reviewReason }}</p>
                  <p v-if="r.action === 'update'" class="text-gray-600">{{ describe(r.changes) }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="job.rows.length >= 500" class="px-5 py-3 text-[11px] font-ui text-gray-500">Showing the first 500 rows. The exceptions CSV lists every problem.</p>

        <!-- Step 3: approve -->
        <div v-if="canImport && job.status === 'previewed'" class="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center gap-3 bg-brand-light rounded-b-xl">
          <p class="text-xs font-ui text-gray-700 flex-1 min-w-[16rem]">
            Approving writes {{ job.stats.counts.invoice_insert }} new and {{ job.stats.counts.invoice_update }} changed invoices and
            {{ job.stats.counts.payment_insert + job.stats.counts.payment_update }} payments. Skipped rows are not imported. monday.com is not touched.
          </p>
          <button @click="approve" :disabled="Boolean(busy)"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">
            <FaIcon v-if="busy === 'approve'" name="spinner" spin class="text-xs" />
            Approve import
          </button>
        </div>
        <p v-if="applied" role="status" class="px-5 py-4 border-t border-gray-100 text-sm font-ui text-green-800 bg-green-50 rounded-b-xl">
          Applied: {{ applied.applied.invoices }} invoices, {{ applied.applied.payments }} payments<span v-if="applied.applied.links">, {{ applied.applied.links }} client(s) linked to monday.com by eImmigration ID</span>.
        </p>
      </section>
    </template>
  </div>
</template>

<script setup>
import FaIcon from '../../../components/FaIcon.vue'
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBillingApi, money, shortDate, REPORT_TYPE_LABELS, FIELD_LABELS } from '../api.js'
import { can } from '../../../composables/useAuth.js'

// Previewing, approving and cancelling an import need billing.import.
const canImport = can('billing.import')
import { API_BASE } from '../../../composables/useApi.js'
import StatusPill from '../components/StatusPill.vue'

const FIELD_ORDER = Object.keys(FIELD_LABELS)
const REPORT_TYPE_HELP = {
  invoice_summary: 'Every invoice, paid or not. Invoices we have that are missing from it are flagged for review (never marked paid).',
  outstanding_only: 'Only invoices with money owed. Invoices not in the file are left untouched.',
  payment_transactions: 'One row per payment, credit or refund. Recorded as history; invoice balances only change from reports that state balances.',
  mixed: 'Invoice rows and payment rows in the same file.',
}
const ACTION = {
  insert: { label: 'New', tone: 'bg-green-100 text-green-800' },
  update: { label: 'Changes', tone: 'bg-brand-navy/10 text-brand-navy' },
  unchanged: { label: 'Unchanged', tone: 'bg-gray-100 text-gray-600' },
  skip: { label: 'Skipped', tone: 'bg-red-100 text-brand-red' },
  stale: { label: 'Older report', tone: 'bg-amber-100 text-amber-800' },
}
const MATCH = {
  linked: 'Linked', matched_by_id: 'Matched by ID', ambiguous: 'Needs a decision', unmatched: 'Not found', no_client_id: 'No client ID',
}
const ROW_FILTERS = [
  { key: 'problems', label: 'Problems' },
  { key: 'update', label: 'Changes' },
  { key: 'insert', label: 'New' },
  { key: '', label: 'All rows' },
]
const CHANGE_NAMES = { totalCents: 'total', paidCents: 'paid', balanceCents: 'balance', status: 'status', dueDate: 'due', nextInstallmentDate: 'next installment', lastPaymentDate: 'last payment' }

const api = useBillingApi()
const route = useRoute()
const router = useRouter()
const job = ref(null)
const loading = ref(true)
const error = ref('')
const busy = ref('')
const mapping = reactive({})
const reportType = ref('invoice_summary')
const reportDate = ref('')
const fieldWarnings = ref([])
const rowFilter = ref('problems')
const applied = ref(null)

const id = computed(() => Number(route.params.id))
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const editable = computed(() => job.value && ['uploaded', 'previewed'].includes(job.value.status))
const exceptionsUrl = computed(() => `${API_BASE}/api/billing/imports/${id.value}/exceptions.csv`)
const stateLabel = computed(() => ({ uploaded: 'Needs mapping', previewed: 'Awaiting approval', applied: 'Applied', cancelled: 'Cancelled', failed: 'Failed' })[job.value?.status])
const stateTone = computed(() => ({ applied: 'text-green-700', cancelled: 'text-gray-500', failed: 'text-brand-red' })[job.value?.status] || 'text-brand-navy')

const tiles = computed(() => {
  const c = job.value?.stats?.counts || {}
  const m = job.value?.stats?.matching || {}
  return [
    { label: 'New invoices', count: c.invoice_insert || 0 },
    { label: 'Changed invoices', count: c.invoice_update || 0 },
    { label: 'Unchanged', count: c.invoice_unchanged || 0 },
    { label: 'Skipped (errors)', count: (c.invoice_skip || 0) + (c.payment_skip || 0), tone: 'text-brand-red' },
    { label: 'Older than current data', count: c.invoice_stale || 0, tone: 'text-amber-700' },
    { label: 'New payments', count: c.payment_insert || 0 },
    { label: 'Clients needing a match', count: (m.ambiguous || 0) + (m.unmatched || 0), tone: 'text-amber-700' },
    { label: 'Needs review', count: job.value?.stats?.statuses?.needs_review || 0, tone: 'text-violet-700' },
  ]
})

function samples(header) {
  const idx = job.value.headers.indexOf(header)
  return (job.value.sampleRows || []).map((r) => r[idx]).filter((v) => v !== '' && v != null).slice(0, 3)
}
function usedElsewhere(header, field) {
  return Object.entries(mapping).some(([f, h]) => f !== field && h === header)
}
function describe(changes = []) {
  return changes.filter((c) => CHANGE_NAMES[c.field]).map((c) => {
    const fmt = (v) => (/Cents$/.test(c.field) ? money(v) : (v ?? '—'))
    return `${CHANGE_NAMES[c.field]} ${fmt(c.from)} → ${fmt(c.to)}`
  }).join('; ')
}

async function load(filter = rowFilter.value) {
  loading.value = true
  error.value = ''
  try {
    const j = await api.importJob(id.value, filter)
    job.value = j
    for (const f of FIELD_ORDER) mapping[f] = j.mapping?.[f] ?? null
    reportType.value = j.report_type || 'invoice_summary'
    reportDate.value = j.report_date || ''
    fieldWarnings.value = (j.errors || []).filter((e) => e && e.message && (e.severity === 'error' || e.severity === 'warning'))
  } catch (err) {
    error.value = `Could not load the import: ${err.message}`
  } finally {
    loading.value = false
  }
}

function setRowFilter(key) {
  rowFilter.value = key
  load(key)
}

async function runPreview() {
  busy.value = 'preview'
  error.value = ''
  try {
    const result = await api.preview(id.value, { mapping: { ...mapping }, reportType: reportType.value, reportDate: reportDate.value || null })
    fieldWarnings.value = [...(result.fieldWarnings || []), ...(result.fileIssues || [])]
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = ''
  }
}

async function approve() {
  busy.value = 'approve'
  error.value = ''
  try {
    applied.value = await api.approve(id.value)
    await load()
  } catch (err) {
    error.value = err.message
    if (/Preview it again/.test(err.message)) await load()
  } finally {
    busy.value = ''
  }
}

async function cancel() {
  if (!window.confirm('Cancel this import? Nothing from it has been applied.')) return
  busy.value = 'cancel'
  try {
    await api.cancel(id.value)
    router.push({ name: 'BillingImports' })
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = ''
  }
}

onMounted(() => load())
</script>
