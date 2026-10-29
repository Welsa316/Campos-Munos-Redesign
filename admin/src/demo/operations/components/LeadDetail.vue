<template>
  <div class="h-full flex flex-col bg-white min-h-0">
    <!-- Empty state -->
    <div v-if="!lead" class="flex-1 flex items-center justify-center p-8">
      <div class="text-center max-w-xs">
        <DemoIcon :icon="faRoute" class="text-4xl text-gray-200 mb-4" />
        <p class="text-gray-700 font-ui text-sm font-medium">Select a lead to see its full timeline</p>
        <p class="text-gray-500 font-ui text-xs mt-1 leading-relaxed">From the ad click or call, through every automatic and staff action, to a scheduled or retained client.</p>
      </div>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="px-6 pt-6 pb-5 border-b border-gray-100 flex-shrink-0">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-3 flex-wrap mb-1">
              <h2 class="font-heading text-2xl text-gray-900 tabular-nums">{{ displayName(lead) }}</h2>
              <StatusBadge :status="lead.status" size="lg" />
            </div>
            <!-- Plain text on purpose: tel:/mailto: links would fire the site's
                 GA4 lead tracking, and these numbers are fictional anyway. -->
            <div class="flex items-center gap-4 flex-wrap text-sm font-ui text-brand-navy">
              <span class="inline-flex items-center gap-1.5 tabular-nums"><DemoIcon :icon="faPhone" class="text-xs" />{{ lead.phone }}</span>
              <span v-if="lead.email" class="inline-flex items-center gap-1.5"><DemoIcon :icon="faEnvelope" class="text-xs" />{{ lead.email }}</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap text-xs font-ui mt-2.5">
              <SourceBadge kind="method" :value="lead.method" />
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy font-semibold uppercase tracking-wider text-[10px]">
                <DemoIcon :icon="faBriefcase" class="text-[10px]" />{{ lead.practice }}
              </span>
              <span v-if="lead.country" class="inline-flex items-center gap-1 text-gray-500">
                <DemoIcon :icon="faLocationDot" class="text-[10px]" />{{ lead.country }}
              </span>
              <span v-if="lead.language !== 'Unknown'" class="text-gray-500">· {{ lead.language }}</span>
            </div>
          </div>
          <button @click="$emit('back')" aria-label="Back to leads" class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors lg:hidden">
            <DemoIcon :icon="faArrowLeft" />
          </button>
        </div>
      </div>

      <!-- Next step -->
      <div class="px-6 py-3 border-b border-gray-100 bg-brand-light flex-shrink-0">
        <div class="flex items-center gap-3 flex-wrap">
          <p class="text-xs font-ui text-gray-600 mr-auto min-w-0">
            <span class="font-semibold text-gray-900">Next step:</span> {{ nextStep }}
          </p>
          <div class="flex items-center gap-2 flex-wrap">
            <button v-for="a in secondaryActions" :key="a.key" @click="a.run" :disabled="state.playing"
              class="disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg text-xs font-ui font-semibold text-gray-600 hover:text-gray-900 bg-white ring-1 ring-gray-200 hover:ring-gray-300 transition-colors">
              {{ a.label }}
            </button>
            <button v-if="primaryAction" @click="primaryAction.run" :disabled="state.playing"
              class="disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-ui font-semibold text-white bg-brand-navy hover:bg-brand-navy-dark shadow-sm transition-colors active:scale-[0.98]">
              <DemoIcon :icon="primaryAction.icon" class="text-[11px]" />
              {{ primaryAction.label }}
            </button>
          </div>
        </div>
        <p v-if="lead.inRecovery" class="mt-2 inline-flex items-center gap-2 text-[11px] font-ui font-semibold text-brand-navy">
          <span class="relative flex w-2 h-2">
            <span class="recovery-ping absolute inline-flex h-full w-full rounded-full bg-brand-navy/40"></span>
            <span class="relative inline-flex rounded-full w-2 h-2 bg-brand-navy"></span>
          </span>
          In the recovery queue — callback due within 10 minutes of the missed call
        </p>
      </div>

      <!-- Body -->
      <div ref="body" class="flex-1 overflow-y-auto min-h-0">
        <div class="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_300px]">
          <section class="p-6 min-w-0" aria-labelledby="timeline-heading">
            <h3 id="timeline-heading" class="text-xs font-ui font-semibold uppercase tracking-[0.12em] text-gray-500 mb-3">Timeline</h3>
            <LeadTimeline :key="lead.id" :events="lead.events" />
          </section>

          <aside class="p-6 pt-0 xl:pt-6 xl:border-l border-gray-100 space-y-4">
            <!-- Attribution -->
            <section class="rounded-xl ring-1 ring-gray-200 overflow-hidden">
              <header class="px-4 py-3 bg-brand-surface flex items-center justify-between">
                <h3 class="text-xs font-ui font-semibold uppercase tracking-[0.12em] text-gray-600">Attribution</h3>
                <SourceBadge kind="channel" :value="lead.attribution.channel" />
              </header>
              <dl class="px-4 py-3 space-y-2.5 text-xs font-ui">
                <div v-for="row in attributionRows" :key="row.label" class="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <dt class="text-gray-500">{{ row.label }}</dt>
                  <dd :class="row.mono ? 'font-mono text-[11px]' : ''" class="text-gray-900 break-words">{{ row.value }}</dd>
                </div>
              </dl>
              <p v-if="lead.status === 'retained'" class="px-4 py-2.5 border-t border-gray-100 text-[11px] font-ui text-brand-navy bg-brand-navy/[0.04] leading-relaxed">
                <span class="font-semibold">Closed loop:</span> this ad spend is now tied to a retained client, not just a form fill.
              </p>
              <p v-else class="px-4 py-2.5 border-t border-gray-100 text-[11px] font-ui text-gray-500 leading-relaxed">
                Stays attached to the lead through to retained — so ad spend can be measured in clients, not clicks.
              </p>
            </section>

            <!-- Summary -->
            <section class="rounded-xl ring-1 ring-gray-200">
              <dl class="px-4 py-3 space-y-2.5 text-xs font-ui">
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <dt class="text-gray-500">Received</dt>
                  <dd class="text-gray-900 tabular-nums">{{ receivedLabel }}</dd>
                </div>
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <dt class="text-gray-500">First response</dt>
                  <dd class="text-gray-900 tabular-nums">{{ firstResponse }}</dd>
                </div>
                <div v-if="lead.consultationAt" class="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <dt class="text-gray-500">Consultation</dt>
                  <dd class="text-gray-900">{{ formatConsultation(lead.consultationAt) }}<span class="text-gray-500"> · {{ lead.consultationMode }}</span></dd>
                </div>
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <dt class="text-gray-500">Language</dt>
                  <dd class="text-gray-900">{{ lead.language }}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </template>

    <ScheduleModal
      :visible="scheduling"
      :leadName="lead ? displayName(lead) : ''"
      @close="scheduling = false"
      @save="saveSchedule"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import {
  faPhone, faEnvelope, faBriefcase, faLocationDot, faArrowLeft, faRoute,
  faBolt, faPhoneVolume, faCalendarCheck, faHandshake,
} from '@fortawesome/free-solid-svg-icons'
import DemoIcon from './DemoIcon.vue'
import StatusBadge from './StatusBadge.vue'
import SourceBadge from './SourceBadge.vue'
import LeadTimeline from './LeadTimeline.vue'
import ScheduleModal from './ScheduleModal.vue'
import { LEAD_METHODS, CHANNELS } from '../data/model.js'
import { state, actions, displayName, formatConsultation, clockTime, relativeTime } from '../useOpsDemo.js'

