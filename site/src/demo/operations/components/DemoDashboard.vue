<template>
  <div class="flex-1 overflow-y-auto">
    <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <!-- Heading -->
      <div class="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 class="font-heading text-2xl text-brand-navy tracking-tight">Operations</h2>
          <p class="text-xs font-ui text-gray-500 mt-1">{{ MONTH_LABEL }} · every figure is demo data except the one marked <span class="font-semibold text-gray-700">Firm data</span></p>
        </div>
        <span class="inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-gray-500 px-2.5 py-1 rounded-full border border-dashed border-gray-300">
          <DemoIcon :icon="faFlask" class="text-[10px]" /> Demo data
        </span>
      </div>

      <!-- Headline metrics -->
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div v-for="m in HEADLINE_METRICS" :key="m.key"
          :class="m.real ? 'bg-white ring-2 ring-brand-navy' : 'bg-white ring-1 ring-gray-200'"
          class="rounded-xl px-4 py-4 flex flex-col">
          <div class="flex items-start justify-between gap-2 min-h-[32px]">
            <p class="text-[11px] font-ui font-medium text-gray-600 leading-tight">{{ m.label }}</p>
          </div>
          <p :class="m.real ? 'text-brand-navy' : 'text-gray-900'" class="font-ui text-[32px] font-light tracking-tight tabular-nums leading-none mt-2">
            {{ m.value }}<span v-if="m.unit" class="text-base text-gray-500 ml-1 font-normal">{{ m.unit }}</span>
          </p>
          <div class="mt-3">
            <span v-if="m.real" class="inline-flex items-center gap-1 text-[9px] font-ui font-bold uppercase tracking-[0.12em] text-white bg-brand-navy px-2 py-0.5 rounded">
              Firm data
            </span>
            <span v-else class="inline-flex text-[9px] font-ui font-bold uppercase tracking-[0.12em] text-gray-500 px-1.5 py-0.5 rounded border border-dashed border-gray-300">
              Demo
            </span>
            <p v-if="m.note" class="text-[10px] font-ui text-gray-500 mt-1.5 leading-tight">{{ m.note }}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <!-- Source funnel -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="funnel-heading">
          <header class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 id="funnel-heading" class="text-sm font-ui font-semibold text-gray-900">Source funnel</h3>
              <p class="text-[11px] font-ui text-gray-500 mt-0.5">Each bar is 100% of that source's leads — how far they get</p>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-[11px] font-ui text-gray-600">
              <span v-for="s in BAR_STAGES" :key="s.key" class="inline-flex items-center gap-1.5">
                <span :class="s.swatch" class="w-2.5 h-2.5 rounded-sm"></span>{{ s.label }}
              </span>
            </div>
          </header>

          <div class="overflow-x-auto">
            <table class="w-full text-xs font-ui min-w-[620px]">
              <thead>
                <tr class="text-[10px] uppercase tracking-[0.1em] text-gray-500">
                  <th scope="col" class="text-left font-semibold px-5 py-2.5">Source</th>
                  <th scope="col" class="text-left font-semibold px-2 py-2.5 w-[34%]">Progress</th>
                  <th v-for="s in FUNNEL_STAGES" :key="s.key" scope="col" class="text-right font-semibold px-2 py-2.5">{{ s.label }}</th>
                  <th scope="col" class="text-right font-semibold px-5 py-2.5 whitespace-nowrap">Lead → client</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in SOURCE_FUNNEL" :key="row.channel" class="border-t border-gray-50">
                  <th scope="row" class="text-left font-medium text-gray-900 px-5 py-3.5 whitespace-nowrap">
                    <span class="inline-flex items-center gap-2">
                      <DemoIcon :icon="CHANNELS[row.channel].icon" class="text-gray-500 text-[11px]" />{{ row.label }}
                    </span>
                  </th>
                  <td class="px-2 py-3.5">
                    <div class="relative h-2.5 rounded-full bg-gray-100 overflow-hidden" :aria-label="`${pct(row.contacted, row.leads)} contacted, ${pct(row.scheduled, row.leads)} scheduled, ${pct(row.retained, row.leads)} retained`" role="img">
                      <div v-for="s in BAR_STAGES" :key="s.key" :class="s.swatch"
                        class="absolute inset-y-0 left-0 rounded-full"
                        :style="{ width: pct(row[s.key], row.leads) }"></div>
                    </div>
                  </td>
                  <td v-for="s in FUNNEL_STAGES" :key="s.key" class="text-right px-2 py-3.5 tabular-nums text-gray-700">{{ row[s.key] }}</td>
                  <td class="text-right px-5 py-3.5 tabular-nums font-semibold text-brand-navy">{{ pct(row.retained, row.leads, 1) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="border-t border-gray-200 bg-brand-light">
                  <th scope="row" class="text-left font-semibold text-gray-900 px-5 py-3">All sources</th>
                  <td></td>
                  <td v-for="s in FUNNEL_STAGES" :key="s.key" class="text-right px-2 py-3 tabular-nums font-semibold text-gray-900">{{ totals[s.key] }}</td>
                  <td class="text-right px-5 py-3 tabular-nums font-semibold text-brand-navy">{{ pct(totals.retained, totals.leads, 1) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <!-- Needs attention (live) -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="attention-heading">
          <header class="px-5 py-4 border-b border-gray-100">
            <h3 id="attention-heading" class="text-sm font-ui font-semibold text-gray-900">Needs attention</h3>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">Today · updates as leads are worked</p>
          </header>
          <ul class="p-2">
            <li v-for="item in attentionItems" :key="item.key">
              <button @click="$emit('openList', { status: item.status })"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-brand-surface transition-colors text-left group">
                <span :class="item.count ? item.tone : 'bg-gray-100 text-gray-500'" class="w-9 h-9 rounded-lg inline-flex items-center justify-center text-base font-ui font-semibold tabular-nums flex-shrink-0 transition-colors">
                  {{ item.count }}
                </span>
                <span class="flex-1 text-[13px] font-ui text-gray-800 leading-snug">{{ item.label }}</span>
                <DemoIcon :icon="faChevronRight" class="text-[10px] text-gray-300 group-hover:text-brand-navy transition-colors" />
              </button>
            </li>
          </ul>
        </section>
      </div>

      <!-- Missed-call operations -->
      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="missed-heading">
        <header class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 id="missed-heading" class="text-sm font-ui font-semibold text-gray-900">Missed-call recovery</h3>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">Every unanswered call is acknowledged within a minute and queued for a callback</p>
          </div>
        </header>

        <div class="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <!-- Month -->
          <div class="p-5 lg:border-r border-gray-100">
            <p class="text-[10px] font-ui font-semibold uppercase tracking-[0.12em] text-gray-500 mb-3">{{ MONTH_LABEL }}</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p class="font-ui text-[28px] font-light tracking-tight tabular-nums leading-none text-brand-navy">98</p>
                <p class="text-[11px] font-ui text-gray-600 mt-1.5">Missed calls</p>
                <span class="inline-flex mt-1 text-[9px] font-ui font-bold uppercase tracking-[0.12em] text-white bg-brand-navy px-1.5 py-0.5 rounded">Firm data</span>
              </div>
              <div v-for="s in MONTH_STATS" :key="s.label">
                <p class="font-ui text-[28px] font-light tracking-tight tabular-nums leading-none text-gray-900">{{ s.value }}</p>
                <p class="text-[11px] font-ui text-gray-600 mt-1.5">{{ s.label }}</p>
                <span class="inline-flex mt-1 text-[9px] font-ui font-bold uppercase tracking-[0.12em] text-gray-500 px-1.5 py-0.5 rounded border border-dashed border-gray-300">Demo</span>
              </div>
            </div>

            <div class="mt-6">
              <div class="flex h-3 rounded-full overflow-hidden bg-gray-100" role="img"
                :aria-label="MISSED_CALL_OUTCOMES.map(o => `${o.value} ${o.label}`).join(', ')">
                <div v-for="o in MISSED_CALL_OUTCOMES" :key="o.key" :class="o.bar" class="h-full first:rounded-l-full last:rounded-r-full border-r-2 border-white last:border-r-0"
                  :style="{ width: `${(o.value / 98) * 100}%` }"></div>
              </div>
              <ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] font-ui text-gray-600">
                <li v-for="o in MISSED_CALL_OUTCOMES" :key="o.key" class="inline-flex items-center gap-1.5">
                  <span :class="o.bar" class="w-2.5 h-2.5 rounded-sm"></span>
                  <span class="tabular-nums font-semibold text-gray-900">{{ o.value }}</span> {{ o.label }}
                </li>
              </ul>
              <p class="text-[11px] font-ui text-gray-500 mt-3 leading-relaxed">What last month's 98 calls could look like with recovery running. The split is illustrative.</p>
            </div>
          </div>

          <!-- Today (live) -->
          <div class="p-5 border-t lg:border-t-0 border-gray-100">
            <div class="flex items-baseline justify-between mb-3 gap-3">
              <p class="text-[10px] font-ui font-semibold uppercase tracking-[0.12em] text-gray-500">Today</p>
              <p class="text-[11px] font-ui text-gray-600"><span class="font-semibold text-gray-900 tabular-nums">{{ recoveredToday }} of {{ missedCallLog.length }}</span> recovered</p>
            </div>
            <ul class="divide-y divide-gray-50">
              <li v-for="row in missedCallLog" :key="row.lead.id">
                <button @click="$emit('openLead', row.lead.id)"
                  class="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-brand-surface transition-colors text-left">
                  <span class="w-[62px] text-[11px] font-ui text-gray-500 tabular-nums flex-shrink-0">{{ clockTime(row.lead.receivedAt) }}</span>
                  <span class="flex-1 min-w-0 text-[13px] font-ui text-gray-900 truncate tabular-nums">{{ displayName(row.lead) }}</span>
                  <span :key="row.outcome" :class="TONES[row.tone]" class="outcome text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap">{{ row.outcome }}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { faFlask, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import DemoIcon from './DemoIcon.vue'
import { CHANNELS } from '../data/model.js'
import {
  HEADLINE_METRICS, SOURCE_FUNNEL, FUNNEL_STAGES, MISSED_CALL_OUTCOMES, MEDIAN_CALLBACK, MONTH_LABEL,
} from '../data/dashboard.js'
import { attention, missedCallLog, displayName, clockTime } from '../useOpsDemo.js'

defineEmits(['openList', 'openLead'])

const BAR_STAGES = [
  { key: 'contacted', label: 'Contacted', swatch: 'bg-brand-navy/25' },
  { key: 'scheduled', label: 'Scheduled', swatch: 'bg-brand-navy/55' },
  { key: 'retained',  label: 'Retained',  swatch: 'bg-brand-navy' },
]

const MONTH_STATS = [
  { label: 'Recovered', value: '71' },
  { label: 'Still unresolved', value: '12' },
  { label: 'Median callback', value: MEDIAN_CALLBACK },
]

const TONES = {
  orange: 'bg-orange-100 text-orange-800 ring-orange-200',
  navy: 'bg-brand-navy/10 text-brand-navy ring-brand-navy/20',
  green: 'bg-green-100 text-green-800 ring-green-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
}

const totals = computed(() => SOURCE_FUNNEL.reduce((acc, r) => {
  for (const s of FUNNEL_STAGES) acc[s.key] = (acc[s.key] || 0) + r[s.key]
  return acc
}, {}))

function pct(n, d, digits = 0) {
  return `${((n / d) * 100).toFixed(digits)}%`
}

const plural = (n, one, many) => (n === 1 ? one : many)

const attentionItems = computed(() => {
  const a = attention.value
  return [
    { key: 'missed', status: 'missed_call', count: a.missedUnresolved.length, tone: 'bg-orange-100 text-orange-800',
      label: `${plural(a.missedUnresolved.length, 'missed call', 'missed calls')} unresolved` },
    { key: 'followup', status: 'no_response', count: a.awaitingFollowUp.length, tone: 'bg-violet-100 text-violet-800',
      label: `${plural(a.awaitingFollowUp.length, 'lead', 'leads')} awaiting a second follow-up` },
    { key: 'consults', status: 'scheduled', count: a.consultsToday.length, tone: 'bg-green-100 text-green-800',
      label: `${plural(a.consultsToday.length, 'consultation', 'consultations')} today` },
    { key: 'stale', status: 'new', count: a.staleNew.length, tone: 'bg-brand-red/10 text-brand-red',
      label: `${plural(a.staleNew.length, 'lead', 'leads')} not contacted in over an hour` },
  ]
})

const recoveredToday = computed(() => missedCallLog.value.filter(r => r.tone === 'green').length)
</script>

<style scoped>
.outcome { animation: settle 0.45s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes settle { from { transform: scale(0.9); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .outcome { animation: none; } }
</style>
