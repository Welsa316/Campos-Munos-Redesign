<template>
  <div class="h-full flex flex-col bg-white border-r border-gray-200">
    <!-- Header -->
    <div class="p-5 border-b border-gray-100">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-ui font-semibold text-gray-900 text-sm tracking-wide">
          {{ viewMode === 'archived' ? 'Archived' : 'Messages' }}
          <span v-if="viewMode !== 'archived' && unreadCount > 0" class="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-red text-white text-xs font-bold">
            {{ unreadCount }}
          </span>
        </h2>
        <button ref="refreshBtn" @click="$emit('refresh')" :disabled="refreshing" class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors disabled:opacity-50" title="Refresh" aria-label="Refresh messages">
          <i class="fa-solid fa-rotate-right text-sm" :class="{ 'fa-spin': refreshing }" aria-hidden="true"></i>
        </button>
      </div>

      <!-- View toggle: Inbox / Archived -->
      <div class="flex bg-brand-surface rounded-lg p-0.5 mb-3">
        <button
          @click="$emit('changeView', 'inbox')"
          :class="viewMode === 'inbox' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 text-xs font-ui font-medium py-1.5 rounded-md transition-all"
        >Inbox</button>
        <button
          @click="$emit('changeView', 'archived')"
          :class="viewMode === 'archived' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 text-xs font-ui font-medium py-1.5 rounded-md transition-all"
        >Archived</button>
      </div>

      <!-- Filter toggle (only in inbox view) -->
      <div v-if="viewMode === 'inbox'" class="flex bg-brand-surface rounded-lg p-0.5">
        <button
          @click="filter = 'all'"
          :class="filter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 text-xs font-ui font-medium py-1.5 rounded-md transition-all"
        >All</button>
        <button
          @click="filter = 'unread'"
          :class="filter === 'unread' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 text-xs font-ui font-medium py-1.5 rounded-md transition-all"
        >Unread</button>
      </div>

      <!-- Search — the front desk is often on the phone with the person -->
      <div class="mt-3 relative">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" aria-hidden="true"></i>
        <input
          v-model="search"
          type="search"
          placeholder="Search name, email or phone"
          aria-label="Search leads by name, email or phone"
          class="w-full text-xs font-ui pl-8 pr-8 py-2 rounded-lg bg-brand-surface border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none text-gray-700 transition-colors"
        />
        <button v-if="search" @click="search = ''" aria-label="Clear search"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">
          <i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Consultation type filter -->
      <div class="mt-3">
        <select v-model="consultationFilter"
          aria-label="Filter by consultation type"
          class="w-full text-xs font-ui font-medium px-3 py-2 rounded-lg bg-brand-surface border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none text-gray-700 transition-colors">
          <option value="">All consultation types</option>
          <option v-for="key in CONSULTATION_KEYS" :key="key" :value="key">
            {{ consultationLabel(key) }}
          </option>
        </select>
      </div>

      <!-- Pipeline at a glance: counts come from what's loaded, and clicking
           one narrows the list to that stage. -->
      <div class="mt-3 flex flex-wrap gap-1.5">
        <button
          @click="statusFilter = ''"
          :class="statusFilter === '' ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
          class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors"
        >All {{ props.submissions.length }}</button>
        <button
          v-for="st in LEAD_STATUSES"
          :key="st.key"
          @click="statusFilter = statusFilter === st.key ? '' : st.key"
          :title="st.hint"
          :aria-pressed="statusFilter === st.key"
          :class="statusFilter === st.key ? 'bg-brand-navy text-white ring-brand-navy' : `${st.pill} hover:brightness-95`"
          class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors"
        >{{ st.label }} {{ statusCounts[st.key] || 0 }}</button>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredSubmissions.length === 0" class="p-6 text-center">
        <i :class="viewMode === 'archived' ? 'fa-solid fa-archive' : 'fa-solid fa-inbox'" class="text-3xl text-gray-300 mb-3"></i>
        <p class="text-gray-500 text-sm font-ui">
          {{ viewMode === 'archived' ? 'No archived messages' : (filter === 'unread' ? 'No unread messages' : 'No messages yet') }}
        </p>
      </div>

      <div
        v-for="sub in filteredSubmissions"
        :key="sub.id"
        :class="[
          'border-b border-gray-50 transition-colors',
          sub.id === selectedId ? 'bg-brand-navy/[0.06]' : 'hover:bg-gray-50',
        ]"
      >
      <button
        @click="$emit('select', sub.id)"
        class="w-full text-left px-5 pt-4 pb-2"
      >
        <div class="flex items-start gap-3">
          <!-- Unread dot -->
          <div class="pt-1.5 w-2 flex-shrink-0">
            <div v-if="!sub.is_read" class="w-2 h-2 rounded-full bg-brand-red"><span class="sr-only">Unread. </span></div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 mb-1">
              <span :class="['font-ui text-sm truncate flex items-center gap-1.5', sub.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold']">
                <i v-if="sub.source === 'chat'" class="fa-solid fa-comment-dots text-brand-navy/60 text-[10px] flex-shrink-0" title="Chat session"></i>
                <span class="truncate">{{ sub.first_name }} {{ sub.last_name }}</span>
              </span>
              <span class="text-xs text-gray-500 font-ui flex-shrink-0">
                {{ relativeTime(sub.created_at) }}
              </span>
            </div>
            <div class="flex items-center gap-2 mb-1">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy text-[10px] font-ui font-semibold uppercase tracking-wider">
                {{ consultationLabel(sub.consultation_type) }}
              </span>
              <span v-if="sub.location" class="text-[11px] text-gray-500 font-ui truncate">
                <i class="fa-solid fa-location-dot text-[9px] mr-0.5" aria-hidden="true"></i>{{ formatCountry(sub.location) }}
              </span>
            </div>
            <p class="text-xs text-gray-500 font-ui truncate leading-relaxed"
              :class="{ 'italic text-gray-400': !sub.message }">
              {{ sub.message || '(no message)' }}
            </p>
          </div>
        </div>
      </button>

      <!-- Status + notes live OUTSIDE the select button: nesting buttons is
           invalid markup and would swallow these clicks. -->
      <div class="flex items-center gap-2 px-5 pb-3 pl-10">
        <div class="relative">
          <button
            @click.stop="openStatusFor = openStatusFor === sub.id ? null : sub.id"
            :aria-expanded="openStatusFor === sub.id"
            :aria-label="`Change status for ${sub.first_name} ${sub.last_name}, currently ${statusMeta(sub.status).label}`"
            :class="statusMeta(sub.status).pill"
            class="inline-flex items-center gap-1.5 text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-transform active:scale-95"
          >
            <span :class="statusMeta(sub.status).dot" class="w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
            {{ statusMeta(sub.status).label }}
            <i class="fa-solid fa-chevron-down text-[8px] opacity-60" aria-hidden="true"></i>
          </button>

          <div v-if="openStatusFor === sub.id"
            class="absolute left-0 top-full mt-1 z-30 w-44 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 py-1">
            <button
              v-for="st in LEAD_STATUSES"
              :key="st.key"
              @click.stop="chooseStatus(sub, st.key)"
              class="w-full text-left px-3 py-2 hover:bg-brand-surface transition-colors flex items-center gap-2"
            >
              <span :class="st.dot" class="w-2 h-2 rounded-full flex-shrink-0" aria-hidden="true"></span>
              <span class="flex-1 min-w-0">
                <span class="block text-xs font-ui font-semibold text-gray-800">{{ st.label }}</span>
                <span class="block text-[10px] text-gray-500 font-ui leading-tight">{{ st.hint }}</span>
              </span>
              <i v-if="sub.status === st.key" class="fa-solid fa-check text-[10px] text-brand-navy" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <button
          @click="$emit('openNotes', sub.id)"
          :aria-label="`Notes for ${sub.first_name} ${sub.last_name}`"
          :title="sub.note_count ? `${sub.note_count} note(s)` : 'Add a note'"
          :class="sub.note_count ? 'text-brand-navy' : 'text-gray-400 hover:text-gray-600'"
          class="inline-flex items-center gap-1 text-[11px] font-ui font-semibold px-2 py-1 rounded-full hover:bg-brand-surface transition-colors"
        >
          <i class="fa-solid fa-note-sticky text-[11px]" aria-hidden="true"></i>
          <span v-if="sub.note_count">{{ sub.note_count }}</span>
        </button>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CONSULTATION_KEYS, consultationLabel as consultationLabelShared } from '../../data/consultationTypes.js'