const props = defineProps({
  lead: { type: Object, default: null },
})
defineEmits(['back'])

const scheduling = ref(false)

// When an action adds events to the open lead, bring the newest into view —
// they land at the bottom of the timeline, often below the fold.
const body = ref(null)
watch(() => [props.lead?.id, props.lead?.events.length], ([id, n], [prevId, prevN]) => {
  if (id !== prevId || !(n > prevN)) return
  nextTick(() => {
    const el = body.value
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  })
})
watch(() => props.lead?.id, () => { scheduling.value = false })

function saveSchedule(payload) {
  scheduling.value = false
  actions.scheduleConsultation(props.lead.id, payload)
}

const openSchedule = () => { scheduling.value = true }

// One obvious next move per stage keeps the presentation path clear.
const primaryAction = computed(() => {
  const l = props.lead
  if (!l) return null
  switch (l.status) {
    case 'missed_call':
      return l.inRecovery
        ? { label: 'Mark Contacted', icon: faPhoneVolume, run: () => actions.markContacted(l.id) }
        : { label: 'Simulate Recovery', icon: faBolt, run: () => actions.simulateRecovery(l.id) }
    case 'new':
    case 'no_response':
      return { label: 'Mark Contacted', icon: faPhoneVolume, run: () => actions.markContacted(l.id) }
    case 'contacted':
      return { label: 'Schedule Consultation', icon: faCalendarCheck, run: openSchedule }
    case 'scheduled':
      return { label: 'Mark Retained', icon: faHandshake, run: () => actions.markRetained(l.id) }
    default:
      return null
  }
})

