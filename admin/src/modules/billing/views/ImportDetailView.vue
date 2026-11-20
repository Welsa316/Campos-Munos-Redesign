<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <router-link :to="{ name: 'BillingImports' }" class="inline-flex items-center gap-2 text-xs font-ui text-gray-500 hover:text-brand-navy">
      <i class="fa-solid fa-arrow-left text-[10px]" aria-hidden="true"></i> {{ t('import.all') }}
    </router-link>

    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <p v-if="loading && !job" class="py-12 text-center text-sm text-gray-500 font-ui">{{ t('loading') }}</p>

    <template v-if="job">
      <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 class="font-heading text-xl text-gray-900 break-all">{{ job.filename }}</h2>
        <span class="text-xs font-ui text-gray-500">{{ t('import.meta', { id: job.id, date: shortDate(job.created_at) }) }}</span>
        <span class="text-xs font-ui font-semibold" :class="stateTone">{{ stateLabel }}</span>
      </header>

      <p v-if="job.duplicateOf" class="text-sm font-ui bg-amber-50 text-amber-900 rounded-lg px-4 py-3">
        {{ t('import.duplicate', { id: job.duplicateOf.id, date: shortDate(job.duplicateOf.applied_at) }) }}
      </p>
      <p v-if="job.raw_purged_at && job.status !== 'applied'" class="text-sm font-ui bg-gray-100 text-gray-700 rounded-lg px-4 py-3">
        {{ t('import.purged') }}
      </p>

      <!-- Step 1: mapping (until applied) -->
      <section v-if="editable" class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="map-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h3 id="map-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('map.title') }}</h3>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            {{ t('map.note') }}
          </p>
        </header>
        <div class="p-5 grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
          <div v-for="f in FIELD_ORDER" :key="f" class="form-group">
            <label :for="`map-${f}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ t(`field.${f}`) }}</label>
            <select :id="`map-${f}`" v-model="mapping[f]"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/10">
              <option :value="null">{{ t('map.not_in_report') }}</option>
              <option v-for="h in job.headers" :key="h" :value="h" :disabled="usedElsewhere(h, f)">{{ h }}</option>
            </select>
            <p v-if="mapping[f] && samples(mapping[f]).length" class="mt-1 text-[10px] font-ui text-gray-500 truncate" :title="samples(mapping[f]).join(' · ')">
              {{ t('map.example', { values: samples(mapping[f]).join(' · ') }) }}
            </p>
          </div>
        </div>
        <div class="px-5 pb-5 grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-4">
          <div>
            <label for="report-type" class="text-[11px] font-ui font-semibold text-gray-700">{{ t('map.report_type') }}</label>
            <select id="report-type" v-model="reportType"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/10">
              <option v-for="key in REPORT_TYPES" :key="key" :value="key">{{ t(`report_type.${key}`) }}</option>
            </select>
            <p class="mt-1 text-[10px] font-ui text-gray-500 leading-snug">{{ REPORT_TYPES.includes(reportType) ? t(`report_help.${reportType}`) : '' }}</p>
          </div>
          <div>
            <label for="report-date" class="text-[11px] font-ui font-semibold text-gray-700">{{ t('map.report_date') }}</label>
            <input id="report-date" v-model="reportDate" type="date" :max="today"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/10" />
            <p class="mt-1 text-[10px] font-ui text-gray-500 leading-snug">{{ t('map.report_date_note') }}</p>
          </div>
        </div>
        <div v-if="canImport" class="px-5 pb-5 flex flex-wrap items-center gap-3">
          <button @click="runPreview" :disabled="busy || Boolean(job.raw_purged_at)"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50 transition-colors">
            <FaIcon v-if="busy === 'preview'" name="spinner" spin class="text-xs" />
            {{ t(job.status === 'previewed' ? 'map.preview_again' : 'map.preview') }}
          </button>
          <button @click="confirmingCancel = true" :disabled="Boolean(busy)" :aria-expanded="confirmingCancel" class="px-3 py-2 rounded-lg text-sm font-ui text-gray-600 hover:text-brand-red hover:bg-red-50 transition-colors">{{ t('map.cancel') }}</button>
          <ConfirmInline v-if="confirmingCancel" class="basis-full" :title="t('map.cancel_title')" :body="t('map.cancel_body')"
            :confirm-label="t('map.cancel')" :cancel-label="t('map.keep')" :busy="Boolean(busy)" @confirm="cancel" @cancel="confirmingCancel = false" />
        </div>
      </section>

      <!-- Missing-field problems -->
      <section v-if="fieldWarnings.length" class="bg-white rounded-xl ring-1 ring-gray-200 p-5" :aria-label="t('problems.label')">
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
            <h3 id="preview-h" class="text-sm font-ui font-semibold text-gray-900">{{ t(job.status === 'applied' ? 'preview.applied' : 'preview.review') }}</h3>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ REPORT_TYPES.includes(job.report_type) ? t(`report_type.${job.report_type}`) : t('type_not_set') }} · {{ job.report_date ? t('preview.as_of', { date: shortDate(job.report_date) }) : t('preview.as_of_upload') }}</p>
          </div>
          <button type="button" @click="downloadExceptions" :disabled="csvBusy" class="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-ui font-semibold hover:bg-brand-surface disabled:opacity-60" :class="csvFailed ? 'text-brand-red' : 'text-brand-navy'">
            <i class="fa-solid fa-download text-[10px]" aria-hidden="true"></i> <span aria-live="polite">{{ t(csvFailed ? 'preview.download_failed' : 'preview.exceptions') }}</span>
          </button>
        </header>

        <div class="p-5 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <div v-for="tile in tiles" :key="tile.label" class="rounded-lg bg-brand-light ring-1 ring-gray-100 px-3 py-2.5">
            <p class="text-[10px] font-ui text-gray-600 leading-tight">{{ t(tile.label) }}</p>
            <p :class="tile.count && tile.tone ? tile.tone : 'text-gray-900'" class="font-ui text-xl font-light tabular-nums mt-1">{{ tile.count }}</p>
          </div>
        </div>

        <p v-if="job.report_type === 'outstanding_only'" class="mx-5 mb-4 text-[11px] font-ui text-gray-600 bg-brand-surface rounded-lg px-3 py-2">
          {{ t('preview.outstanding_note') }}
        </p>
        <p v-if="job.stats.counts.absent" class="mx-5 mb-4 text-[11px] font-ui text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
          {{ t('preview.absent', { count: num(job.stats.counts.absent, lang) }) }}
        </p>

        <p v-if="phoneSummary" class="mx-5 mb-4 text-[11px] font-ui text-gray-700 bg-brand-surface rounded-lg px-3 py-2">
          <span class="font-semibold">{{ t('phones.label') }}</span> {{ phoneSummary }}.
          {{ t('phones.note') }}
        </p>

        <div class="px-5 pb-3 flex flex-wrap gap-1.5" role="group" :aria-label="t('rows.filter_label')">
          <button v-for="f in ROW_FILTERS" :key="f.key" @click="setRowFilter(f.key)" :aria-pressed="rowFilter === f.key"
            :class="rowFilter === f.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
            class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap">{{ t(f.label) }}</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs font-ui min-w-[760px]">
            <thead>
              <tr class="text-[10px] uppercase tracking-[0.1em] text-gray-500 border-y border-gray-100">
                <th scope="col" class="text-left font-semibold px-5 py-2">{{ t('col.row') }}</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">{{ t('col.record') }}</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">{{ t('col.client') }}</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">{{ t('col.result') }}</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">monday.com</th>
                <th scope="col" class="text-left font-semibold px-5 py-2">{{ t('col.details') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!job.rows.length"><td colspan="6" class="px-5 py-6 text-center text-gray-500">{{ t('rows.none') }}</td></tr>
              <tr v-for="r in job.rows" :key="r.kind + r.row_number" class="border-b border-gray-50 align-top">
                <td class="px-5 py-2.5 tabular-nums text-gray-500">{{ r.row_number }}</td>
                <td class="px-2 py-2.5 text-gray-800 whitespace-nowrap">
                  <span class="text-[9px] uppercase tracking-wider text-gray-500 mr-1">{{ word('kind.', r.kind) }}</span>
                  {{ r.kind === 'invoice' ? r.record.input.externalInvoiceId : (r.record.input.externalPaymentId || r.record.input.externalInvoiceId) }}
                  <span v-if="r.kind === 'payment'" class="block text-gray-500 tabular-nums">{{ money(r.record.input.amountCents) }} · {{ r.record.input.paymentType }}</span>
                </td>
                <td class="px-2 py-2.5 text-gray-800">{{ r.record.input.clientName || '—' }}<span class="block text-[10px] text-gray-500">{{ r.record.input.externalClientId || t('rows.no_client_id') }}</span></td>
                <td class="px-2 py-2.5">
                  <span :class="ACTION[r.action]?.tone" class="inline-block text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded">{{ word('action.', r.action) }}</span>
                  <div v-if="r.record.proposed" class="mt-1"><StatusPill :status="r.record.proposed.status" /></div>
                </td>
                <td class="px-2 py-2.5 text-gray-600 whitespace-nowrap">{{ word('match.', r.match_status) }}</td>
                <td class="px-5 py-2.5 text-gray-700 max-w-[28rem]">
                  <p v-for="i in r.issues" :key="i.code + i.field" :class="i.severity === 'error' ? 'text-brand-red' : 'text-amber-700'">{{ i.message }}</p>
                  <p v-if="r.record.reason && !r.issues.length" class="text-gray-600">{{ r.record.reason }}</p>
                  <p v-if="r.record.proposed?.reviewReason" class="text-violet-800">{{ r.record.proposed.reviewReason }}</p>
                  <p v-if="r.action === 'update'" class="text-gray-600">{{ rowChanges(r.changes, lang) }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="job.rows.length >= 500" class="px-5 py-3 text-[11px] font-ui text-gray-500">{{ t('rows.first_500') }}</p>

        <!-- Step 3: approve -->
        <div v-if="canImport && job.status === 'previewed'" class="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center gap-3 bg-brand-light rounded-b-xl">
          <p class="text-xs font-ui text-gray-700 flex-1 min-w-[16rem]">
            {{ approveSummary(job.stats.counts, phonesWritten, lang) }}
          </p>
          <button @click="approve" :disabled="Boolean(busy)"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">
            <FaIcon v-if="busy === 'approve'" name="spinner" spin class="text-xs" />
            {{ t('approve.button') }}
          </button>
        </div>
        <p v-if="applied" role="status" class="px-5 py-4 border-t border-gray-100 text-sm font-ui text-green-800 bg-green-50 rounded-b-xl">
          {{ appliedSummary(applied.applied, lang) }}
        </p>
      </section>
    </template>
  </div>
</template>

<script setup>
import FaIcon from '../../../components/FaIcon.vue'
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBillingApi, REPORT_TYPES, FIELD_KEYS } from '../api.js'
import { money as moneyIn, shortDate as dateIn } from '../format.js'
import { num, hasWord, rowChanges, phoneSummary as phoneLine, approveSummary, appliedSummary } from '../billingText.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'
import { can } from '../../../composables/useAuth.js'

// Previewing, approving and cancelling an import need billing.import.
const canImport = can('billing.import')
import { rawFetch, goToLogin } from '../../../composables/useApi.js'
import StatusPill from '../components/StatusPill.vue'
import ConfirmInline from '../../../components/ConfirmInline.vue'

const FIELD_ORDER = FIELD_KEYS
// A row's result; its label is action.<key> in i18n/billing.js.
const ACTION = {
  insert: { tone: 'bg-green-100 text-green-800' },
  update: { tone: 'bg-brand-navy/10 text-brand-navy' },
  unchanged: { tone: 'bg-gray-100 text-gray-600' },
  skip: { tone: 'bg-red-100 text-brand-red' },
  stale: { tone: 'bg-amber-100 text-amber-800' },
}
// label: a word in i18n/billing.js.
const ROW_FILTERS = [
  { key: 'problems', label: 'rows.problems' },
  { key: 'update', label: 'rows.update' },
  { key: 'insert', label: 'rows.insert' },
  { key: '', label: 'rows.all' },
]

const { t, lang, locale } = useT(BILLING)
const money = (cents) => moneyIn(cents, locale.value)
const shortDate = (value) => dateIn(value, locale.value)
// A value the server sends with a word for it (a row's kind, result, match),
// or the value itself when it is new.
const word = (prefix, value) => (hasWord(BILLING, prefix + value) ? t(prefix + value) : value)

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
const csvBusy = ref(false)
const csvFailed = ref(false)
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const editable = computed(() => job.value && ['uploaded', 'previewed'].includes(job.value.status))
const stateLabel = computed(() => (['uploaded', 'previewed', 'applied', 'cancelled', 'failed'].includes(job.value?.status) ? t(`job.${job.value.status}`) : undefined))
const stateTone = computed(() => ({ applied: 'text-green-700', cancelled: 'text-gray-500', failed: 'text-brand-red' })[job.value?.status] || 'text-brand-navy')

// Fetched and saved as a file rather than a plain link: the desktop app keeps
// the portal in its window and would refuse to navigate to the API's address.
async function downloadExceptions() {
  if (csvBusy.value) return
  csvBusy.value = true
  csvFailed.value = false
  try {
    const res = await rawFetch(`/api/billing/imports/${id.value}/exceptions.csv`)
    if (res.status === 401) { goToLogin(); return }
    if (!res.ok) throw new Error('Download failed')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `import-${id.value}-exceptions.csv`
    a.click()
    // Revoked a moment later: Safari can abort a download whose URL is
    // revoked in the same task as the click.
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch {
    csvFailed.value = true
  } finally {
    csvBusy.value = false
  }
}

const tiles = computed(() => {
  const c = job.value?.stats?.counts || {}
  const m = job.value?.stats?.matching || {}
  return [
    { label: 'tile.new_invoices', count: c.invoice_insert || 0 },
    { label: 'tile.changed_invoices', count: c.invoice_update || 0 },
    { label: 'tile.unchanged', count: c.invoice_unchanged || 0 },
    { label: 'tile.skipped', count: (c.invoice_skip || 0) + (c.payment_skip || 0), tone: 'text-brand-red' },
    { label: 'tile.stale', count: c.invoice_stale || 0, tone: 'text-amber-700' },
    { label: 'tile.new_payments', count: c.payment_insert || 0 },
    { label: 'tile.need_match', count: (m.ambiguous || 0) + (m.unmatched || 0), tone: 'text-amber-700' },
    { label: 'tile.needs_review', count: job.value?.stats?.statuses?.needs_review || 0, tone: 'text-violet-700' },
  ]
})

// What the report's phone column does to the clients' WhatsApp numbers.
const phonesWritten = computed(() => {
  const p = job.value?.stats?.phones
  return p ? (p.new || 0) + (p.changed || 0) : 0
})
const phoneSummary = computed(() => phoneLine(job.value?.stats?.phones, lang.value))

function samples(header) {
  const idx = job.value.headers.indexOf(header)
  return (job.value.sampleRows || []).map((r) => r[idx]).filter((v) => v !== '' && v != null).slice(0, 3)
}
function usedElsewhere(header, field) {
  return Object.entries(mapping).some(([f, h]) => f !== field && h === header)
}

// The mapping form is filled from the server on the first load and after a
// preview or approval, never by a change of row filter: that only changes
// which rows are listed, and must not undo a mapping being edited.
async function load(filter = rowFilter.value, { seedForm = true } = {}) {
  loading.value = true
  error.value = ''
  try {
    const j = await api.importJob(id.value, filter)
    job.value = j
    if (seedForm) {
      for (const f of FIELD_ORDER) mapping[f] = j.mapping?.[f] ?? null
      reportType.value = j.report_type || 'invoice_summary'
      reportDate.value = j.report_date || ''
    }
    fieldWarnings.value = (j.errors || []).filter((e) => e && e.message && (e.severity === 'error' || e.severity === 'warning'))
  } catch (err) {
    error.value = t('import.load_error', { message: err.message })
  } finally {
    loading.value = false
  }
}

function setRowFilter(key) {
  rowFilter.value = key
  load(key, { seedForm: false })
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
    // Whatever went wrong (including a timeout after the server applied it),
    // show the import as the server now has it, not a stale Approve button.
    await load()
    if (!error.value) error.value = err.message
  } finally {
    busy.value = ''
  }
}

const confirmingCancel = ref(false)
async function cancel() {
  confirmingCancel.value = false
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
