<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader :title="t('page.title')" current="integrations" label-at="xl" actions-label-at="lg" show-email :notifications="false" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[880px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <!-- What happened on RingCentral's page, by fixed code. -->
        <p v-if="banner" role="status" :class="banner.tone" class="text-sm font-ui rounded-lg px-4 py-3 flex items-start gap-2">
          <FaIcon :name="banner.icon" class="mt-0.5" />
          <span>{{ t(banner.key) }}</span>
        </p>
        <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <!-- What the portal does on its own lives on its own page. -->
        <router-link :to="{ name: 'Automation' }" class="auto-link flex items-center gap-4 bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 font-ui">
          <span class="w-9 h-9 flex-shrink-0 rounded-full bg-brand-navy/10 text-brand-navy inline-flex items-center justify-center text-[13px]" aria-hidden="true"><FaIcon name="bolt" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-gray-900">{{ t('automation.title') }}</span>
            <span class="block text-[11px] text-gray-500 mt-0.5">{{ t('automation.about') }}</span>
          </span>
          <FaIcon name="chevron-right" class="text-[11px] text-gray-400 flex-shrink-0" />
        </router-link>

        <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="rc-h">
          <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div class="min-w-0">
              <h2 id="rc-h" class="text-sm font-ui font-semibold text-gray-900">RingCentral</h2>
              <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ t('rc.about') }}</p>
            </div>
            <span v-if="data" :class="statusChip.tone" class="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-ui font-semibold">{{ statusChip.label }}</span>
          </header>

          <div v-if="loading && !data" class="px-5 py-10 text-center text-sm text-gray-500 font-ui">
            <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>{{ t('loading') }}
          </div>

          <div v-else-if="data" class="px-5 py-5 space-y-5">
            <!-- Server not set up: which variables to set, never their values. -->
            <div v-if="!data.configured" class="text-sm font-ui text-amber-900 bg-amber-50 rounded-lg px-4 py-3">
              <p class="font-semibold">{{ t('rc.not_set_up') }}</p>
              <p class="mt-1 text-[13px]">{{ t('rc.set_these') }}</p>
              <ul class="mt-2 list-disc pl-5 text-[13px] space-y-0.5">
                <li v-for="p in data.configProblems" :key="p">{{ p }}</li>
              </ul>
            </div>

            <div v-if="data.status === 'needs_reauth'" class="text-sm font-ui text-amber-900 bg-amber-50 rounded-lg px-4 py-3">
              <p class="font-semibold">{{ t('rc.needs_reauth') }}</p>
              <p class="mt-1 text-[13px]">{{ reauthReason }}</p>
            </div>
            <div v-else-if="conn && (conn.environmentMismatch || conn.encryptionKeyMatches === false)" class="text-sm font-ui text-amber-900 bg-amber-50 rounded-lg px-4 py-3">
              <p class="font-semibold">{{ t('rc.unusable') }}</p>
              <p class="mt-1 text-[13px]">{{ t(conn.environmentMismatch ? 'rc.env_mismatch' : 'rc.key_changed') }} {{ t('rc.connect_to_replace') }}</p>
            </div>

            <dl v-if="conn" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px] font-ui">
              <div><dt class="text-gray-500 text-[11px]">{{ t('rc.environment') }}</dt><dd class="text-gray-900">{{ t(conn.environment === 'sandbox' ? 'rc.sandbox' : 'rc.production') }}</dd></div>
              <div><dt class="text-gray-500 text-[11px]">{{ t('rc.extension') }}</dt><dd class="text-gray-900 tabular-nums">{{ conn.ownerId || '—' }}</dd></div>
              <div><dt class="text-gray-500 text-[11px]">{{ t('rc.connected') }}</dt><dd class="text-gray-900">{{ when(conn.connectedAt) }}<span v-if="conn.connectedBy" class="text-gray-500">{{ t('rc.connected_by', { name: conn.connectedBy }) }}</span></dd></div>
              <div><dt class="text-gray-500 text-[11px]">{{ t('rc.last_refresh') }}</dt><dd class="text-gray-900">{{ when(conn.lastRefreshedAt) }}</dd></div>
              <div v-if="data.status === 'connected'"><dt class="text-gray-500 text-[11px]">{{ t('rc.stays_until') }}</dt><dd class="text-gray-900">{{ when(conn.refreshTokenExpiresAt) }} <span class="text-gray-500">{{ t('rc.renewed') }}</span></dd></div>
              <div v-if="conn.lastErrorCode"><dt class="text-gray-500 text-[11px]">{{ t('rc.last_problem') }}</dt><dd class="text-gray-900">{{ conn.lastErrorCode }} · {{ when(conn.lastErrorAt) }}</dd></div>
              <div v-if="conn.scope" class="sm:col-span-2"><dt class="text-gray-500 text-[11px]">{{ t('rc.permissions') }}</dt><dd class="text-gray-900 break-words">{{ conn.scope }}</dd></div>
            </dl>

            <p v-if="data.status === 'not_connected' && data.configured && !desktop" class="text-[13px] font-ui text-gray-700">
              {{ t('rc.not_connected_note') }}
            </p>
            <!-- RingCentral's sign-in has to come back to the portal in the same
                 browser; the desktop app hands outside pages to the browser instead. -->
            <p v-if="desktop && data.configured" class="text-[13px] font-ui text-gray-700">
              {{ t('rc.desktop_note') }}
            </p>

            <div class="flex flex-wrap gap-2">
              <button v-if="data.configured && !desktop" type="button" @click="connect" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50">
                <FaIcon name="plug" />{{ t(data.status === 'not_connected' ? 'rc.connect' : 'rc.connect_again') }}
              </button>
              <button v-if="data.status === 'connected' && data.configured" type="button" @click="check" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg ring-1 ring-gray-300 text-gray-700 text-sm font-ui font-semibold hover:bg-brand-surface transition-colors disabled:opacity-50">
                <FaIcon name="arrows-rotate" :spin="busy === 'check'" />{{ t('rc.check') }}
              </button>
              <button v-if="data.status !== 'not_connected'" type="button" @click="confirmDisconnect = true" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-brand-red text-sm font-ui font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                <FaIcon name="xmark" />{{ t('rc.disconnect') }}
              </button>
            </div>

            <div v-if="confirmDisconnect" role="alertdialog" aria-labelledby="dc-h" v-alert-focus @keydown.esc.stop="confirmDisconnect = false" class="rounded-lg ring-1 ring-red-200 bg-red-50 px-4 py-3 text-[13px] font-ui">
              <p id="dc-h" class="font-semibold text-gray-900">{{ t('rc.disconnect_q') }}</p>
              <p class="mt-1 text-gray-700">{{ t('rc.disconnect_body') }}</p>
              <div class="mt-3 flex gap-2">
                <button type="button" @click="disconnectNow" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-red text-white font-semibold disabled:opacity-50">{{ t('rc.disconnect') }}</button>
                <button type="button" data-autofocus @click="confirmDisconnect = false" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white">{{ t('cancel') }}</button>
              </div>
            </div>
          </div>

          <footer v-if="data?.redirectUri" class="px-5 py-3 border-t border-gray-100 text-[11px] font-ui text-gray-500 space-y-1">
            <p>{{ t('rc.footer') }}</p>
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              <template v-if="data.clientId"><dt>{{ t('rc.client_id') }}</dt><dd class="text-gray-700 break-all font-mono">{{ data.clientId }}</dd></template>
              <template v-if="data.serverHost"><dt>RingCentral</dt><dd class="text-gray-700">{{ data.serverHost }} ({{ data.environment }})</dd></template>
              <dt>{{ t('rc.redirect_uri') }}</dt><dd class="text-gray-700 break-all font-mono">{{ data.redirectUri }}</dd>
            </dl>
          </footer>
        </section>

        <!-- RingCentral's live call events, delivered to the API as calls happen. -->
        <section v-if="data && data.status !== 'not_connected'" class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="ev-h" data-live-events>
          <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h2 id="ev-h" class="font-ui font-semibold text-gray-900">{{ t('ev.title') }}</h2>
            <span :class="eventsChip.tone" class="text-[11px] font-ui font-semibold px-2 py-0.5 rounded-full">{{ eventsChip.label }}</span>
          </header>
          <div class="px-5 py-4 space-y-3 text-[13px] font-ui text-gray-700">
            <p>{{ t('ev.about') }}</p>
            <p v-if="eventsError" role="alert" class="text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ eventsError }}</p>
            <dl v-if="events?.registered" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div><dt class="text-gray-500 text-[11px]">{{ t('ev.registered') }}</dt><dd class="text-gray-900">{{ when(events.createdAt) }}</dd></div>
              <div><dt class="text-gray-500 text-[11px]">{{ t('ev.last_event') }}</dt><dd class="text-gray-900">{{ when(events.lastEventAt) }}<span class="text-gray-500">{{ t('ev.last_day', { count: events.eventsLastDay }) }}</span></dd></div>
              <div><dt class="text-gray-500 text-[11px]">{{ t('ev.runs_until') }}</dt><dd class="text-gray-900">{{ when(events.expiresAt) }} <span class="text-gray-500">{{ t('rc.renewed') }}</span></dd></div>
              <div><dt class="text-gray-500 text-[11px]">{{ t('ev.last_checked') }}</dt><dd class="text-gray-900">{{ when(events.checkedAt) }}</dd></div>
              <div v-if="events.lastErrorCode" class="sm:col-span-2"><dt class="text-gray-500 text-[11px]">{{ t('rc.last_problem') }}</dt><dd class="text-gray-900">{{ events.lastErrorCode }} · {{ when(events.lastErrorAt) }}</dd></div>
            </dl>
            <p v-else-if="events?.lastErrorCode" class="text-gray-600">{{ t('ev.last_failed', { code: events.lastErrorCode, when: when(events.lastErrorAt) }) }}</p>
            <p v-if="events && !events.address" class="text-amber-900 bg-amber-50 rounded-lg px-3 py-2">{{ t('ev.no_address') }}</p>
            <div class="flex flex-wrap gap-2">
              <button v-if="data.status === 'connected'" type="button" @click="registerEvents" :disabled="Boolean(busy) || !events?.address" data-register-events
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50">
                <FaIcon name="plug" :spin="false" />{{ t(events?.registered ? 'ev.register_again' : 'ev.register') }}
              </button>
              <button v-if="events?.registered && data.status === 'connected'" type="button" @click="checkEvents" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg ring-1 ring-gray-300 text-gray-700 text-sm font-semibold hover:bg-brand-surface transition-colors disabled:opacity-50">
                <FaIcon name="arrows-rotate" :spin="busy === 'events-check'" />{{ t('ev.check') }}
              </button>
              <button v-if="events?.registered" type="button" @click="confirmRemoveEvents = true" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-brand-red text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                <FaIcon name="xmark" />{{ t('ev.remove') }}
              </button>
            </div>
            <div v-if="confirmRemoveEvents" role="alertdialog" aria-labelledby="re-h" v-alert-focus @keydown.esc.stop="confirmRemoveEvents = false" class="rounded-lg ring-1 ring-red-200 bg-red-50 px-4 py-3">
              <p id="re-h" class="font-semibold text-gray-900">{{ t('ev.remove_q') }}</p>
              <p class="mt-1 text-gray-700">{{ t('ev.remove_body') }}</p>
              <div class="mt-3 flex gap-2">
                <button type="button" @click="removeEvents" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-red text-white font-semibold disabled:opacity-50">{{ t('ev.remove') }}</button>
                <button type="button" data-autofocus @click="confirmRemoveEvents = false" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white">{{ t('cancel') }}</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../../composables/useApi.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import FaIcon from '../../components/FaIcon.vue'
