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
    <CallDetailCard :call="detailCall" :return-to="detail.returnTo" :now="now"
      :can-call="canCall" :can-exclude="canExclude" :can-see-leads="canSeeLeads" :can-mark="detailCall ? canMark(detailCall) : false"
      :busy="Boolean(detailCall && busyId === detailCall.id)"
      @close="closeDetail" @callback="openCall" @handled="markHandled" @reopen="reopen" @exclude="startExclude" @count-again="countAgain" />

    <div ref="scroller" class="flex-1 overflow-y-auto">
      <div class="max-w-[1160px] mx-auto px-4 sm:px-6 pt-5 sm:pt-7 pb-10 space-y-4 font-ui">
        <!-- The three company-wide counts. Search and filters never change them. -->
        <div class="flex flex-wrap items-center gap-x-6 gap-y-4">
          <dl class="flex flex-wrap items-center gap-x-6 sm:gap-x-8 gap-y-3" aria-label="Today's calls">
            <div v-for="(m, i) in metrics" :key="m.key" :class="i ? 'sm:pl-8 sm:border-l sm:border-gray-200' : ''" class="flex items-center gap-3">
              <dd :class="m.tone" class="order-first text-[30px] sm:text-[34px] font-light leading-none tracking-tight tabular-nums">
                <RollingNumber v-if="kpis" :value="m.value" />
                <span v-else class="text-gray-400" aria-label="Loading">–</span>
              </dd>
              <dt class="text-[13px] leading-tight text-gray-600 max-w-[6.5rem]">{{ m.label }}</dt>
            </div>
          </dl>
          <div class="ml-auto flex items-center gap-2">
            <span class="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-gray-500" :title="sync?.lastSuccessAt ? fullDate(sync.lastSuccessAt) : ''">
              <span v-if="live" class="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true"></span>{{ updatedLabel }}
            </span>
            <button type="button" @click="refresh" :disabled="Boolean(refreshing) || !canRefresh" aria-label="Refresh from RingCentral" title="Refresh from RingCentral"
              class="w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white disabled:opacity-50">
              <FaIcon name="arrows-rotate" :spin="Boolean(refreshing)" />
            </button>
            <button v-if="canCall" type="button" @click="openCall()"
              class="inline-flex items-center gap-2 min-h-11 sm:min-h-9 px-4 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-[13px] font-semibold">
              <FaIcon name="phone" />New call
            </button>
          </div>
        </div>

        <!-- Why the list might be empty or incomplete -->
        <p v-if="notice" role="status" :class="notice.tone" class="text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <FaIcon :name="notice.icon" class="mt-0.5 flex-shrink-0" />
          <span>{{ notice.text }}
            <router-link v-if="notice.link && canManageConnection" :to="{ name: 'Integrations' }" class="font-semibold underline ml-1">Open Integrations</router-link>
          </span>
        </p>
        <p v-if="error" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <section class="bg-white rounded-2xl ring-1 ring-gray-200" aria-label="Calls">
          <!-- Tabs, search, filters -->
          <div class="flex flex-wrap items-stretch gap-x-5 gap-y-3 px-4 sm:px-5 pt-3 sm:pt-0 border-b border-gray-100">
            <div class="flex items-stretch gap-6 order-2 sm:order-none w-full sm:w-auto" role="tablist" aria-label="Call views" @keydown="onTabKey">
              <button v-for="t in TABS" :key="t.key" :id="`calls-tab-${t.key}`" type="button" role="tab"
                :aria-selected="tab === t.key" :aria-controls="'calls-panel'" :tabindex="tab === t.key ? 0 : -1" @click="setTab(t.key)"
                :class="tab === t.key ? 'text-gray-900 after:bg-brand-navy' : 'text-gray-600 hover:text-gray-900 after:bg-transparent'"
                class="relative inline-flex items-center gap-2 min-h-12 sm:min-h-[60px] text-[13.5px] font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full">
                {{ t.label }}
                <span v-if="t.key === 'attention' && kpis" :class="kpis.needsAttention ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'"
                  class="min-w-[22px] px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums text-center">
                  <RollingNumber :value="kpis.needsAttention" />
                </span>
              </button>
            </div>
            <div class="order-1 sm:order-none flex items-center gap-2 w-full sm:w-auto sm:ml-auto sm:py-3">
              <label class="relative flex-1 sm:w-64">
                <span class="sr-only">Search calls by name or number</span>
                <FaIcon name="magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                <input v-model="search" type="search" placeholder="Search name or number"
                  class="w-full min-h-11 sm:min-h-9 pl-8 pr-3 rounded-lg bg-brand-surface ring-1 ring-gray-200 focus:ring-2 focus:ring-brand-navy outline-none text-[13px] text-gray-900" />
              </label>
              <button type="button" @click="filtersOpen = !filtersOpen" :aria-expanded="filtersOpen" aria-controls="calls-filters"
                :class="filtersOpen || activeFilters ? 'ring-brand-navy text-gray-900' : 'ring-gray-200 text-gray-700'"
                class="inline-flex items-center gap-2 min-h-11 sm:min-h-9 px-3.5 rounded-lg ring-1 bg-white hover:bg-gray-50 text-[13px] font-semibold">
                <FaIcon name="sliders" />Filters
                <span v-if="activeFilters" class="min-w-[18px] px-1 rounded bg-brand-navy text-white text-[11px] tabular-nums">{{ activeFilters }}</span>
              </button>
            </div>
          </div>

          <!-- Filters: the time range and outcome only apply to All calls;
               Needs attention always covers the last 90 days. -->
          <Transition name="drawer">
            <div v-if="filtersOpen" id="calls-filters" class="px-4 sm:px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-end gap-x-5 gap-y-3 text-[13px]">
              <div v-if="tab === 'all'">
                <p class="flabel" id="calls-range-label">Date range</p>
                <div class="inline-flex bg-white rounded-lg ring-1 ring-gray-200 p-0.5" role="group" aria-labelledby="calls-range-label">
                  <button v-for="r in RANGES" :key="r.key" type="button" @click="range = r.key" :aria-pressed="range === r.key"
                    :class="range === r.key ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-gray-900'"
                    class="min-h-10 sm:min-h-8 px-3 rounded-md text-[12px] font-semibold transition-colors">{{ r.label }}</button>
                </div>
              </div>
              <label v-if="tab === 'all'" class="block">
                <span class="flabel">Outcome</span>
                <select v-model="filter" class="fselect" data-outcome-filter>
                  <option v-for="o in outcomeOptions" :key="o.key" :value="o.key">{{ o.label }}{{ o.count != null ? ` (${o.count})` : '' }}</option>
                </select>
              </label>
              <!-- Calls a RingCentral step proves were offered to one person. -->
              <label v-if="people.length" class="block">
                <span class="flabel">Offered to</span>
                <select v-model="personFilter" class="fselect" data-person-filter>
                  <option value="">Anyone</option>
                  <option v-for="p in people" :key="p.extensionId" :value="p.extensionId">{{ p.name }}{{ p.extension ? ` · ext. ${p.extension}` : '' }}</option>
                </select>
              </label>
              <label class="inline-flex items-center gap-2 min-h-10 text-gray-700">
                <input v-model="businessHours" type="checkbox" class="w-4 h-4 accent-brand-navy" />Business hours only <span class="text-gray-500">(Mon–Fri 9–5)</span>
              </label>
              <button v-if="activeFilters" type="button" @click="clearNarrowing" class="min-h-10 font-semibold text-brand-navy underline">Clear filters</button>
            </div>
          </Transition>

          <div id="calls-panel" role="tabpanel" :aria-labelledby="`calls-tab-${tab}`">
            <!-- What this list is -->
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-gray-100 text-[12px] text-gray-600">
              <span class="font-semibold text-gray-800" aria-live="polite">{{ listSummary }}</span>
              <span aria-hidden="true">·</span><span>{{ scopeLabel }}</span>
              <template v-if="personRow"><span aria-hidden="true">·</span><span>offered to {{ personRow.name }}</span></template>
              <template v-if="businessHours"><span aria-hidden="true">·</span><span>business hours</span></template>
              <span class="ml-auto">{{ tab === 'attention' ? 'Oldest first' : 'Newest first' }}</span>
            </div>

            <!-- One person: what happened to the calls offered to them. -->
            <p v-if="personRow && tab === 'all'" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-gray-100 text-[13px] text-gray-700" data-person-summary>
              <span class="font-semibold text-gray-900">{{ personRow.name }}</span>
              <span>{{ counts.incoming || 0 }} offered</span>
              <span class="text-green-700">{{ counts.person_answered || 0 }} answered by them</span>
              <span class="text-brand-red">{{ counts.person_not_answered || 0 }} not answered by them</span>
              <span class="text-gray-500 basis-full sm:basis-auto">Only calls where a RingCentral step shows the call offered to their extension.</span>
            </p>

            <!-- Column labels, wide screens only -->
            <div class="hidden lg:grid grid-cols-[var(--call-cols)] gap-x-5 px-5 py-2.5 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500 calls-cols" aria-hidden="true">
              <span class="pl-12">Caller</span><span>What happened</span><span>Received</span><span class="text-right">Next step</span>
            </div>

            <div v-if="loading && !rows.length" class="py-16 text-center text-sm text-gray-500">
              <FaIcon name="spinner" spin class="mr-2" />Loading calls…
            </div>

            <div v-else-if="!rows.length" class="px-6 py-14 text-center">
              <span :class="caughtUp ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'" class="mx-auto w-11 h-11 rounded-full inline-flex items-center justify-center">
                <FaIcon :name="caughtUp ? 'circle-check' : 'magnifying-glass'" />
              </span>
              <p class="mt-3 text-[15px] font-semibold text-gray-900">{{ caughtUp ? 'You’re all caught up' : 'No calls in this view' }}</p>
              <p class="mt-1 text-[13px] text-gray-600">{{ emptyText }}</p>
            </div>

            <!-- The list. Rows keep their ids, so a live update moves, adds or
                 removes only the rows that changed (the Animated List
                 behaviour); a new view fades in as a whole instead. -->
            <div v-else :key="renderedKey" class="panel-in calls-cols">
              <TransitionGroup tag="ul" :name="animateRows ? 'row' : 'row-still'" class="relative" @keydown="onListKey">
                <li v-for="r in rows" :key="r.key" :class="r.type === 'call' ? 'border-t border-gray-100 first:border-t-0 bg-white' : ''">
                  <h2 v-if="r.type === 'group'" class="font-ui flex items-center gap-3 px-4 sm:px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em]"
                    :class="r.key === 'g-waiting' || r.key === 'g-try_again' ? 'text-amber-800' : 'text-gray-600'">
                    <span class="whitespace-nowrap">{{ r.label }}<span v-if="r.hint" class="normal-case tracking-normal font-medium text-gray-500"> · {{ r.hint }}</span></span>
                    <span class="h-px flex-1 bg-gray-100" aria-hidden="true"></span>
                    <span class="normal-case tracking-normal font-medium text-gray-500 tabular-nums">{{ r.count }}</span>
                  </h2>
                  <CallRow v-else :c="r.call" :now="now" :show-day="tab === 'attention'"
                    :can-call="canCall" :can-exclude="canExclude" :can-see-leads="canSeeLeads" :can-mark="canMark(r.call)"
                    :busy="busyId === r.call.id" :menu-open="menuId === r.call.id"
                    @open="openDetail" @callback="openCall" @handled="markHandled" @menu="toggleMenu"
                    @exclude="startExclude" @count-again="countAgain" @reopen="reopen" />
                </li>
              </TransitionGroup>
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3 border-t border-gray-100 text-[12px] text-gray-600">
              <span>{{ tab === 'attention' ? 'Every open call stays here until a callback connects or someone marks it handled.' : 'Each call is counted once; its original outcome is kept.' }}</span>
              <span class="ml-auto inline-flex items-center gap-1.5"><FaIcon name="clock" class="text-gray-400" />Times in New Orleans</span>
            </div>
          </div>
        </section>

        <!-- Calls left out of the counts, and where to see them (All calls). -->
        <div v-if="tab === 'all'" class="space-y-1.5 text-[12.5px] text-gray-600">
          <p v-if="counts.system && filter !== 'system'">
            {{ counts.system }} {{ counts.system === 1 ? 'call was' : 'calls were' }} ended by the phone system (a blocked number or a refused call) and {{ counts.system === 1 ? 'needs' : 'need' }} no callback.
            <button type="button" @click="filter = 'system'" class="font-semibold text-brand-navy underline">Show {{ counts.system === 1 ? 'it' : 'them' }}</button>
          </p>
          <p v-if="counts.unconfirmed && filter !== 'unconfirmed'">
            {{ counts.unconfirmed }} {{ counts.unconfirmed === 1 ? 'call has' : 'calls have' }} no outcome recorded by RingCentral. {{ counts.unconfirmed === 1 ? 'It is' : 'They are' }} not counted as missed or against anyone, and {{ counts.unconfirmed === 1 ? 'needs' : 'need' }} nothing from you.
            <button type="button" @click="filter = 'unconfirmed'" class="font-semibold text-brand-navy underline">Show {{ counts.unconfirmed === 1 ? 'it' : 'them' }}</button>
          </p>
          <p v-if="counts.excluded && filter !== 'excluded'">
            {{ counts.excluded }} {{ counts.excluded === 1 ? 'call was' : 'calls were' }} marked as needing no callback and {{ counts.excluded === 1 ? 'is' : 'are' }} left out of these counts.
            <button type="button" @click="filter = 'excluded'" class="font-semibold text-brand-navy underline">Show {{ counts.excluded === 1 ? 'it' : 'them' }}</button>
          </p>
          <p v-if="truncated" class="text-gray-500">Showing the most recent calls in this range. Narrow the range or search to see older ones.</p>
        </div>
        <p v-else-if="truncated" class="text-[12.5px] text-gray-500">Showing the {{ calls.length }} most recent open calls. Search for a caller to find an older one.</p>

        <div class="flex justify-end">
          <button type="button" @click="countsHelp = !countsHelp" :aria-expanded="countsHelp" aria-controls="calls-counts-help"
            class="inline-flex items-center gap-1.5 min-h-11 text-[12.5px] font-semibold text-brand-navy hover:underline">
            How counts work <FaIcon name="circle-info" />
          </button>
        </div>
        <Transition name="drawer">
          <section v-if="countsHelp" id="calls-counts-help" class="bg-white rounded-2xl ring-1 ring-gray-200 px-5 py-4 text-[13px] text-gray-700 space-y-3" aria-label="How counts work">
            <dl class="grid gap-3 sm:grid-cols-3">
              <div><dt class="font-semibold text-gray-900">Needs attention</dt><dd class="mt-1">Incoming calls from the last 90 days that nobody answered (not answered, the caller hung up, it ended before anyone was rung, or a voicemail), from a number we can call back, that nobody has dealt with yet. A call leaves the list when a callback to the number connects, the caller gets through on a later call, or someone marks it handled or as needing no callback.</dd></div>
              <div><dt class="font-semibold text-gray-900">Handled today</dt><dd class="mt-1">Calls dealt with today: marked handled today, or closed today by a connected callback or a later answered call. Includes calls from earlier days. Calls marked as needing no callback are not counted.</dd></div>
              <div><dt class="font-semibold text-gray-900">Total calls today</dt><dd class="mt-1">Every incoming and outgoing call that started today, each counted once however many steps RingCentral recorded. Calls between extensions are not counted.</dd></div>
            </dl>
            <p class="text-gray-600">“Today” is midnight to midnight in New Orleans. Search and filters never change these three counts. Calls RingCentral recorded no outcome for, and withheld numbers, are not listed in Needs attention. Marking a call handled never changes how it is classified or who it is attributed to.</p>
          </section>
        </Transition>
      </div>
    </div>

    <!-- What just changed, with a way back. Only after the server confirmed it. -->
    <Transition name="toast">
      <div v-if="toast" role="status" aria-live="polite" @mouseenter="holdToast" @mouseleave="releaseToast" @focusin="holdToast" @focusout="releaseToast"
        class="fixed z-[180] left-1/2 -translate-x-1/2 bottom-4 sm:bottom-6 w-[calc(100%-2rem)] max-w-md flex items-center gap-3 rounded-xl bg-gray-900 text-white px-4 py-3 shadow-xl font-ui text-[13px]">
        <FaIcon name="circle-check" class="flex-shrink-0" />
        <span class="flex-1 min-w-0">{{ toast.text }}</span>
        <button v-if="toast.undo" type="button" @click="undoToast" class="min-h-9 px-2 font-semibold underline">Undo</button>
        <button type="button" @click="toast = null" aria-label="Dismiss" class="w-9 h-9 -mr-2 inline-flex items-center justify-center rounded-lg hover:bg-white/10"><FaIcon name="xmark" /></button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { useApi, latestOnly } from '../../composables/useApi.js'
