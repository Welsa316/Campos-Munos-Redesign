<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6">
    <section class="bg-white rounded-xl ring-1 ring-gray-200">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-sm font-ui font-semibold text-gray-900">
            Invoices <span class="text-gray-400 font-normal">{{ invoices.length }}<span v-if="invoices.length >= 500">+</span></span>
          </h2>
          <div class="relative ml-auto w-full sm:w-72">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" aria-hidden="true"></i>
            <input v-model="search" type="search" placeholder="Client, invoice or client ID" aria-label="Search invoices"
              class="w-full text-xs font-ui pl-8 pr-3 py-2 rounded-lg bg-brand-surface border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none text-gray-700" />
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          <button v-for="f in FILTERS" :key="f.key" @click="setFilter(f.key)" :aria-pressed="filter === f.key"
            :class="filter === f.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
            class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors">{{ f.label }}</button>
        </div>
      </header>

      <p v-if="error" role="alert" class="m-4 text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
      <p v-else-if="loading && !invoices.length" class="p-8 text-center text-sm text-gray-500 font-ui">Loading…</p>
      <p v-else-if="!invoices.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ search || filter ? 'No invoices match.' : 'No invoices imported yet.' }}</p>

      <template v-else>
        <!-- Desktop: full table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-xs font-ui">
            <thead class="bg-white">
              <tr class="text-[10px] uppercase tracking-[0.1em] text-gray-500 border-b border-gray-100">
                <th scope="col" class="text-left font-semibold px-5 py-2.5">Client</th>
                <th scope="col" class="text-left font-semibold px-2 py-2.5">Invoice</th>
                <th scope="col" class="text-right font-semibold px-2 py-2.5">Total</th>
                <th scope="col" class="text-right font-semibold px-2 py-2.5">Paid</th>
                <th scope="col" class="text-right font-semibold px-2 py-2.5">Balance</th>
                <th scope="col" class="text-left font-semibold px-2 py-2.5">Due</th>
                <th scope="col" class="text-left font-semibold px-2 py-2.5">Status</th>
                <th scope="col" class="text-left font-semibold px-5 py-2.5">Verified</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inv in invoices" :key="inv.id" @click="open(inv.id)" @keydown.enter="open(inv.id)" tabindex="0"
                class="border-b border-gray-50 hover:bg-brand-surface/60 cursor-pointer focus-visible:bg-brand-surface">
                <td class="px-5 py-3">
                  <span class="block text-gray-900 font-medium">{{ inv.clientName || '—' }}</span>
                  <span class="block text-[10px] text-gray-500">{{ inv.eimmigrationClientId || 'No client ID in report' }}</span>
                </td>
                <td class="px-2 py-3 text-gray-700 whitespace-nowrap">{{ inv.invoiceId }}</td>
                <td class="px-2 py-3 text-right tabular-nums text-gray-700">{{ money(inv.totalCents) }}</td>
                <td class="px-2 py-3 text-right tabular-nums text-gray-700">{{ money(inv.paidCents) }}</td>
                <td class="px-2 py-3 text-right tabular-nums font-semibold text-gray-900">
                  {{ money(inv.balanceCents) }}
                  <span v-if="inv.balanceSource === 'computed'" class="block text-[9px] font-normal text-gray-500" title="Total minus amount paid; the report gave no balance">computed</span>
                </td>
                <td class="px-2 py-3 whitespace-nowrap text-gray-700">
                  {{ shortDate(inv.nextInstallmentDate || inv.dueDate) }}
                  <span v-if="inv.nextInstallmentDate" class="block text-[9px] text-gray-500">next installment</span>
                </td>
                <td class="px-2 py-3"><StatusPill :status="inv.status" /></td>
                <td class="px-5 py-3 text-gray-500 whitespace-nowrap">
                  {{ shortDate(inv.lastReportDate) }}
                  <span v-if="inv.notInLatestReport" class="block text-[9px] text-amber-700 font-semibold">not in latest report</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Phone: one card per invoice -->
        <ul class="md:hidden divide-y divide-gray-100">
          <li v-for="inv in invoices" :key="inv.id">
            <button @click="open(inv.id)" class="w-full text-left px-4 py-3.5 hover:bg-brand-surface/60">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-ui font-medium text-gray-900 truncate">{{ inv.clientName || '—' }}</p>
                  <p class="text-[11px] font-ui text-gray-500">{{ inv.invoiceId }} · due {{ shortDate(inv.nextInstallmentDate || inv.dueDate) }}</p>
                </div>
                <p class="text-sm font-ui font-semibold tabular-nums text-gray-900">{{ money(inv.balanceCents) }}</p>
              </div>
              <div class="mt-2"><StatusPill :status="inv.status" /></div>
            </button>
          </li>
        </ul>
      </template>
    </section>

    <!-- Detail panel -->
    <div v-if="selectedId" class="fixed inset-0 z-30 flex" role="dialog" aria-modal="true" aria-labelledby="inv-detail-h" @keydown.esc="close">
      <button class="flex-1 bg-black/20" aria-label="Close invoice details" @click="close"></button>
      <div class="w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div class="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 id="inv-detail-h" class="font-heading text-xl text-gray-900 truncate">{{ detail?.clientName || 'Invoice' }}</h2>
            <p class="text-xs font-ui text-gray-500 mt-0.5">{{ detail?.invoiceId }} <span v-if="detail?.eimmigrationClientId">· client {{ detail.eimmigrationClientId }}</span></p>
          </div>
          <button ref="closeBtn" @click="close" class="p-2 rounded-lg text-gray-500 hover:bg-brand-surface" aria-label="Close">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div v-if="!detail" class="p-8 text-center text-sm text-gray-500 font-ui">Loading…</div>
        <div v-else class="flex-1 overflow-y-auto p-5 space-y-5 text-xs font-ui">
          <div class="flex flex-wrap items-center gap-2">
            <StatusPill :status="detail.status" />
            <span v-if="detail.sourceStatus" class="text-gray-500">eImmigration says “{{ detail.sourceStatus }}”</span>
          </div>
          <p v-if="detail.reviewReason" class="bg-violet-50 text-violet-900 rounded-lg px-3 py-2">{{ detail.reviewReason }}</p>
          <p v-if="detail.notInLatestReport" class="bg-amber-50 text-amber-900 rounded-lg px-3 py-2">This invoice was not in the latest full report. Its status was left unchanged: absence is not treated as payment. Check it in eImmigration.</p>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div v-for="f in detailFields" :key="f.label">
              <dt class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold">{{ f.label }}</dt>
              <dd class="text-gray-900 mt-0.5 tabular-nums">{{ f.value }}</dd>
            </div>
          </dl>

          <section>
            <h3 class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-2">Payments in imported reports</h3>
            <p v-if="!detail.payments.length" class="text-gray-500">None imported for this invoice.</p>
            <ul v-else class="divide-y divide-gray-100 ring-1 ring-gray-100 rounded-lg">
              <li v-for="p in detail.payments" :key="p.id" class="px-3 py-2 flex items-center gap-3">
                <span class="tabular-nums text-gray-700 w-24">{{ shortDate(p.payment_date) }}</span>
                <span class="flex-1 text-gray-600 capitalize">{{ p.payment_type }}<span v-if="p.method"> · {{ p.method }}</span></span>
                <span class="tabular-nums font-semibold text-gray-900">{{ money(p.amount_cents) }}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-2">monday.com</h3>
            <p v-if="!detail.mondayLinks.length" class="text-gray-500">Client not linked yet. <router-link :to="{ name: 'BillingMatching' }" class="text-brand-navy underline">Link it</router-link>.</p>
            <ul v-else><li v-for="l in detail.mondayLinks" :key="l.external_id" class="text-gray-700">{{ l.external_label || l.external_id }} <span class="text-gray-400">({{ l.method === 'manual' ? 'linked by staff' : 'matched by eImmigration ID' }})</span></li></ul>
          </section>

          <section>
            <h3 class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-2">History</h3>
            <ol class="space-y-2">
              <li v-for="r in detail.revisions" :key="r.id" class="ring-1 ring-gray-100 rounded-lg px-3 py-2">
                <p class="text-gray-500">{{ shortDate(r.created_at) }} · import #{{ r.import_job_id }}</p>
                <p class="text-gray-800 mt-1">{{ describeChanges(r.changes) }}</p>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBillingApi, money, shortDate } from '../api.js'
