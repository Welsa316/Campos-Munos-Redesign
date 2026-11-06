<template>
  <transition name="fade">
    <div v-if="visible"
      ref="overlayRef"
      class="fixed inset-0 z-[200] flex items-center justify-center dialog-frame"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      aria-describedby="notifications-text"
      @keydown.esc="close"
      @keydown.tab="trapFocus"
      @click.self="close">
      <div class="absolute inset-0 scrim" aria-hidden="true"></div>

      <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden font-ui">
        <div class="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 id="notifications-title" class="font-heading text-xl text-brand-navy">Desktop notifications</h2>
            <p id="notifications-text" class="text-gray-500 text-sm mt-1">Receive callback reminders and new website messages on this computer, even when the portal tab is closed.</p>
          </div>
          <button ref="closeBtnRef" @click="close" type="button"
            class="w-8 h-8 flex-shrink-0 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
            aria-label="Close">
            <FaIcon name="xmark" class="text-sm" />
          </button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <p class="flex items-center gap-2 text-sm">
            <span :class="badge.tone" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold">
              <FaIcon :name="badge.icon" class="text-[11px]" />{{ badge.label }}
            </span>
            <span v-if="state === 'on' && devices > 1" class="text-xs text-gray-500">{{ devices }} computers in all</span>
          </p>

          <p v-if="explanation" class="text-sm text-gray-600 leading-relaxed">{{ explanation }}</p>

          <p v-if="error" role="alert" class="text-brand-red text-sm">
            <FaIcon name="circle-exclamation" class="text-xs mr-1 inline-flex" />{{ error }}
          </p>
          <p role="status" class="text-green-700 text-sm empty:hidden">{{ notice }}</p>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button v-if="state === 'off'" type="button" @click="enable" :disabled="Boolean(busy)"
              class="flex-1 min-w-[180px] py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span v-if="busy === 'enable'" class="inline-flex items-center gap-1.5"><FaIcon name="spinner" spin class="text-xs" />Turning on…</span>
              <span v-else>Enable notifications</span>
            </button>
            <button v-if="state.startsWith('desktop')" type="button" @click="sendDesktopTest" :disabled="Boolean(busy)"
              class="flex-1 min-w-[180px] py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span v-if="busy === 'test'" class="inline-flex items-center gap-1.5"><FaIcon name="spinner" spin class="text-xs" />Sending…</span>
              <span v-else>Send test notification</span>
            </button>
            <button v-if="state === 'error'" type="button" @click="refresh"
              class="flex-1 min-w-[180px] py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-900 text-sm font-medium transition-colors">
              Try again
            </button>
            <template v-if="state === 'on'">
              <button type="button" @click="sendTest" :disabled="Boolean(busy)"
                class="flex-1 min-w-[180px] py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <span v-if="busy === 'test'" class="inline-flex items-center gap-1.5"><FaIcon name="spinner" spin class="text-xs" />Sending…</span>
                <span v-else>Send test notification</span>
              </button>
              <button type="button" @click="turnOff" :disabled="Boolean(busy)"
                class="flex-1 min-w-[180px] py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <span v-if="busy === 'off'" class="inline-flex items-center gap-1.5"><FaIcon name="spinner" spin class="text-xs" />Turning off…</span>
                <span v-else>Turn off on this computer</span>
              </button>
            </template>
          </div>

          <!-- Push is delivered to the browser: it must be running, even with no window open. -->
          <p v-if="state === 'on'" class="text-xs text-gray-600 leading-relaxed" data-background-tip>
            Notifications show only while your browser is running. To get them with every window closed, let it keep running in the background:
            in Chrome, Settings → System → Continue running background apps; in Edge, Settings → System and performance → Startup boost.
            One sent while the browser was quit appears when it next starts, up to a day later.
          </p>
          <!-- Shown as the browser until the portal is installed as an app. -->
          <p v-if="state === 'on' && !installed" class="text-xs text-gray-600 leading-relaxed" data-install-tip>
            To have notifications show as Campos Muños instead of your browser, install the portal as an app:
            in Chrome or Edge, click the install icon at the right of the address bar
            (or the ⋮ menu → Cast, save and share → Install page as app).
          </p>

          <p class="text-xs text-gray-500">Turn it on separately on each computer you use. Notifications say only that a follow-up is ready, never who it is for.</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