import SectionLinks from '../../components/portal/SectionLinks.vue'
import ChangePasswordModal from '../../components/messages/ChangePasswordModal.vue'
import FaIcon from '../../components/FaIcon.vue'
import RollingNumber from '../../components/RollingNumber.vue'
import CallDialog from './CallDialog.vue'
import ExcludeCallDialog from './ExcludeCallDialog.vue'
import CallRow from './CallRow.vue'
import CallDetailCard from './CallDetailCard.vue'
import { attentionSections, daySections, animateChange, when } from './callsInbox.js'

const router = useRouter()
const route = useRoute()
const { adminEmail, logout, can } = useAuth()
const { get, post, del } = useApi()

const TABS = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'all', label: 'All calls' },
]
const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
]
// Needs attention looks back this far (server: ATTENTION_DAYS).
const ATTENTION_DAYS = 90

// The Home card opens /calls?range=month&filter=unanswered&hours=business:
// a narrowed All calls. Without one, the page opens on Needs attention.
const range = ref('today')
// The filters and the unanswered set come from the API with each list
// (server: OUTCOME_FILTERS, UNANSWERED_CLASSES), so the page never keeps its
// own copy to fall out of step. An unknown filter in a link is reset once
// the first answer says which ones exist.
const outcomeFilters = ref([])
const filter = ref('all')
// Calls offered to one person (a RingCentral extension id), and who can be picked.
const personFilter = ref('')
const businessHours = ref(false)
const tab = ref('attention')
const filtersOpen = ref(false)
function fromLink(q) {
  range.value = ['today', 'yesterday', 'week', 'month'].includes(q.range) ? q.range : 'today'
  filter.value = typeof q.filter === 'string' && /^[a-z_]{1,20}$/.test(q.filter) ? q.filter : 'all'
  personFilter.value = typeof q.person === 'string' && /^\d+$/.test(q.person) ? q.person : ''
  businessHours.value = q.hours === 'business'
  tab.value = q.tab === 'all' || q.range || q.filter || q.hours ? 'all' : 'attention'
  filtersOpen.value = Boolean(q.filter || q.hours || q.person)
}
fromLink(route.query)
const people = ref([])
const personRow = computed(() => people.value.find((p) => p.extensionId === personFilter.value) || null)
const search = ref('')
const searched = ref('')
const countsHelp = ref(false)

