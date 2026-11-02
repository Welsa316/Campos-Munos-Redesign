<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Same shell as the other sections. -->
    <header class="nav-chrome h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img src="/logo.png" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight">Calls</h1>
      </div>
      <div class="ml-auto flex items-center gap-1 sm:gap-3">
        <SectionLinks current="calls" />
        <span class="text-xs text-gray-500 font-ui hidden lg:inline">{{ adminEmail }}</span>
        <button @click="showChangePassword = true" aria-label="Change password" title="Change password"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-key text-xs" aria-hidden="true"></i>
          <span class="hidden lg:inline">Password</span>
        </button>
        <button @click="handleLogout" aria-label="Sign out"
          class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
          <span class="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>

    <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />
    <CallDialog :visible="dialog.open" :number="dialog.number" :name="dialog.name" @close="dialog.open = false" />
    <ExcludeCallDialog :call="excluding" @close="excluding = null" @saved="afterExclude" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1100px] mx-auto px-4 sm:px-6 py-5 space-y-4">
        <!-- Range, search, refresh -->
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <div class="inline-flex bg-white rounded-lg ring-1 ring-gray-200 p-0.5" role="group" aria-label="Time range">
            <button v-for="r in RANGES" :key="r.key" type="button" @click="setRange(r.key)"
              :aria-pressed="range === r.key"
              :class="range === r.key ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-gray-900'"
              class="px-3 py-1.5 rounded-md text-xs font-ui font-semibold transition-colors">{{ r.label }}</button>
          </div>
          <label class="relative flex-1 min-w-[180px] max-w-sm">
            <span class="sr-only">Search calls</span>
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" aria-hidden="true"></i>
            <input v-model="search" type="search" placeholder="Search name or number"
              class="w-full pl-8 pr-3 py-2 rounded-lg bg-white ring-1 ring-gray-200 focus:ring-2 focus:ring-brand-navy/40 outline-none text-sm font-ui" />
          </label>
          <div class="ml-auto flex items-center gap-2">
            <button v-if="canCall" type="button" @click="openCall()"
              class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-ui font-semibold">
              <FaIcon name="phone" />New call
            </button>
            <span class="text-[11px] font-ui text-gray-500" :title="sync?.lastSuccessAt ? fullDate(sync.lastSuccessAt) : ''">{{ updatedLabel }}</span>
            <button type="button" @click="refresh" :disabled="Boolean(refreshing) || !canRefresh"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white ring-1 ring-gray-200 text-gray-700 text-xs font-ui font-semibold hover:bg-gray-50 disabled:opacity-50">
              <FaIcon name="arrows-rotate" :spin="Boolean(refreshing)" />Refresh
            </button>
          </div>
        </div>

        <!-- A narrower view opened from elsewhere (the Home card) -->
        <p v-if="businessHours || filter === 'unanswered' || filter === 'excluded'" class="flex flex-wrap items-center gap-2 text-xs font-ui text-gray-700">
          <span class="text-gray-500">Showing</span>
          <span v-if="filter === 'unanswered'" class="px-2.5 py-1 rounded-full bg-white ring-1 ring-gray-200 font-semibold">Unanswered (missed + voicemail)</span>
          <span v-if="filter === 'excluded'" class="px-2.5 py-1 rounded-full bg-white ring-1 ring-gray-200 font-semibold">Marked as no callback needed</span>
          <span v-if="businessHours" class="px-2.5 py-1 rounded-full bg-white ring-1 ring-gray-200 font-semibold">Business hours · Mon–Fri 9–5</span>
          <button type="button" @click="clearNarrowing" class="font-semibold text-brand-navy underline">Show all</button>
        </p>

        <!-- Why the list might be empty or incomplete -->
        <p v-if="notice" role="status" :class="notice.tone" class="text-sm font-ui rounded-lg px-4 py-3 flex items-start gap-2">
          <FaIcon :name="notice.icon" class="mt-0.5 flex-shrink-0" />
          <span>{{ notice.text }}
            <router-link v-if="notice.link && canManageConnection" :to="{ name: 'Integrations' }" class="font-semibold underline ml-1">Open Integrations</router-link>
          </span>
        </p>
        <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <!-- Counts; each one filters the list -->
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <button v-for="tile in tiles" :key="tile.key" type="button" @click="setFilter(tile.key)"
            :aria-pressed="filter === tile.key"
            :class="filter === tile.key ? 'ring-2 ring-brand-navy' : 'ring-1 ring-gray-200 hover:ring-gray-300'"
            class="bg-white rounded-xl px-3 py-2.5 text-left transition-shadow">
            <p class="text-[11px] font-ui font-medium text-gray-600 truncate">{{ tile.label }}</p>
            <p :class="tile.tone" class="font-ui text-2xl font-light tabular-nums leading-tight mt-0.5">{{ tile.count }}</p>
          </button>
        </div>
        <p v-if="counts.excluded && filter !== 'excluded'" class="-mt-1 text-xs font-ui text-gray-600">
          {{ counts.excluded }} {{ counts.excluded === 1 ? 'call was' : 'calls were' }} marked as needing no callback and {{ counts.excluded === 1 ? 'is' : 'are' }} left out of these counts.
          <button type="button" @click="setFilter('excluded')" class="font-semibold text-brand-navy underline">Show {{ counts.excluded === 1 ? 'it' : 'them' }}</button>
        </p>

        <div v-if="loading && !calls.length" class="py-16 text-center text-sm text-gray-500 font-ui">
          <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Loading calls…
        </div>

        <section v-else-if="!calls.length" class="bg-white rounded-xl ring-1 ring-gray-200 px-6 py-12 text-center">
          <p class="text-sm font-ui text-gray-600">{{ emptyText }}</p>
        </section>

        <!-- Calls, by day -->
        <section v-for="day in days" :key="day.key" class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" :aria-label="day.label">
          <h2 class="px-4 sm:px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-ui font-semibold uppercase tracking-[0.1em] text-gray-600 flex">
            {{ day.label }}<span class="ml-auto font-medium normal-case tracking-normal text-gray-500">{{ day.calls.length }} {{ day.calls.length === 1 ? 'call' : 'calls' }}</span>
          </h2>
          <ul>
            <li v-for="c in day.calls" :key="c.id"
              class="px-4 sm:px-5 py-3 border-t border-gray-100 first:border-t-0 grid grid-cols-[36px_minmax(0,1fr)_auto] gap-x-3 items-start"
              :class="needsCallback(c) ? 'bg-red-50/40' : ''">
              <span :class="c.exclusion ? 'bg-gray-100 text-gray-500' : look(c).badge" class="w-9 h-9 rounded-full inline-flex items-center justify-center text-sm" :title="look(c).label">
                <FaIcon :name="look(c).icon" />
                <span class="sr-only">{{ look(c).label }}</span>
              </span>

              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="text-[15px] font-ui font-semibold text-gray-900 truncate">{{ c.name || (c.number ? 'Unknown caller' : 'Private number') }}</span>
                  <span v-if="c.fromFirm" class="text-[10px] font-ui font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700"
                    title="Marked as someone from the firm for every call from this number">Firm</span>
                  <span v-else-if="c.client" class="text-[10px] font-ui font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-brand-navy/10 text-brand-navy">Client</span>
                  <router-link v-else-if="c.lead && canSeeLeads" :to="{ name: 'Inbox', query: { lead: c.lead.id } }"
                    class="text-[10px] font-ui font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 hover:bg-amber-200"
                    :title="c.lead.matches > 1 ? `${c.lead.matches} website leads use this number; showing the latest` : 'Open the website lead'">
                    Website lead<span v-if="c.lead.matches > 1"> · {{ c.lead.matches }}</span>
                  </router-link>
                  <span v-else-if="c.lead" class="text-[10px] font-ui font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">Website lead</span>
                </p>
                <p class="text-[13px] font-ui text-gray-600 mt-0.5">
                  <a v-if="c.number" :href="telHref(c.number)" class="tabular-nums hover:text-brand-navy hover:underline" :title="`Call ${phone(c.number)}`">{{ phone(c.number) }}</a>
                  <span v-else class="text-gray-500">Number withheld</span>
                  <span v-if="!c.name && c.callerLocation" class="text-gray-500"> · {{ c.callerLocation }}</span>
                </p>
                <p class="text-[13px] font-ui mt-1" :class="c.exclusion ? 'text-gray-600' : look(c).text">
                  {{ statusLine(c) }}
                  <template v-if="isMissedIncoming(c)">
                    <span v-if="c.followUp" class="text-green-700"> · {{ followUpText(c.followUp) }}</span>
                    <span v-else-if="c.number && !c.exclusion" class="text-brand-red font-semibold"> · Not called back</span>
                  </template>
                </p>
                <!-- Where the call went, from RingCentral's own record of each step. -->
                <ol v-if="showPath(c)" class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-ui text-gray-600" :aria-label="`Where the call went, ${c.path.length} steps`" data-call-path>
                  <li v-for="(s, i) in c.path" :key="i" class="inline-flex items-center gap-1.5">
                    <span v-if="i > 0" aria-hidden="true" class="text-gray-500">→</span>
                    <span>{{ stepLabel(s) }}<span v-if="stepResult(s)" :class="s.result === 'answered' ? 'text-green-700' : 'text-gray-500'"> · {{ stepResult(s) }}</span></span>
                  </li>
                </ol>
                <!-- Marked as needing no callback: out of the missed counts, still in the log. -->
                <div v-if="c.exclusion" class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-ui">
                  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                    <FaIcon name="circle-check" />No callback needed · {{ exclusionLabel(c.exclusion.reason) }}
                  </span>
                  <span class="text-gray-500">{{ exclusionDetail(c) }}</span>
                  <button v-if="canExclude" type="button" @click="countAgain(c)" :disabled="countingAgain === c.id" :data-count-again="c.id"
                    class="inline-flex items-center min-h-11 -my-2 sm:min-h-0 sm:my-0 text-left font-semibold text-brand-navy underline disabled:opacity-50">{{ c.exclusion.scope === 'number' ? 'Count this number again' : 'Count it again' }}</button>
                </div>
                <button v-else-if="canExclude && isMissedIncoming(c)" type="button" @click="excluding = c" :data-exclude="c.id"
                  class="mt-1 inline-flex items-center min-h-11 -my-2 sm:min-h-0 sm:my-0 text-[12px] font-ui font-semibold text-gray-600 hover:text-brand-navy underline decoration-gray-300 underline-offset-2">No callback needed</button>
                <!-- Only when the caller dialled an extension directly; calls to the main line all look alike. -->
                <p v-if="!showPath(c) && c.direction === 'inbound' && c.firm.extension" class="text-[11px] font-ui text-gray-500 mt-0.5">
                  Dialled {{ person({ name: c.firm.name, extension: c.firm.extension }) }}
                </p>
              </div>

              <div class="text-right flex flex-col items-end">
                <p class="text-[13px] font-ui text-gray-900 tabular-nums whitespace-nowrap">{{ timeOf(c.startedAt) }}</p>
                <p class="text-[11px] font-ui text-gray-500 tabular-nums mt-0.5">{{ duration(c.durationSeconds) }}</p>
                <button v-if="canCall && c.number" type="button" @click="openCall(c)"
                  :aria-label="`Call ${c.name || phone(c.number)}`" :title="`Call ${c.name || phone(c.number)}`"
                  :class="needsCallback(c) ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50'"
                  class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-ui font-semibold">
                  <FaIcon name="phone" />{{ needsCallback(c) ? 'Call back' : 'Call' }}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <p v-if="truncated" class="text-xs font-ui text-gray-500 text-center">Showing the most recent calls in this range. Narrow the range or search to see older ones.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { useApi } from '../../composables/useApi.js'
