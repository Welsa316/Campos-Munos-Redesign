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
        <button @click="$emit('refresh')" class="p-2 rounded-lg text-gray-400 hover:text-brand-navy hover:bg-brand-surface transition-colors" title="Refresh">
          <i class="fa-solid fa-rotate-right text-sm"></i>
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
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredSubmissions.length === 0" class="p-6 text-center">
        <i :class="viewMode === 'archived' ? 'fa-solid fa-archive' : 'fa-solid fa-inbox'" class="text-3xl text-gray-300 mb-3"></i>
        <p class="text-gray-400 text-sm font-ui">
          {{ viewMode === 'archived' ? 'No archived messages' : (filter === 'unread' ? 'No unread messages' : 'No messages yet') }}
        </p>
      </div>

      <button
        v-for="sub in filteredSubmissions"
        :key="sub.id"
        @click="$emit('select', sub.id)"
        :class="[
          'w-full text-left px-5 py-4 border-b border-gray-50 transition-colors',
          sub.id === selectedId ? 'bg-brand-navy/[0.06]' : 'hover:bg-gray-50',
        ]"
      >
        <div class="flex items-start gap-3">
          <!-- Unread dot -->
          <div class="pt-1.5 w-2 flex-shrink-0">
            <div v-if="!sub.is_read" class="w-2 h-2 rounded-full bg-brand-red"></div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 mb-1">
              <span :class="['font-ui text-sm truncate', sub.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold']">
                {{ sub.first_name }} {{ sub.last_name }}
              </span>
              <span class="text-xs text-gray-400 font-ui flex-shrink-0">
                {{ relativeTime(sub.created_at) }}
              </span>
            </div>
            <p class="text-xs text-gray-400 font-ui truncate leading-relaxed">
              {{ sub.message }}
            </p>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  submissions: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  viewMode: { type: String, default: 'inbox' },
})

defineEmits(['select', 'refresh', 'changeView'])

const filter = ref('all')

const unreadCount = computed(() => props.submissions.filter(s => !s.is_read).length)

const filteredSubmissions = computed(() => {
  let list = filter.value === 'unread' && props.viewMode !== 'archived'
    ? props.submissions.filter(s => !s.is_read)
    : props.submissions

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