const secondaryActions = computed(() => {
  const l = props.lead
  if (!l) return []
  const out = []
  if (l.status === 'missed_call' && !l.inRecovery) out.push({ key: 'contacted', label: 'Mark Contacted', run: () => actions.markContacted(l.id) })
  if (l.status === 'contacted') out.push({ key: 'noresp', label: 'No Response', run: () => actions.markNoResponse(l.id) })
  if (l.status === 'no_response') out.push({ key: 'schedule', label: 'Schedule', run: openSchedule })
  if (l.status === 'scheduled') out.push({ key: 'resched', label: 'Reschedule', run: openSchedule })
  if (!['retained', 'closed'].includes(l.status)) out.push({ key: 'close', label: 'Close', run: () => actions.closeLead(l.id) })
  return out
})

const nextStep = computed(() => {
  const l = props.lead
  if (!l) return ''
  switch (l.status) {
    case 'missed_call':
      return l.inRecovery ? 'Call them back from the recovery queue.' : 'Nobody answered. Start recovery so they hear from the firm within a minute.'
    case 'new': return 'Not contacted yet — reach out while the lead is warm.'
    case 'contacted': return 'Book the consultation while you have them.'
    case 'no_response': return 'Second follow-up is due today.'
    case 'scheduled': return `Consultation ${formatConsultation(l.consultationAt)}.`
    case 'retained': return 'Signed on as a client. Attribution is closed out.'
    default: return 'Not moving forward.'
  }
})

const attributionRows = computed(() => {
  const a = props.lead.attribution
  const rows = [{ label: 'Source', value: CHANNELS[a.channel]?.label }]
  if (a.campaign) rows.push({ label: 'Campaign', value: a.campaign })
  if (a.adGroup) rows.push({ label: 'Ad group', value: a.adGroup })
  if (a.keyword) rows.push({ label: 'Search term', value: `“${a.keyword}”` })
  if (a.landingPage) rows.push({ label: 'Landing page', value: a.landingPage, mono: true })
  rows.push({ label: 'Lead method', value: LEAD_METHODS[props.lead.method]?.label })
  return rows
})

const receivedLabel = computed(() => `${clockTime(props.lead.receivedAt)} · ${relativeTime(props.lead.receivedAt)}`)

// First moment a person or the system actually answered the lead.
const firstResponse = computed(() => {
  const l = props.lead
  const start = new Date(l.receivedAt)
  const first = l.events
    .filter(e => (e.kind === 'auto' || e.kind === 'staff') && new Date(e.at) >= start)
    .sort((a, b) => new Date(a.at) - new Date(b.at))[0]
  if (!first) return 'Waiting'
  const mins = Math.round((new Date(first.at) - start) / 60000)
  const who = first.kind === 'auto' ? 'automatic' : 'staff'
  return mins < 1 ? `Under a minute · ${who}` : `${mins} min · ${who}`
})
</script>

<style scoped>
.recovery-ping { animation: ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite; }
@keyframes ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .recovery-ping { animation: none; } }
</style>