import { formatPhone, telHref } from '../../utils/phone.js'
import SectionLinks from '../../components/portal/SectionLinks.vue'
import ChangePasswordModal from '../../components/messages/ChangePasswordModal.vue'
import FaIcon from '../../components/FaIcon.vue'
import CallDialog from './CallDialog.vue'
import ExcludeCallDialog from './ExcludeCallDialog.vue'
import { exclusionLabel } from './exclusionReasons.js'

const router = useRouter()
const route = useRoute()
const { adminEmail, logout, can } = useAuth()
const { get, post, del } = useApi()

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
]

// The Home card opens /calls?range=month&filter=unanswered&hours=business.
const q0 = route.query
const range = ref(['today', 'yesterday', 'week', 'month'].includes(q0.range) ? q0.range : 'today')
const filter = ref(['all', 'answered', 'missed', 'voicemail', 'unanswered', 'outgoing', 'not_returned', 'excluded'].includes(q0.filter) ? q0.filter : 'all')
const businessHours = ref(q0.hours === 'business')
const search = ref('')
const calls = ref([])
const counts = ref({})
const sync = ref(null)
const connection = ref(null)
const configured = ref(true)
const canManageConnection = ref(false)
const truncated = ref(false)
const loading = ref(false)
const refreshing = ref(null)
const error = ref('')
const now = ref(Date.now())
const showChangePassword = ref(false)
const canSeeLeads = computed(() => can('crm.view'))
// RingOut (calls.place): your own phone rings first, then the client.
const canCall = computed(() => can('calls.place') && connection.value === 'connected')
const dialog = ref({ open: false, number: '', name: '' })
function openCall(c = null) {
  dialog.value = { open: true, number: c?.number || '', name: c?.name || '' }
}
const canRefresh = computed(() => configured.value && connection.value === 'connected')

