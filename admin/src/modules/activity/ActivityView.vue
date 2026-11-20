<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader :title="t('page.title')" current="activity" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 space-y-5 font-ui">
        <div>
          <h2 class="text-base font-ui font-semibold text-gray-900">{{ t('heading') }}</h2>
          <p class="text-xs text-gray-500 mt-0.5">{{ t('intro') }}</p>
        </div>

        <!-- Filters -->
        <form @submit.prevent="reload" class="bg-white rounded-xl ring-1 ring-gray-200 px-4 sm:px-5 py-4 grid grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-3 items-end" :aria-label="t('filters.label')">
          <div class="col-span-2 sm:col-span-1">
            <label for="f-actor" class="block leading-4 text-[11px] font-semibold text-gray-700">{{ t('filters.person') }}</label>
            <select id="f-actor" v-model="filters.actor" @change="reload"
              class="mt-1 w-full h-[38px] text-sm px-3 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
              <option value="">{{ t('filters.everyone') }}</option>
              <option v-for="p in people" :key="p.id" :value="String(p.id)">{{ p.name || p.email }}{{ p.disabled ? t('filters.revoked') : '' }}</option>
              <option value="cli">{{ t('filters.cli') }}</option>
              <option value="system">{{ t('filters.system') }}</option>
            </select>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <span id="f-outcome" class="block leading-4 text-[11px] font-semibold text-gray-700">{{ t('filters.show') }}</span>
            <div role="radiogroup" aria-labelledby="f-outcome" class="mt-1 flex h-[38px] rounded-lg ring-1 ring-gray-300 p-0.5 bg-white" @keydown="rovingKeydown">
              <button v-for="(o, i) in OUTCOMES" :key="o.key" type="button" role="radio" :aria-checked="filters.outcome === o.key"
                :tabindex="rovingTabindex(filters.outcome === o.key, i, OUTCOMES.some((x) => x.key === filters.outcome))"
                @click="filters.outcome = o.key; reload()"
                :class="filters.outcome === o.key ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-brand-surface'"
                :title="o.key === 'problems' ? t('outcome.problems_hint') : ''"
                class="flex-1 px-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors">{{ t(`outcome.${o.key || 'all'}`) }}</button>
            </div>
          </div>
          <div>
            <label for="f-from" class="block leading-4 text-[11px] font-semibold text-gray-700">{{ t('filters.from') }}</label>
            <input id="f-from" v-model="filters.from" @change="reload" type="date" :max="filters.to || undefined"
              class="mt-1 w-full h-[38px] text-sm px-3 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
          </div>
          <div>
            <label for="f-to" class="block leading-4 text-[11px] font-semibold text-gray-700">{{ t('filters.to') }}</label>
            <input id="f-to" v-model="filters.to" @change="reload" type="date" :min="filters.from || undefined"
              class="mt-1 w-full h-[38px] text-sm px-3 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
          </div>
          <div class="col-span-2 lg:col-span-1">
            <label for="f-q" class="block leading-4 text-[11px] font-semibold text-gray-700">{{ t('filters.search') }}</label>
            <div class="mt-1 flex gap-2">
              <input id="f-q" v-model.trim="filters.q" type="search" :placeholder="t('filters.search_placeholder')"
                class="min-w-0 flex-1 h-[38px] text-sm px-3 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
              <button type="submit" :aria-label="t('filters.search')" class="h-[38px] px-3 rounded-lg ring-1 ring-gray-300 text-gray-600 hover:bg-brand-surface"><FaIcon name="magnifying-glass" class="text-xs" /></button>
            </div>
          </div>
        </form>

        <p v-if="error" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <section class="bg-white rounded-xl ring-1 ring-gray-200" :aria-label="t('section.label')" :aria-busy="loading">
          <p v-if="loading && !items.length" class="py-12 text-center text-sm text-gray-500">{{ t('loading') }}</p>
          <LoadError v-else-if="loadFailed && !items.length" :message="t('load_failed')" @retry="reload" />
          <div v-else-if="!items.length" class="py-12 px-6 text-center">
            <p class="text-sm text-gray-700">{{ t('empty') }}</p>
            <button v-if="filtered" type="button" @click="clearFilters" class="mt-2 text-xs font-semibold text-brand-navy underline">{{ t('clear') }}</button>
          </div>

          <template v-for="day in days" :key="day.key">
            <h3 class="sticky top-0 z-[1] bg-white px-4 sm:px-5 py-2 border-b border-gray-100 font-ui text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold first:rounded-t-xl">{{ day.label }}</h3>
            <ol class="divide-y divide-gray-50">
              <li v-for="e in day.items" :key="e.id"
                class="grid grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[5.5rem_minmax(0,14rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 sm:px-5 py-3 text-sm">
                <time :datetime="e.at" :title="fullTime(e.at)" class="text-xs text-gray-500 tabular-nums pt-0.5">{{ clock(e.at) }}</time>

                <div class="min-w-0 flex items-center gap-2 lg:pt-0">
                  <FaIcon v-if="e.source === 'cli'" name="terminal" class="text-[11px] text-gray-500" />
                  <FaIcon v-else-if="e.source === 'system'" name="bolt" class="text-[11px] text-gray-500" />
                  <span class="truncate font-semibold text-gray-900" :title="e.actor?.email || ''">{{ actorName(e) }}</span>
                  <span v-if="e.actor?.role" class="hidden sm:inline text-[11px] text-gray-500 truncate">{{ roleName(e.actor.role) }}</span>
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
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1">{{ t(e.outcome === 'denied' ? 'refused' : 'failed') }}</span>
                  <span v-if="e.ip" class="text-[11px] text-gray-500 tabular-nums" :title="t('from_ip', { ip: e.ip })">{{ e.ip }}</span>
                </div>
              </li>
            </ol>
          </template>

          <div v-if="nextBefore" class="px-5 py-4 border-t border-gray-100 text-center">
            <button type="button" @click="more" :disabled="loading" class="px-4 py-2 rounded-lg text-sm font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-brand-surface disabled:opacity-50">
              <FaIcon v-if="loading" name="spinner" spin class="text-xs mr-1" />{{ t('older') }}
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
import { useApi, latestOnly } from '../../composables/useApi.js'
import { statusMeta } from '../../data/leadStatuses.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import { rovingKeydown, rovingTabindex } from '../../utils/roving.js'
import FaIcon from '../../components/FaIcon.vue'
import LoadError from '../../components/LoadError.vue'
import { systemEventBits } from '../automation/automationText.js'
import { useT, makeTranslate } from '../../i18n/translator.js'
import { ACTIVITY } from '../../i18n/activity.js'
import { MESSAGES } from '../../i18n/messages.js'
import { roleLabel } from '../../i18n/dashboard.js'

