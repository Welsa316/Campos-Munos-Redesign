<template>
  <div class="h-full flex flex-col bg-white border-r border-gray-200">
    <div class="p-5 border-b border-gray-100">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-ui font-semibold text-gray-900 text-sm tracking-wide">
          Leads
          <span v-if="unreadCount > 0" class="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-red text-white text-xs font-bold">
            {{ unreadCount }}
          </span>
        </h2>
        <span class="text-[11px] font-ui text-gray-500">{{ filtered.length }} of {{ leads.length }}</span>
      </div>

      <!-- Lead method: the one axis the production inbox doesn't have yet -->
      <div class="flex bg-brand-surface rounded-lg p-0.5" role="group" aria-label="Filter by how the lead arrived">
        <button
          v-for="opt in METHOD_FILTERS"
          :key="opt.key"
          @click="methodFilter = opt.key"
          :aria-pressed="methodFilter === opt.key"
          :class="methodFilter === opt.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 text-[11px] font-ui font-medium py-1.5 rounded-md transition-all whitespace-nowrap"
        >{{ opt.label }}</button>
      </div>

      <div class="mt-3 relative">
        <DemoIcon :icon="faMagnifyingGlass" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
        <input
          v-model="search"
          type="search"
          placeholder="Search name, phone or campaign"
          aria-label="Search leads"
          class="w-full text-xs font-ui pl-8 pr-3 py-2 rounded-lg bg-brand-surface border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none text-gray-700 transition-colors"
        />
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5">
        <button
          @click="statusFilter = ''"
          :class="statusFilter === '' ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
          class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors"
        >All {{ leads.length }}</button>
        <button
          v-for="st in DEMO_STATUSES"
          :key="st.key"
          @click="statusFilter = statusFilter === st.key ? '' : st.key"
          :title="st.hint"
          :aria-pressed="statusFilter === st.key"
          :class="statusFilter === st.key ? 'bg-brand-navy text-white ring-brand-navy' : `${st.pill} hover:brightness-95`"
          class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors"
        >{{ st.label }} {{ counts[st.key] || 0 }}</button>
      </div>
    </div>

    <div ref="scroller" class="flex-1 overflow-y-auto">
      <div v-if="filtered.length === 0" class="p-8 text-center">
        <DemoIcon :icon="faInbox" class="text-3xl text-gray-300 mb-3" />
        <p class="text-gray-500 text-sm font-ui">No leads match these filters</p>
        <button @click="clearFilters" class="mt-3 text-brand-navy text-xs font-ui font-semibold hover:underline">Clear filters</button>
      </div>

      <TransitionGroup name="row" tag="ul">
        <li v-for="lead in filtered" :key="lead.id" :data-lead="lead.id">
          <button
            @click="$emit('select', lead.id)"
            :aria-current="lead.id === selectedId ? 'true' : undefined"
            :class="[
              'w-full text-left px-5 py-3.5 border-b border-gray-50 transition-colors relative',
              lead.id === selectedId ? 'bg-brand-navy/[0.06]' : 'hover:bg-gray-50',
            ]"
          >
            <span v-if="lead.id === selectedId" class="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-navy" aria-hidden="true"></span>
            <div class="flex items-start gap-3">
              <div class="pt-1.5 w-2 flex-shrink-0">
                <div v-if="lead.unread" class="w-2 h-2 rounded-full bg-brand-red"><span class="sr-only">Unread. </span></div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-2 mb-1">
                  <span :class="['font-ui text-sm truncate tabular-nums', lead.unread ? 'text-gray-900 font-semibold' : 'text-gray-700']">
                    {{ displayName(lead) }}
                  </span>
                  <span class="text-xs text-gray-500 font-ui flex-shrink-0 tabular-nums">{{ relativeTime(lead.receivedAt) }}</span>
                </div>
                <div class="flex items-center gap-2 mb-1.5 min-w-0">
                  <SourceBadge kind="method" :value="lead.method" />
                  <span class="text-[11px] text-gray-600 font-ui truncate">{{ lead.practice }}</span>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span class="flex items-center gap-2 min-w-0 text-[11px] text-gray-500 font-ui">
                    <SourceBadge kind="channel" :value="lead.attribution.channel" short />
                    <span v-if="lead.inRecovery" class="truncate font-semibold text-brand-navy">· In recovery queue</span>
                    <span v-else-if="lead.attribution.campaign" class="truncate text-gray-500">· {{ lead.attribution.campaign }}</span>
                    <span v-else-if="lead.country" class="truncate text-gray-500">· {{ lead.country }}</span>
                  </span>
                  <StatusBadge :status="lead.status" />
                </div>
              </div>
            </div>
          </button>
        </li>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { faMagnifyingGlass, faInbox } from '@fortawesome/free-solid-svg-icons'
