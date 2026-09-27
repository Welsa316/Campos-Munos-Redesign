<template>
  <transition name="fade">
    <div v-if="visible"
      class="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-title"
      @keydown.esc="$emit('close')"
      @keydown.tab="trapFocus"
      ref="overlayRef">
      <div class="absolute inset-0 bg-black/40" aria-hidden="true" @click="$emit('close')"></div>

      <div class="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 id="schedule-title" class="font-heading text-xl text-brand-navy">Schedule consultation</h2>
            <p class="text-gray-500 text-sm font-ui mt-1">{{ leadName }} · demo calendar, nothing is booked</p>
          </div>
          <button ref="closeBtn" @click="$emit('close')" type="button"
            class="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors"
            aria-label="Close">
            <DemoIcon :icon="faXmark" class="text-sm" />
          </button>
        </div>

        <form @submit.prevent="submit" class="px-6 py-5 space-y-5">
          <fieldset>
            <legend class="block text-xs font-ui font-semibold tracking-wide uppercase text-gray-500 mb-2">Day</legend>
            <div class="grid grid-cols-5 gap-1.5">
              <button v-for="d in days" :key="d.key" type="button"
                @click="dayKey = d.key"
                :aria-pressed="dayKey === d.key"
                :class="dayKey === d.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-brand-navy/40'"
                class="rounded-lg ring-1 py-2 text-center font-ui transition-colors">
                <span class="block text-[10px] uppercase tracking-wider opacity-80">{{ d.weekday }}</span>
                <span class="block text-sm font-semibold tabular-nums">{{ d.date }}</span>
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend class="block text-xs font-ui font-semibold tracking-wide uppercase text-gray-500 mb-2">Time</legend>
            <div class="grid grid-cols-3 gap-1.5">
              <button v-for="s in SLOTS" :key="s.label" type="button"
                @click="slot = s.label"
                :aria-pressed="slot === s.label"
                :disabled="s.taken"
                :class="slot === s.label ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-brand-navy/40'"
                class="rounded-lg ring-1 py-2 text-sm font-ui font-medium tabular-nums transition-colors disabled:bg-gray-50 disabled:text-gray-300 disabled:ring-gray-100 disabled:cursor-not-allowed">
                {{ s.label }}<span v-if="s.taken" class="sr-only"> (booked)</span>
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend class="block text-xs font-ui font-semibold tracking-wide uppercase text-gray-500 mb-2">Consultation type</legend>
            <div class="flex bg-brand-surface rounded-lg p-0.5">
              <button v-for="m in MODES" :key="m" type="button"
                @click="mode = m"
                :aria-pressed="mode === m"
                :class="mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
                class="flex-1 text-xs font-ui font-medium py-2 rounded-md transition-all">{{ m }}</button>
            </div>
          </fieldset>

          <div class="rounded-xl bg-brand-surface px-4 py-3 text-xs font-ui text-gray-600 leading-relaxed">
            <span class="font-semibold text-gray-900">{{ summary }}</span><br>
            On save the client gets a confirmation in Spanish and a reminder the day before — simulated in this demo.
          </div>

          <div class="flex items-center gap-2 pt-1">
            <button type="button" @click="$emit('close')"
              class="flex-1 py-2.5 rounded-lg text-gray-500 hover:text-gray-800 text-sm font-ui font-medium border border-gray-200 hover:border-gray-300 transition-colors">
              Cancel
            </button>
            <button type="submit"
              class="flex-1 py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-ui font-semibold transition-colors">
              Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import DemoIcon from './DemoIcon.vue'
import { formatConsultation, upcomingBusinessDays } from '../useOpsDemo.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  leadName: { type: String, default: '' },
})
const emit = defineEmits(['close', 'save'])

const SLOTS = [
  { label: '9:00 AM', h: 9, m: 0 },
  { label: '10:00 AM', h: 10, m: 0, taken: true },
  { label: '11:00 AM', h: 11, m: 0 },
  { label: '1:30 PM', h: 13, m: 30 },
  { label: '3:00 PM', h: 15, m: 0 },
  { label: '4:30 PM', h: 16, m: 30 },
]
const MODES = ['In person', 'Phone', 'Video']

// The next five business days, starting tomorrow.
const days = computed(() => upcomingBusinessDays(5).map(d => ({
  key: d.toDateString(),
  value: d,
  weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
  date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
})))

// Default to the first Friday on offer at 11:00 — the slot the scripted story uses.
function defaults() {
  const friday = days.value.find(d => d.value.getDay() === 5) || days.value[0]
  dayKey.value = friday.key
  slot.value = '11:00 AM'
  mode.value = 'In person'
}

const dayKey = ref('')
const slot = ref('11:00 AM')
const mode = ref('In person')

const chosenIso = computed(() => {
  const d = days.value.find(x => x.key === dayKey.value) || days.value[0]
  const s = SLOTS.find(x => x.label === slot.value) || SLOTS[2]
  const at = new Date(d.value)
  at.setHours(s.h, s.m, 0, 0)
  return at.toISOString()
})

const summary = computed(() => `${mode.value} · ${formatConsultation(chosenIso.value)}`)

const overlayRef = ref(null)
const closeBtn = ref(null)

watch(() => props.visible, (v) => {
  if (!v) return
  defaults()
  nextTick(() => closeBtn.value?.focus())
})

function submit() {
  emit('save', { at: chosenIso.value, mode: mode.value })
}

function trapFocus(e) {
  const els = overlayRef.value?.querySelectorAll('button:not([disabled])')
  if (!els || !els.length) return
  const first = els[0]
  const last = els[els.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
</script>
