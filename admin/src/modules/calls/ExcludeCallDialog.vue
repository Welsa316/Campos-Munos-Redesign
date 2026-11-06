<template>
  <!-- Mark a missed call as needing no callback: it leaves the missed counts but stays in the log. -->
  <transition name="fade">
    <div v-if="call" ref="overlayRef" class="fixed inset-0 z-(--z-dialog) flex items-center justify-center dialog-frame"
      role="dialog" aria-modal="true" aria-labelledby="exclude-dialog-title"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 scrim" aria-hidden="true"></div>

      <form @submit.prevent="save" class="relative w-full max-w-[440px] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl font-ui">
        <div class="px-6 pt-6 pb-1 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="exclude-dialog-title" class="text-[19px] font-semibold tracking-tight text-gray-900">No callback needed</h2>
            <p class="text-[13px] text-gray-600 mt-0.5 tabular-nums truncate">{{ who }} · {{ several ? `${call.callIds.length} calls, last ${when}` : when }}</p>
          </div>
          <button @click="close" type="button" aria-label="Close"
            class="w-8 h-8 flex-shrink-0 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <FaIcon name="xmark" />
          </button>
        </div>

        <div class="px-6 pb-6 pt-3 space-y-4">
          <fieldset>
            <legend class="text-[12px] font-semibold text-gray-700 mb-2">Why doesn't it need a callback?</legend>
            <div class="space-y-1.5">
              <label v-for="r in REASONS" :key="r.key"
                :class="reason === r.key ? 'ring-2 ring-brand-navy bg-brand-surface' : 'ring-1 ring-gray-200 hover:bg-gray-50'"
                class="flex items-start gap-3 rounded-xl px-3.5 py-2.5 cursor-pointer transition-colors">
                <input v-model="reason" type="radio" name="exclude-reason" :value="r.key" class="mt-1 accent-brand-navy" />
                <span class="min-w-0">
                  <span class="block text-[14px] font-semibold text-gray-900">{{ r.label }}</span>
                  <span class="block text-[12px] text-gray-600 leading-snug">{{ r.hint }}</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div>
            <label for="exclude-note" class="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Note <span class="font-normal text-gray-500">{{ reason === 'other' ? '(required)' : '(optional)' }}</span>
            </label>
            <input id="exclude-note" v-model="note" type="text" maxlength="200" autocomplete="off"
              :placeholder="reason === 'staff_test' ? 'e.g. Ana testing the main line' : ''"
              class="w-full px-3.5 py-2.5 rounded-xl bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[14px]" />
          </div>

          <label v-if="call.number" class="flex items-start gap-3 rounded-xl bg-brand-surface px-3.5 py-3 cursor-pointer">
            <input v-model="wholeNumber" type="checkbox" class="mt-0.5 w-4 h-4 accent-brand-navy" />
            <span class="min-w-0">
              <span class="block text-[13px] font-semibold text-gray-900">Every call from <span class="tabular-nums whitespace-nowrap">{{ phone(call.number) }}</span></span>
              <span class="block text-[12px] text-gray-600 leading-snug">For a number that keeps calling, such as a staff member's mobile. Covers its past and future missed calls.</span>
            </span>
          </label>

          <p v-if="error" role="alert" class="text-[13px] text-brand-red">{{ error }}</p>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" @click="close" class="px-5 py-2.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" :disabled="!canSave"
              class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
              {{ busy ? 'Saving…' : 'Leave out of missed calls' }}
            </button>
          </div>
          <p class="text-[11px] text-gray-500 leading-snug">It stays in the call log with your name and the reason, and can be counted again at any time.</p>
        </div>
      </form>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { toDate } from '../../utils/text.js'
import { FIRM_TIME_ZONE } from '../../utils/firmTime.js'
import { useApi } from '../../composables/useApi.js'
import { formatPhone } from '../../utils/phone.js'
import FaIcon from '../../components/FaIcon.vue'
import { EXCLUSION_REASONS } from './exclusionReasons.js'

// call: { id, number, name, startedAt, callIds? } or null (closed). callIds:
// every call of the caller's episode, each marked on its own.
const props = defineProps({ call: { type: Object, default: null } })
const emit = defineEmits(['close', 'saved'])
const { post } = useApi()

const REASONS = EXCLUSION_REASONS
const reason = ref('')
const note = ref('')
const wholeNumber = ref(false)
const busy = ref(false)
const error = ref('')
const overlayRef = ref(null)
let previouslyFocused = null

const phone = (n) => {
  const s = String(n || '')
  return /^\+1\d{10}$/.test(s) ? formatPhone(s.slice(2)) : formatPhone(s)
}
const who = computed(() => props.call?.name || (props.call?.number ? phone(props.call.number) : 'Number withheld'))
const when = computed(() => {
  const d = toDate(props.call?.startedAt)
  return d ? d.toLocaleString('en-US', { timeZone: FIRM_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
})
const several = computed(() => (props.call?.callIds?.length || 0) > 1)
const canSave = computed(() => !busy.value && reason.value && (reason.value !== 'other' || note.value.trim()))

watch(() => props.call, (c) => {
  if (!c) {
    if (previouslyFocused?.focus) previouslyFocused.focus()
    previouslyFocused = null
    return
  }
  previouslyFocused = document.activeElement
  reason.value = ''
  note.value = ''
  wholeNumber.value = false
  error.value = ''
  busy.value = false
  nextTick(() => overlayRef.value?.querySelector('input[type="radio"]')?.focus())
})

async function save() {
  if (!canSave.value) return
  busy.value = true
  error.value = ''
  try {
    await post(`/api/calls/${props.call.id}/exclusion`, {
      reason: reason.value, note: note.value.trim(), scope: wholeNumber.value ? 'number' : 'call',
      ...(several.value && !wholeNumber.value ? { callIds: props.call.callIds } : {}),
    })
    emit('saved')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
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
