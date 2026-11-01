<template>
  <!-- Call a number with RingCentral RingOut: your phone rings first, then the client. -->
  <transition name="fade">
    <div v-if="visible" ref="overlayRef" class="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="call-dialog-title"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true"></div>

      <div class="relative w-full max-w-[420px] bg-white rounded-3xl shadow-2xl overflow-hidden font-ui">
        <div class="px-6 pt-6 pb-2 flex items-start justify-between">
          <h2 id="call-dialog-title" class="text-[19px] font-semibold tracking-tight text-gray-900">{{ call ? 'Calling' : 'New call' }}</h2>
          <button ref="closeBtnRef" @click="close" type="button" aria-label="Close"
            class="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <i class="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
          </button>
        </div>

        <div v-if="loading" class="px-6 py-10 text-center text-sm text-gray-500">
          <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Loading…
        </div>

        <!-- Progress of a placed call -->
        <div v-else-if="call" class="px-6 pb-6 pt-2 text-center" aria-live="polite">
          <span :class="phaseLook.badge" class="mx-auto w-20 h-20 rounded-full flex items-center justify-center text-[30px]">
            <FaIcon :name="phaseLook.icon" :class="phaseLook.pulse ? 'animate-pulse' : ''" />
          </span>
          <p class="mt-4 text-[17px] font-semibold text-gray-900">{{ phaseLook.title }}</p>
          <p class="mt-1 text-[13px] text-gray-600">{{ phaseLook.text }}</p>
          <p class="mt-3 text-[13px] text-gray-500 tabular-nums">{{ name ? `${name} · ` : '' }}{{ phone(call.to) }}</p>
          <div class="mt-6 flex justify-center gap-2">
            <button v-if="inProgress" type="button" @click="cancel" :disabled="Boolean(busy)"
              class="px-5 py-2.5 rounded-full bg-brand-red text-white text-[13px] font-semibold hover:bg-brand-red-light disabled:opacity-50">
              {{ call.phase === 'connected' ? 'Hang up' : 'Cancel call' }}
            </button>
            <button v-else type="button" @click="reset" class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black">Call again</button>
            <button type="button" @click="close" class="px-5 py-2.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">Close</button>
          </div>
        </div>

        <!-- Set up and dial -->
        <form v-else @submit.prevent="place" class="px-6 pb-6 pt-2 space-y-4">
          <p v-if="connection && connection !== 'connected'" role="alert" class="text-[13px] text-amber-900 bg-amber-50 rounded-xl px-3 py-2.5">
            RingCentral is not connected, so calls can't be placed yet.
          </p>

          <div>
            <label for="call-to" class="block text-[12px] font-semibold text-gray-700 mb-1.5">Number to call</label>
            <input id="call-to" ref="toRef" v-model="to" type="tel" autocomplete="off" placeholder="(504) 555-0101"
              class="w-full px-3.5 py-3 rounded-xl bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[17px] tabular-nums" />
            <p v-if="name" class="text-[12px] text-gray-500 mt-1">{{ name }}</p>
          </div>

          <div class="rounded-2xl bg-brand-surface px-4 py-3">
            <div v-if="!editingMine && myPhone" class="flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[12px] font-semibold text-gray-700">Rings you first at</p>
                <p class="text-[15px] text-gray-900 tabular-nums">{{ phone(myPhone) }}</p>
              </div>
              <button type="button" @click="editingMine = true; mine = myPhone" class="text-[12px] font-semibold text-brand-navy underline">Change</button>
            </div>
            <div v-else>
              <label for="call-mine" class="block text-[12px] font-semibold text-gray-700 mb-1.5">Ring me at</label>
              <div class="flex gap-2">
                <input id="call-mine" v-model="mine" type="tel" autocomplete="tel" placeholder="Your RingCentral direct number"
                  class="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[15px] tabular-nums" />
                <button type="button" @click="saveMine" :disabled="Boolean(busy) || !mine.trim()"
                  class="px-4 rounded-xl bg-white ring-1 ring-gray-300 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">Save</button>
              </div>
              <p class="text-[11px] text-gray-500 mt-1.5 leading-snug">Your RingCentral direct number rings your RingCentral app and desk phone. A mobile number works too. You only set this once.</p>
            </div>
          </div>

          <p v-if="error" role="alert" class="text-[13px] text-brand-red">{{ error }}</p>

          <button type="submit" :disabled="Boolean(busy) || !myPhone || editingMine || !to.trim() || connection !== 'connected'"
            class="w-full py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <FaIcon name="phone" /> Call
          </button>
          <p class="text-[11px] text-gray-500 text-center leading-snug">Your phone rings first. Answer it and RingCentral dials the client, showing the firm's number.</p>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useApi, rawFetch, goToLogin } from '../../composables/useApi.js'