const calls = ref([])
const counts = ref({})
const kpis = ref(null)
const stamp = ref(null)
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
const canRefresh = computed(() => configured.value && connection.value === 'connected')
// Marking calls handled or as needing no callback (calls.exclude).
const canExclude = computed(() => can('calls.exclude'))
// Only calls counted as missed can be marked as needing no callback: a
// blocked number, or a call with no recorded outcome, is in no count.
const canMark = (c) => c.direction === 'inbound' && !['answered', 'system', 'unknown'].includes(c.classification)

const dialog = ref({ open: false, number: '', name: '' })
function openCall(c = null) {
  closeDetail({ restore: false })
  dialog.value = { open: true, number: c?.number || '', name: c?.name || '' }
}

// --- the list -------------------------------------------------------------------

// What the list shows. Changing it swaps the list in one fade; within one
// view, a reload animates only the rows that changed.
const viewKey = computed(() => [tab.value, tab.value === 'all' ? range.value : '', tab.value === 'all' ? filter.value : '', personFilter.value, businessHours.value, searched.value].join('|'))
const renderedKey = ref('')
const animateRows = ref(false)

const rows = computed(() => {
  const out = []
  if (tab.value === 'attention') {
    for (const s of attentionSections(calls.value)) {
      out.push({ type: 'group', key: `g-${s.key}`, label: s.label, hint: s.hint, count: s.calls.length })
      for (const c of s.calls) out.push({ type: 'call', key: c.id, call: c })
    }
  } else {
    for (const d of daySections(calls.value, now.value)) {
      out.push({ type: 'group', key: `d-${d.key}`, label: d.label === d.date ? d.label : `${d.label} · ${d.date}`, count: d.calls.length })
      for (const c of d.calls) out.push({ type: 'call', key: c.id, call: c })
    }
  }
  return out
})
const visibleCalls = computed(() => rows.value.filter((r) => r.type === 'call').map((r) => r.call))

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

