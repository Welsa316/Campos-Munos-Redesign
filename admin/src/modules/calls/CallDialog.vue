<template>
  <!-- Call a number with RingCentral RingOut: your phone rings first, then the client. -->
  <transition name="fade">
    <div v-if="visible" ref="overlayRef" class="fixed inset-0 z-(--z-dialog) flex items-center justify-center dialog-frame"
      role="dialog" aria-modal="true" aria-labelledby="call-dialog-title"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 scrim" aria-hidden="true"></div>

      <div class="relative w-full max-w-[420px] bg-white rounded-3xl shadow-2xl overflow-hidden font-ui">
        <div class="px-6 pt-6 pb-2 flex items-start justify-between">
          <h2 id="call-dialog-title" class="text-[19px] font-semibold tracking-tight text-gray-900">{{ t(call ? 'dialog.calling' : 'dialog.new_call') }}</h2>
          <button ref="closeBtnRef" @click="close" type="button" :aria-label="t('dialog.close')"
            class="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <i class="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
          </button>
        </div>

        <div v-if="loading" class="px-6 py-10 text-center text-sm text-gray-500">
          <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>{{ t('loading') }}
        </div>

        <!-- Progress of a placed call -->
        <div v-else-if="call" class="px-6 pb-6 pt-2 text-center" aria-live="polite">
          <span :class="phaseLook.badge" class="mx-auto w-20 h-20 rounded-full flex items-center justify-center text-[30px]">
            <FaIcon :name="phaseLook.icon" :class="phaseLook.pulse ? 'animate-pulse' : ''" />
          </span>
          <p class="mt-4 text-[17px] font-semibold text-gray-900">{{ phaseLook.title }}</p>
          <p class="mt-1 text-[13px] text-gray-600">{{ phaseLook.text }}</p>
          <p class="mt-3 text-[13px] text-gray-500 tabular-nums">{{ name ? `${name} · ` : '' }}{{ phone(call.to) }}</p>
          <div class="mt-6 flex justify-center gap-2" data-phase-actions>
            <button v-if="inProgress" type="button" @click="cancel" :disabled="Boolean(busy)"
              class="px-5 py-2.5 rounded-full bg-brand-red text-white text-[13px] font-semibold hover:bg-brand-red-light disabled:opacity-50">
              {{ t(call.phase === 'connected' ? 'dialog.hang_up' : 'dialog.cancel_call') }}
            </button>
            <button v-else type="button" @click="reset" class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black">{{ t('dialog.call_again') }}</button>
            <button type="button" @click="close" class="px-5 py-2.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">{{ t('dialog.close') }}</button>
          </div>
        </div>

        <!-- Set up and dial -->
        <form v-else @submit.prevent="place" class="px-6 pb-6 pt-2 space-y-4">
          <p v-if="connection && connection !== 'connected'" role="alert" class="text-[13px] text-amber-900 bg-amber-50 rounded-xl px-3 py-2.5">
            {{ t('dialog.not_connected') }}
          </p>

          <div>
            <label for="call-to" class="block text-[12px] font-semibold text-gray-700 mb-1.5">{{ t('dialog.number') }}</label>
            <input id="call-to" ref="toRef" v-model="to" type="tel" autocomplete="off" placeholder="(504) 555-0101"
              class="w-full px-3.5 py-3 rounded-xl bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[17px] tabular-nums" />
            <p v-if="name" class="text-[12px] text-gray-500 mt-1">{{ name }}</p>
          </div>

          <div class="rounded-2xl bg-brand-surface px-4 py-3">
            <div v-if="!editingMine && myPhone" class="flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[12px] font-semibold text-gray-700">{{ t('dialog.rings_first') }}</p>
                <p class="text-[15px] text-gray-900 tabular-nums">{{ phone(myPhone) }}</p>
              </div>
              <button type="button" @click="editingMine = true; mine = myPhone" class="text-[12px] font-semibold text-brand-navy underline">{{ t('dialog.change') }}</button>
            </div>
            <div v-else>
              <label for="call-mine" class="block text-[12px] font-semibold text-gray-700 mb-1.5">{{ t('dialog.ring_me') }}</label>
              <div class="flex gap-2">
                <input id="call-mine" v-model="mine" type="tel" autocomplete="tel" :placeholder="t('dialog.mine_placeholder')"
                  class="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[15px] tabular-nums" />
                <button type="button" @click="saveMine" :disabled="Boolean(busy) || !mine.trim()"
                  class="px-4 rounded-xl bg-white ring-1 ring-gray-300 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">{{ t('dialog.save') }}</button>
              </div>
              <p class="text-[11px] text-gray-500 mt-1.5 leading-snug">{{ t('dialog.mine_help') }}</p>
            </div>
          </div>

          <p v-if="error" role="alert" class="text-[13px] text-brand-red">{{ error }}</p>

          <button type="submit" :disabled="Boolean(busy) || !myPhone || editingMine || !to.trim() || connection !== 'connected'"
            class="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <FaIcon name="phone" /> {{ t('dialog.call') }}
          </button>
          <p class="text-[11px] text-gray-500 text-center leading-snug">{{ t('dialog.footer') }}</p>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useApi, rawFetch, goToLogin, latestOnly } from '../../composables/useApi.js'
import { formatPhone } from '../../utils/phone.js'
import FaIcon from '../../components/FaIcon.vue'
import { useT } from '../../i18n/translator.js'
import { CALLS } from '../../i18n/calls.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  number: { type: String, default: '' },
  name: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const { get, post, del } = useApi()
const { t } = useT(CALLS)