// The person's own setting for this browser (utils/push.js,
// server/routes/push.js). Opening it only reads state: the browser's
// permission prompt appears only after "Enable notifications" is clicked.
import { ref, computed, watch, nextTick } from 'vue'
import { rawFetch, goToLogin } from '../../composables/useApi.js'
import { inDesktopApp, desktopNotificationState } from '../../utils/desktop.js'
import { pushSupport, permissionState, currentSubscription, subscribeThisBrowser, blockedHelp, testSentHelp } from '../../utils/push.js'
import FaIcon from '../FaIcon.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

// loading | error | unsupported | insecure | not_configured | blocked | off | on
const state = ref('loading')
const devices = ref(0)
const busy = ref('')
const error = ref('')
const notice = ref('')
// Running as the installed app (its own window), where notifications already carry its name.
const installed = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
const overlayRef = ref(null)
const closeBtnRef = ref(null)
let publicKey = null
let previouslyFocused = null

const BADGES = {
  loading: { label: 'Checking…', icon: 'spinner', tone: 'bg-gray-100 text-gray-600' },
  error: { label: 'Could not check', icon: 'circle-exclamation', tone: 'bg-gray-100 text-gray-700' },
  on: { label: 'On for this computer', icon: 'bell', tone: 'bg-green-50 text-green-800 ring-1 ring-green-200' },
  off: { label: 'Off on this computer', icon: 'bell-slash', tone: 'bg-gray-100 text-gray-700' },
  blocked: { label: 'Blocked in this browser', icon: 'ban', tone: 'bg-red-50 text-brand-red ring-1 ring-red-200' },
  not_configured: { label: 'Not available yet', icon: 'circle-info', tone: 'bg-gray-100 text-gray-700' },
  unsupported: { label: 'Not available in this browser', icon: 'circle-info', tone: 'bg-gray-100 text-gray-700' },
  insecure: { label: 'Not available on this connection', icon: 'circle-info', tone: 'bg-gray-100 text-gray-700' },
  desktop: { label: 'On in this app', icon: 'bell', tone: 'bg-green-50 text-green-800 ring-1 ring-green-200' },
  desktop_paused: { label: 'Paused in this app', icon: 'circle-pause', tone: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' },
  desktop_blocked: { label: 'Blocked on this computer', icon: 'ban', tone: 'bg-red-50 text-brand-red ring-1 ring-red-200' },
}
const badge = computed(() => BADGES[state.value] || BADGES.loading)
const host = () => (typeof window !== 'undefined' ? window.location.host : 'admin.camulaw.com')
const explanation = computed(() => ({
  blocked: blockedHelp(host()),
  not_configured: 'Desktop notifications are not set up on the server yet. Ask the office administrator.',
  unsupported: 'This browser cannot show desktop notifications. Use a current version of Chrome or Edge.',
  insecure: 'Desktop notifications only work when the portal is opened over https.',
  desktop: 'This app shows notifications itself while it is running, even with its window closed. Nothing to turn on here. If a test does not appear, check that notifications are allowed for Campos Muños in the computer’s notification settings.',
  desktop_paused: 'The app cannot reach the server right now, so new notifications wait until it can. It keeps trying on its own.',
  desktop_blocked: 'This computer does not let the app show notifications. Allow them for Campos Muños in the computer’s notification settings.',
}[state.value] || ''))

async function api(path, method, body) {
  const res = await rawFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  if (res.status === 401) {
    goToLogin()
    throw new Error('Your session has ended. Sign in again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status, code: data.code })
  return data
}

// Read where things stand. Never asks for permission.
async function refresh() {
  error.value = ''
  state.value = 'loading'
  // The desktop app reads its notifications from the server itself.
  if (inDesktopApp()) { state.value = await desktopNotificationState(); return }
  const support = pushSupport()
  if (support !== 'ok') { state.value = support; return }
  try {
    const cfg = await api('/api/push/config', 'GET')
    if (!cfg.configured) { state.value = 'not_configured'; return }
    publicKey = cfg.publicKey
    if (permissionState() === 'denied') { state.value = 'blocked'; return }
    const sub = await currentSubscription()
    if (!sub) { state.value = 'off'; return }
    const st = await api('/api/push/subscriptions/status', 'POST', { endpoint: sub.endpoint })
    devices.value = st.devices
    // Subscribed in the browser but not for this account (someone else
    // turned it on here, or the push service dropped it): off until enabled.
    state.value = st.enabled && permissionState() === 'granted' ? 'on' : 'off'
  } catch (e) {
    error.value = e.message
    state.value = 'error'
  }
}

async function enable() {
  error.value = ''
  notice.value = ''
  busy.value = 'enable'
  try {
    // Permission is requested first, straight from this click.
    const sub = await subscribeThisBrowser(publicKey)
    const res = await api('/api/push/subscriptions', 'POST', { subscription: sub.toJSON() })
    devices.value = res.devices
    state.value = 'on'
    notice.value = 'Notifications are on for this computer. Send a test to check they appear.'
  } catch (e) {
    if (e.code === 'denied') state.value = 'blocked'
    else if (e.code === 'dismissed') error.value = 'Notifications were not allowed. Click Enable notifications again and choose Allow.'
    else if (e.code === 'unsupported' || e.code === 'insecure') state.value = e.code
    else if (e.code === 'push_not_configured') state.value = 'not_configured'
    else error.value = e.message || 'Could not turn notifications on. Try again.'
  } finally {
    busy.value = ''
  }
}

async function turnOff() {
  error.value = ''
  notice.value = ''
  busy.value = 'off'
  try {
    const sub = await currentSubscription()
    if (sub) {
      const res = await api('/api/push/subscriptions', 'DELETE', { endpoint: sub.endpoint })
      devices.value = res.devices
      await sub.unsubscribe().catch(() => {})
    }
    state.value = 'off'
    notice.value = 'Notifications are off for this computer.'
  } catch (e) {
    error.value = e.message || 'Could not turn notifications off. Try again.'
  } finally {
    busy.value = ''
  }
}

// In the desktop app: a test item in its feed, which it shows within about 20 seconds.
async function sendDesktopTest() {
  error.value = ''
  notice.value = ''
  busy.value = 'test'
  try {
    await api('/api/notifications/test', 'POST', {})
    notice.value = 'Test sent. It should appear within about 20 seconds.'
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

async function sendTest() {
  error.value = ''
  notice.value = ''
  busy.value = 'test'
  try {
    const sub = await currentSubscription()
    if (!sub) { state.value = 'off'; throw new Error('Notifications are not turned on on this computer.') }
    await api('/api/push/test', 'POST', { endpoint: sub.endpoint })
    // Accepted by the push service; whether it shows is up to the browser and the operating system.
    notice.value = testSentHelp()
  } catch (e) {
    if (e.code === 'expired' || e.code === 'not_subscribed') state.value = 'off'
    error.value = e.message
  } finally {
    busy.value = ''
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    error.value = ''
    notice.value = ''
    busy.value = ''
    previouslyFocused = document.activeElement
    nextTick(() => closeBtnRef.value?.focus())
    refresh()
  } else if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus()
    previouslyFocused = null
  }
})

function close() {
  emit('close')
}

function trapFocus(e) {
  if (e.key !== 'Tab' || !overlayRef.value) return
  const focusable = overlayRef.value.querySelectorAll('a[href], button:not([disabled])')
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
