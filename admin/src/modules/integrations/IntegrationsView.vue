<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Same shell as the other sections: white bar, logo, title, actions. -->
    <header class="nav-chrome h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img src="/logo.png" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight">Integrations</h1>
      </div>
      <div class="ml-auto flex items-center gap-1 sm:gap-3">
        <SectionLinks current="integrations" />
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

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[880px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <!-- What happened on RingCentral's page, by fixed code. -->
        <p v-if="banner" role="status" :class="banner.tone" class="text-sm font-ui rounded-lg px-4 py-3 flex items-start gap-2">
          <FaIcon :name="banner.icon" class="mt-0.5" />
          <span>{{ banner.text }}</span>
        </p>
        <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="rc-h">
          <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div class="min-w-0">
              <h2 id="rc-h" class="text-sm font-ui font-semibold text-gray-900">RingCentral</h2>
              <p class="text-[11px] font-ui text-gray-500 mt-0.5">Phone system. Connecting lets the server read call information; it changes nothing in RingCentral.</p>
            </div>
            <span v-if="data" :class="statusChip.tone" class="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-ui font-semibold">{{ statusChip.label }}</span>
          </header>

          <div v-if="loading && !data" class="px-5 py-10 text-center text-sm text-gray-500 font-ui">
            <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Loading…
          </div>

          <div v-else-if="data" class="px-5 py-5 space-y-5">
            <!-- Server not set up: which variables to set, never their values. -->
            <div v-if="!data.configured" class="text-sm font-ui text-amber-900 bg-amber-50 rounded-lg px-4 py-3">
              <p class="font-semibold">RingCentral is not set up on the server yet.</p>
              <p class="mt-1 text-[13px]">An administrator with Railway access sets these on the API service:</p>
              <ul class="mt-2 list-disc pl-5 text-[13px] space-y-0.5">
                <li v-for="p in data.configProblems" :key="p">{{ p }}</li>
              </ul>
            </div>

            <div v-if="data.status === 'needs_reauth'" class="text-sm font-ui text-amber-900 bg-amber-50 rounded-lg px-4 py-3">
              <p class="font-semibold">RingCentral needs to be connected again.</p>
              <p class="mt-1 text-[13px]">{{ reauthReason }}</p>
            </div>
            <div v-else-if="conn && (conn.environmentMismatch || conn.encryptionKeyMatches === false)" class="text-sm font-ui text-amber-900 bg-amber-50 rounded-lg px-4 py-3">
              <p class="font-semibold">This connection can't be used by the server as it is configured now.</p>
              <p class="mt-1 text-[13px]">{{ conn.environmentMismatch ? 'It was made against a different RingCentral environment (sandbox vs production).' : 'The server’s token encryption key changed since it was connected.' }} Connect again to replace it.</p>
            </div>

            <dl v-if="conn" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px] font-ui">
              <div><dt class="text-gray-500 text-[11px]">Environment</dt><dd class="text-gray-900">{{ conn.environment === 'sandbox' ? 'Sandbox (testing)' : 'Production' }}</dd></div>
              <div><dt class="text-gray-500 text-[11px]">Authorised extension ID</dt><dd class="text-gray-900 tabular-nums">{{ conn.ownerId || '—' }}</dd></div>
              <div><dt class="text-gray-500 text-[11px]">Connected</dt><dd class="text-gray-900">{{ when(conn.connectedAt) }}<span v-if="conn.connectedBy" class="text-gray-500"> by {{ conn.connectedBy }}</span></dd></div>
              <div><dt class="text-gray-500 text-[11px]">Last token refresh</dt><dd class="text-gray-900">{{ when(conn.lastRefreshedAt) }}</dd></div>
              <div v-if="data.status === 'connected'"><dt class="text-gray-500 text-[11px]">Stays connected until</dt><dd class="text-gray-900">{{ when(conn.refreshTokenExpiresAt) }} <span class="text-gray-500">(renewed automatically)</span></dd></div>
              <div v-if="conn.lastErrorCode"><dt class="text-gray-500 text-[11px]">Last problem</dt><dd class="text-gray-900">{{ conn.lastErrorCode }} · {{ when(conn.lastErrorAt) }}</dd></div>
              <div v-if="conn.scope" class="sm:col-span-2"><dt class="text-gray-500 text-[11px]">Permissions granted</dt><dd class="text-gray-900 break-words">{{ conn.scope }}</dd></div>
            </dl>

            <p v-if="data.status === 'not_connected' && data.configured" class="text-[13px] font-ui text-gray-700">
              Not connected. Connecting opens RingCentral's sign-in page; sign in with an account allowed to authorise the firm's RingCentral app, approve, and you'll come back here.
            </p>

            <div class="flex flex-wrap gap-2">
              <button v-if="data.configured" type="button" @click="connect" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50">
                <FaIcon name="plug" />{{ data.status === 'not_connected' ? 'Connect RingCentral' : 'Connect again' }}
              </button>
              <button v-if="data.status === 'connected' && data.configured" type="button" @click="check" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg ring-1 ring-gray-300 text-gray-700 text-sm font-ui font-semibold hover:bg-brand-surface transition-colors disabled:opacity-50">
                <FaIcon name="arrows-rotate" :spin="busy === 'check'" />Check connection
              </button>
              <button v-if="data.status !== 'not_connected'" type="button" @click="confirmDisconnect = true" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-brand-red text-sm font-ui font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                <FaIcon name="xmark" />Disconnect
              </button>
            </div>

            <div v-if="confirmDisconnect" role="alertdialog" aria-labelledby="dc-h" v-alert-focus @keydown.esc.stop="confirmDisconnect = false" class="rounded-lg ring-1 ring-red-200 bg-red-50 px-4 py-3 text-[13px] font-ui">
              <p id="dc-h" class="font-semibold text-gray-900">Disconnect RingCentral?</p>
              <p class="mt-1 text-gray-700">The server's access is revoked and its stored tokens are deleted. Calls, numbers and settings in RingCentral are not affected. You can connect again at any time.</p>
              <div class="mt-3 flex gap-2">
                <button type="button" @click="disconnectNow" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-red text-white font-semibold disabled:opacity-50">Disconnect</button>
                <button type="button" data-autofocus @click="confirmDisconnect = false" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white">Cancel</button>
              </div>
            </div>
          </div>

          <footer v-if="data?.redirectUri" class="px-5 py-3 border-t border-gray-100 text-[11px] font-ui text-gray-500 space-y-1">
            <p>What this server sends to RingCentral. The app with this client ID must have exactly this redirect URI saved, in the same environment.</p>
            <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              <template v-if="data.clientId"><dt>Client ID</dt><dd class="text-gray-700 break-all font-mono">{{ data.clientId }}</dd></template>
              <template v-if="data.serverHost"><dt>RingCentral</dt><dd class="text-gray-700">{{ data.serverHost }} ({{ data.environment }})</dd></template>
              <dt>Redirect URI</dt><dd class="text-gray-700 break-all font-mono">{{ data.redirectUri }}</dd>
            </dl>
          </footer>
        </section>

        <!-- RingCentral's live call events, delivered to the API as calls happen. -->
        <section v-if="data && data.status !== 'not_connected'" class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="ev-h" data-live-events>
          <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h2 id="ev-h" class="font-ui font-semibold text-gray-900">Live call events</h2>
            <span :class="eventsChip.tone" class="text-[11px] font-ui font-semibold px-2 py-0.5 rounded-full">{{ eventsChip.label }}</span>
          </header>
          <div class="px-5 py-4 space-y-3 text-[13px] font-ui text-gray-700">
            <p>RingCentral reports each call as it happens: whose phone rang and for how long, who answered, and when the caller left. That shows in Calls, in each call’s details, for calls after this is registered. Needs the Call Control permission. It changes nothing in RingCentral’s routing, phones or settings; removing it stops the reports.</p>
            <p v-if="eventsError" role="alert" class="text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ eventsError }}</p>
            <dl v-if="events?.registered" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div><dt class="text-gray-500 text-[11px]">Registered</dt><dd class="text-gray-900">{{ when(events.createdAt) }}</dd></div>
              <div><dt class="text-gray-500 text-[11px]">Last event received</dt><dd class="text-gray-900">{{ when(events.lastEventAt) }}<span class="text-gray-500"> · {{ events.eventsLastDay }} in the last day</span></dd></div>
              <div><dt class="text-gray-500 text-[11px]">Runs until</dt><dd class="text-gray-900">{{ when(events.expiresAt) }} <span class="text-gray-500">(renewed automatically)</span></dd></div>
              <div><dt class="text-gray-500 text-[11px]">Last checked</dt><dd class="text-gray-900">{{ when(events.checkedAt) }}</dd></div>
              <div v-if="events.lastErrorCode" class="sm:col-span-2"><dt class="text-gray-500 text-[11px]">Last problem</dt><dd class="text-gray-900">{{ events.lastErrorCode }} · {{ when(events.lastErrorAt) }}</dd></div>
            </dl>
            <p v-else-if="events?.lastErrorCode" class="text-gray-600">The last attempt failed ({{ events.lastErrorCode }}, {{ when(events.lastErrorAt) }}).</p>
            <p v-if="events && !events.address" class="text-amber-900 bg-amber-50 rounded-lg px-3 py-2">The server has no https address for RingCentral to deliver to.</p>
            <div class="flex flex-wrap gap-2">
              <button v-if="data.status === 'connected'" type="button" @click="registerEvents" :disabled="Boolean(busy) || !events?.address" data-register-events
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50">
                <FaIcon name="plug" :spin="false" />{{ events?.registered ? 'Register again' : 'Register' }}
              </button>
              <button v-if="events?.registered && data.status === 'connected'" type="button" @click="checkEvents" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg ring-1 ring-gray-300 text-gray-700 text-sm font-semibold hover:bg-brand-surface transition-colors disabled:opacity-50">
                <FaIcon name="arrows-rotate" :spin="busy === 'events-check'" />Check
              </button>
              <button v-if="events?.registered" type="button" @click="confirmRemoveEvents = true" :disabled="Boolean(busy)"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-brand-red text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50">
                <FaIcon name="xmark" />Remove
              </button>
            </div>
            <div v-if="confirmRemoveEvents" role="alertdialog" aria-labelledby="re-h" v-alert-focus @keydown.esc.stop="confirmRemoveEvents = false" class="rounded-lg ring-1 ring-red-200 bg-red-50 px-4 py-3">
              <p id="re-h" class="font-semibold text-gray-900">Stop live call events?</p>
              <p class="mt-1 text-gray-700">The subscription is deleted in RingCentral. Events already received stay with their calls; new calls are classified from the call log only.</p>
              <div class="mt-3 flex gap-2">
                <button type="button" @click="removeEvents" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-red text-white font-semibold disabled:opacity-50">Remove</button>
                <button type="button" data-autofocus @click="confirmRemoveEvents = false" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white">Cancel</button>
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
import { useAuth } from '../../composables/useAuth.js'
import { useApi } from '../../composables/useApi.js'
import SectionLinks from '../../components/portal/SectionLinks.vue'
import ChangePasswordModal from '../../components/messages/ChangePasswordModal.vue'
import FaIcon from '../../components/FaIcon.vue'
import { vAlertFocus } from '../../directives/alertFocus.js'

