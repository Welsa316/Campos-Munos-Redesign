<template>
  <!-- Clear Needs attention (administrators, calls.clear): every open call
       received before a time marked handled at once, with one reason. -->
  <transition name="fade">
    <div v-if="open" ref="overlayRef" class="fixed inset-0 z-(--z-dialog) flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="clear-calls-title" aria-describedby="clear-calls-what"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true"></div>

      <form @submit.prevent="save" class="relative w-full max-w-[460px] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl font-ui">
        <div class="px-6 pt-6 pb-1 flex items-start justify-between gap-3">
          <h2 id="clear-calls-title" class="font-ui text-[19px] font-semibold tracking-tight text-gray-900">Clear Needs attention</h2>
          <button @click="close" type="button" aria-label="Close"
            class="w-8 h-8 flex-shrink-0 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <FaIcon name="xmark" />
          </button>
        </div>

        <div class="px-6 pb-6 pt-2 space-y-4">
          <p id="clear-calls-what" class="text-[13px] text-gray-700 leading-relaxed">
            Marks every open call received before the time below as handled. How each call is recorded, who it was offered to, and the missed counts stay as they are. Cleared calls are listed under Handled, and Undo puts them all back.
          </p>

          <div>
            <label for="clear-before" class="block text-[12px] font-semibold text-gray-700 mb-1.5">Received before</label>
            <input id="clear-before" v-model="before" type="datetime-local" required
              class="w-full px-3.5 py-2.5 rounded-xl bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[14px] tabular-nums" />
          </div>

          <div>
            <label for="clear-note" class="block text-[12px] font-semibold text-gray-700 mb-1.5">Reason <span class="font-normal text-gray-500">(saved on each call)</span></label>
            <input id="clear-note" ref="noteRef" v-model="note" type="text" maxlength="200" required autocomplete="off"
              class="w-full px-3.5 py-2.5 rounded-xl bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[14px]" />
          </div>

          <!-- The review group stays unless asked: nobody missed those calls,
               but someone may still need to check on them. -->
          <label v-if="review" class="flex items-start gap-3 rounded-xl bg-brand-surface px-3.5 py-3 cursor-pointer">
            <input v-model="withReview" type="checkbox" class="mt-0.5 w-4 h-4 accent-brand-navy" />
            <span class="min-w-0">
              <span class="block text-[13px] font-semibold text-gray-900">Also clear {{ review }} {{ review === 1 ? 'call' : 'calls' }} with no recorded outcome</span>
              <span class="block text-[12px] text-gray-600 leading-snug">From “Check if they still need help”. Left as they are unless ticked.</span>
            </span>
          </label>

          <p class="text-[13px] tabular-nums" role="status" aria-live="polite">
            <span v-if="count === null" class="text-gray-500">Counting…</span>
            <span v-else-if="count === 0" class="text-gray-600">No open calls came in before then.</span>
            <span v-else class="font-semibold text-gray-900">{{ count }} open {{ count === 1 ? 'call' : 'calls' }}{{ people && people !== count ? ` from ${people} ${people === 1 ? 'caller' : 'callers'}` : '' }} will be marked handled.</span>
          </p>

          <p v-if="error" role="alert" class="text-[13px] text-brand-red">{{ error }}</p>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button type="button" @click="close" class="px-5 py-2.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" :disabled="!canSave"
              class="px-5 py-2.5 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
              {{ busy ? 'Clearing…' : count ? `Clear ${count} ${count === 1 ? 'call' : 'calls'}` : 'Clear' }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useApi, latestOnly } from '../../composables/useApi.js'
import FaIcon from '../../components/FaIcon.vue'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'cleared'])
const { get, post } = useApi()

const DEFAULT_NOTE = 'Missed before voicemail routing was set up'
const before = ref('')
const note = ref(DEFAULT_NOTE)
const count = ref(null)
// Callers the calls are from, and the review group's calls before the cutoff.
const people = ref(null)
const review = ref(0)
const withReview = ref(false)
const busy = ref(false)
const error = ref('')
const overlayRef = ref(null)
const noteRef = ref(null)
let previouslyFocused = null

// "2026-11-06T14:05" in the browser's own time, as the input shows it.
const localInput = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const cutoff = computed(() => {
  const d = new Date(before.value)
  return Number.isNaN(d.getTime()) ? null : d
})
const canSave = computed(() => !busy.value && cutoff.value && note.value.trim() && count.value > 0)

// The count comes from the server, by the same rules as the list.
const latestCount = latestOnly()
async function recount() {
  if (!cutoff.value) { count.value = 0; return }
  count.value = null
  try {
    const q = new URLSearchParams({ before: cutoff.value.toISOString(), ...(withReview.value ? { review: '1' } : {}) })
    const r = await latestCount(() => get(`/api/calls/handled/bulk?${q}`))
    if (r.current) {
      count.value = r.value.count
      people.value = r.value.people ?? null
      review.value = r.value.review || 0
    }
  } catch (e) {
    error.value = e.message
    count.value = 0
  }
}
watch([before, withReview], () => { if (props.open) recount() })

watch(() => props.open, (open) => {
  if (!open) {
    if (previouslyFocused?.focus) previouslyFocused.focus()
    previouslyFocused = null
    return
  }
  previouslyFocused = document.activeElement
  // A minute ahead, so a call that is still ringing as the dialog opens is included.
  before.value = localInput(new Date(Date.now() + 60 * 1000))
  note.value = DEFAULT_NOTE
  withReview.value = false
  review.value = 0
  error.value = ''
  busy.value = false
  recount()
  nextTick(() => noteRef.value?.focus())
})

async function save() {
  if (!canSave.value) return
  busy.value = true
  error.value = ''
  try {
    const out = await post('/api/calls/handled/bulk', { before: cutoff.value.toISOString(), note: note.value.trim(), review: withReview.value })
    emit('cleared', out)
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