import { countryLabel } from '../../data/countries.js'
import { LEAD_STATUSES, statusMeta } from '../../data/leadStatuses.js'

const props = defineProps({
  submissions: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  viewMode: { type: String, default: 'inbox' },
  refreshing: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'refresh', 'changeView', 'setStatus', 'openNotes'])

const refreshBtn = ref(null)
// Let the dashboard restore focus here after the detail pane unmounts (e.g. archive).
defineExpose({ focusTop: () => refreshBtn.value?.focus() })

const { t, te, locale } = useI18n()
const filter = ref('all')
const consultationFilter = ref('')
const statusFilter = ref('')
const search = ref('')
const openStatusFor = ref(null)

// Counts are over everything loaded for the current view, not the filtered
// list, so the chips keep showing the whole pipeline while one is selected.
const statusCounts = computed(() => {
  const counts = {}
  for (const sub of props.submissions) {
    const key = statusMeta(sub.status).key
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
})

function chooseStatus(sub, status) {
  openStatusFor.value = null
  if (sub.status === status) return
  emit('setStatus', { id: sub.id, status })
}

// Close the dropdown on an outside click or Escape.
function closeStatusMenu(event) {
  if (event.type === 'keydown' && event.key !== 'Escape') return
  openStatusFor.value = null
}
onMounted(() => {
  document.addEventListener('click', closeStatusMenu)
  document.addEventListener('keydown', closeStatusMenu)
})
onUnmounted(() => {
  document.removeEventListener('click', closeStatusMenu)
  document.removeEventListener('keydown', closeStatusMenu)
})

const consultationLabel = (key) => consultationLabelShared(key, t, te)
const formatCountry = (code) => countryLabel(code, locale.value)

const unreadCount = computed(() => props.submissions.filter(s => !s.is_read).length)

const filteredSubmissions = computed(() => {
  let list = props.submissions
  if (filter.value === 'unread' && props.viewMode !== 'archived') {
    // Keep the currently-open row visible even after opening auto-marks it read,
    // so the selected item doesn't vanish out from under the admin mid-read.
    list = list.filter(s => !s.is_read || s.id === props.selectedId)
  }
  if (consultationFilter.value) {
    list = list.filter(s => s.consultation_type === consultationFilter.value)
  }
  if (statusFilter.value) {
    list = list.filter(s => statusMeta(s.status).key === statusFilter.value)
  }
  const term = search.value.trim().toLowerCase()
  if (term) {
    // Digits-only comparison for phone so "(504) 910-6508" matches "5049106508".
    const digits = term.replace(/\D/g, '')
    list = list.filter(s => {
      const name = `${s.first_name} ${s.last_name}`.toLowerCase()
      const phoneDigits = String(s.phone || '').replace(/\D/g, '')
      return name.includes(term)
        || String(s.email || '').toLowerCase().includes(term)
        || (digits.length >= 3 && phoneDigits.includes(digits))
    })
  }

  return [...list].sort((a, b) => {
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1
    return new Date(b.created_at) - new Date(a.created_at)
  })
})

function relativeTime(dateStr) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>
