<template>
  <!-- The test history as lines; a message that was sent or shown opens in place. -->
  <ol class="divide-y divide-gray-100">
    <li v-for="e in lines" :key="e.id" class="py-2.5 flex gap-2.5 text-xs">
      <FaIcon :name="e.icon" :class="TONE[e.tone]" class="mt-0.5 w-3.5 shrink-0 text-[11px]" />
      <div class="min-w-0 flex-1">
        <p class="text-gray-900">
          <button v-if="showTest && e.testId" type="button" class="font-semibold text-brand-navy hover:underline" @click="$emit('open', e.testId)">{{ e.testName || `Test ${e.testId}` }}</button>
          <span v-if="showTest && e.testId" class="text-gray-500"> · </span>
          <span class="font-semibold">{{ e.title }}</span>
        </p>
        <p v-if="e.note" class="text-gray-600 mt-0.5">{{ e.note }}</p>
        <details v-if="e.preview" class="mt-1.5 group">
          <summary class="inline-flex items-center gap-1 py-2 sm:py-0.5 cursor-pointer text-brand-navy font-semibold select-none">
            <FaIcon name="chevron-right" class="text-[8px] transition-transform group-open:rotate-90" />{{ e.tone === 'good' ? 'What was sent' : 'What it would say' }}
          </summary>
          <div class="mt-1.5 rounded-lg ring-1 ring-gray-200 bg-brand-surface px-3 py-2.5">
            <p v-if="e.preview.to" class="text-[11px] text-gray-500">To {{ e.preview.to }}</p>
            <p v-if="e.preview.subject" class="font-semibold text-gray-900 break-words">{{ e.preview.subject }}</p>
            <p class="mt-1 text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{{ e.preview.body }}</p>
          </div>
        </details>
      </div>
      <time :datetime="e.at" class="shrink-0 text-[11px] text-gray-500 tabular-nums" :title="full(e.at)">{{ clock(e.at) }}</time>
    </li>
  </ol>
</template>

<script setup>
import { computed } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import { eventLine } from './testAutomationText.js'

const props = defineProps({
  events: { type: Array, required: true },
  // The history of every test: each line names its test.
  showTest: { type: Boolean, default: false },
})
defineEmits(['open'])

const TONE = { good: 'text-green-700', shown: 'text-brand-navy', quiet: 'text-gray-500', bad: 'text-brand-red' }
const lines = computed(() => props.events.map((e) => ({ id: e.id, at: e.at, testId: e.testId, testName: e.testName, ...eventLine(e) })))
const clock = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const full = (d) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
</script>