const loading = ref(false)
const busy = ref(null)
const error = ref('')
const to = ref('')
const myPhone = ref(null)
const mine = ref('')
const editingMine = ref(false)
const connection = ref(null)
const call = ref(null) // { id, to, phase, who?, reason? }
const overlayRef = ref(null)
const closeBtnRef = ref(null)
const toRef = ref(null)
let pollTimer = null
let pollUntil = 0
let previouslyFocused = null

const phone = (n) => {
  const s = String(n || '')
  return /^\+1\d{10}$/.test(s) ? formatPhone(s.slice(2)) : formatPhone(s)
}
const inProgress = computed(() => ['ringing_you', 'calling_client', 'connected'].includes(call.value?.phase))

// Why RingCentral could not connect a RingOut (its codes, worded here).
const REASONS = ['Busy', 'NoAnswer', 'Rejected', 'InternationalDisabled', 'DestinationBlocked', 'NotEnoughFunds', 'NoSuchUser']
const phaseLook = computed(() => {
  const c = call.value || {}
  const why = t(REASONS.includes(c.reason) ? `dialog.why.${c.reason}` : 'dialog.why.other')
  return {
    ringing_you: { icon: 'phone-volume', badge: 'bg-sky-100 text-sky-700', pulse: true, title: t('dialog.ringing_you'), text: t('dialog.ringing_you_text', { phone: phone(myPhone.value) }) },
    calling_client: { icon: 'phone-volume', badge: 'bg-emerald-100 text-emerald-700', pulse: true, title: props.name ? t('dialog.calling_client', { name: props.name }) : t('dialog.calling_client_anon'), text: t('dialog.calling_client_text') },
    connected: { icon: 'phone', badge: 'bg-emerald-100 text-emerald-700', title: t('dialog.connected'), text: t('dialog.connected_text') },
    finished: { icon: 'phone', badge: 'bg-gray-100 text-gray-600', title: t('dialog.finished'), text: t('dialog.finished_text') },
    cancelled: { icon: 'phone-slash', badge: 'bg-gray-100 text-gray-600', title: t('dialog.cancelled'), text: t('dialog.cancelled_text') },
    failed: { icon: 'phone-slash', badge: 'bg-red-100 text-brand-red', title: t(c.who === 'you' ? 'dialog.failed_you' : 'dialog.failed'), text: `${why.charAt(0).toUpperCase()}${why.slice(1)}.` },
  }[c.phase] || { icon: 'phone', badge: 'bg-gray-100 text-gray-600', title: t('dialog.calling_generic'), text: '' }
})

watch(() => props.visible, async (v) => {
  if (!v) {
    stopPolling()
    if (previouslyFocused?.focus) previouslyFocused.focus()
    previouslyFocused = null
    return
  }
  previouslyFocused = document.activeElement
  reset()
  to.value = props.number ? phone(props.number) : ''
  loading.value = true
  try {
    const me = await get('/api/calls/ringout/me')
    myPhone.value = me.phone
    connection.value = me.connection
    editingMine.value = !me.phone
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
  nextTick(() => (toRef.value || closeBtnRef.value)?.focus())
})

// The dialog swaps its content (the form, then the call's progress, then the
// form again): focus follows into the new content, or it would fall to the
// page behind and Esc and the Tab trap would stop working.
function focusContent() {
  nextTick(() => {
    const action = overlayRef.value?.querySelector('[data-phase-actions] button:not([disabled])')
    ;(action || toRef.value || closeBtnRef.value)?.focus()
  })
}

function reset() {
  stopPolling()
  call.value = null
  error.value = ''
  busy.value = null
  focusContent()
}

async function saveMine() {
  busy.value = 'mine'
  error.value = ''
  try {
    const res = await rawFetch('/api/calls/ringout/me', { method: 'PUT', body: JSON.stringify({ phone: mine.value }) })
    if (res.status === 401) return goToLogin()
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('dialog.save_failed'))
    myPhone.value = data.phone
    editingMine.value = false
    focusContent()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = null
  }
}

async function place() {
  busy.value = 'call'
  error.value = ''
  try {
    const placed = await post('/api/calls/ringout', { to: to.value })
    // Closed while RingCentral was accepting it: nothing more to show or follow.
    if (!props.visible) return
    call.value = placed
    pollUntil = Date.now() + 3 * 60 * 1000
    schedulePoll()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = null
    focusContent()
  }
}

// Follow the call until it connects, ends or fails (at most three minutes).
// A check still in flight when the dialog closes, resets or cancels is
// dropped when it lands: it must not repaint the call or start polling again.
const latestCheck = latestOnly()
function schedulePoll() {
  stopPolling()
  if (!call.value || !['ringing_you', 'calling_client'].includes(call.value.phase) || Date.now() > pollUntil) return
  const id = call.value.id
  pollTimer = setTimeout(async () => {
    pollTimer = null
    try {
      const r = await latestCheck(() => get(`/api/calls/ringout/${id}`))
      if (!r.current) return
      call.value = r.value
    } catch { /* keep the last state; try again */ }
    schedulePoll()
  }, 1500)
}
function stopPolling() { latestCheck.cancel(); clearTimeout(pollTimer); pollTimer = null }
onUnmounted(stopPolling)

async function cancel() {
  busy.value = 'cancel'
  try {
    call.value = await del(`/api/calls/ringout/${call.value.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = null
    stopPolling()
    focusContent()
  }
}

function close() { emit('close') }

function trapFocus(e) {
  if (!overlayRef.value) return
  const f = overlayRef.value.querySelectorAll('button:not([disabled]), input:not([disabled])')
  if (!f.length) return
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
}
</script>
