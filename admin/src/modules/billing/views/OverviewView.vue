<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

    <div v-if="loading && !data" class="py-16 text-center text-sm text-gray-500 font-ui">
      <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>{{ t('overview.loading') }}
    </div>

    <template v-else-if="data">
      <!-- Empty state: nothing imported yet -->
      <section v-if="!data.lastImport" class="bg-white rounded-xl ring-1 ring-gray-200 px-6 py-10 text-center">
        <h2 class="font-heading text-xl text-brand-navy">{{ t('overview.empty.title') }}</h2>
        <p class="text-sm font-ui text-gray-600 mt-2 max-w-md mx-auto">{{ t('overview.empty.body') }}</p>
        <router-link :to="{ name: 'BillingImports' }"
          class="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark transition-colors">
          {{ t('import_report') }}
        </router-link>
      </section>

      <template v-if="data.lastImport">
      <!-- Headline figures -->
      <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div class="col-span-2 bg-white rounded-xl ring-2 ring-brand-navy px-5 py-4">
          <p class="text-[11px] font-ui font-medium text-gray-600">{{ t('overview.verified') }}</p>
          <p class="font-ui text-[34px] font-light tracking-tight tabular-nums leading-none mt-2 text-brand-navy">{{ money(data.verifiedOutstandingCents) }}</p>
          <p class="text-[10px] font-ui text-gray-500 mt-2 leading-snug">{{ t('overview.verified_note') }}</p>
        </div>
        <router-link v-for="m in metrics" :key="m.key" :to="{ name: 'BillingInvoices', query: { status: m.key } }"
          class="bg-white rounded-xl ring-1 ring-gray-200 hover:ring-brand-navy/40 px-4 py-4 transition-colors">
          <p class="text-[11px] font-ui font-medium text-gray-600">{{ t(m.label) }}</p>
          <p :class="m.tone" class="font-ui text-[28px] font-light tracking-tight tabular-nums leading-none mt-2">{{ data.byStatus[m.key]?.count || 0 }}</p>
          <p v-if="m.showOwed" class="text-[11px] font-ui text-gray-500 mt-2 tabular-nums">{{ t('owed', { amount: money(data.byStatus[m.key]?.owedCents || 0) }) }}</p>
        </router-link>
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <!-- Upcoming payments -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="upcoming-h">
          <header class="px-5 py-4 border-b border-gray-100">
            <h2 id="upcoming-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('overview.upcoming') }}</h2>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ t('overview.upcoming_note') }}</p>
          </header>
          <p v-if="!data.upcoming.length" class="px-5 py-8 text-sm font-ui text-gray-500 text-center">{{ t('overview.nothing_due') }}</p>
          <div v-else class="overflow-x-auto">
          <table class="w-full text-xs font-ui">
            <thead>
              <tr class="text-[10px] uppercase tracking-[0.1em] text-gray-500">
                <th scope="col" class="text-left font-semibold px-5 py-2">{{ t('col.due') }}</th>
                <th scope="col" class="text-left font-semibold px-2 py-2">{{ t('col.client') }}</th>
                <th scope="col" class="text-left font-semibold px-2 py-2 hidden sm:table-cell">{{ t('col.invoice') }}</th>
                <th scope="col" class="text-right font-semibold px-5 py-2">{{ t('col.balance') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in data.upcoming" :key="u.invoiceId" class="border-t border-gray-50">
                <td class="px-5 py-3 whitespace-nowrap text-gray-700 tabular-nums">{{ shortDate(u.dueDate) }}</td>
                <td class="px-2 py-3 text-gray-900 font-medium">{{ u.clientName || '—' }}</td>
                <td class="px-2 py-3 text-gray-500 hidden sm:table-cell">{{ u.invoiceId }}</td>
                <td class="px-5 py-3 text-right tabular-nums text-gray-900">{{ money(u.balanceCents) }}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <div class="space-y-5">
          <!-- Needs attention -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="attention-h">
            <header class="px-5 py-4 border-b border-gray-100">
              <h2 id="attention-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('overview.attention') }}</h2>
            </header>
            <ul class="p-2">
              <li v-for="a in attention" :key="a.label">
                <router-link :to="a.to" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-surface transition-colors">
                  <span :class="a.count ? a.tone : 'bg-gray-100 text-gray-500'" class="w-9 h-9 rounded-lg inline-flex items-center justify-center text-base font-ui font-semibold tabular-nums flex-shrink-0">{{ a.count }}</span>
                  <span class="flex-1 text-[13px] font-ui text-gray-800 leading-snug">{{ t(a.label) }}</span>
                  <i class="fa-solid fa-chevron-right text-[10px] text-gray-300" aria-hidden="true"></i>
                </router-link>
              </li>
            </ul>
          </section>

          <!-- Freshness -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 space-y-3 text-xs font-ui" :aria-label="t('overview.freshness')">
            <div>
              <p class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold">{{ t('overview.last_import') }}</p>
              <p v-if="data.lastImport" class="text-gray-800 mt-1">{{ shortDate(data.lastImport.applied_at) }} · {{ data.lastImport.filename }}</p>
              <p v-if="data.lastImport" class="text-gray-500">{{ t('overview.report_dated', { date: shortDate(data.lastImport.report_date) }) }}</p>
              <p v-else class="text-gray-500 mt-1">{{ t('overview.none_yet') }}</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold">{{ t('overview.last_sync') }}</p>
              <p v-if="data.lastSync" class="text-gray-800 mt-1">
                {{ shortDate(data.lastSync.applied_at) }} ·
                <span v-if="data.lastSync.provider_mode === 'mock'" class="font-semibold text-violet-700">{{ t('overview.simulated_board') }}</span>
                <span v-else-if="data.lastSync.dry_run" class="font-semibold text-amber-700">{{ t('overview.dry_run') }}</span>
                <span v-else>{{ t('overview.items_updated', { count: data.lastSync.stats?.written ?? 0 }) }}</span>
              </p>
              <p v-else class="text-gray-500 mt-1">{{ t('overview.never_synced') }}</p>
            </div>
          </section>
        </div>
      </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useBillingApi } from '../api.js'
import { money as moneyIn, shortDate as dateIn } from '../format.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'

const emit = defineEmits(['counts'])
const api = useBillingApi()
const data = ref(null)
const loading = ref(true)
const error = ref('')
const { t, locale } = useT(BILLING)
const money = (cents) => moneyIn(cents, locale.value)
const shortDate = (value) => dateIn(value, locale.value)

// label (and the attention rows' label): a word in i18n/billing.js.
const metrics = [
  { key: 'overdue', label: 'filter.overdue', tone: 'text-brand-red', showOwed: true },
  { key: 'partial', label: 'filter.partial', tone: 'text-gray-900', showOwed: true },
  { key: 'unpaid', label: 'filter.unpaid', tone: 'text-gray-900', showOwed: true },
  { key: 'paid', label: 'filter.paid', tone: 'text-green-700', showOwed: false },
]

const attention = computed(() => {
  const a = data.value?.attention || {}
  return [
    { label: 'attention.overdue', count: a.overdue || 0, tone: 'bg-brand-red/10 text-brand-red', to: { name: 'BillingInvoices', query: { status: 'overdue' } } },
    { label: 'attention.needs_review', count: a.needs_review || 0, tone: 'bg-violet-100 text-violet-800', to: { name: 'BillingInvoices', query: { status: 'needs_review' } } },
    { label: 'attention.unmatched', count: a.unmatchedClients || 0, tone: 'bg-amber-100 text-amber-800', to: { name: 'BillingMatching' } },
    { label: 'attention.absent', count: a.absent || 0, tone: 'bg-gray-200 text-gray-700', to: { name: 'BillingInvoices', query: { absent: 'true' } } },
  ]
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.overview()
    emit('counts', { unmatched: data.value.attention?.unmatchedClients || 0 })
  } catch (err) {
    error.value = err.message === 'Your account cannot perform this action' ? err.message : t('overview.load_error', { message: err.message })
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>
