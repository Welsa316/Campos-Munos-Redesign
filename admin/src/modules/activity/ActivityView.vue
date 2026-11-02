<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader title="Activity" current="activity" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 space-y-5 font-ui">
        <div>
          <h2 class="text-base font-ui font-semibold text-gray-900">Activity log</h2>
          <p class="text-xs text-gray-500 mt-0.5">Every change made in the portal, by whom and when, including attempts that were refused. Opening and reading are not listed; downloads are.</p>
        </div>

        <!-- Filters -->
        <form @submit.prevent="reload" class="bg-white rounded-xl ring-1 ring-gray-200 px-4 sm:px-5 py-4 grid grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-3 items-end" aria-label="Filter the activity log">
          <div class="col-span-2 sm:col-span-1">
            <label for="f-actor" class="block leading-4 text-[11px] font-semibold text-gray-700">Person</label>
            <select id="f-actor" v-model="filters.actor" @change="reload"
              class="mt-1 w-full h-[38px] text-sm px-3 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
              <option value="">Everyone</option>
              <option v-for="p in people" :key="p.id" :value="String(p.id)">{{ p.name || p.email }}{{ p.disabled ? ' (access revoked)' : '' }}</option>
              <option value="cli">Command line (scripts/staff.js)</option>
            </select>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <span id="f-outcome" class="block leading-4 text-[11px] font-semibold text-gray-700">Show</span>
            <div role="radiogroup" aria-labelledby="f-outcome" class="mt-1 flex h-[38px] rounded-lg ring-1 ring-gray-300 p-0.5 bg-white">
              <button v-for="o in OUTCOMES" :key="o.key" type="button" role="radio" :aria-checked="filters.outcome === o.key"
                @click="filters.outcome = o.key; reload()"
                :class="filters.outcome === o.key ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-brand-surface'"
                :title="o.key === 'problems' ? 'Only attempts that were refused or failed' : ''"
                class="flex-1 px-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors">{{ o.label }}</button>
            </div>
          </div>
          <div>
            <label for="f-from" class="block leading-4 text-[11px] font-semibold text-gray-700">From</label>
            <input id="f-from" v-model="filters.from" @change="reload" type="date" :max="filters.to || undefined"
              class="mt-1 w-full h-[38px] text-sm px-3 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
          </div>
          <div>
            <label for="f-to" class="block leading-4 text-[11px] font-semibold text-gray-700">To</label>
            <input id="f-to" v-model="filters.to" @change="reload" type="date" :min="filters.from || undefined"
              class="mt-1 w-full h-[38px] text-sm px-3 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
          </div>
          <div class="col-span-2 lg:col-span-1">
            <label for="f-q" class="block leading-4 text-[11px] font-semibold text-gray-700">Search</label>
            <div class="mt-1 flex gap-2">
              <input id="f-q" v-model.trim="filters.q" type="search" placeholder="Action, email, ID"
                class="min-w-0 flex-1 h-[38px] text-sm px-3 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
              <button type="submit" aria-label="Search" class="h-[38px] px-3 rounded-lg ring-1 ring-gray-300 text-gray-600 hover:bg-brand-surface"><FaIcon name="magnifying-glass" class="text-xs" /></button>
            </div>
          </div>
        </form>

        <p v-if="error" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-label="Activity" :aria-busy="loading">
          <p v-if="loading && !items.length" class="py-12 text-center text-sm text-gray-500">Loading…</p>
          <div v-else-if="!items.length" class="py-12 px-6 text-center">
            <p class="text-sm text-gray-700">Nothing matches these filters.</p>
            <button v-if="filtered" type="button" @click="clearFilters" class="mt-2 text-xs font-semibold text-brand-navy underline">Clear filters</button>
          </div>

          <template v-for="day in days" :key="day.key">
            <h3 class="sticky top-0 z-[1] bg-white/95 backdrop-blur px-4 sm:px-5 py-2 border-b border-gray-100 font-ui text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold first:rounded-t-xl">{{ day.label }}</h3>
            <ol class="divide-y divide-gray-50">
              <li v-for="e in day.items" :key="e.id"
                class="grid grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[5.5rem_minmax(0,14rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 sm:px-5 py-3 text-sm">
                <time :datetime="e.at" :title="fullTime(e.at)" class="text-xs text-gray-500 tabular-nums pt-0.5">{{ clock(e.at) }}</time>

                <div class="min-w-0 flex items-center gap-2 lg:pt-0">
                  <FaIcon v-if="e.source === 'cli'" name="terminal" class="text-[11px] text-gray-500" />
                  <span class="truncate font-semibold text-gray-900" :title="e.actor?.email || ''">{{ actorName(e) }}</span>
                  <span v-if="e.actor?.role" class="hidden sm:inline text-[11px] text-gray-500 truncate">{{ roleLabels[e.actor.role] || e.actor.role }}</span>
                </div>

                <div class="col-start-2 lg:col-start-auto min-w-0">
                  <p class="text-gray-800">
                    {{ describe(e) }}
                    <router-link v-if="linkFor(e)" :to="linkFor(e)" class="ml-1 text-xs font-semibold text-brand-navy underline whitespace-nowrap">{{ linkText(e) }}</router-link>
                    <span v-else-if="e.entityId && e.entityType !== 'account'" class="ml-1 text-xs text-gray-500 tabular-nums">#{{ e.entityId }}</span>
                  </p>
                  <p v-if="extra(e)" class="text-xs text-gray-500 mt-0.5 break-words">{{ extra(e) }}</p>
                </div>

                <div class="col-start-2 lg:col-start-auto flex items-center gap-2 lg:justify-end">
                  <span v-if="e.outcome !== 'ok'" :class="e.outcome === 'denied' ? 'bg-amber-100 text-amber-900 ring-amber-200' : 'bg-red-50 text-brand-red ring-red-200'"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1">{{ e.outcome === 'denied' ? 'Refused' : 'Failed' }}</span>
                  <span v-if="e.ip" class="text-[11px] text-gray-500 tabular-nums" :title="`From ${e.ip}`">{{ e.ip }}</span>
                </div>
              </li>
            </ol>
          </template>

          <div v-if="nextBefore" class="px-5 py-4 border-t border-gray-100 text-center">
            <button type="button" @click="more" :disabled="loading" class="px-4 py-2 rounded-lg text-sm font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-brand-surface disabled:opacity-50">
              <FaIcon v-if="loading" name="spinner" spin class="text-xs mr-1" />Show older
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../../composables/useApi.js'
import { statusMeta } from '../../data/leadStatuses.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import FaIcon from '../../components/FaIcon.vue'