const latestCalls = latestOnly()
async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  const key = viewKey.value
  try {
    const params = new URLSearchParams({ kpis: '1' })
    if (tab.value === 'attention') {
      params.set('from', new Date(Date.now() - ATTENTION_DAYS * 864e5).toISOString())
      params.set('to', new Date(Date.now() + 60 * 1000).toISOString())
      params.set('outcome', 'attention')
      params.set('limit', '500')
    } else {
      const { from, to } = rangeBounds(range.value)
      params.set('from', from.toISOString())
      params.set('to', to.toISOString())
      params.set('outcome', filter.value)
    }
    if (searched.value) params.set('q', searched.value)
    if (businessHours.value) params.set('businessHours', '1')
    if (personFilter.value) params.set('person', personFilter.value)
    // A slow answer for an earlier view is dropped.
    const r = await latestCalls(() => get(`/api/calls?${params}`))
    if (!r.current) return
    const data = r.value
    // Same view: animate the few rows that changed. New view: no row motion.
    animateRows.value = key === renderedKey.value && animateChange(calls.value.map((c) => c.id), data.calls.map((c) => c.id))
    renderedKey.value = key
    calls.value = data.calls
    people.value = data.people || []
    if (Array.isArray(data.outcomeFilters)) {
      outcomeFilters.value = data.outcomeFilters
      if (!data.outcomeFilters.includes(filter.value)) filter.value = 'all'
    }
    counts.value = data.counts || {}
    if (data.kpis) kpis.value = data.kpis
    if (data.stamp) stamp.value = data.stamp
    truncated.value = data.truncated
    applyStatus(data)
    error.value = ''
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

function setTab(key) {
  if (tab.value === key) return
  tab.value = key
  menuId.value = null
}
function onTabKey(e) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const i = TABS.findIndex((t) => t.key === tab.value)
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
  setTab(TABS[next].key)
  nextTick(() => document.getElementById(`calls-tab-${TABS[next].key}`)?.focus())
}
function clearNarrowing() {
  businessHours.value = false
  filter.value = 'all'
  personFilter.value = ''
  router.replace({ query: {} })
}
const activeFilters = computed(() => (tab.value === 'all' && filter.value !== 'all' ? 1 : 0) + (personFilter.value ? 1 : 0) + (businessHours.value ? 1 : 0))