// Their names are outcome.all and outcome.problems (i18n/activity.js).
const OUTCOMES = [{ key: '' }, { key: 'problems' }]
const trMessages = makeTranslate(MESSAGES)

const { get } = useApi()
const { t, lang, locale } = useT(ACTIVITY)
const route = useRoute()
const router = useRouter()

const items = ref([])
const people = ref([])
const roleLabels = ref({})
const capabilityText = ref({})
const nextBefore = ref(null)
const loading = ref(false)
const error = ref('')
const loadFailed = ref(false)
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
  if (key === today) return t('today')
  if (key === yesterday) return t('yesterday')
  return new Date(d).toLocaleDateString(locale.value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
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
const clock = (d) => new Date(d).toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' })
const fullTime = (d) => new Date(d).toLocaleString(locale.value, { dateStyle: 'full', timeStyle: 'medium' })
// A role's name: the server's label in English, the portal's own in Spanish.
const roleName = (role) => roleLabel(lang.value, role, roleLabels.value[role] || role)
// A lead status's name, as the inbox calls it.
const statusName = (key) => (lang.value === 'es' ? trMessages('es', `status.${statusMeta(key).key}`) : statusMeta(key).label)

function actorName(e) {
  // Only a failed sign-in has nobody to name.
  if (e.source === 'system') return t('actor.system')
  if (!e.actor) return t('actor.unknown')
  if (e.source === 'cli') return e.actor.email
  return e.actor.name || e.actor.email
}

// The sentence for one row. The server stores a plain description; a few
// actions read better with what they changed to.
function describe(e) {
  const d = e.details || {}
  if (e.action === 'auth.sign_in' && e.outcome !== 'ok') {
    return e.actor && e.statusCode === 403 ? t('do.sign_in_revoked') : d.email ? t('do.sign_in_failed_as', { email: d.email }) : t('do.sign_in_failed')
  }
  if (e.action === 'lead.status' && d.status) return t('do.lead_status', { status: statusName(d.status) })
  if (e.action === 'lead.read') return t(d.read === false ? 'do.lead_unread' : 'do.lead_read')
  if (e.action === 'lead.archived') return t(d.archived === false ? 'do.lead_restored' : 'do.lead_archived')
  if (e.action === 'whatsapp.status' && d.status) return t(d.status === 'closed' ? 'do.wa_closed' : 'do.wa_reopened')
  if (e.action === 'team.role' && d.role) return t('do.role', { account: d.account || t('an_account'), role: roleName(d.role) })
  if (e.action === 'team.capability' && d.capability) {
    const state = ['grant', 'revoke', 'default'].includes(d.state) ? d.state : 'other'
    return t(`do.cap.${state}`, { cap: capabilityText.value[d.capability] || d.capability, account: d.account || t('an_account') })
  }
  if (e.entityType === 'account' && d.account && e.action.startsWith('team.')) return `${e.label}: ${d.account}`
  return e.label
}

// Secondary line: what else was recorded.
function extra(e) {
  const d = e.details || {}
  const bits = []
  if (e.action === 'team.role' && d.from) bits.push(t('extra.was', { role: roleName(d.from) }))
  if (e.action === 'calls.placed' && d.to) bits.push(t('extra.number_ending', { digits: d.to.replace('…', '') }))
  if (e.action === 'calls.excluded' && d.reason) bits.push(t('extra.reason', { reason: d.reason.replace(/_/g, ' ') }))
  if (e.action === 'reminders.approved' && d.count != null) bits.push(t('extra.reminders', { count: d.count }))
  if (e.action === 'integrations.rc_connected' && d.outcome) bits.push(t('extra.result', { result: d.outcome.replace(/_/g, ' ') }))
  // What the portal did on its own: why, in words (modules/automation/automationText.js).
  if (e.source === 'system') bits.push(...systemEventBits(e, lang.value))
  if (e.action === 'request') bits.push(t('extra.request'))
  if (e.action === 'auth.sign_in' && e.outcome !== 'ok') {
    bits.push([401, 403, 429].includes(e.statusCode) ? t(`extra.${e.statusCode}`) : t('extra.error', { code: e.statusCode }))
  } else if (e.outcome !== 'ok' && e.statusCode) {
    bits.push(e.outcome === 'denied' ? t('extra.denied') : t('extra.error', { code: e.statusCode }))
  }
  return bits.join(' · ')
}

function linkFor(e) {
  if (!e.entityId || e.outcome === 'denied') return null
  switch (e.entityType) {
    case 'lead': return { name: 'Inbox', query: { lead: e.entityId } }
    case 'call': return { name: 'Calls', query: { call: e.entityId } }
    case 'conversation': return { name: 'WhatsApp', params: { id: e.entityId } }
    case 'import': return { name: 'BillingImportDetail', params: { id: e.entityId } }
    case 'account': return e.action.startsWith('team.') ? { name: 'Team' } : null
    default: return null
  }
}
const linkText = (e) => t(['lead', 'call', 'conversation', 'import', 'account'].includes(e.entityType) ? `link.${e.entityType}` : 'link.other', { id: e.entityId })

function params(before) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
  if (before) p.set('before', before)
  return p.toString()
}

// "Show older" for one filter must not append rows after the filter changed.
const latestPage = latestOnly()
async function fetchPage(before = null) {
  loading.value = true
  error.value = ''
  try {
    const r = await latestPage(() => get(`/api/activity?${params(before)}`))
    if (!r.current) return
    const data = r.value
    items.value = before ? [...items.value, ...data.items] : data.items
    nextBefore.value = data.nextBefore
    if (data.people) people.value = data.people
    if (data.roles) roleLabels.value = data.roles
    if (data.capabilities) capabilityText.value = data.capabilities
  } catch (err) {
    error.value = t('load_error', { error: err.message })
    loadFailed.value = true
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