const OUTCOMES = [
  { key: '', label: 'All' },
  { key: 'problems', label: 'Problems' },
]

const { get } = useApi()
const route = useRoute()
const router = useRouter()

const items = ref([])
const people = ref([])
const roleLabels = ref({})
const capabilityText = ref({})
const nextBefore = ref(null)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  actor: typeof route.query.actor === 'string' ? route.query.actor : '',
  outcome: route.query.outcome === 'problems' ? 'problems' : '',
  q: typeof route.query.q === 'string' ? route.query.q : '',
  from: typeof route.query.from === 'string' ? route.query.from : '',
  to: typeof route.query.to === 'string' ? route.query.to : '',
})
const filtered = computed(() => Object.values(filters).some(Boolean))

const dayKey = (d) => new Date(d).toLocaleDateString('en-CA')
function dayLabel(d) {
  const key = dayKey(d)
  const today = dayKey(Date.now())
  const yesterday = dayKey(Date.now() - 86400000)
  if (key === today) return 'Today'
  if (key === yesterday) return 'Yesterday'
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
const days = computed(() => {
  const out = []
  for (const e of items.value) {
    const key = dayKey(e.at)
    if (out[out.length - 1]?.key !== key) out.push({ key, label: dayLabel(e.at), items: [] })
    out[out.length - 1].items.push(e)
  }
  return out
})
const clock = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fullTime = (d) => new Date(d).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' })

function actorName(e) {
  // Only a failed sign-in has nobody to name.
  if (!e.actor) return 'Unknown'
  if (e.source === 'cli') return e.actor.email
  return e.actor.name || e.actor.email
}

// The sentence for one row. The server stores a plain description; a few
// actions read better with what they changed to.
function describe(e) {
  const d = e.details || {}
  if (e.action === 'auth.sign_in' && e.outcome !== 'ok') {
    return e.actor && e.statusCode === 403 ? 'Tried to sign in after their access was revoked' : `Failed sign-in${d.email ? ` as ${d.email}` : ''}`
  }
  if (e.action === 'lead.status' && d.status) return `Set a lead’s status to “${statusMeta(d.status).label}”`
  if (e.action === 'lead.read') return d.read === false ? 'Marked a lead unread' : 'Opened a new lead (marked it read)'
  if (e.action === 'lead.archived') return d.archived === false ? 'Restored a lead from the archive' : 'Archived a lead'
  if (e.action === 'whatsapp.status' && d.status) return d.status === 'closed' ? 'Closed a WhatsApp conversation' : 'Reopened a WhatsApp conversation'
  if (e.action === 'team.role' && d.role) return `Changed ${d.account || 'an account'} to ${roleLabels.value[d.role] || d.role}`
  if (e.action === 'team.capability' && d.capability) {
    const verb = { grant: 'Gave', revoke: 'Took away', default: 'Reset' }[d.state] || 'Changed'
    return `${verb} “${capabilityText.value[d.capability] || d.capability}” ${d.state === 'revoke' ? 'from' : d.state === 'default' ? 'to the role default for' : 'to'} ${d.account || 'an account'}`
  }
  if (e.entityType === 'account' && d.account && e.action.startsWith('team.')) return `${e.label}: ${d.account}`
  return e.label
}

// Secondary line: what else was recorded.
function extra(e) {
  const d = e.details || {}
  const bits = []
  if (e.action === 'team.role' && d.from) bits.push(`was ${roleLabels.value[d.from] || d.from}`)
  if (e.action === 'calls.placed' && d.to) bits.push(`to a number ending ${d.to.replace('…', '')}`)
  if (e.action === 'calls.excluded' && d.reason) bits.push(`reason: ${d.reason.replace(/_/g, ' ')}`)
  if (e.action === 'reminders.approved' && d.count != null) bits.push(`${d.count} reminder${d.count === 1 ? '' : 's'}`)
  if (e.action === 'integrations.rc_connected' && d.outcome) bits.push(`result: ${d.outcome.replace(/_/g, ' ')}`)
  if (e.action === 'request') bits.push('Not yet named in the log; shown as the request itself')
  if (e.action === 'auth.sign_in' && e.outcome !== 'ok') {
    bits.push({ 401: 'wrong email or password', 403: 'access revoked', 429: 'too many attempts; sign-in paused for 15 minutes' }[e.statusCode] || `error ${e.statusCode}`)
  } else if (e.outcome !== 'ok' && e.statusCode) {
    bits.push(e.outcome === 'denied' ? 'their role does not allow this' : `error ${e.statusCode}`)
  }
  return bits.join(' · ')
}

function linkFor(e) {
  if (!e.entityId || e.outcome === 'denied') return null
  switch (e.entityType) {
    case 'lead': return { name: 'Inbox', query: { lead: e.entityId } }
    case 'conversation': return { name: 'WhatsApp', params: { id: e.entityId } }
    case 'import': return { name: 'BillingImportDetail', params: { id: e.entityId } }
    case 'account': return e.action.startsWith('team.') ? { name: 'Team' } : null
    default: return null
  }
}
const linkText = (e) => ({ lead: `Lead #${e.entityId}`, conversation: 'Open conversation', import: `Import #${e.entityId}`, account: 'Team' }[e.entityType] || 'Open')

function params(before) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
  if (before) p.set('before', before)
  return p.toString()
}

async function fetchPage(before = null) {
  loading.value = true
  error.value = ''
  try {
    const data = await get(`/api/activity?${params(before)}`)
    items.value = before ? [...items.value, ...data.items] : data.items
    nextBefore.value = data.nextBefore
    if (data.people) people.value = data.people
    if (data.roles) roleLabels.value = data.roles
    if (data.capabilities) capabilityText.value = data.capabilities
  } catch (err) {
    error.value = `Could not load the activity log: ${err.message}`
  } finally {
    loading.value = false
  }
}

function reload() {
  // Filters live in the address, so a filtered view can be bookmarked or shared.
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  router.replace({ query })
  fetchPage()
}
const more = () => fetchPage(nextBefore.value)
function clearFilters() {
  Object.assign(filters, { actor: '', outcome: '', q: '', from: '', to: '' })
  reload()
}

onMounted(() => fetchPage())
</script>