watch(viewKey, () => load())
let searchTimer = null
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { searched.value = search.value.trim() }, 300) })

// Up and down move between calls (each row's name), Home and End to the ends.
function onListKey(e) {
  if (!e.target.matches?.('[data-row-focus]') || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const all = [...e.currentTarget.querySelectorAll('[data-row-focus]')]
  const i = all.indexOf(e.target)
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : Math.min(all.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
  all[next]?.focus()
}

// After a call leaves the list, focus the call that took its place. A row
// still fading out is already gone as far as focus is concerned.
function focusAfter(id, index) {
  nextTick(() => {
    const staying = [...document.querySelectorAll('#calls-panel [data-row-focus]')].filter((b) => !b.closest('.row-leave-active'))
    const own = staying.find((b) => b.dataset.open === String(id))
    const target = own || staying[Math.min(index, staying.length - 1)] || document.getElementById(`calls-tab-${tab.value}`)
    target?.focus({ preventScroll: true })
  })
}
const indexOf = (id) => visibleCalls.value.findIndex((c) => c.id === id)

// --- row menu ---------------------------------------------------------------------

const menuId = ref(null)
function toggleMenu(id) {
  menuId.value = menuId.value === id ? null : id
  if (menuId.value) nextTick(() => document.querySelector(`#call-menu-${id} [role="menuitem"]`)?.focus())
}
function closeMenu({ restore = true } = {}) {
  const id = menuId.value
  menuId.value = null
  if (restore && id) nextTick(() => document.querySelector(`[data-menu="${id}"]`)?.focus())
}
function onDocPointer(e) { if (menuId.value && !e.target.closest('[data-row-menu]')) closeMenu({ restore: false }) }
function onDocKey(e) {
  if (e.key === 'Escape' && menuId.value) { e.preventDefault(); closeMenu() }
  if (e.key === 'Tab' && menuId.value && !e.target.closest?.('[data-row-menu]')) closeMenu({ restore: false })
}

// --- details card ---------------------------------------------------------------

// The card shows the call as the list last loaded it; once it leaves the
// list (handled from the card), the card closes.
const detail = ref({ id: null, snap: null, returnTo: null })
const detailCall = computed(() => (detail.value.id == null ? null : calls.value.find((c) => c.id === detail.value.id) || detail.value.snap))
function openDetail(c, opener) {
  menuId.value = null
  detail.value = { id: c.id, snap: c, returnTo: document.querySelector(`[data-open="${c.id}"]`) || opener || null }
}
function closeDetail({ restore = true } = {}) {
  if (detail.value.id == null) return
  const back = restore ? detail.value.returnTo : null
  detail.value = { id: null, snap: null, returnTo: null }
  if (back) nextTick(() => back.isConnected && back.focus({ preventScroll: true }))
}

// --- follow-up actions ------------------------------------------------------------
// Each waits for the server: a call is never shown as dealt with before the
// server has recorded it.

const busyId = ref(null)
const excluding = ref(null)
let excludedFrom = null
function startExclude(c) {
  menuId.value = null
  excludedFrom = { id: c.id, index: indexOf(c.id) }
  closeDetail({ restore: false })
  excluding.value = c
}
async function afterExclude() {
  const c = excluding.value
  excluding.value = null
  await load({ quiet: true })
  if (c) showToast(`${c.name || 'The call'} marked as needing no callback.`)
  if (excludedFrom) focusAfter(excludedFrom.id, excludedFrom.index)
}

async function markHandled(c) {
  if (busyId.value) return
  menuId.value = null
  busyId.value = c.id
  error.value = ''
  const index = indexOf(c.id)
  try {
    await post(`/api/calls/${c.id}/handled`, {})
    closeDetail({ restore: false })
    await load({ quiet: true })
    showToast(`${c.name || 'The call'} marked handled.`, async () => {
      await del(`/api/calls/${c.id}/handled`)
      await load({ quiet: true })
      focusAfter(c.id, index)
    })
    focusAfter(c.id, index)
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}

async function reopen(c) {
  if (busyId.value) return
  menuId.value = null
  busyId.value = c.id
  error.value = ''
  try {
    await del(`/api/calls/${c.id}/handled`)
    await load({ quiet: true })
    showToast(`${c.name || 'The call'} is open again.`)
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}

async function countAgain(c) {
  if (busyId.value) return
  menuId.value = null
  busyId.value = c.id
  error.value = ''
  try {
    await del(`/api/calls/${c.id}/exclusion`)
    await load({ quiet: true })
    showToast(`${c.name || 'The call'} is counted again.`)
    focusAfter(c.id, indexOf(c.id))
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}

// --- toast ------------------------------------------------------------------------

const toast = ref(null)
let toastTimer = null
function showToast(text, undo = null) {
  toast.value = { text, undo }
  releaseToast()
}
function holdToast() { clearTimeout(toastTimer) }
function releaseToast() { clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = null }, 6000) }
async function undoToast() {
  const fn = toast.value?.undo
  toast.value = null
  if (!fn) return
  try { await fn() } catch (e) { error.value = e.message }
}

// --- live updates ---------------------------------------------------------------
// The server imports new calls every few minutes, and within about half a
// minute of a call ending once RingCentral's live events are registered.
// The page asks every 10 seconds whether anything changed (one small query)
// and reloads the list only when it did.

const POLL_MS = 10 * 1000
let poll = null
let tick = null
let checking = false
const live = computed(() => connection.value === 'connected' && Boolean(stamp.value))
async function checkChanges() {
  if (checking || document.visibilityState !== 'visible' || loading.value) return
  checking = true
  try {
    const r = await get('/api/calls/changes')
    if (r?.stamp && r.stamp !== stamp.value) await load({ quiet: true })
  } catch { /* the next check tries again */ } finally {
    checking = false
  }
}
function onVisible() { if (document.visibilityState === 'visible') { now.value = Date.now(); checkChanges() } }
function start() {
  stop()
  poll = setInterval(checkChanges, POLL_MS)
  tick = setInterval(() => { now.value = Date.now() }, 30 * 1000)
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onDocKey)
}
function stop() {
  clearInterval(poll); clearInterval(tick)
  poll = tick = null
  document.removeEventListener('visibilitychange', onVisible)
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onDocKey)
}

// Kept alive between sections (App.vue): coming back shows the list at once
// and refreshes it in the background.
let activations = 0
onMounted(() => { load(); start() })
onActivated(() => {
  if (activations++ === 0) return
  now.value = Date.now()
  start()
  // Opened again by a link that narrows the list (the Home card): follow it.
  // The changed view reloads by itself; otherwise refresh in place.
  const before = viewKey.value
  if (Object.keys(route.query).length) fromLink(route.query)
  if (viewKey.value === before) load({ quiet: true })
})
onDeactivated(() => { stop(); menuId.value = null })
onUnmounted(() => { stop(); clearTimeout(searchTimer); clearTimeout(toastTimer) })

// --- presentation -----------------------------------------------------------------

const metrics = computed(() => [
  { key: 'attention', label: 'Needs attention', value: kpis.value?.needsAttention ?? 0, tone: kpis.value?.needsAttention ? 'text-amber-800' : 'text-gray-900' },
  { key: 'handled', label: 'Handled today', value: kpis.value?.handledToday ?? 0, tone: 'text-gray-900' },
  { key: 'total', label: 'Total calls today', value: kpis.value?.totalToday ?? 0, tone: 'text-gray-900' },
])

// The outcome filters (each one a count from the server for the range).
const OUTCOMES = [
  { key: 'all', label: 'All calls', count: (c) => (c.incoming || 0) + (c.outgoing || 0) },
  { key: 'answered', label: 'Answered', count: (c) => c.answered },
  { key: 'unanswered', label: 'Unanswered (any kind)', count: (c) => (c.missed || 0) + (c.hung_up || 0) + (c.ended || 0) + (c.voicemail || 0) },
  { key: 'missed', label: 'Not answered', count: (c) => c.missed },
  { key: 'hung_up', label: 'Caller hung up', count: (c) => c.hung_up },
  { key: 'ended', label: 'Ended before ringing', count: (c) => c.ended },
  { key: 'voicemail', label: 'Voicemail', count: (c) => c.voicemail },
  { key: 'not_returned', label: 'Not called back', count: (c) => c.not_returned },
  { key: 'outgoing', label: 'Outgoing', count: (c) => c.outgoing },
  { key: 'unconfirmed', label: 'No outcome recorded', count: (c) => c.unconfirmed },
  { key: 'system', label: 'Ended by the phone system', count: (c) => c.system },
  { key: 'excluded', label: 'No callback needed', count: (c) => c.excluded },
]
const outcomeOptions = computed(() => OUTCOMES
  .filter((o) => o.key === 'all' || !outcomeFilters.value.length || outcomeFilters.value.includes(o.key))
  .map((o) => ({ key: o.key, label: o.label, count: o.count(counts.value) ?? null })))

const listSummary = computed(() => {
  const n = visibleCalls.value.length
  return tab.value === 'attention' ? `${n} open ${n === 1 ? 'call' : 'calls'}` : `${n} ${n === 1 ? 'call' : 'calls'}`
})
const scopeLabel = computed(() => {
  if (tab.value === 'attention') return `last ${ATTENTION_DAYS} days`
  const r = RANGES.find((x) => x.key === range.value)?.label || ''
  const o = filter.value !== 'all' ? OUTCOMES.find((x) => x.key === filter.value)?.label : null
  return [r === '7 days' || r === '30 days' ? `last ${r}` : r.toLowerCase(), o ? o.toLowerCase() : null].filter(Boolean).join(' · ')
})
const caughtUp = computed(() => tab.value === 'attention' && !searched.value && !activeFilters.value && connection.value === 'connected')

const fullDate = (d) => new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
const updatedLabel = computed(() => {
  const t = sync.value?.lastSuccessAt
  if (!t) return 'Not imported yet'
  const mins = Math.max(0, Math.round((now.value - new Date(t).getTime()) / 60000))
  return mins < 1 ? 'Updated just now' : mins < 60 ? `Updated ${mins} min ago` : `Updated ${when(t, now.value)}`
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
  if (sync.value?.directoryErrorCode) return { icon: 'triangle-exclamation', tone: 'text-amber-900 bg-amber-50', text: sync.value.directoryErrorCode === 'missing_permission' ? 'RingCentral did not allow reading the extension list (the Read Accounts permission), so calls cannot be confirmed as answered or missed by a person. They show as not confirmed until it can be read.' : 'The extension list could not be read from RingCentral at the last update. It will try again.', link: sync.value.directoryErrorCode === 'missing_permission' }
  if (sync.value?.scope === 'extension') return { icon: 'circle-info', tone: 'text-sky-900 bg-sky-50', text: 'Showing only the calls of the RingCentral user who connected. To see every call to the firm, connect again signed in as a RingCentral administrator.', link: true }
  return null
})

const emptyText = computed(() => {
  if (connection.value !== 'connected') return 'No calls to show yet.'
  if (searched.value) return 'No calls match that search here. Try All calls, or a different name or number.'
  if (tab.value === 'attention') return activeFilters.value ? 'No open calls match these filters.' : 'New calls that need a callback will appear here.'
  if (filter.value === 'excluded') return 'No calls in this range are marked as needing no callback.'
  if (filter.value !== 'all') return 'No calls of this kind in this range.'
  return sync.value?.lastSuccessAt ? 'No calls in this range.' : 'Calls appear here after the first update from RingCentral. Press Refresh to fetch them now.'
})

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>

<style scoped>
/* Caller · what happened · received · next step: the header and every row share it. */
.calls-cols { --call-cols: minmax(0, 1fr) minmax(0, 1.3fr) 92px 262px; }
.flabel { display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.fselect { min-height: 40px; padding: 0 28px 0 10px; border-radius: 8px; background: var(--surface); color: var(--text-primary); box-shadow: inset 0 0 0 1px var(--border); font-size: 13px; }
.fselect:focus { outline: 2px solid var(--primary-ring); outline-offset: 1px; }
@media (min-width: 640px) { .fselect { min-height: 34px; } }

/* A new view fades in whole. */
.panel-in { animation: panel-in 240ms ease-out; }
@keyframes panel-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* Within a view: a new call rises in with a brief highlight, a dealt-with
   call fades out, and the rest slide to their new places. */
.row-enter-active { transition: opacity 300ms ease, transform 380ms cubic-bezier(0.22, 1, 0.36, 1); animation: row-arrive 1600ms ease-out; }
.row-enter-from { opacity: 0; transform: translateY(6px); }
.row-leave-active { transition: opacity 220ms ease; position: absolute; left: 0; right: 0; z-index: 0; }
.row-leave-to { opacity: 0; }
.row-move { transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes row-arrive { from { background-color: var(--warning-soft); } to { background-color: var(--surface); } }

.drawer-enter-active, .drawer-leave-active { transition: opacity 200ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; transform: translateY(-4px); }

.toast-enter-active, .toast-leave-active { transition: opacity 220ms ease, transform 300ms cubic-bezier(0.22, 1, 0.36, 1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

@media (prefers-reduced-motion: reduce) {
  .panel-in { animation: none; }
  .row-enter-active { transition: opacity 150ms ease; animation: none; }
  .row-enter-from { transform: none; }
  .row-move { transition: none; }
  .drawer-enter-active, .drawer-leave-active, .toast-enter-active, .toast-leave-active { transition: opacity 150ms ease; }
  .drawer-enter-from, .drawer-leave-to { transform: none; }
  .toast-enter-from, .toast-leave-to { transform: none; }
}
</style>