const route = useRoute()
const router = useRouter()
const { adminEmail, logout } = useAuth()
const { get, post, del } = useApi()

const data = ref(null)
const loading = ref(false)
const busy = ref(null) // which action is running; null when idle (an empty string would render disabled="")
const error = ref('')
const banner = ref(null)
const confirmDisconnect = ref(false)
const showChangePassword = ref(false)

const conn = computed(() => data.value?.connection || null)

// Live call events (server/integrations/ringcentral/telephonyEvents.js).
const events = ref(null)
const eventsError = ref('')
const confirmRemoveEvents = ref(false)
const eventsChip = computed(() => {
  const e = events.value
  if (!e && eventsError.value) return { label: 'Could not load', tone: 'bg-amber-50 text-amber-800' }
  if (!e?.registered) return { label: 'Not registered', tone: 'bg-gray-100 text-gray-600' }
  if (e.status === 'Active') return { label: 'Receiving', tone: 'bg-emerald-50 text-emerald-800' }
  return { label: e.status || 'Problem', tone: 'bg-amber-50 text-amber-800' }
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

// The callback reports one of these fixed codes (server/integrations/ringcentral/service.js).
const OUTCOMES = {
  connected: { text: 'RingCentral is connected.', tone: 'text-emerald-900 bg-emerald-50', icon: 'circle-check' },
  denied: { text: 'Authorisation was declined on RingCentral’s page. Nothing changed.', tone: 'text-amber-900 bg-amber-50', icon: 'circle-info' },
  expired_state: { text: 'That sign-in took longer than 10 minutes. Please connect again.', tone: 'text-amber-900 bg-amber-50', icon: 'circle-info' },
  invalid_state: { text: 'That authorisation could not be verified (it was already used, or started in another browser). Please connect again from this page.', tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  session_mismatch: { text: 'Finish the connection signed in as the same administrator who started it. Please connect again.', tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  invalid_request: { text: 'RingCentral returned an incomplete answer. Please connect again.', tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  exchange_failed: { text: 'RingCentral did not accept the authorisation. Check that the app’s client ID, secret and redirect URI match the server settings, then try again.', tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
  not_configured: { text: 'RingCentral is not set up on the server yet.', tone: 'text-amber-900 bg-amber-50', icon: 'circle-info' },
  error: { text: 'Something went wrong finishing the connection. Please try again.', tone: 'text-brand-red bg-red-50', icon: 'triangle-exclamation' },
}

const REAUTH_REASONS = {
  invalid_grant: 'RingCentral no longer accepts the saved authorisation (it was revoked, or the account’s password or app settings changed).',
  refresh_token_expired: 'The saved authorisation expired before it could be renewed.',
}
const reauthReason = computed(() => REAUTH_REASONS[conn.value?.lastErrorCode] || 'The saved authorisation stopped working.')

const statusChip = computed(() => {
  if (!data.value?.configured && data.value?.status === 'not_connected') return { label: 'Not set up', tone: 'bg-gray-100 text-gray-600' }
  return {
    connected: { label: 'Connected', tone: 'bg-emerald-50 text-emerald-800' },
    needs_reauth: { label: 'Reconnect needed', tone: 'bg-amber-50 text-amber-800' },
    not_connected: { label: 'Not connected', tone: 'bg-gray-100 text-gray-600' },
  }[data.value?.status] || { label: '—', tone: 'bg-gray-100 text-gray-600' }
})

function when(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
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
    if (u.protocol !== 'https:' || !/(^|\.)ringcentral\.com$/.test(u.hostname)) throw new Error('Unexpected authorisation address')
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
    banner.value = { text: 'Connection confirmed: RingCentral issued fresh tokens.', tone: 'text-emerald-900 bg-emerald-50', icon: 'circle-check' }
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
    banner.value = { text: 'RingCentral is disconnected.', tone: 'text-gray-800 bg-gray-100', icon: 'circle-info' }
  } catch (e) {
    error.value = e.message
  } finally {
    confirmDisconnect.value = false
    busy.value = null
  }
}

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}

onMounted(async () => {
  const outcome = typeof route.query.ringcentral === 'string' ? route.query.ringcentral : null
  if (outcome) {
    banner.value = OUTCOMES[outcome] || OUTCOMES.error
    // Drop the code from the address bar so a reload doesn't repeat the banner.
    router.replace({ query: {} })
  }
  await load()
})
</script>
