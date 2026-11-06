<template>
  <!-- One caller's unanswered calls (a callback episode), oldest first, each
       with what RingCentral recorded for it. Shown in the call's detail card
       when there is more than one. -->
  <div>
    <h3 class="label">{{ heading }}</h3>
    <p class="mt-1 text-[12.5px] text-gray-600">{{ episode.kind === 'review' ? 'Marking handled closes all of them.' : 'They count as one caller to call back. Marking handled closes all of them; each call keeps its own record.' }}</p>
    <ol class="mt-2 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
      <li v-for="(c, i) in episode.calls" :key="c.id" class="px-3.5 py-2.5 text-[13px]">
        <div class="flex items-start gap-3">
          <span class="mt-px w-5 flex-shrink-0 text-gray-500 tabular-nums" aria-hidden="true">{{ i + 1 }}.</span>
          <span class="min-w-0 flex-1 text-gray-800">{{ statusLine(c) }}</span>
          <span class="text-gray-500 tabular-nums whitespace-nowrap">{{ when(c.startedAt, now) }}</span>
        </div>
        <button type="button" @click="toggle(c.id)" :aria-expanded="open.has(c.id)" :aria-controls="`episode-evidence-${c.id}`"
          class="ml-8 mt-0.5 inline-flex items-center gap-2 min-h-11 sm:min-h-9 text-[12.5px] font-semibold text-brand-navy hover:underline">
          <FaIcon :name="open.has(c.id) ? 'chevron-up' : 'chevron-down'" class="text-[10px]" />What RingCentral recorded<span class="sr-only"> for the call at {{ when(c.startedAt, now) }}</span>
        </button>
        <CallDetails v-if="open.has(c.id)" :id="`episode-evidence-${c.id}`" :call-id="c.id" :start="String(c.startedAt)" :reload-key="c" class="ml-8 !mt-1" />
      </li>
    </ol>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import CallDetails from './CallDetails.vue'
import { statusLine } from './callEvidenceText.js'
import { when } from './callsInbox.js'

const props = defineProps({
  // { id, kind, attempts, calls: [call, ...] } (calls oldest first).
  episode: { type: Object, required: true },
  now: { type: Number, required: true },
})

const heading = computed(() => `${props.episode.calls.length} ${props.episode.kind === 'review' ? 'calls with no recorded outcome' : 'unanswered calls'}`)

// Which calls show their evidence; a different caller starts with all closed.
const open = ref(new Set())
watch(() => props.episode.id, () => { open.value = new Set() })
function toggle(id) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}
</script>

<style scoped>
.label { font-family: var(--font-ui); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
</style>
