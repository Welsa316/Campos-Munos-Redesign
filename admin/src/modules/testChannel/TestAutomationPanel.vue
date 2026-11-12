<template>
  <!-- One test form's automation test: its pretend status, the buttons that
       stand in for the client and the staff, each step and when it is due,
       and everything that was sent or only shown. -->
  <section class="mt-6 rounded-xl ring-1 ring-amber-200 overflow-hidden" :aria-labelledby="uid + '-h'">
    <header class="px-4 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <h5 :id="uid + '-h'" class="text-sm font-semibold text-gray-900">Automation test</h5>
      <TestModeBadge />
      <template v-if="run">
        <span class="text-xs text-gray-700">Test status: <span class="font-semibold text-gray-900">{{ STATUS_LABELS[run.leadStatus] || run.leadStatus }}</span></span>
        <span class="ml-auto text-[11px] text-gray-600">{{ run.timing === 'production' ? 'Real timing' : 'Accelerated timing' }} · {{ run.endedAt ? 'finished' : 'running' }}</span>
      </template>
    </header>

    <!-- Not started yet -->
    <div v-if="!run" class="px-4 py-4 bg-white">
      <p class="text-xs text-gray-700">No automation test has run on this form. Start one with the choices under “Automation test” above:
        <span class="font-semibold text-gray-900">{{ options.timing === 'production' ? 'real timing' : 'accelerated timing' }}</span>,
        acknowledgment email <span class="font-semibold text-gray-900">{{ options.sendEmail ? `really sent to ${test.email}` : 'shown only' }}</span>.</p>
      <p v-if="error" role="alert" class="mt-3 text-sm text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
      <ConfirmInline v-if="askKnown" class="mt-3" tone="navy" :title="askKnown" body="Only continue if the address is your own. The email is marked as a test, and a reply to it comes to you."
        confirm-label="It is mine, send the test" :busy="busy" @confirm="$emit('start', true)" @cancel="$emit('dismiss')" />
      <button v-else type="button" :disabled="busy" @click="$emit('start', false)"
        class="mt-3 inline-flex items-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-0 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-xs font-semibold transition-colors disabled:opacity-50">
        <FaIcon :name="busy ? 'spinner' : 'play'" :spin="busy" class="text-[10px]" />Start the automation test
      </button>
    </div>

    <div v-else class="bg-white">
      <!-- What the "client" or the "staff" does next -->
      <div class="px-4 py-3 border-b border-gray-100">
        <p class="text-[11px] font-semibold text-gray-500">Pretend that…</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button v-for="a in actions" :key="a.key" type="button" :disabled="busy || a.disabled" :title="a.hint" @click="$emit('action', a.key)"
            class="inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 min-h-11 sm:min-h-0 rounded-lg ring-1 ring-gray-300 bg-white text-gray-800 hover:bg-brand-surface hover:ring-brand-navy/40 text-xs font-semibold transition-colors disabled:opacity-45 disabled:hover:bg-white">
            <FaIcon :name="a.icon" class="text-[10px] text-gray-500" />{{ a.label }}
          </button>
        </div>
        <p v-if="error" role="alert" class="mt-2.5 text-sm text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
        <p class="mt-2.5 text-[11px] text-gray-500">These change this test only. No lead, reminder, call or booking is touched.</p>
      </div>

      <div class="xl:grid xl:grid-cols-2 xl:divide-x xl:divide-gray-100">
        <!-- The steps -->
        <div class="px-4 py-3">
          <h6 class="text-xs font-semibold text-gray-900">Steps <span class="font-normal text-gray-500">({{ waiting }} waiting)</span></h6>
          <ol class="mt-2 space-y-2.5" aria-live="polite">
            <li v-for="s in steps" :key="s.id" class="flex gap-2.5 text-xs">
              <FaIcon :name="s.icon" :class="TONE[s.tone].icon" class="mt-0.5 w-3.5 shrink-0 text-[11px]" />
              <span class="min-w-0">
                <span class="font-semibold text-gray-900">{{ s.label }}</span>
                <span class="block tabular-nums" :class="TONE[s.tone].text">{{ s.text }}</span>
              </span>
            </li>
          </ol>
        </div>

        <!-- What happened -->
        <div class="px-4 py-3 border-t border-gray-100 xl:border-t-0">
          <h6 class="text-xs font-semibold text-gray-900">Test history</h6>
          <TestEventList :events="run.events" class="mt-1" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, useId } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'
import TestModeBadge from './TestModeBadge.vue'
import TestEventList from './TestEventList.vue'
import { STATUS_LABELS, stepLabel, stepIcon, stepState } from './testAutomationText.js'

const props = defineProps({
  // The open test form, with `automation` (its automation test, or null).
  test: { type: Object, required: true },
  // The choices a new automation test would use.
  options: { type: Object, required: true },
  // The clock the countdowns read.
  now: { type: Number, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  // The question to confirm before a real email goes to an address a lead also has.
  askKnown: { type: String, default: '' },
})
defineEmits(['start', 'action', 'dismiss'])

const uid = useId()
const run = computed(() => props.test.automation)

const TONE = {
  wait: { icon: 'text-amber-600', text: 'text-amber-800 font-semibold' },
  good: { icon: 'text-green-700', text: 'text-green-700 font-semibold' },
  shown: { icon: 'text-brand-navy', text: 'text-gray-700' },
  quiet: { icon: 'text-gray-400', text: 'text-gray-500' },
  bad: { icon: 'text-brand-red', text: 'text-brand-red font-semibold' },
}

const steps = computed(() => run.value.steps.map((s) => ({ id: s.id, icon: stepIcon(s.type), label: stepLabel(s.type), ...stepState(s, { test: props.test, now: props.now }) })))
const waiting = computed(() => run.value.steps.filter((s) => s.state === 'pending' || s.state === 'running').length)

const actions = computed(() => {
  const r = run.value
  const over = !waiting.value
  return [
    { key: 'client_replied', label: 'Client replied', icon: 'comment-dots', disabled: over || Boolean(r.repliedAt), hint: 'The person answered a text: the follow-ups stop, the escalation stays' },
    { key: 'consultation_booked', label: 'Consultation booked', icon: 'calendar-check', disabled: Boolean(r.bookedAt) || r.leadStatus === 'scheduled' || r.leadStatus === 'closed', hint: 'A booking was found on the calendar: everything stops, the test becomes Scheduled' },
    { key: 'mark_contacted', label: 'Mark contacted', icon: 'user-check', disabled: r.leadStatus !== 'new' && r.leadStatus !== 'no_response', hint: 'A person changed the status: everything stops' },
    { key: 'mark_closed', label: 'Mark closed', icon: 'ban', disabled: r.leadStatus === 'closed', hint: 'A person closed it: everything stops' },
    { key: 'run_next', label: 'Run the next step now', icon: 'play', disabled: over, hint: 'Do the next waiting step without waiting for its time' },
  ]
})
</script>
