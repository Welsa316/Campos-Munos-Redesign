<template>
  <div>
    <!-- Legend: the three actors the demo is about -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5 text-[11px] font-ui text-gray-500">
      <span v-for="k in LEGEND" :key="k" class="inline-flex items-center gap-1.5">
        <span :class="EVENT_KINDS[k].node" class="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px]">
          <DemoIcon :icon="EVENT_KINDS[k].icon" />
        </span>
        {{ EVENT_KINDS[k].label }}
      </span>
    </div>

    <TransitionGroup name="tl" tag="ol" class="relative">
      <li
        v-for="(item, i) in items"
        :key="item.type === 'day' ? item.key : item.event.id"
        class="relative"
      >
        <!-- Day divider -->
        <div v-if="item.type === 'day'" class="flex items-center gap-3 pb-3" :class="i > 0 ? 'pt-2' : ''">
          <span class="text-[10px] font-ui font-semibold uppercase tracking-[0.12em] text-gray-500">{{ item.label }}</span>
          <span class="flex-1 h-px bg-gray-100"></span>
        </div>

        <div v-else class="flex gap-3 pb-4">
          <!-- Time column -->
          <div class="w-[62px] flex-shrink-0 pt-1 text-right">
            <span class="text-[11px] font-ui text-gray-500 tabular-nums whitespace-nowrap">{{ clockTime(item.event.at) }}</span>
          </div>

          <!-- Rail + node -->
          <div class="relative flex flex-col items-center flex-shrink-0">
            <span
              :class="EVENT_KINDS[item.event.kind].node"
              class="relative z-[1] w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px]"
            >
              <DemoIcon :icon="EVENT_KINDS[item.event.kind].icon" />
            </span>
            <span v-if="!item.last" class="absolute top-6 -bottom-4 w-px bg-gray-200" aria-hidden="true"></span>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0 pt-0.5">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p :class="titleClass(item.event)" class="text-sm font-ui font-medium leading-snug">{{ item.event.title }}</p>
              <span :class="EVENT_KINDS[item.event.kind].tag" class="text-[9px] font-ui font-bold uppercase tracking-[0.12em]">
                {{ EVENT_KINDS[item.event.kind].label }}<template v-if="item.event.channel"> · {{ item.event.channel }}</template>
              </span>
            </div>
            <p v-if="item.event.detail" class="text-xs font-ui text-gray-500 mt-0.5 leading-relaxed">{{ item.event.detail }}</p>
            <div v-if="item.event.quote"
              :class="item.event.kind === 'auto' ? 'bg-brand-navy/[0.05] border-brand-navy/30' : 'bg-brand-surface border-gray-300'"
              class="mt-2 border-l-2 rounded-r-lg px-3 py-2 max-w-xl">
              <p class="text-xs font-ui text-gray-800 leading-relaxed">“{{ item.event.quote }}”</p>
              <p v-if="item.event.quoteNote" class="text-[11px] font-ui text-gray-500 leading-relaxed mt-1">{{ item.event.quoteNote }}</p>
            </div>
          </div>
        </div>
      </li>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import DemoIcon from './DemoIcon.vue'
import { EVENT_KINDS } from '../data/model.js'
import { clockTime } from '../useOpsDemo.js'
import { demoNow } from '../data/leads.js'

const props = defineProps({
  events: { type: Array, required: true },
})

const LEGEND = ['client', 'auto', 'staff']

function dayLabel(d) {
  const today = demoNow()
  const y = new Date(today); y.setDate(y.getDate() - 1)
  const t = new Date(today); t.setDate(t.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  if (d.toDateString() === t.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// Chronological, stable for events sharing a minute, with a divider per day.
const items = computed(() => {
  const sorted = props.events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (new Date(a.e.at) - new Date(b.e.at)) || (a.i - b.i))
    .map(x => x.e)
  const out = []
  let lastDay = ''
  sorted.forEach((event, idx) => {
    const d = new Date(event.at)
    const key = d.toDateString()
    if (key !== lastDay) {
      out.push({ type: 'day', key: `day-${key}`, label: dayLabel(d) })
      lastDay = key
    }
    out.push({ type: 'event', event, last: idx === sorted.length - 1 })
  })
  return out
})

function titleClass(event) {
  if (event.tone === 'alert') return 'text-orange-700'
  if (event.tone === 'win') return 'text-brand-navy'
  if (event.kind === 'upcoming') return 'text-brand-navy'
  return 'text-gray-900'
}
</script>

<style scoped>
.tl-enter-active {
  transition: opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), background-color 1.6s ease;
}
.tl-enter-from { opacity: 0; transform: translateY(6px); }
.tl-move { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
@media (prefers-reduced-motion: reduce) {
  .tl-enter-active, .tl-move { transition: none; }
}
</style>
