<template>
  <!-- One call's evidence: what RingCentral recorded, step by step, and why
       the portal reads it as it does. Loaded when the row is opened. -->
  <section :id="id" class="mt-3 rounded-lg bg-gray-50 ring-1 ring-gray-200 px-4 py-3.5 text-[13px] font-ui text-gray-700" data-call-details>
    <p v-if="loading" class="text-gray-600"><FaIcon name="spinner" spin class="mr-1.5" />{{ t('ev.loading') }}</p>
    <p v-else-if="error" role="alert" class="text-brand-red">{{ error }}</p>
    <template v-else-if="ev">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 class="font-ui font-semibold text-gray-900">{{ classLabel(ev.classification, lang) || t('ev.outgoing') }}</h3>
        <p class="text-gray-600">{{ classExplained(ev.classification, lang) || t('ev.outgoing_explained') }}</p>
      </div>
      <p class="mt-1.5 text-gray-600">
        {{ t('ev.rc_result') }}
        <span v-if="ev.rcResults.length" class="font-semibold text-gray-900">{{ ev.rcResults.join(', ') }}</span>
        <span v-else class="text-gray-500">{{ t('ev.none_given') }}</span>
        <span v-if="ev.records > 1">{{ t('ev.records', { count: ev.records }) }}</span>
      </p>

      <div v-if="ev.classification" class="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 class="font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">{{ t('ev.evidence') }}</h4>
          <ul v-if="ev.facts.length || gaps.length" class="mt-1.5 space-y-1 list-disc pl-4 marker:text-gray-400">
            <li v-for="(f, i) in ev.facts" :key="`f${i}`">{{ factText(f, lang) }}</li>
            <li v-for="g in gaps" :key="g" class="text-gray-600">{{ g }}</li>
          </ul>
          <p v-else class="mt-1.5 text-gray-600">{{ t('ev.no_evidence') }}</p>
        </div>
        <div>
          <h4 class="font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">{{ t('ev.offered_to') }} <span class="normal-case tracking-normal font-normal">{{ t('ev.confirmed_by_step') }}</span></h4>
          <ul v-if="ev.offeredTo.length" class="mt-1.5 space-y-1">
            <li v-for="o in ev.offeredTo" :key="o.extensionId || o.extension" class="flex flex-wrap gap-x-2">
              <span class="font-medium text-gray-900">{{ who(o, lang) }}</span>
              <span :class="o.reason === 'Accepted' ? 'text-green-700' : 'text-gray-600'">{{ offerShort(o, lang) }}</span>
            </li>
          </ul>
          <p v-else class="mt-1.5 text-gray-600">{{ t('ev.no_offer') }}</p>
          <h4 class="mt-3 font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">{{ t('ev.answered_by') }}</h4>
          <p class="mt-1" :class="ev.answeredBy ? 'font-medium text-gray-900' : 'text-gray-600'">{{ ev.answeredBy ? who(ev.answeredBy, lang) : t(ev.classification === 'unknown' ? 'ev.not_confirmed' : 'ev.nobody') }}</p>
        </div>
      </div>

      <!-- RingCentral's live events, when the call happened after they were registered. -->
      <template v-if="ev.live">
        <h4 class="mt-4 font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">{{ t('ev.live') }}
          <span class="normal-case tracking-normal font-normal">{{ t(ev.live.complete ? 'ev.live_complete' : 'ev.live_partial', { count: ev.live.events }) }}</span>
        </h4>
        <ul class="mt-1.5 space-y-1.5" data-live-timeline>
          <li v-for="(p, i) in ev.live.parties" :key="p.partyId ?? `party-${i}`" class="rounded-md bg-white ring-1 ring-gray-200 px-3 py-2">
            <p class="flex flex-wrap items-baseline justify-between gap-x-3">
              <span class="font-medium text-gray-900">{{ partyLabel(p, lang) }}<span v-if="p.rcName && p.rcName !== p.name" class="text-gray-500">{{ t('ev.in_rc', { name: p.rcName }) }}</span></span>
              <span v-if="p.person && p.rang" class="text-gray-700">{{ t('ev.rang', { offset: offset(p.rang.from, start) }) }}<template v-if="p.rang.seconds != null">{{ t('ev.rang_for', { seconds: p.rang.seconds }) }}</template></span>
            </p>
            <p class="mt-0.5 text-gray-600">
              <template v-for="(st, i) in p.states" :key="i"><span v-if="i" aria-hidden="true" class="text-gray-400"> → </span><span>{{ stateText(st.code, p, lang) }} {{ offset(st.at, start) }}<template v-if="st.reason"> ({{ st.reason }})</template></span></template>
            </p>
            <p v-if="p.person && p.missedCall && !p.answered" class="mt-0.5 text-gray-600">{{ t('ev.flagged_missed') }}</p>
          </li>
        </ul>
      </template>

      <h4 class="mt-4 font-ui text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">{{ t('ev.steps') }}</h4>
      <p v-if="!ev.steps.length" class="mt-1.5 text-gray-600">{{ ev.hasRaw ? t('ev.no_steps') : gapText('no_record', lang) }}</p>
      <template v-else>
        <!-- Wide screens: a table to scan across. -->
        <div class="hidden md:block mt-1.5 overflow-x-auto">
          <table class="w-full text-left text-[12px]">
            <thead class="text-gray-600">
              <tr class="border-b border-gray-200">
                <th scope="col" class="py-1.5 pr-3 font-semibold">{{ t('ev.col.when') }}</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">{{ t('ev.col.to') }}</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">{{ t('ev.col.leg') }}</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">{{ t('ev.col.result') }}</th>
                <th scope="col" class="py-1.5 pr-3 font-semibold">{{ t('ev.col.reason') }}</th>
                <th scope="col" class="py-1.5 font-semibold text-right">{{ t('ev.col.length') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in ev.steps" :key="i" class="border-b border-gray-100 last:border-0 align-top">
                <td class="py-1.5 pr-3 tabular-nums text-gray-600 whitespace-nowrap">{{ s.level === 'record' ? t('ev.whole_call') : offset(s.at, start) }}</td>
                <td class="py-1.5 pr-3 text-gray-900">{{ stepTarget(s.to, lang) }}<span v-if="s.master" class="text-gray-500">{{ t('ev.master') }}</span></td>
                <td class="py-1.5 pr-3 font-mono text-[11px] text-gray-700">{{ s.legType || '—' }}</td>
                <td class="py-1.5 pr-3 text-gray-700">{{ s.result || '—' }}</td>
                <td class="py-1.5 pr-3">
                  <span v-if="s.reason" class="font-semibold text-gray-900">{{ s.reason }}</span><span v-else class="text-gray-500">{{ t('ev.none') }}</span>
                  <span v-if="s.reasonMeaning" class="text-gray-600"> · “{{ s.reasonMeaning }}”</span>
                  <span v-if="s.reasonDescription" class="block text-gray-600">{{ t('ev.detail', { detail: s.reasonDescription }) }}</span>
                  <span v-if="s.voicemailMessage" class="block text-amber-800">{{ t('ev.voicemail_attached') }}</span>
                </td>
                <td class="py-1.5 tabular-nums text-right text-gray-600 whitespace-nowrap">{{ s.seconds ? `${s.seconds}s` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Phones: the same steps, one block each. -->
        <ol class="md:hidden mt-1.5 space-y-2">
          <li v-for="(s, i) in ev.steps" :key="i" class="rounded-md bg-white ring-1 ring-gray-200 px-3 py-2">
            <p class="flex justify-between gap-2"><span class="font-medium text-gray-900">{{ stepTarget(s.to, lang) }}</span><span class="tabular-nums text-gray-600 whitespace-nowrap">{{ s.level === 'record' ? t('ev.whole_call') : offset(s.at, start) }}</span></p>
            <p class="mt-0.5 text-gray-700">
              <span v-if="s.reason" class="font-semibold">{{ s.reason }}</span><span v-else class="text-gray-500">{{ t('ev.no_reason') }}</span>
              <span class="text-gray-600">{{ t('ev.result', { result: s.result || t('ev.none') }) }}<template v-if="s.legType"> · {{ s.legType }}</template><template v-if="s.seconds"> · {{ s.seconds }}s</template></span>
            </p>
            <p v-if="s.reasonMeaning" class="mt-0.5 text-gray-600">“{{ s.reasonMeaning }}”</p>
            <p v-if="s.reasonDescription" class="mt-0.5 text-gray-600">{{ t('ev.detail', { detail: s.reasonDescription }) }}</p>
            <p v-if="s.voicemailMessage" class="mt-0.5 text-amber-800">{{ t('ev.voicemail_attached') }}</p>
          </li>
        </ol>
      </template>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useApi, latestOnly } from '../../composables/useApi.js'
import FaIcon from '../../components/FaIcon.vue'
import { classLabel, classExplained, gapLines, gapText, who, stepTarget, offerShort, factText, offset, stateText, partyLabel } from './callEvidenceText.js'
import { useT } from '../../i18n/translator.js'
import { CALLS } from '../../i18n/calls.js'

const props = defineProps({
  callId: { type: Number, required: true },
  start: { type: String, required: true },
  id: { type: String, required: true },
  // Changes whenever the call list is re-read (the call object itself): the
  // open evidence is re-read with it, so live events that arrived since show.
  reloadKey: { type: [Object, String, Number], default: null },
})

const { get } = useApi()
const { t, lang } = useT(CALLS)
const ev = ref(null)
const loading = ref(true)
const error = ref('')
const gaps = computed(() => gapLines(ev.value?.gaps, lang.value))

// Only the newest answer paints (a re-read can overlap the first load).
const latest = latestOnly()
async function load({ quiet = false } = {}) {
  if (!quiet) { loading.value = true; error.value = '' }
  try {
    const r = await latest(() => get(`/api/calls/${props.callId}/evidence`))
    if (!r.current) return
    ev.value = r.value
    error.value = ''
  } catch (e) {
    // A failed background re-read keeps what is on screen.
    if (!quiet || !ev.value) error.value = e.message || t('ev.error')
  } finally {
    if (!quiet) loading.value = false
  }
}
onMounted(() => load())
watch(() => props.callId, () => { ev.value = null; load() })
watch(() => props.reloadKey, () => { if (!loading.value) load({ quiet: true }) })
</script>