import DemoIcon from './DemoIcon.vue'
import StatusBadge from './StatusBadge.vue'
import SourceBadge from './SourceBadge.vue'
import { DEMO_STATUSES, demoStatusMeta } from '../data/model.js'
import { displayName, relativeTime } from '../useOpsDemo.js'

const props = defineProps({
  leads: { type: Array, required: true },
  selectedId: { type: String, default: null },
  // { status?: string } handed over from a dashboard shortcut
  preset: { type: Object, default: null },
})
defineEmits(['select'])

const METHOD_FILTERS = [
  { key: '', label: 'All' },
  { key: 'calls', label: 'Calls' },
  { key: 'website_form', label: 'Forms' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

const methodFilter = ref('')
const statusFilter = ref('')
const search = ref('')

watch(() => props.preset, (p) => {
  if (!p) return
  statusFilter.value = p.status || ''
  methodFilter.value = ''
  search.value = ''
}, { immediate: true })

function clearFilters() {
  methodFilter.value = ''
  statusFilter.value = ''
  search.value = ''
}

// A lead opened from the dashboard or walkthrough may sit below the fold.
const scroller = ref(null)
function revealSelected() {
  nextTick(() => {
    const box = scroller.value
    const row = box?.querySelector(`[data-lead="${props.selectedId}"]`)
    if (!row) return
    // Scroll only the list. scrollIntoView would also scroll every ancestor,
    // yanking the strategy page down to wherever this list is embedded.
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    if (top < box.scrollTop) box.scrollTop = top
    else if (top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + row.offsetHeight - box.clientHeight
  })
}
watch(() => props.selectedId, revealSelected)
onMounted(revealSelected)

const unreadCount = computed(() => props.leads.filter(l => l.unread).length)

const counts = computed(() => {
  const c = {}
  for (const l of props.leads) c[demoStatusMeta(l.status).key] = (c[demoStatusMeta(l.status).key] || 0) + 1
  return c
})

const filtered = computed(() => {
  let list = props.leads
  if (methodFilter.value === 'calls') list = list.filter(l => l.method === 'missed_call' || l.method === 'phone_call')
  else if (methodFilter.value) list = list.filter(l => l.method === methodFilter.value)
  // The open lead stays listed after an action moves it out of the filtered stage.
  if (statusFilter.value) list = list.filter(l => l.status === statusFilter.value || l.id === props.selectedId)
  const term = search.value.trim().toLowerCase()
  if (term) {
    const digits = term.replace(/\D/g, '')
    list = list.filter(l =>
      (l.name || '').toLowerCase().includes(term)
      || (l.attribution.campaign || '').toLowerCase().includes(term)
      || l.practice.toLowerCase().includes(term)
      || (digits.length >= 3 && l.phone.replace(/\D/g, '').includes(digits)))
  }
  // Newest first, and nothing else: opening a lead must not reshuffle the list
  // under the presenter's cursor the way an unread-first sort would.
  return [...list].sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
})
</script>

<style scoped>
.row-move { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.row-enter-active, .row-leave-active { transition: opacity 0.2s ease; }
.row-enter-from, .row-leave-to { opacity: 0; }
.row-leave-active { position: absolute; width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .row-move, .row-enter-active, .row-leave-active { transition: none; }
}
</style>
