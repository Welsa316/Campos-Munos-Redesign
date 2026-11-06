<template>
  <!-- Everything the portal knows about this number, newest first: calls,
       website enquiries, email replies and notes. A website lead with the
       same number is a possible match until someone says it is the same
       person; marked as someone else, it leaves this history. -->
  <div class="font-ui" data-contact-history>
    <h3 class="label">Contact history</h3>
    <p v-if="!hasNumber && loaded" class="mt-2 text-[13px] text-gray-600">The number was withheld, so there is nothing to match this call with.</p>
    <p v-else-if="loading && !events.length" class="mt-2 text-[13px] text-gray-500"><FaIcon name="spinner" spin class="mr-1.5" />Loading…</p>
    <p v-else-if="error && !events.length" class="mt-2 text-[13px] text-gray-600">Could not load the history. <button type="button" class="font-semibold text-brand-navy underline" @click="load()">Try again</button></p>
    <template v-else>
      <!-- Different people on one number (a family phone): named, never merged. -->
      <div v-if="undecided.length" class="mt-2 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-3.5 py-3 text-[13px] text-gray-800">
        <p class="font-semibold text-gray-900">{{ undecided.length === 1 ? 'A website lead uses this number' : `${undecided.length} website leads use this number` }}</p>
        <p class="mt-0.5 text-gray-700">The same number does not always mean the same person. Say who it is, so the history only shows them.</p>
        <ul class="mt-2 space-y-2">
          <li v-for="m in undecided" :key="m.key" class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span class="min-w-0"><span class="font-semibold">{{ m.name || 'No name' }}</span><span v-if="m.email" class="text-gray-600"> · {{ m.email }}</span></span>
            <span v-if="canDecide" class="flex gap-1.5">
              <button type="button" class="mbtn" :disabled="deciding" @click="decide(m, 'confirmed')">Same person</button>
              <button type="button" class="mbtn" :disabled="deciding" @click="decide(m, 'rejected')">Someone else</button>
            </span>
          </li>
        </ul>
      </div>

      <p v-if="!events.length" class="mt-2 text-[13px] text-gray-600">Nothing else yet.</p>
      <ol v-else class="mt-2 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
        <li v-for="e in events" :key="e.id" :class="isCurrent(e) ? 'bg-gray-50' : ''">
          <component :is="linkFor(e) ? (linkFor(e).to ? 'router-link' : 'button') : 'div'" v-bind="linkFor(e)?.to ? { to: linkFor(e).to } : linkFor(e) ? { type: 'button' } : {}"
            class="w-full px-3.5 py-2.5 flex items-start gap-3 text-left text-[13px]" :class="linkFor(e) ? 'hover:bg-gray-50' : ''"
            @click="linkFor(e)?.call ? $emit('open-call', e.callId) : null">
            <FaIcon :name="HISTORY_ICON[e.type] || 'circle-info'" class="mt-0.5 text-gray-500 w-4" />
            <span class="min-w-0 flex-1">
              <span class="text-gray-900">{{ historyLine(e, consultationLabel) }}</span>
              <span v-if="isCurrent(e)" class="text-gray-500"> · this call</span>
              <span v-if="e.type === 'submission' && e.name" class="block text-[12px] text-gray-600">{{ e.name }}<template v-if="possibleMatch(e)"> · same number, not confirmed as this person</template></span>
              <span class="block text-[11.5px] text-gray-500">{{ e.source }}</span>
            </span>
            <time :datetime="e.at" class="text-gray-500 tabular-nums whitespace-nowrap">{{ when(e.at) }}</time>
          </component>
        </li>
      </ol>
      <button v-if="more" type="button" class="mt-2 inline-flex items-center gap-1.5 min-h-10 text-[13px] font-semibold text-brand-navy hover:underline" :disabled="loading" @click="load({ older: true })">
        <FaIcon v-if="loading" name="spinner" spin />Show older
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useApi } from '../../composables/useApi.js'
import { can } from '../../composables/useAuth.js'
import { toast } from '../../composables/useToast.js'
import FaIcon from '../../components/FaIcon.vue'
import { when } from '../calls/callsInbox.js'
import { historyLine, possibleMatch, olderPageParam, HISTORY_ICON } from './historyText.js'
import { consultationLabel } from '../../data/consultationTypes.js'

const props = defineProps({
  // One of the two: the history of this call's number, or this lead's.
  callId: { type: Number, default: null },
  submissionId: { type: Number, default: null },
})
defineEmits(['open-call'])
const { get, put } = useApi()

const events = ref([])
const matches = ref([])
const hasNumber = ref(true)
const more = ref(false)
// The last page's cursor for the next older one (absent from an older API).
let next = null
const loading = ref(false)
const loaded = ref(false)
const error = ref(false)
const deciding = ref(false)
const canDecide = computed(() => can('crm.view') && (can('calls.exclude') || can('crm.manage')))

const query = () => (props.callId ? `callId=${props.callId}` : `submissionId=${props.submissionId}`)
async function load({ older = false } = {}) {
  loading.value = true
  error.value = false
  try {
    const page = older ? olderPageParam(next, events.value) : ''
    const r = await get(`/api/contacts/history?${query()}&limit=20${page}`)
    events.value = older ? [...events.value, ...r.events.filter((e) => !events.value.some((x) => x.id === e.id))] : r.events
    next = r.next || null
    more.value = r.more
    hasNumber.value = r.hasNumber
    matches.value = r.matches || []
    loaded.value = true
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
watch(() => [props.callId, props.submissionId], () => { events.value = []; next = null; load() }, { immediate: true })
defineExpose({ reload: () => load() })

// A person counts as undecided while any of their leads is.
const undecided = computed(() => matches.value
  .filter((m) => m.submissions.some((s) => s.state === 'possible'))
  .map((m) => ({ ...m, key: m.email || m.name })))

async function decide(m, state) {
  deciding.value = true
  try {
    for (const s of m.submissions) {
      await put('/api/contacts/matches', { ...(props.callId ? { callId: props.callId } : { submissionId: props.submissionId }), lead: s.id, state })
    }
    toast(state === 'confirmed' ? `${m.name || 'The lead'} is linked to this number.` : `${m.name || 'The lead'} is set aside as someone else.`)
    await load()
  } catch (e) {
    toast({ text: `That was not saved: ${e.message}`, tone: 'error' })
  } finally {
    deciding.value = false
  }
}

const isCurrent = (e) => (props.callId && e.callId === props.callId) || (props.submissionId && e.type === 'submission' && e.submissionId === props.submissionId)
// Calls open in place; website events open the lead in Messages.
function linkFor(e) {
  if (isCurrent(e)) return null
  if (e.type === 'call' && props.callId) return { call: true }
  if (e.submissionId && can('crm.view')) return { to: { name: 'Inbox', query: { lead: e.submissionId } } }
  return null
}
</script>

<style scoped>
.label { font-family: var(--font-ui); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.mbtn { min-height: 36px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; font-weight: 600; background: var(--surface); color: var(--text-strong); box-shadow: inset 0 0 0 1px var(--border); }
.mbtn:hover:not(:disabled) { background: var(--surface-hover); }
.mbtn:disabled { opacity: 0.55; }
</style>