import StatusPill from '../components/StatusPill.vue'

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'partial', label: 'Partially paid' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
  { key: 'absent', label: 'Not in latest report' },
]
const FIELD_NAMES = {
  totalCents: 'total', paidCents: 'paid', balanceCents: 'balance', status: 'status', dueDate: 'due date',
  nextInstallmentDate: 'next installment', lastPaymentDate: 'last payment', reviewReason: 'review note',
}

const api = useBillingApi()
const route = useRoute()
const router = useRouter()
const invoices = ref([])
const loading = ref(true)
const error = ref('')
const search = ref(String(route.query.search || ''))
const filter = ref(route.query.absent === 'true' ? 'absent' : String(route.query.status || ''))
const selectedId = ref(null)
const detail = ref(null)
const closeBtn = ref(null)

let timer = null
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 250)
})

function setFilter(key) {
  filter.value = key
  router.replace({ query: key === 'absent' ? { absent: 'true' } : key ? { status: key } : {} })
  load()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = {}
    if (filter.value === 'absent') params.absent = 'true'
    else if (filter.value) params.status = filter.value
    if (search.value.trim()) params.search = search.value.trim()
    invoices.value = await api.invoices(params)
  } catch (err) {
    error.value = `Could not load invoices: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function open(id) {
  selectedId.value = id
  detail.value = null
  await nextTick()
  closeBtn.value?.focus()
  try {
    detail.value = await api.invoice(id)
  } catch (err) {
    error.value = `Could not load the invoice: ${err.message}`
    selectedId.value = null
  }
}
function close() {
  selectedId.value = null
  detail.value = null
}

const detailFields = computed(() => {
  const d = detail.value
  if (!d) return []
  return [
    { label: 'Invoice total', value: money(d.totalCents) },
    { label: 'Amount paid', value: money(d.paidCents) },
    { label: 'Balance', value: `${money(d.balanceCents)}${d.balanceSource === 'computed' ? ' (computed)' : ''}` },
    { label: 'Invoice date', value: shortDate(d.invoiceDate) },
    { label: 'Due date', value: shortDate(d.dueDate) },
    { label: 'Payment plan', value: d.paymentPlanText || '—' },
    { label: 'Next installment', value: d.nextInstallmentDate ? `${shortDate(d.nextInstallmentDate)} · ${money(d.nextInstallmentCents)}` : '—' },
    { label: 'Last payment', value: shortDate(d.lastPaymentDate) },
    { label: 'Report date', value: shortDate(d.lastReportDate) },
    { label: 'Last verified', value: shortDate(d.lastVerifiedAt) },
  ]
})

function describeChanges(changes = []) {
  if (!changes.length) return 'Re-confirmed, no changes'
  if (changes.every((c) => c.from == null)) return 'First imported from this report'
  const shown = changes.filter((c) => FIELD_NAMES[c.field])
  if (!shown.length) return `${changes.length} field(s) updated`
  return shown.map((c) => {
    const fmt = (v) => (v == null ? '—' : /Cents$/.test(c.field) ? money(v) : /Date$/.test(c.field) ? shortDate(v) : v)
    return `${FIELD_NAMES[c.field]}: ${fmt(c.from)} → ${fmt(c.to)}`
  }).join('; ')
}

onMounted(load)
</script>