import { vAlertFocus } from '../../directives/alertFocus.js'
import { inDesktopApp } from '../../utils/desktop.js'
import { useT } from '../../i18n/translator.js'
import { INTEGRATIONS } from '../../i18n/integrations.js'

const route = useRoute()
const router = useRouter()
const { get, post, del } = useApi()
const desktop = inDesktopApp()
const { t, locale } = useT(INTEGRATIONS)

const data = ref(null)
const loading = ref(false)
const busy = ref(null) // which action is running; null when idle (an empty string would render disabled="")
const error = ref('')
const banner = ref(null)
const confirmDisconnect = ref(false)

const conn = computed(() => data.value?.connection || null)

// Live call events (server/integrations/ringcentral/telephonyEvents.js).
const events = ref(null)
const eventsError = ref('')
const confirmRemoveEvents = ref(false)
const eventsChip = computed(() => {
  const e = events.value
  if (!e && eventsError.value) return { label: t('ev.chip.load_failed'), tone: 'bg-amber-50 text-amber-800' }
  if (!e?.registered) return { label: t('ev.chip.not_registered'), tone: 'bg-gray-100 text-gray-600' }
  if (e.status === 'Active') return { label: t('ev.chip.receiving'), tone: 'bg-emerald-50 text-emerald-800' }
  // RingCentral's own word for any other state, as it sends it.
  return { label: e.status || t('ev.chip.problem'), tone: 'bg-amber-50 text-amber-800' }
})
async function loadEvents() {
  try { events.value = await get('/api/integrations/ringcentral/events') } catch (e) { eventsError.value = e.message }
}
async function eventsAction(label, fn) {
  busy.value = label
  eventsError.value = ''
  try { events.value = await fn() } catch (e) { eventsError.value = e.message; await loadEvents() } finally { busy.value = null }
}
const registerEvents = () => eventsAction('events-register', () => post('/api/integrations/ringcentral/events', {}))
const checkEvents = () => eventsAction('events-check', () => post('/api/integrations/ringcentral/events/check', {}))
async function removeEvents() {
  await eventsAction('events-remove', () => del('/api/integrations/ringcentral/events'))
  confirmRemoveEvents.value = false
}

