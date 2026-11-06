<template>
  <!-- One call's evidence: what RingCentral recorded, step by step, and why
       the portal reads it as it does. Loaded when the row is opened. -->
  <section :id="id" class="mt-3 rounded-lg bg-gray-50 ring-1 ring-gray-200 px-4 py-3.5 text-[13px] font-ui text-gray-700" data-call-details>
    <p v-if="loading" class="text-gray-600"><FaIcon name="spinner" spin class="mr-1.5" />Loading what RingCentral recorded…</p>
    <p v-else-if="error" role="alert" class="text-brand-red">{{ error }}</p>
    <template v-else-if="ev">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 class="font-ui font-semibold text-gray-900">{{ CLASS_LABEL[ev.classification] || 'Outgoing call' }}</h3>
        <p class="text-gray-600">{{ CLASS_EXPLAINED[ev.classification] || 'Outgoing calls keep RingCentral’s own result.' }}</p>
      </div>
      <p class="mt-1.5 text-gray-600">
        RingCentral’s own result:
        <span v-if="ev.rcResults.length" class="font-semibold text-gray-900">{{ ev.rcResults.join(', ') }}</span>
        <span v-else class="text-gray-500">none given</span>
        <span v-if="ev.records > 1"> · {{ ev.records }} RingCentral records for this one call, read together and counted once</span>
      </p>

      <div v-if="ev.classification" class="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 class="font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Evidence</h4>
          <ul v-if="ev.facts.length || gaps.length" class="mt-1.5 space-y-1 list-disc pl-4 marker:text-gray-400">
            <li v-for="(f, i) in ev.facts" :key="`f${i}`">{{ factText(f) }}</li>
            <li v-for="g in gaps" :key="g" class="text-gray-600">{{ g }}</li>
          </ul>
          <p v-else class="mt-1.5 text-gray-600">Nothing RingCentral documents settles how this call ended.</p>
        </div>
        <div>
          <h4 class="font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Offered to <span class="normal-case tracking-normal font-normal">(confirmed by a step)</span></h4>
          <ul v-if="ev.offeredTo.length" class="mt-1.5 space-y-1">
            <li v-for="o in ev.offeredTo" :key="o.extensionId || o.extension" class="flex flex-wrap gap-x-2">
              <span class="font-medium text-gray-900">{{ who(o) }}</span>
              <span :class="o.reason === 'Accepted' ? 'text-green-700' : 'text-gray-600'">{{ offerShort(o) }}</span>
            </li>
          </ul>
          <p v-else class="mt-1.5 text-gray-600">No step shows the call offered to a person. That does not prove nobody was rung.</p>
          <h4 class="mt-3 font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Answered by</h4>
          <p class="mt-1" :class="ev.answeredBy ? 'font-medium text-gray-900' : 'text-gray-600'">{{ ev.answeredBy ? who(ev.answeredBy) : ev.classification === 'unknown' ? 'Not confirmed: see the evidence' : 'Nobody, as far as RingCentral’s record shows' }}</p>
        </div>
      </div>

      <!-- RingCentral's live events, when the call happened after they were registered. -->
      <template v-if="ev.live">
        <h4 class="mt-4 font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">What happened live
          <span class="normal-case tracking-normal font-normal">({{ ev.live.events }} events from RingCentral{{ ev.live.complete ? ', followed to the end' : ', not all seen to the end' }})</span>
        </h4>
        <ul class="mt-1.5 space-y-1.5" data-live-timeline>
          <li v-for="p in ev.live.parties" :key="p.extensionId || p.name" class="rounded-md bg-white ring-1 ring-gray-200 px-3 py-2">
            <p class="flex flex-wrap items-baseline justify-between gap-x-3">
              <span class="font-medium text-gray-900">{{ partyLabel(p) }}<span v-if="p.rcName && p.rcName !== p.name" class="text-gray-500"> · “{{ p.rcName }}” in RingCentral</span></span>
              <span v-if="p.person && p.rang" class="text-gray-700">rang {{ offset(p.rang.from, start) }}<template v-if="p.rang.seconds != null"> for {{ p.rang.seconds }}s</template></span>
            </p>
            <p class="mt-0.5 text-gray-600">
              <template v-for="(st, i) in p.states" :key="i"><span v-if="i" aria-hidden="true" class="text-gray-400"> → </span><span>{{ stateText(st.code, p) }} {{ offset(st.at, start) }}<template v-if="st.reason"> ({{ st.reason }})</template></span></template>
            </p>
            <p v-if="p.person && p.missedCall && !p.answered" class="mt-0.5 text-gray-600">RingCentral flagged it as missed on this phone. The flag is shown but not counted against anyone: RingCentral does not document what sets it.</p>
          </li>
        </ul>
      </template>

      <h4 class="mt-4 font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">What RingCentral recorded, in order</h4>
      <p v-if="!ev.steps.length" class="mt-1.5 text-gray-600">{{ ev.hasRaw ? 'No steps were recorded.' : 'This call was imported before RingCentral’s full record was kept.' }}</p>
      <template v-else>
        <!-- Wide screens: a table to scan across. -->
        <div class="hidden md:block mt-1.5 overflow-x-auto">
          <table class="w-full text-left text-[12px]">
            <thead class="text-gray-600">
              <tr class="border-b border-gray-200">
                <th scope="col" class="py-1.5 pr-3 font-semibold">When</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">Went to</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">Leg type</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">Result</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">Reason, and what RingCentral says it means</th>
                <th scope="col" class="py-1.5 font-semibold text-right">Length</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in ev.steps" :key="i" class="border-b border-gray-100 last:border-0 align-top">
                <td class="py-1.5 pr-3 tabular-nums text-gray-600 whitespace-nowrap">{{ s.level === 'record' ? 'Whole call' : offset(s.at, start) }}</td>
                <td class="py-1.5 pr-3 text-gray-900">{{ stepTarget(s.to) }}<span v-if="s.master" class="text-gray-500"> · master</span></td>
                <td class="py-1.5 pr-3 font-mono text-[11px] text-gray-700">{{ s.legType || '—' }}</td>
                <td class="py-1.5 pr-3 text-gray-700">{{ s.result || '—' }}</td>
                <td class="py-1.5 pr-3">
                  <span v-if="s.reason" class="font-semibold text-gray-900">{{ s.reason }}</span><span v-else class="text-gray-500">none</span>
                  <span v-if="s.reasonMeaning" class="text-gray-600"> · “{{ s.reasonMeaning }}”</span>
                  <span v-if="s.reasonDescription" class="block text-gray-600">Detail: {{ s.reasonDescription }}</span>
                  <span v-if="s.voicemailMessage" class="block text-amber-800">Voicemail message attached</span>
                </td>
                <td class="py-1.5 tabular-nums text-right text-gray-600 whitespace-nowrap">{{ s.seconds ? `${s.seconds}s` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Phones: the same steps, one block each. -->
        <ol class="md:hidden mt-1.5 space-y-2">
          <li v-for="(s, i) in ev.steps" :key="i" class="rounded-md bg-white ring-1 ring-gray-200 px-3 py-2">
            <p class="flex justify-between gap-2"><span class="font-medium text-gray-900">{{ stepTarget(s.to) }}</span><span class="tabular-nums text-gray-600 whitespace-nowrap">{{ s.level === 'record' ? 'Whole call' : offset(s.at, start) }}</span></p>
            <p class="mt-0.5 text-gray-700">
              <span v-if="s.reason" class="font-semibold">{{ s.reason }}</span><span v-else class="text-gray-500">No reason</span>
              <span class="text-gray-600"> · result {{ s.result || 'none' }}<template v-if="s.legType"> · {{ s.legType }}</template><template v-if="s.seconds"> · {{ s.seconds }}s</template></span>
            </p>
            <p v-if="s.reasonMeaning" class="mt-0.5 text-gray-600">“{{ s.reasonMeaning }}”</p>
            <p v-if="s.reasonDescription" class="mt-0.5 text-gray-600">Detail: {{ s.reasonDescription }}</p>
            <p v-if="s.voicemailMessage" class="mt-0.5 text-amber-800">Voicemail message attached</p>
          </li>
        </ol>
      </template>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi.js'
import FaIcon from '../../components/FaIcon.vue'
import { CLASS_LABEL, CLASS_EXPLAINED, gapLines, who, stepTarget, offerShort, factText, offset, stateText, partyLabel } from './callEvidenceText.js'

const props = defineProps({
  callId: { type: Number, required: true },
  start: { type: String, required: true },
  id: { type: String, required: true },
})

const { get } = useApi()
const ev = ref(null)
const loading = ref(true)
const error = ref('')
const gaps = computed(() => gapLines(ev.value?.gaps))

onMounted(async () => {
  try {
    ev.value = await get(`/api/calls/${props.callId}/evidence`)
  } catch (e) {
    error.value = e.message || 'Could not load this call’s details.'
  } finally {
    loading.value = false
  }
})
</script>