import { formatPhone } from '../../utils/phone.js'
import FaIcon from '../../components/FaIcon.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  number: { type: String, default: '' },
  name: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const { get, post, del } = useApi()

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

const REASONS = {
  Busy: 'the line was busy', NoAnswer: 'nobody answered', Rejected: 'the call was declined',
  InternationalDisabled: 'international calling is turned off in RingCentral', DestinationBlocked: 'RingCentral blocks this number',
  NotEnoughFunds: 'the RingCentral account has no calling credit', NoSuchUser: 'RingCentral did not recognise the number',
}
const phaseLook = computed(() => {
  const c = call.value || {}
  const why = REASONS[c.reason] || 'RingCentral could not connect the call'
  return {
    ringing_you: { icon: 'phone-volume', badge: 'bg-sky-100 text-sky-700', pulse: true, title: 'Ringing your phone…', text: `Pick up at ${phone(myPhone.value)} to start the call.` },
    calling_client: { icon: 'phone-volume', badge: 'bg-emerald-100 text-emerald-700', pulse: true, title: `Calling ${props.name || 'the client'}…`, text: 'Stay on the line; RingCentral is dialing.' },
    connected: { icon: 'phone', badge: 'bg-emerald-100 text-emerald-700', title: 'Connected', text: 'Talk on your phone. You can close this window.' },
    finished: { icon: 'phone', badge: 'bg-gray-100 text-gray-600', title: 'Call ended', text: 'It will appear in the call log after the next update.' },
    cancelled: { icon: 'phone-slash', badge: 'bg-gray-100 text-gray-600', title: 'Call cancelled', text: 'Nothing more will ring.' },
    failed: { icon: 'phone-slash', badge: 'bg-red-100 text-brand-red', title: c.who === 'you' ? 'Your phone did not pick up' : 'The call did not go through', text: `${why.charAt(0).toUpperCase()}${why.slice(1)}.` },
  }[c.phase] || { icon: 'phone', badge: 'bg-gray-100 text-gray-600', title: 'Calling…', text: '' }
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

function reset() {
  stopPolling()
  call.value = null
  error.value = ''
  busy.value = null
}

async function saveMine() {
  busy.value = 'mine'
  error.value = ''
  try {
    const res = await rawFetch('/api/calls/ringout/me', { method: 'PUT', body: JSON.stringify({ phone: mine.value }) })
    if (res.status === 401) return goToLogin()
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Could not save the number')
    myPhone.value = data.phone
    editingMine.value = false
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
    call.value = await post('/api/calls/ringout', { to: to.value })
    pollUntil = Date.now() + 3 * 60 * 1000
    schedulePoll()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = null
  }
}

// Follow the call until it connects, ends or fails (at most three minutes).
function schedulePoll() {
  stopPolling()
  if (!call.value || !['ringing_you', 'calling_client'].includes(call.value.phase) || Date.now() > pollUntil) return
  pollTimer = setTimeout(async () => {
    try {
      call.value = await get(`/api/calls/ringout/${call.value.id}`)
    } catch { /* keep the last state; try again */ }
    schedulePoll()
  }, 1500)
}
function stopPolling() { clearTimeout(pollTimer); pollTimer = null }
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