// The callback reports one of these fixed codes (server/integrations/ringcentral/service.js);
// each one's words are outcome.<code> (i18n/integrations.js).
const OUTCOMES = {
  connected: { tone: 'text-emerald-900 bg-emerald-50', icon: 'circle-check' },
  denied: { tone: 'text-amber-900 bg-amber-50', icon: 'circle-info' },
  expired_state: { tone: 'text-amber-900 bg-amber-50', icon: 'circle-info' },
  invalid_state: { tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  session_mismatch: { tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  invalid_request: { tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  exchange_failed: { tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  not_configured: { tone: 'text-amber-900 bg-amber-50', icon: 'circle-info' },
  error: { tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
}

const REAUTH_REASONS = ['invalid_grant', 'refresh_token_expired']
const reauthReason = computed(() => t(REAUTH_REASONS.includes(conn.value?.lastErrorCode) ? `reauth.${conn.value.lastErrorCode}` : 'reauth.other'))

const statusChip = computed(() => {
  if (!data.value?.configured && data.value?.status === 'not_connected') return { label: t('chip.not_set_up'), tone: 'bg-gray-100 text-gray-600' }
  return {
    connected: { label: t('chip.connected'), tone: 'bg-emerald-50 text-emerald-800' },
    needs_reauth: { label: t('chip.needs_reauth'), tone: 'bg-amber-50 text-amber-800' },
    not_connected: { label: t('chip.not_connected'), tone: 'bg-gray-100 text-gray-600' },
  }[data.value?.status] || { label: '—', tone: 'bg-gray-100 text-gray-600' }
})

function when(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale.value, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await get('/api/integrations/ringcentral')
    if (data.value?.status !== 'not_connected') await loadEvents()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function connect() {
  busy.value = 'connect'
  error.value = ''
  try {
    const { authorizeUrl } = await post('/api/integrations/ringcentral/authorize', {})
    // Only ever leave for RingCentral's own sign-in page.
    const u = new URL(authorizeUrl)
    if (u.protocol !== 'https:' || !/(^|\.)ringcentral\.com$/.test(u.hostname)) throw new Error(t('bad_address'))
    window.location.assign(u.toString())
  } catch (e) {
    error.value = e.message
    busy.value = null
  }
}

async function check() {
  busy.value = 'check'
  error.value = ''
  banner.value = null
  try {
    data.value = await post('/api/integrations/ringcentral/refresh', {})
    banner.value = { key: 'banner.checked', tone: 'text-emerald-900 bg-emerald-50', icon: 'circle-check' }
  } catch (e) {
    error.value = e.message
    await load()
  } finally {
    busy.value = null
  }
}

async function disconnectNow() {
  busy.value = 'disconnect'
  error.value = ''
  try {
    data.value = await post('/api/integrations/ringcentral/disconnect', {})
    banner.value = { key: 'banner.disconnected', tone: 'text-gray-800 bg-gray-100', icon: 'circle-info' }
  } catch (e) {
    error.value = e.message
  } finally {
    confirmDisconnect.value = false
    busy.value = null
  }
}


onMounted(async () => {
  const outcome = typeof route.query.ringcentral === 'string' ? route.query.ringcentral : null
  if (outcome) {
    const code = Object.hasOwn(OUTCOMES, outcome) ? outcome : 'error'
    banner.value = { key: `outcome.${code}`, ...OUTCOMES[code] }
    // Drop the code from the address bar so a reload doesn't repeat the banner.
    router.replace({ query: {} })
  }
  await load()
})
</script>

<style scoped>
.auto-link { transition: background-color 160ms ease; }
.auto-link:hover { background: var(--surface-hover); }
.auto-link:focus-visible { outline: 2px solid var(--primary-ring); outline-offset: 2px; }
</style>
