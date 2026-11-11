<template>
  <!-- What the portal does on its own (GET /api/automation/*): is it on, is
       it working, what failed, and the few things an administrator decides.
       Switching an automation ON is a variable on the API service, never a
       button here, so nothing starts sending because of a click; this page
       can only pause one that is on. -->
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Icons only below 2xl: an administrator has ten sections, and their labels push Sign out off a laptop screen. -->
    <PortalHeader title="Automation" current="automation" label-at="2xl" actions-label-at="2xl" :notifications="false" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1080px] mx-auto px-4 sm:px-6 py-6 space-y-5 font-ui">
        <LoadError v-if="error && !health" :message="error" @retry="load" />
        <div v-else-if="!health" class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-10 text-center text-sm text-gray-500" aria-busy="true">
          <FaIcon name="spinner" spin class="mr-2" />Loading…
        </div>

        <template v-else>
          <!-- The three things to know before anything else. -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200 grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100" aria-label="At a glance">
            <div v-for="c in glance" :key="c.key" class="px-5 py-4">
              <p class="text-[11px] text-gray-500">{{ c.label }}</p>
              <p class="mt-1 text-[15px] font-semibold tracking-tight" :class="c.tone">{{ c.value }}</p>
              <p class="mt-1 text-xs text-gray-600 leading-relaxed">{{ c.detail }}</p>
            </div>
          </section>

          <p v-if="notice" role="status" class="text-sm text-emerald-900 bg-emerald-50 rounded-lg px-4 py-3">{{ notice }}</p>
          <p v-if="error" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

          <!-- Failed automatic work nobody has dealt with. -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="ex-h">
            <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="ex-h" class="text-sm font-ui font-semibold text-gray-900">Needs someone</h2>
              <p class="text-[11px] text-gray-500">Automatic steps that failed. The portal does not try them again by itself.</p>
            </header>
            <p v-if="!exceptions.length" class="px-5 py-4 text-[13px] text-gray-700 flex items-center gap-2.5">
              <FaIcon name="circle-check" class="text-green-700" />Nothing has failed.
            </p>
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="x in exceptions" :key="x.id" class="px-5 py-3 grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center text-[13px]">
                <div class="min-w-0">
                  <p class="text-gray-900"><span class="font-semibold">{{ jobLabel(x.type) }}</span><span v-if="x.name"> to {{ x.name }}</span></p>
                  <p class="text-xs text-gray-600 mt-0.5">{{ capital(reasonText(x.reason)) }} · {{ when(x.at) }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <router-link v-if="x.path" :to="x.path" class="btn-quiet">Open</router-link>
                  <button v-if="x.reason !== 'unknown_delivery' && x.reason !== 'not_delivered'" type="button" @click="retry(x)" :disabled="Boolean(busy)" class="btn-quiet">Try again</button>
                  <button type="button" @click="dismiss(x)" :disabled="Boolean(busy)" class="btn-quiet">Dismiss</button>
                </div>
              </li>
            </ul>
          </section>

          <!-- Every switch, by area, with what it has done. -->
          <section v-for="g in groups" :key="g.key" class="bg-white rounded-xl ring-1 ring-gray-200" :aria-labelledby="`g-${g.key}`">
            <header class="px-5 py-4 border-b border-gray-100">
              <h2 :id="`g-${g.key}`" class="text-sm font-ui font-semibold text-gray-900">{{ g.title }}</h2>
              <p v-if="g.stats" class="text-xs text-gray-600 mt-1 leading-relaxed">{{ g.stats }}</p>
              <p v-if="g.problem" class="text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2 mt-2 leading-relaxed">{{ g.problem }}</p>
              <button v-if="g.key === 'phone'" type="button" @click="checkSms" :disabled="Boolean(busy)" class="btn-quiet mt-2">
                <FaIcon name="arrows-rotate" :spin="busy === 'sms'" class="text-[11px]" />Ask RingCentral now
              </button>
            </header>
            <ul class="divide-y divide-gray-100">
              <li v-for="f in g.flags" :key="f.key" class="px-5 py-3 grid gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,17rem)_5.5rem_minmax(0,1fr)_auto] md:items-center">
                <p class="text-[13px] font-semibold text-gray-900">{{ f.label }}<span v-if="f.sends" class="ml-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">sends</span></p>
                <p><span :class="CHIP[flagChip(f).tone]" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold">{{ flagChip(f).label }}</span></p>
                <div class="text-xs leading-relaxed">
                  <p class="text-gray-600">{{ f.about }}</p>
                  <p v-if="!f.on && flagWhy(f, health.flags)" class="text-gray-700 font-medium mt-0.5">{{ flagWhy(f, health.flags) }}</p>
                </div>
                <p class="md:text-right">
                  <button v-if="f.on || f.paused" type="button" @click="setPaused(f, !f.paused)" :disabled="Boolean(busy)" :aria-label="`${f.paused ? 'Resume' : 'Pause'} ${f.label}`" class="btn-quiet">
                    <FaIcon :name="f.paused ? 'play' : 'pause'" class="text-[10px]" />{{ f.paused ? 'Resume' : 'Pause' }}
                  </button>
                </p>
              </li>
            </ul>
          </section>

          <AutomationSettings :health="health" @saved="onSaved" />

          <!-- Who gets no automatic messages. -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="so-h">
            <header class="px-5 py-4 border-b border-gray-100">
              <h2 id="so-h" class="text-sm font-ui font-semibold text-gray-900">No automatic messages</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">People who replied STOP, or whom the firm listed. Checked right before every automatic message. A number that opted out of the WhatsApp payment reminders is not texted either.</p>
            </header>
            <form @submit.prevent="addSuppression" class="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
              <div class="flex-1 min-w-[14rem]">
                <label for="so-address" class="block text-[11px] font-semibold text-gray-700 mb-1">Phone number or email address</label>
                <input id="so-address" v-model.trim="newAddress" type="text" maxlength="254" autocomplete="off" class="fld w-full" placeholder="(504) 555-0100 or name@example.com" />
              </div>
              <button type="submit" :disabled="Boolean(busy) || !newAddress" class="min-h-11 sm:min-h-0 px-4 py-2 rounded-lg bg-brand-navy text-white text-[13px] font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50">Add</button>
            </form>
            <p v-if="!suppressions.length" class="px-5 py-4 text-[13px] text-gray-600">Nobody is on the list.</p>
            <ul v-else class="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              <li v-for="s in suppressions" :key="s.id" class="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <span class="font-semibold text-gray-900 tabular-nums break-all">{{ s.address }}</span>
                <span class="text-xs text-gray-600">{{ SUPPRESSION[s.reason] || s.reason }} · {{ s.channel === 'sms' ? 'texts' : s.channel === 'email' ? 'email' : 'texts and email' }} · {{ when(s.at) }}<template v-if="s.by"> · {{ s.by }}</template></span>
                <button type="button" @click="removeSuppression(s)" :disabled="Boolean(busy)" :aria-label="`Remove ${s.address} from the list`" class="btn-quiet ml-auto">Remove</button>
              </li>
            </ul>
          </section>

          <p class="text-xs text-gray-600 px-1">
            Everything the portal did on its own is in the
            <router-link :to="{ name: 'Activity', query: { actor: 'system' } }" class="font-semibold text-brand-navy underline">activity log</router-link>, with why.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import FaIcon from '../../components/FaIcon.vue'
import LoadError from '../../components/LoadError.vue'
import AutomationSettings from './AutomationSettings.vue'
import { useApi } from '../../composables/useApi.js'
import { flagChip, flagWhy, jobLabel, reasonText } from './automationText.js'

const { get, post, put, del } = useApi()
const health = ref(null)
const exceptions = ref([])
const suppressions = ref([])
const error = ref('')
const notice = ref('')
const busy = ref(null)
const newAddress = ref('')

const CHIP = { good: 'bg-emerald-50 text-emerald-800', warn: 'bg-amber-50 text-amber-800', quiet: 'bg-gray-100 text-gray-600' }
const SUPPRESSION = { opt_out: 'Opted out', staff: 'Listed by the firm', invalid: 'Cannot receive' }
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function when(value) {
  if (!value) return 'never'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

async function load() {
  error.value = ''
  try {
    const [h, x, s] = await Promise.all([get('/api/automation/health'), get('/api/automation/exceptions'), get('/api/automation/suppressions')])
    health.value = h
    exceptions.value = x.items || []
    suppressions.value = s.items || []
  } catch (e) {
    error.value = e.message
  }
}

async function act(label, fn, done) {
  busy.value = label
  error.value = ''
  notice.value = ''
  try {
    const r = await fn()
    if (done) notice.value = typeof done === 'function' ? done(r) : done
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = null
  }
}
const setPaused = (f, paused) => act(`flag-${f.key}`, () => put(`/api/automation/flags/${f.key}`, { paused }), paused ? `${f.label} is paused. Nothing it had queued is sent while it is.` : `${f.label} is running again.`)
const retry = (x) => act(`job-${x.id}`, () => post(`/api/automation/jobs/${x.id}/retry`, {}), 'Queued again. It runs within a minute.')
const dismiss = (x) => act(`job-${x.id}`, () => post(`/api/automation/jobs/${x.id}/acknowledge`, {}))
const checkSms = () => act('sms', () => post('/api/automation/sms/check', {}), (r) => (r.available ? `RingCentral can send text messages from ${r.sender}.` : `Text messages cannot be sent: ${r.reasonText || r.reason}`))
const removeSuppression = (s) => act(`so-${s.id}`, () => del(`/api/automation/suppressions/${s.id}`))
async function addSuppression() {
  const address = newAddress.value
  await act('so-add', () => post('/api/automation/suppressions', { channel: address.includes('@') ? 'email' : 'sms', address, reason: 'staff' }), 'Added to the list.')
  if (!error.value) newAddress.value = ''
}
function onSaved(text) {
  notice.value = text
  load()
}

// --- what the page says about the numbers ------------------------------------------

const glance = computed(() => {
  const h = health.value
  const on = h.flags.filter((f) => f.on && f.key !== 'worker').length
  const worker = h.flags.find((f) => f.key === 'worker')
  const ran = h.worker?.lastSuccessAt
  const failing = exceptions.value.length
  const where = h.recipients.mode === 'everyone'
    ? { value: 'Clients', detail: 'This is the live server: automatic messages go to real people when their switch is on.', tone: 'text-gray-900' }
    : h.recipients.mode === 'test_list'
      ? { value: `Only ${plural(h.recipients.count, 'test address', 'test addresses')}`, detail: 'AUTOMATION_TEST_RECIPIENTS is set: nobody else receives anything.', tone: 'text-amber-800' }
      : { value: 'Nobody', detail: 'This server is not the live one, and no test addresses are set.', tone: 'text-gray-900' }
  return [
    { key: 'worker', label: 'The worker', value: worker.on ? 'Running' : worker.paused ? 'Paused' : 'Off', tone: worker.on ? 'text-emerald-800' : 'text-gray-900',
      detail: worker.on ? `Last ran ${when(ran)}. ${plural(on, 'automation')} switched on.` : flagWhy(worker, h.flags) || 'Nothing below runs while it is off.' },
    { key: 'where', label: 'Messages can go to', ...where },
    { key: 'failed', label: 'Needs someone', value: failing ? plural(failing, 'failed step') : 'Nothing', tone: failing ? 'text-amber-800' : 'text-gray-900',
      detail: failing ? 'Listed below, with what to do.' : 'No automatic step is waiting for a person.' },
  ]
})

const groups = computed(() => {
  const h = health.value
  const of = (group) => h.flags.filter((f) => f.group === group)
  const sent = (purpose) => h.messages.filter((m) => m.purpose === purpose).reduce((n, m) => n + m.sent7d, 0)
  const sms = h.sms
  const cal = h.scheduling
  const pr = h.paymentReminders
  return [
    { key: 'core', title: 'Worker', flags: of('core'), stats: null },
    { key: 'leads', title: 'Website leads', flags: of('leads'),
      stats: `Last 7 days: ${plural(sent('lead_ack'), 'acknowledgment')} and ${plural(sent('lead_followup'), 'follow-up')} sent. ${plural(h.leadFollowup.pending, 'follow-up step')} queued, ${plural(h.escalation.pending, 'deadline')} being watched.`,
      problem: !h.email.configured ? `Email cannot be sent from this server: ${h.email.problems.join('; ')}.` : null },
    { key: 'phone', title: 'Text messages (RingCentral)', flags: of('phone'),
      stats: sms.checkedAt
        ? (sms.available ? `Texts go out from ${sms.sender}. Last asked ${when(sms.checkedAt)}. Last 7 days: ${plural(sent('missed_call'), 'missed-call text')} sent.` : `Last asked ${when(sms.checkedAt)}.`)
        : 'RingCentral has not been asked yet whether this connection can send text messages.',
      problem: [sms.checkedAt && !sms.available ? `Text messages cannot be sent: ${sms.reasonText || sms.reason}.` : null,
        sms.inbound?.lastError ? `Reading replies failed (${sms.inbound.lastError}, ${when(sms.inbound.lastFailureAt)}).` : null].filter(Boolean).join(' ') || null },
    { key: 'scheduling', title: 'Consultation bookings', flags: of('scheduling'),
      stats: cal.configured ? `Calendar last read ${when(cal.lastSuccessAt)}. ${cal.bookingLinkSet ? 'The booking link is offered in messages.' : 'No booking link is set, so messages do not offer one.'}` : null,
      problem: !cal.configured ? `The calendar cannot be read yet: ${cal.problems.join('; ')}.` : cal.lastError ? `Reading the calendar failed (${cal.lastError}, ${when(cal.lastFailureAt)}).` : null },
    { key: 'billing', title: 'Payment reminders', flags: of('billing'),
      stats: `${plural(pr.automaticRules, 'rule')} marked “send automatically”. ${plural(pr.drafts, 'draft')} waiting for a person, ${pr.queued} approved and waiting to go, ${plural(pr.problems, 'problem')}. ${pr.autoApproved7d} approved automatically in the last 7 days.`,
      problem: !pr.schedulerOn ? 'The reminder scheduler is off on the server (BILLING_SCHEDULER_ENABLED), so nothing is drafted, approved or sent on its own.' : !pr.sendingOn ? 'Sending is off on the server (WHATSAPP_SENDING_ENABLED): approved reminders wait.' : pr.lastError ? `The last run failed (${pr.lastError}).` : null },
  ].filter((g) => g.flags.length)
})

onMounted(load)
</script>

<style scoped>
.fld {
  padding: 0.4rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary);
  font-family: var(--font-ui); font-size: 13px; line-height: 1.5; min-height: 2.75rem; max-width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
@media (min-width: 640px) { .fld { min-height: 2.125rem; } }
.fld:focus { outline: none; border-color: var(--primary-ring); box-shadow: 0 0 0 2px var(--focus-ring); }
textarea.fld { display: block; }
.btn-quiet {
  display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.75rem; padding: 0.375rem 0.75rem; border-radius: 0.5rem;
  font-size: 12px; font-weight: 600; color: var(--text-link); box-shadow: inset 0 0 0 1px var(--color-gray-300);
  transition: background-color 160ms ease;
}
@media (min-width: 640px) { .btn-quiet { min-height: 0; } }
.btn-quiet:hover { background: var(--surface-hover); }
.btn-quiet:focus-visible { outline: 2px solid var(--primary-ring); outline-offset: 1px; }
.btn-quiet:disabled { opacity: 0.5; }
</style>
