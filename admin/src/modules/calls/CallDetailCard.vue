<template>
  <!-- One call, opened from its row: a card that rises over the list on a
       wide screen and a sheet from the bottom on a phone (the Modal Cards
       behaviour). Who called, what happened, what is left to do, the
       number's other calls, and what RingCentral recorded. The list behind
       keeps its scroll position. -->
  <Teleport to="body">
    <Transition name="card-backdrop">
      <div v-if="call" class="fixed inset-0 z-[190] scrim" aria-hidden="true" @click="close"></div>
    </Transition>
    <Transition name="card" @after-enter="focusHeading">
      <div v-if="call" class="fixed inset-x-0 bottom-0 z-[200] flex justify-center pointer-events-none sm:inset-0 sm:items-center sm:p-6"
        @keydown.tab="trapFocus">
        <section ref="cardRef" role="dialog" aria-modal="true" :aria-labelledby="`call-card-title-${call.id}`"
          class="call-card pointer-events-auto relative w-full sm:max-w-[640px] max-h-[88dvh] sm:max-h-[min(760px,calc(100dvh-3rem))] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl ring-1 ring-gray-200 font-ui pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div class="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-gray-300" aria-hidden="true"></div>
          <header class="sticky top-0 z-10 bg-white px-5 sm:px-6 pt-4 sm:pt-5 pb-4 border-b border-gray-100 flex items-start gap-3">
            <span :class="call.exclusion ? 'bg-gray-100 text-gray-500' : look.badge"
              class="w-10 h-10 flex-shrink-0 rounded-full inline-flex items-center justify-center" :title="look.label">
              <FaIcon :name="look.icon" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 :id="`call-card-title-${call.id}`" ref="headingRef" tabindex="-1" class="font-ui text-[18px] font-semibold tracking-tight text-gray-900 outline-none truncate">{{ displayName }}</h2>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-600">
                <a v-if="call.number" :href="telHref(call.number)" class="tabular-nums hover:text-brand-navy hover:underline">{{ phone(call.number) }}</a>
                <span v-else>Number withheld</span>
                <span v-if="call.fromFirm" class="tag bg-gray-100 text-gray-700">Firm</span>
                <span v-else-if="call.client" class="tag bg-brand-navy/10 text-brand-navy">Client</span>
                <span v-else-if="call.lead" class="tag bg-amber-100 text-amber-900">Website lead</span>
              </p>
            </div>
            <button type="button" @click="close" aria-label="Close call details"
              class="w-11 h-11 -mr-2 -mt-1.5 flex-shrink-0 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 inline-flex items-center justify-center">
              <FaIcon name="xmark" />
            </button>
          </header>

          <div class="px-5 sm:px-6 py-5 space-y-5">
            <!-- What happened: the evidence wording, unchanged from the row. -->
            <div>
              <h3 class="label">What happened</h3>
              <p class="mt-1.5 text-[14px] text-gray-900">{{ status }}</p>
              <p class="mt-1 text-[12.5px] text-gray-600 tabular-nums">
                {{ fullDate }} · {{ call.direction === 'inbound' ? 'incoming' : 'outgoing' }} · {{ durationText(call.durationSeconds) }}
              </p>
            </div>

            <!-- What is left to do. -->
            <div v-if="call.direction === 'inbound'" :class="BOX[line?.tone || 'quiet']" class="rounded-xl px-4 py-3.5">
              <h3 class="label">Follow-up</h3>
              <p v-if="call.exclusion" class="mt-1.5 text-[13.5px] text-gray-800">
                No callback needed · {{ exclusionLabel(call.exclusion.reason) }}. {{ exclusionDetail }}.
              </p>
              <p v-else class="mt-1.5 text-[13.5px] text-gray-800">{{ detail }}</p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button v-if="canCall && call.number" type="button" @click="$emit('callback', call)"
                  :class="call.needsAttention ? 'btn-call' : 'btn-quiet'" class="btn">
                  <FaIcon name="phone" />{{ call.needsAttention ? 'Call back' : 'Call' }}
                </button>
                <button v-if="canExclude && call.needsAttention" type="button" @click="$emit('handled', call)" :disabled="busy" :aria-busy="busy" class="btn btn-quiet">
                  <FaIcon :name="busy ? 'spinner' : 'check'" :spin="busy" />{{ busy ? 'Saving…' : 'Mark handled' }}
                </button>
                <button v-if="canExclude && call.handled" type="button" @click="$emit('reopen', call)" :disabled="busy" class="btn btn-quiet">
                  <FaIcon name="rotate-left" />Reopen follow-up
                </button>
                <button v-if="canExclude && canMark && !call.exclusion && !call.handled" type="button" @click="$emit('exclude', call)" class="btn btn-quiet">
                  <FaIcon name="ban" />No callback needed
                </button>
                <button v-if="canExclude && call.exclusion" type="button" @click="$emit('count-again', call)" :disabled="busy" class="btn btn-quiet">
                  <FaIcon name="rotate-left" />{{ call.exclusion.scope === 'number' ? 'Count this number again' : 'Count it again' }}
                </button>
                <router-link v-if="call.lead && canSeeLeads" :to="{ name: 'Inbox', query: { lead: call.lead.id } }" class="btn btn-quiet">
                  <FaIcon name="inbox" />Website lead<span v-if="call.lead.matches > 1" class="text-gray-500">· {{ call.lead.matches }}</span>
                </router-link>
              </div>
            </div>
            <div v-else-if="canCall && call.number">
              <button type="button" @click="$emit('callback', call)" class="btn btn-quiet"><FaIcon name="phone" />Call</button>
            </div>

            <!-- The number's other calls, last 90 days. -->
            <div v-if="call.number">
              <h3 class="label">Other calls with this number <span class="font-normal normal-case tracking-normal">· last 90 days</span></h3>
              <p v-if="history === null" class="mt-2 text-[13px] text-gray-500"><FaIcon name="spinner" spin class="mr-1.5" />Loading…</p>
              <p v-else-if="history.error" class="mt-2 text-[13px] text-gray-600">Could not load them.</p>
              <p v-else-if="!history.calls.length" class="mt-2 text-[13px] text-gray-600">None.</p>
              <ul v-else class="mt-2 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
                <li v-for="h in history.calls" :key="h.id" class="px-3.5 py-2.5 flex items-start gap-3 text-[13px]">
                  <FaIcon :name="lookOf(h).icon" class="mt-0.5 text-gray-500" />
                  <span class="min-w-0 flex-1 text-gray-800">{{ h.direction === 'inbound' ? statusLine(h) : outboundLine(h) }}</span>
                  <span class="text-gray-500 tabular-nums whitespace-nowrap">{{ when(h.startedAt, now) }}</span>
                </li>
              </ul>
              <p v-if="history?.more" class="mt-1.5 text-[12px] text-gray-500">Showing the latest {{ history.calls.length }}. Search the number in All calls for the rest.</p>
            </div>

            <!-- RingCentral's own record, step by step: there for anyone who
                 needs to check, out of the way otherwise. -->
            <div v-if="call.direction === 'inbound'">
              <button type="button" @click="showEvidence = !showEvidence" :aria-expanded="showEvidence" :aria-controls="`call-evidence-${call.id}`"
                class="inline-flex items-center gap-2 min-h-11 text-[13px] font-semibold text-brand-navy hover:underline">
                <FaIcon :name="showEvidence ? 'chevron-up' : 'chevron-down'" class="text-[10px]" />What RingCentral recorded
              </button>
              <CallDetails v-if="showEvidence" :id="`call-evidence-${call.id}`" :call-id="call.id" :start="String(call.startedAt)" :reload-key="call" class="!mt-1" />
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onDeactivated } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import CallDetails from './CallDetails.vue'
import { useApi } from '../../composables/useApi.js'
import { telHref } from '../../utils/phone.js'
import { statusLine } from './callEvidenceText.js'
import { followUpLine, followUpDetail, outboundLine, when } from './callsInbox.js'
import { look as lookOf, phone, durationText } from './callLook.js'
import { exclusionLabel } from './exclusionReasons.js'

