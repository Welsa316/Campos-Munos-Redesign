<template>
  <!-- Every lead in one scannable table, rather than the chronological message
       stack of the inbox. This is the view for working the pipeline: who booked,
       who is still waiting, and what was last said to them. -->
  <div class="flex-1 h-full flex flex-col bg-white min-w-0">
    <!-- Controls -->
    <div class="px-6 py-4 border-b border-gray-100 flex-shrink-0">
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <h2 class="font-ui font-semibold text-gray-900 text-sm tracking-wide">
          {{ archivedView ? 'Archived' : 'Contacts' }}
          <span class="ml-1 text-gray-400 font-normal">{{ filtered.length }} of {{ contacts.length }}</span>
        </h2>

        <!-- Archived leads are a separate book, not a sub-set of the live one:
             mixing them in made a closed lead look like work still to do. -->
        <div class="flex bg-brand-surface rounded-lg p-0.5">
          <button
            @click="$emit('changeArchived', false)"
            :aria-pressed="!archivedView"
            :class="!archivedView ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
            class="text-xs font-ui font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-all"
          >Active</button>
          <button
            @click="$emit('changeArchived', true)"
            :aria-pressed="archivedView"
            :class="archivedView ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
            class="text-xs font-ui font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-all"
          >Archived</button>
        </div>

        <div class="relative ml-auto w-full sm:w-64">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" aria-hidden="true"></i>
          <input
            v-model="search"
            type="search"
            placeholder="Search name, email or phone"
            aria-label="Search contacts"
            class="w-full text-xs font-ui pl-8 pr-3 py-2 rounded-lg bg-brand-surface border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none text-gray-700 transition-colors"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button
          @click="statusFilter = ''"
          :class="statusFilter === '' ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
          class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors"
        >All {{ contacts.length }}</button>
        <button
          v-for="st in LEAD_STATUSES"
          :key="st.key"
          @click="statusFilter = statusFilter === st.key ? '' : st.key"
          :title="st.hint"
          :aria-pressed="statusFilter === st.key"
          :class="statusFilter === st.key ? 'bg-brand-navy text-white ring-brand-navy' : `${st.pill} hover:brightness-95`"
          class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-colors"
        >{{ st.label }} {{ counts[st.key] || 0 }}</button>
      </div>
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto">
      <p v-if="filtered.length === 0" class="p-8 text-center text-sm text-gray-500 font-ui">
        {{ emptyMessage }}
      </p>

      <table v-else class="w-full text-left border-collapse">
        <thead class="sticky top-0 bg-white z-10">
          <tr class="border-b border-gray-200">
            <th v-for="col in COLUMNS" :key="col.key" scope="col"
              class="px-4 py-2.5 text-[10px] font-ui font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap">
              <button v-if="col.sortable" @click="toggleSort(col.key)" class="inline-flex items-center gap-1 hover:text-gray-800">
                {{ col.label }}
                <i v-if="sortKey === col.key" :class="sortAsc ? 'fa-chevron-up' : 'fa-chevron-down'" class="fa-solid text-[8px]" aria-hidden="true"></i>
              </button>
              <span v-else>{{ col.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in filtered"
            :key="c.id"
            @click="$emit('select', c.id)"
            class="border-b border-gray-50 hover:bg-brand-surface/60 cursor-pointer transition-colors"
          >
            <td class="px-4 py-3 align-top">
              <span class="font-ui text-sm text-gray-900 font-medium whitespace-nowrap">{{ c.first_name }} {{ c.last_name }}</span>
              <span v-if="!c.is_read" class="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-brand-red align-middle" title="Unread"></span>
            </td>
            <td class="px-4 py-3 align-top whitespace-nowrap">
              <a :href="telHref(c.phone)" @click.stop class="block text-xs text-brand-navy hover:underline">{{ formatPhone(c.phone) }}</a>
              <a :href="'mailto:' + c.email" @click.stop class="block text-[11px] text-gray-500 hover:underline truncate max-w-[200px]">{{ c.email }}</a>
            </td>
            <td class="px-4 py-3 align-top">
              <span class="text-[11px] font-ui text-gray-600 whitespace-nowrap">{{ consultationLabel(c.consultation_type) }}</span>
            </td>
            <td class="px-4 py-3 align-top">
              <!-- Status is editable straight from the table -->
              <div class="relative inline-block">
                <button
                  @click.stop="openStatusFor = openStatusFor === c.id ? null : c.id"
                  :aria-label="`Change status for ${c.first_name} ${c.last_name}, currently ${statusMeta(c.status).label}`"
                  :class="statusMeta(c.status).pill"
                  class="inline-flex items-center gap-1.5 text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap transition-transform active:scale-95"
                >
                  <span :class="statusMeta(c.status).dot" class="w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
                  {{ statusMeta(c.status).label }}
                  <i class="fa-solid fa-chevron-down text-[8px] opacity-60" aria-hidden="true"></i>
                </button>
                <div v-if="openStatusFor === c.id"
                  class="absolute left-0 top-full mt-1 z-30 w-52 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 py-1 text-left">
                  <button
                    v-for="st in LEAD_STATUSES"
                    :key="st.key"
                    @click.stop="choose(c, st.key)"
                    class="w-full text-left px-3 py-2 hover:bg-brand-surface transition-colors flex items-center gap-2"
                  >
                    <span :class="st.dot" class="w-2 h-2 rounded-full flex-shrink-0" aria-hidden="true"></span>
                    <span class="flex-1 min-w-0">
                      <span class="block text-xs font-ui font-semibold text-gray-800">{{ st.label }}</span>
                      <span class="block text-[10px] text-gray-500 font-ui leading-tight">{{ st.hint }}</span>
                    </span>
                    <i v-if="c.status === st.key" class="fa-solid fa-check text-[10px] text-brand-navy" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
            </td>
            <td class="px-4 py-3 align-top max-w-[280px]">
              <p v-if="c.latest_note" class="text-[11px] text-gray-600 font-ui leading-snug line-clamp-2">{{ c.latest_note }}</p>
              <p v-else class="text-[11px] text-gray-300 font-ui italic">—</p>
            </td>
            <td class="px-4 py-3 align-top text-[11px] text-gray-500 font-ui whitespace-nowrap">
              {{ shortDate(c.created_at) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { consultationLabel as consultationLabelShared } from '../../data/consultationTypes.js'
import { LEAD_STATUSES, statusMeta } from '../../data/leadStatuses.js'
import { formatPhone, telHref } from '../../utils/phone.js'

const props = defineProps({
  contacts: { type: Array, default: () => [] },
  archivedView: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'setStatus', 'changeArchived'])

const { t, te } = useI18n()
const consultationLabel = (key) => consultationLabelShared(key, t, te)

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'contact', label: 'Contact', sortable: false },
  { key: 'service', label: 'Service', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'note', label: 'Latest note', sortable: false },
  { key: 'created_at', label: 'Received', sortable: true },
]

const search = ref('')
const statusFilter = ref('')
const openStatusFor = ref(null)
const sortKey = ref('created_at')
const sortAsc = ref(false)

const emptyMessage = computed(() => {
  if (props.contacts.length === 0) {
    return props.archivedView ? 'Nothing archived yet.' : 'No contacts yet.'
  }
  return 'No contacts match this filter.'
})

const counts = computed(() => {
  const out = {}
  for (const c of props.contacts) {
    const key = statusMeta(c.status).key
    out[key] = (out[key] || 0) + 1
  }
  return out
})

const filtered = computed(() => {
  let list = props.contacts
  if (statusFilter.value) {
    list = list.filter(c => statusMeta(c.status).key === statusFilter.value)
  }
  const term = search.value.trim().toLowerCase()
  if (term) {
    const digits = term.replace(/\D/g, '')
    list = list.filter(c => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase()
      const phoneDigits = String(c.phone || '').replace(/\D/g, '')
      return name.includes(term)
        || String(c.email || '').toLowerCase().includes(term)
        || (digits.length >= 3 && phoneDigits.includes(digits))
    })
  }

  const dir = sortAsc.value ? 1 : -1
  return [...list].sort((a, b) => {
    if (sortKey.value === 'name') {
      return dir * `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    }
    if (sortKey.value === 'status') {
      // Sort by pipeline order rather than alphabetically, so the stages read
      // in the order the work actually happens.
      const order = k => LEAD_STATUSES.findIndex(s => s.key === statusMeta(k).key)
      return dir * (order(a.status) - order(b.status))
    }
    return dir * (new Date(a.created_at) - new Date(b.created_at))
  })
})

function toggleSort(key) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else { sortKey.value = key; sortAsc.value = key === 'name' }
}

function choose(contact, status) {
  openStatusFor.value = null
  if (contact.status === status) return
  emit('setStatus', { id: contact.id, status })
}

function closeMenu(event) {
  if (event.type === 'keydown' && event.key !== 'Escape') return
  openStatusFor.value = null
}
onMounted(() => {
  document.addEventListener('click', closeMenu)
  document.addEventListener('keydown', closeMenu)
})
onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  document.removeEventListener('keydown', closeMenu)
})

function shortDate(value) {
  const d = new Date(value)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}
</script>