// Missed calls that need no callback (calls.exclude): a verification code, a
// test call from the firm, spam. They leave the missed counts.
const canExclude = computed(() => can('calls.exclude'))
const excluding = ref(null)
const countingAgain = ref(null)
// The control that was pressed is replaced by its opposite; keep keyboard
// focus on that row instead of losing it to the page.
const refocus = (attr, id) => nextTick(() => document.querySelector(`[${attr}="${id}"]`)?.focus())
async function afterExclude() {
  const id = excluding.value?.id
  excluding.value = null
  await load({ quiet: true })
  refocus('data-count-again', id)
}
async function countAgain(c) {
  countingAgain.value = c.id
  error.value = ''
  try {
    await del(`/api/calls/${c.id}/exclusion`)
    await load({ quiet: true })
    refocus('data-exclude', c.id)
  } catch (e) {
    error.value = e.message
  } finally {
    countingAgain.value = null
  }
}
function exclusionDetail(c) {
  const e = c.exclusion
  const parts = []
  if (e.note) parts.push(e.note)
  if (e.scope === 'number') parts.push('every call from this number')
  parts.push(`marked by ${e.by || 'a former user'}, ${new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
  return parts.join(' · ')
}

function rangeBounds(key) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const day = 24 * 60 * 60 * 1000
  const soon = new Date(Date.now() + 60 * 1000)
  if (key === 'yesterday') return { from: new Date(start.getTime() - day), to: start }
  if (key === 'week') return { from: new Date(start.getTime() - 6 * day), to: soon }
  if (key === 'month') return { from: new Date(start.getTime() - 29 * day), to: soon }
  return { from: start, to: soon }
}

async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  error.value = ''
  try {
    const { from, to } = rangeBounds(range.value)
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), outcome: filter.value })
    if (search.value.trim()) params.set('q', search.value.trim())
    if (businessHours.value) params.set('businessHours', '1')
    const data = await get(`/api/calls?${params}`)
    calls.value = data.calls
    counts.value = data.counts || {}
    truncated.value = data.truncated
    applyStatus(data)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function applyStatus(data) {
  sync.value = data.sync
  connection.value = data.connection
  configured.value = data.configured
  canManageConnection.value = data.canManageConnection
}

async function refresh() {
  refreshing.value = 'sync'
  error.value = ''
  try {
    const data = await post('/api/calls/sync', {})
    applyStatus(data)
  } catch (e) {
    error.value = e.message
  } finally {
    refreshing.value = null
  }
  await load({ quiet: true })
}

function setRange(key) { range.value = key }
function clearNarrowing() {
  businessHours.value = false
  filter.value = 'all'
  router.replace({ query: {} })
}
function setFilter(key) { filter.value = filter.value === key && key !== 'all' ? 'all' : key }
watch([range, filter, businessHours], () => load())
let searchTimer = null
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => load({ quiet: true }), 300) })

// The server imports every 5 minutes; re-read the list every minute while
// the page is open, and keep "Updated … ago" current.
let poll = null
onMounted(() => {
  load()
  poll = setInterval(() => {
    now.value = Date.now()
    if (document.visibilityState === 'visible') load({ quiet: true })
  }, 60 * 1000)
})
onUnmounted(() => { clearInterval(poll); clearTimeout(searchTimer) })

// --- presentation -----------------------------------------------------------------

const tiles = computed(() => [
  { key: 'all', label: 'All calls', count: (counts.value.incoming || 0) + (counts.value.outgoing || 0), tone: 'text-gray-900' },
  { key: 'answered', label: 'Answered', count: counts.value.answered || 0, tone: 'text-green-700' },
  { key: 'missed', label: 'Missed', count: counts.value.missed || 0, tone: 'text-brand-red' },
  { key: 'voicemail', label: 'Voicemail', count: counts.value.voicemail || 0, tone: 'text-amber-700' },
  { key: 'not_returned', label: 'Not called back', count: counts.value.not_returned || 0, tone: 'text-brand-red' },
  { key: 'outgoing', label: 'Outgoing', count: counts.value.outgoing || 0, tone: 'text-brand-navy' },
])

const LOOK = {
  answered: { icon: 'phone', label: 'Answered', badge: 'bg-green-100 text-green-700', text: 'text-gray-700' },
  missed: { icon: 'phone-slash', label: 'Missed', badge: 'bg-red-100 text-brand-red', text: 'text-brand-red' },
  voicemail: { icon: 'voicemail', label: 'Voicemail', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-800' },
  connected: { icon: 'arrow-turn-up', label: 'Outgoing', badge: 'bg-brand-navy/10 text-brand-navy', text: 'text-gray-700' },
  no_answer: { icon: 'arrow-turn-up', label: 'Outgoing, no answer', badge: 'bg-gray-100 text-gray-500', text: 'text-gray-600' },
  other: { icon: 'phone', label: 'Other', badge: 'bg-gray-100 text-gray-500', text: 'text-gray-600' },
}
const look = (c) => LOOK[c.outcome] || LOOK.other

// "+15045550101" → "(504) 555-0101"; other countries keep their + form.
function phone(n) {
  const s = String(n || '')
  return /^\+1\d{10}$/.test(s) ? formatPhone(s.slice(2)) : formatPhone(s)
}

const person = (p) => (p ? [p.name, p.extension ? `ext. ${p.extension}` : null].filter(Boolean).join(', ') : '')
function statusLine(c) {
  if (c.direction === 'outbound') {
    const by = person({ name: c.firm.name, extension: c.firm.extension })
    const what = c.outcome === 'connected' ? 'Outgoing call' : c.outcome === 'no_answer' ? 'Outgoing call, no answer' : `Outgoing call (${c.result || 'other'})`
    return by ? `${what} · by ${by}` : what
  }
  if (c.outcome === 'answered') return c.answeredBy ? `Answered by ${person(c.answeredBy)}` : 'Answered'
  if (c.outcome === 'missed') return 'Missed call'
  if (c.outcome === 'voicemail') return 'Left a voicemail'
  return c.result || 'Call'
}
// The path is shown when it says more than the status line: a missed call
// (whose phones it rang), or one that went through more than one place. A
// call answered straight away already reads "Answered by ...".
function showPath(c) {
  const hops = (c.path || []).filter((s) => s.kind !== 'line')
  return hops.length > 1 || (hops.length === 1 && c.outcome !== 'answered')
}
function stepLabel(s) {
  if (s.kind === 'line') return `Called ${s.number ? phone(s.number) : s.name || 'the firm'}`
  const who = person(s) || (s.numberEnd ? `number ending ${s.numberEnd}` : 'another phone')
  if (s.kind === 'forwarded') return `Forwarded to ${who}`
  if (s.kind === 'transferred') return `Transferred to ${who}`
  if (s.kind === 'voicemail') return `Went to voicemail (${who})`
  return `Rang ${who}`
}
function stepResult(s) {
  if (s.kind === 'voicemail' || s.kind === 'line') return ''
  return { answered: 'answered', no_answer: 'no answer', busy: 'busy' }[s.result] || ''
}
const isMissedIncoming = (c) => c.direction === 'inbound' && (c.outcome === 'missed' || c.outcome === 'voicemail')
const needsCallback = (c) => isMissedIncoming(c) && !c.followUp && c.number && !c.exclusion
function followUpText(f) {
  const when = timeOrDate(f.at)
  return f.kind === 'called_back' ? `Called back ${when}` : f.kind === 'call_back_attempt' ? `Tried calling back ${when}` : `Reached later ${when}`
}

const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}` }
function dayLabel(d) {
  const x = new Date(d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(x); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  const date = x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return diff === 0 ? `Today · ${date}` : diff === 1 ? `Yesterday · ${date}` : date
}
const days = computed(() => {
  const out = []
  for (const c of calls.value) {
    const key = dayKey(c.startedAt)
    let day = out[out.length - 1]
    if (!day || day.key !== key) { day = { key, label: dayLabel(c.startedAt), calls: [] }; out.push(day) }
    day.calls.push(c)
  }
  return out
})

const timeOf = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
function timeOrDate(d) {
  return dayKey(d) === dayKey(Date.now()) ? timeOf(d) : new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const fullDate = (d) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
function duration(s) {
  if (!s) return '—'
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`
}

const updatedLabel = computed(() => {
  const t = sync.value?.lastSuccessAt
  if (!t) return 'Not imported yet'
  const mins = Math.max(0, Math.round((now.value - new Date(t).getTime()) / 60000))
  return mins < 1 ? 'Updated just now' : mins < 60 ? `Updated ${mins} min ago` : `Updated ${timeOrDate(t)}`
})

const ERRORS = {
  missing_permission: 'RingCentral did not allow reading the call log. Add the Read Call Log permission to the RingCentral app, then connect again.',
  rate_limited: 'RingCentral asked us to slow down. The next update will catch up.',
  network_error: 'Could not reach RingCentral at the last update. It will try again shortly.',
  needs_reauth: 'RingCentral needs to be connected again before new calls can appear.',
  encryption_key_mismatch: 'The server cannot read the saved RingCentral connection. Connect again.',
  environment_mismatch: 'The saved RingCentral connection is for a different environment. Connect again.',
}
const notice = computed(() => {
  if (!configured.value) return { icon: 'circle-info', tone: 'text-amber-900 bg-amber-50', text: 'RingCentral is not set up on the server yet.', link: true }
  if (connection.value === 'not_connected') return { icon: 'circle-info', tone: 'text-amber-900 bg-amber-50', text: canManageConnection.value ? 'RingCentral is not connected yet.' : 'RingCentral is not connected yet. An administrator connects it.', link: true }
  if (connection.value === 'needs_reauth') return { icon: 'triangle-exclamation', tone: 'text-amber-900 bg-amber-50', text: ERRORS.needs_reauth, link: true }
  const code = sync.value?.lastErrorCode
  if (code) return { icon: 'triangle-exclamation', tone: 'text-amber-900 bg-amber-50', text: ERRORS[code] || `The last update from RingCentral failed (${code}). It will try again shortly.`, link: ['missing_permission', 'needs_reauth', 'encryption_key_mismatch', 'environment_mismatch'].includes(code) }
  if (sync.value?.scope === 'extension') return { icon: 'circle-info', tone: 'text-sky-900 bg-sky-50', text: 'Showing only the calls of the RingCentral user who connected. To see every call to the firm, connect again signed in as a RingCentral administrator.', link: true }
  return null
})

const emptyText = computed(() => {
  if (connection.value !== 'connected') return 'No calls to show yet.'
  if (search.value.trim()) return 'No calls match that search in this range.'
  if (filter.value === 'excluded') return 'No calls in this range are marked as needing no callback.'
  if (filter.value !== 'all') return 'No calls of this kind in this range.'
  return sync.value?.lastSuccessAt ? 'No calls in this range.' : 'Calls appear here after the first update from RingCentral. Press Refresh to fetch them now.'
})

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