const props = defineProps({
  call: { type: Object, default: null },
  // Where focus goes back to when the card closes (the row's name).
  returnTo: { type: Object, default: null },
  now: { type: Number, required: true },
  canCall: Boolean,
  canExclude: Boolean,
  canSeeLeads: Boolean,
  canMark: Boolean,
  busy: Boolean,
})
const emit = defineEmits(['close', 'callback', 'handled', 'reopen', 'exclude', 'count-again'])

const { get } = useApi()
const cardRef = ref(null)
const headingRef = ref(null)
const showEvidence = ref(false)
const history = ref(null)

const look = computed(() => lookOf(props.call))
const displayName = computed(() => props.call.name || (props.call.number ? 'Unknown caller' : 'Private number'))
const status = computed(() => (props.call.direction === 'inbound' ? statusLine(props.call) : outboundLine(props.call)))
const line = computed(() => followUpLine(props.call, props.now))
const detail = computed(() => followUpDetail(props.call, props.now) || 'Nothing to follow up.')
const fullDate = computed(() => new Date(props.call.startedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
const exclusionDetail = computed(() => {
  const e = props.call.exclusion
  const parts = []
  if (e.note) parts.push(e.note)
  if (e.scope === 'number') parts.push('Every call from this number')
  parts.push(`Marked by ${e.by || 'a former user'}, ${new Date(e.at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })}`)
  return parts.join(' · ')
})
const BOX = { open: 'bg-amber-50 ring-1 ring-amber-200', done: 'bg-green-50 ring-1 ring-green-200', quiet: 'bg-gray-50 ring-1 ring-gray-200' }

// A different call (or the same one re-read) keeps the card; a new call
// starts with the evidence closed and its own history.
let loadedFor = null
watch(() => props.call, async (c) => {
  if (!c) { loadedFor = null; return }
  if (loadedFor === c.id) return
  loadedFor = c.id
  showEvidence.value = false
  history.value = null
  if (!c.number) return
  try {
    const params = new URLSearchParams({
      from: new Date(Date.now() - 90 * 864e5).toISOString(),
      to: new Date(Date.now() + 60 * 1000).toISOString(),
      q: c.number.replace(/\D/g, ''),
      limit: '11',
    })
    const data = await get(`/api/calls?${params}`)
    if (loadedFor !== c.id) return
    const others = (data.calls || []).filter((h) => h.id !== c.id)
    history.value = { calls: others.slice(0, 10), more: others.length > 10 || data.truncated }
  } catch {
    if (loadedFor === c.id) history.value = { error: true }
  }
}, { immediate: true })

function focusHeading() { headingRef.value?.focus({ preventScroll: true }) }
// The card is in the page before its entrance finishes; focus it at once
// rather than waiting for the animation (and for reduced motion).
watch(() => props.call?.id, (id) => { if (id) nextTick(focusHeading) })

// Escape closes the card wherever focus is (it is the topmost layer).
function onKey(e) { if (e.key === 'Escape' && props.call) { e.preventDefault(); e.stopImmediatePropagation(); close() } }
watch(() => Boolean(props.call), (open) => {
  if (open) document.addEventListener('keydown', onKey, true)
  else document.removeEventListener('keydown', onKey, true)
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))
onDeactivated(() => { if (props.call) close() })

function close() {
  emit('close')
  const back = props.returnTo
  nextTick(() => { if (back?.isConnected) back.focus({ preventScroll: true }) })
}

function trapFocus(e) {
  const nodes = cardRef.value?.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
  if (!nodes?.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.value)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
</script>

<style scoped>
.label { font-family: var(--font-ui); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 4px; }
.btn { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 10px; font-size: 13px; font-weight: 600; transition: background-color 160ms ease, color 160ms ease; }
@media (min-width: 640px) { .btn { min-height: 38px; } }
.btn:disabled { opacity: 0.6; cursor: progress; }
.btn-call { background: var(--success-solid); color: #fff; }
.btn-call:hover { background: color-mix(in srgb, var(--success-solid) 86%, #000); }
.btn-quiet { background: var(--surface); color: var(--text-strong); box-shadow: inset 0 0 0 1px var(--border); }
.btn-quiet:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }

/* Entrance: rises and settles on a wide screen, slides up from the bottom on
   a phone. Opacity only with reduced motion. */
.card-backdrop-enter-active, .card-backdrop-leave-active { transition: opacity 260ms ease; }
.card-backdrop-enter-from, .card-backdrop-leave-to { opacity: 0; }
.card-enter-active { transition: opacity 260ms ease, transform 380ms cubic-bezier(0.22, 1, 0.36, 1); }
.card-leave-active { transition: opacity 200ms ease, transform 220ms ease-in; }
.card-enter-from, .card-leave-to { opacity: 0; }
.card-enter-from .call-card, .card-leave-to .call-card { transform: translateY(100%); }
.card-enter-active .call-card { transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1); }
.card-leave-active .call-card { transition: transform 220ms ease-in; }
@media (min-width: 640px) {
  .card-enter-from .call-card, .card-leave-to .call-card { transform: translateY(12px) scale(0.97); }
}
@media (prefers-reduced-motion: reduce) {
  .card-enter-active, .card-leave-active, .card-enter-active .call-card, .card-leave-active .call-card { transition: opacity 150ms ease; }
  .card-enter-from .call-card, .card-leave-to .call-card { transform: none; }
}
</style>
