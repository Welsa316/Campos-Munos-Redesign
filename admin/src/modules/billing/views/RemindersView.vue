<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

    <!-- Sending status -->
    <section v-if="data" class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 flex flex-wrap items-center gap-3" aria-label="Sending status">
      <span v-if="data.provider.mode === 'mock'" class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-violet-800 bg-violet-100 px-2.5 py-1 rounded-full">Simulated sending</span>
      <span v-else-if="data.provider.sendingEnabled" class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-brand-red bg-red-100 px-2.5 py-1 rounded-full">Live sending on</span>
      <span v-else class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">Sending off</span>
      <p class="text-xs font-ui text-gray-700 flex-1 min-w-[16rem]">
        <template v-if="data.provider.mode === 'mock'">Approved reminders are “sent” to a simulator. No client receives anything.</template>
        <template v-else-if="data.provider.sendingEnabled">Approved reminders go to clients on WhatsApp, {{ hoursLabel }}.</template>
        <template v-else>Approved reminders wait until sending is switched on (WHATSAPP_SENDING_ENABLED).</template>
        Nothing is ever sent without a staff approval.
      </p>
      <button v-if="canAct" @click="runEvaluate" :disabled="Boolean(busy)" class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-brand-surface">
        <FaIcon v-if="busy === 'evaluate'" name="spinner" spin class="mr-1" />Check for due reminders
      </button>
      <button v-if="canAct" @click="runDispatch" :disabled="Boolean(busy) || !(data.counts.approved > 0)" class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-white bg-brand-navy hover:bg-brand-navy-dark disabled:opacity-50">
        <FaIcon v-if="busy === 'dispatch'" name="spinner" spin class="mr-1" />Send approved now
      </button>
    </section>
    <p v-if="notice" role="status" class="text-sm font-ui bg-brand-surface text-gray-800 rounded-lg px-4 py-3">{{ notice }}</p>

    <nav class="flex flex-wrap gap-1.5" aria-label="Reminder views">
      <button v-for="t in views" :key="t.key" @click="setView(t.key)" :aria-pressed="view === t.key"
        :class="view === t.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:text-gray-900'"
        class="text-xs font-ui font-semibold px-3 py-1.5 rounded-full ring-1 whitespace-nowrap">
        {{ t.label }}<span v-if="badge(t.key)" class="ml-1.5 tabular-nums opacity-80">{{ badge(t.key) }}</span>
      </button>
    </nav>

    <!-- Queue -->
    <section v-if="isQueue" class="bg-white rounded-xl ring-1 ring-gray-200">
      <header v-if="canAct && view === 'drafts' && list.length" class="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <label class="inline-flex items-center gap-2 text-xs font-ui text-gray-700">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" class="rounded border-gray-300" /> Select all
        </label>
        <button @click="approveSelected" :disabled="!selected.size || Boolean(busy)" class="ml-auto px-4 py-2 rounded-lg bg-brand-navy text-white text-xs font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">
          Approve {{ selected.size || '' }} selected
        </button>
      </header>
      <p v-if="loading && !data" class="p-8 text-center text-sm text-gray-500 font-ui">Loading…</p>
      <p v-else-if="!list.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ EMPTY[view] }}</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="r in list" :key="r.id" class="px-5 py-4 grid grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,16rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-xs font-ui">
          <div class="pt-0.5">
            <input v-if="canAct && view === 'drafts'" type="checkbox" :checked="selected.has(r.id)" @change="toggle(r.id)" :aria-label="`Select reminder for ${r.client_name}`" class="rounded border-gray-300" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">{{ r.client_name || '—' }}</p>
            <p class="text-gray-500">{{ r.external_invoice_id }} · {{ money(r.balance_cents) }} · due {{ shortDate(r.due_date) }}</p>
            <p class="text-gray-500">{{ ruleLabel(r.rule_key) }}<span v-if="r.to_phone"> · {{ r.to_phone }}</span> · {{ r.language === 'en' ? 'English' : 'Español' }}</p>
          </div>
          <div class="col-start-2 lg:col-start-auto">
            <p v-if="r.action === 'staff_followup'" class="text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Staff follow-up: call or write to the client. Approving marks it done; no message is sent.</p>
            <p v-else class="text-gray-800 bg-brand-light ring-1 ring-gray-100 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-line">{{ r.preview }}</p>
            <p v-if="r.state === 'unknown'" class="mt-2 text-amber-800">{{ r.last_error }}</p>
            <p v-else-if="r.state === 'failed'" class="mt-2 text-brand-red">{{ r.last_error }}</p>
            <p v-if="r.state === 'cancelled'" class="mt-2 text-gray-500">Cancelled: {{ data.cancelReasons[r.cancel_reason] || r.cancel_reason }}</p>
          </div>
          <div class="col-start-2 lg:col-start-auto flex flex-wrap lg:flex-col items-start lg:items-end gap-2">
            <span :class="STATE[r.state].tone" class="text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded">{{ STATE[r.state].label }}</span>
            <span v-if="r.simulated" class="text-[10px] font-semibold text-violet-700">simulated</span>
            <span v-if="r.sent_at" class="text-gray-500">sent {{ shortDate(r.sent_at) }}</span>
            <button v-if="canAct && r.state === 'draft'" @click="approve([r.id])" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">{{ r.action === 'staff_followup' ? 'Mark done' : 'Approve' }}</button>
            <button v-if="canAct && ['draft', 'approved', 'unknown'].includes(r.state)" @click="cancel(r)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg text-gray-600 hover:text-brand-red hover:bg-red-50">Cancel</button>
            <button v-if="canAct && r.state === 'failed' && r.last_error_retryable" @click="retry(r)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg ring-1 ring-brand-navy/30 text-brand-navy font-semibold hover:bg-brand-surface">Retry</button>
            <template v-if="canAct && r.state === 'unknown'">
              <button @click="resolve(r, true)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg ring-1 ring-green-600/40 text-green-800 font-semibold hover:bg-green-50">It arrived</button>
              <button @click="resolve(r, false)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50">It did not</button>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <!-- Client replies -->
    <section v-if="view === 'responses'" class="bg-white rounded-xl ring-1 ring-gray-200">
      <p v-if="!responses.length" class="p-8 text-center text-sm text-gray-500 font-ui">No client replies waiting.</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="m in responses" :key="m.id" class="px-5 py-4 flex flex-wrap items-start gap-3 text-xs font-ui">
          <div class="flex-1 min-w-[14rem]">
            <p class="text-sm font-medium text-gray-900">{{ m.clientName || 'Unknown client' }} <span class="text-gray-500 font-normal">{{ m.phone }}</span></p>
            <p class="text-gray-500">{{ shortDate(m.receivedAt) }}<span v-if="m.kind === 'opt_in'" class="ml-2 text-amber-800 font-semibold">asked to receive messages: confirm consent on the Contacts tab</span></p>
            <p class="mt-1 text-gray-800 bg-brand-light rounded-lg px-3 py-2">{{ m.text || '(non-text message)' }}</p>
          </div>
          <button @click="markHandled(m)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg ring-1 ring-brand-navy/30 text-brand-navy font-semibold hover:bg-brand-surface">Handled</button>
        </li>
      </ul>
    </section>

    <!-- Rules, templates, hours. Read-only without billing.configure: the
         fieldset disables every control inside it. -->
    <fieldset v-if="view === 'setup' && config" :disabled="!canConfigure" class="space-y-5 min-w-0 border-0 p-0 m-0">
      <p v-if="!canConfigure" class="text-xs font-ui text-gray-600 bg-brand-surface rounded-lg px-4 py-3">Shown for reference. Rules, templates and sending hours are changed by an administrator.</p>
      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="rules-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h2 id="rules-h" class="text-sm font-ui font-semibold text-gray-900">Rules</h2>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">A rule only creates drafts for staff to approve. Reminders are never created for invoices that need review, clients without consent, or stale data.</p>
        </header>
        <ul class="divide-y divide-gray-100">
          <li v-for="r in config.rules" :key="r.key" class="px-5 py-3 flex flex-wrap items-center gap-3 text-xs font-ui">
            <label class="inline-flex items-center gap-2 min-w-[14rem] flex-1">
              <input type="checkbox" v-model="r.enabled" @change="saveRule(r)" class="rounded border-gray-300" />
              <span class="text-gray-900 font-medium">{{ ruleLabel(r.key) }}</span>
            </label>
            <label class="inline-flex items-center gap-2 text-gray-600">
              <input type="number" min="0" max="60" v-model.number="r.days" @change="saveRule(r)" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" :aria-label="`Days for ${r.label}`" />
              days {{ r.trigger === 'before_due' ? 'before' : 'after' }} the due date
            </label>
            <span class="text-gray-500 w-40">{{ r.action === 'staff_followup' ? 'Staff task, no message' : `Template: ${r.templateKey}` }}</span>
          </li>
        </ul>
      </section>

      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="tpl-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h2 id="tpl-h" class="text-sm font-ui font-semibold text-gray-900">Message templates</h2>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            WhatsApp only delivers business-initiated messages that use a template Meta approved, word for word. Keep these in step with WhatsApp Manager (category: Utility).
            Placeholders: {{ '{' + '{1}' + '}' }} client's first name, {{ '{' + '{2}' + '}' }} amount, {{ '{' + '{3}' + '}' }} due date. Never add case details or immigration status.
          </p>
        </header>
        <div v-for="t in config.templates" :key="t.key" class="px-5 py-4 border-b border-gray-50 space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label :for="`meta-${t.key}`" class="text-[11px] font-ui font-semibold text-gray-700">Name in WhatsApp Manager</label>
            <input :id="`meta-${t.key}`" v-model="t.metaName" class="text-xs font-ui px-3 py-1.5 rounded-lg border border-gray-300 w-56" />
            <label class="inline-flex items-center gap-2 text-xs font-ui text-gray-700">
              <input type="checkbox" v-model="t.metaApproved" class="rounded border-gray-300" /> Approved by Meta
            </label>
            <button @click="saveTemplate(t)" :disabled="Boolean(busy)" class="ml-auto px-3 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-ui font-semibold hover:bg-brand-navy-dark">Save</button>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
            <div v-for="(l, lang) in t.languages" :key="lang">
              <label :for="`body-${t.key}-${lang}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ lang === 'es' ? 'Spanish' : 'English' }} ({{ l.code }})</label>
              <textarea :id="`body-${t.key}-${lang}`" v-model="l.body" rows="4" class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none leading-relaxed"></textarea>
            </div>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl ring-1 ring-gray-200 p-5 space-y-3" aria-labelledby="hours-h">
        <h2 id="hours-h" class="text-sm font-ui font-semibold text-gray-900">Sending hours</h2>
        <div class="flex flex-wrap items-center gap-3 text-xs font-ui text-gray-700">
          <label class="inline-flex items-center gap-2">From <input type="number" min="0" max="23" v-model.number="hours.startHour" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" />:00</label>
          <label class="inline-flex items-center gap-2">to <input type="number" min="1" max="24" v-model.number="hours.endHour" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" />:00</label>
          <span>{{ hours.timeZone }}</span>
          <fieldset class="flex flex-wrap gap-2"><legend class="sr-only">Days</legend>
            <label v-for="(d, i) in DAYS" :key="d" class="inline-flex items-center gap-1"><input type="checkbox" :checked="hours.days.includes(i)" @change="toggleDay(i)" class="rounded border-gray-300" />{{ d }}</label>
          </fieldset>
          <label class="inline-flex items-center gap-2">Data older than <input type="number" min="1" max="60" v-model.number="hours.staleAfterDays" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" /> days is too old to remind from</label>
          <button @click="saveHours" :disabled="Boolean(busy)" class="ml-auto px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">Save</button>
        </div>
      </section>
    </fieldset>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi, rawFetch, goToLogin } from '../../../composables/useApi.js'
import { can } from '../../../composables/useAuth.js'

// Acting on reminders and changing their setup are separate capabilities.
const canAct = can('billing.reminders')
const canConfigure = can('billing.configure')
import { money, shortDate } from '../api.js'
import FaIcon from '../../../components/FaIcon.vue'

const VIEWS = [
  { key: 'drafts', label: 'Awaiting approval' },
  { key: 'approved', label: 'Approved / scheduled' },
  { key: 'sent', label: 'Sent' },
  { key: 'problems', label: 'Delivery problems' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'responses', label: 'Client replies' },
  { key: 'setup', label: 'Rules & templates' },
]
// Client replies are part of working the reminders.
const views = VIEWS.filter((t) => t.key !== 'responses' || canAct)
const STATE = {
  draft: { label: 'Draft', tone: 'bg-gray-100 text-gray-700' },
  approved: { label: 'Approved', tone: 'bg-brand-navy/10 text-brand-navy' },
  queued: { label: 'Sending', tone: 'bg-brand-navy/10 text-brand-navy' },
  sent: { label: 'Sent', tone: 'bg-green-100 text-green-800' },
  delivered: { label: 'Delivered', tone: 'bg-green-100 text-green-800' },
  read: { label: 'Read', tone: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', tone: 'bg-red-100 text-brand-red' },
  unknown: { label: 'Unconfirmed', tone: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelled', tone: 'bg-gray-100 text-gray-500' },
}
const EMPTY = {
  drafts: 'Nothing waiting for approval. “Check for due reminders” creates drafts for payments that qualify today.',
  approved: 'No approved reminders waiting to send.', sent: 'Nothing sent yet.',
  problems: 'No delivery problems.', cancelled: 'Nothing cancelled.',
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { get, post } = useApi()
const put = async (path, body) => {
  const res = await rawFetch(path, { method: 'PUT', body: JSON.stringify(body) })
  if (res.status === 401) { goToLogin(); throw new Error('Unauthorized') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const view = ref('drafts')
const data = ref(null)
const responses = ref([])
const config = ref(null)
const hours = ref({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5], timeZone: 'America/Chicago', staleAfterDays: 10 })
const loading = ref(true)
const busy = ref('')
const error = ref('')
const notice = ref('')
const selected = ref(new Set())

const isQueue = computed(() => ['drafts', 'approved', 'sent', 'problems', 'cancelled'].includes(view.value))
const list = computed(() => data.value?.reminders || [])
const allSelected = computed(() => list.value.length > 0 && list.value.every((r) => selected.value.has(r.id)))
const hoursLabel = computed(() => {
  const s = data.value?.settings
  return s ? `${s.startHour}:00–${s.endHour}:00 ${s.timeZone.split('/')[1]?.replace('_', ' ') || s.timeZone} time` : 'during business hours'
})
// Describe a rule by what it does now, not its starting label: staff can
// change the days, and "due in 3 days" set to 7 would mislead.
function ruleLabel(key) {
  const r = config.value?.rules.find((x) => x.key === key)
  if (!r) return key
  if (r.action === 'staff_followup') return `Follow-up, ${r.days} days overdue`
  if (r.trigger === 'before_due') return r.days === 0 ? 'Due today' : r.days === 1 ? 'Due tomorrow' : `${r.days} days before due`
  return `${r.days} days overdue`
}

function badge(key) {
  const c = data.value?.counts || {}
  if (key === 'drafts') return c.draft || 0
  if (key === 'approved') return (c.approved || 0) + (c.queued || 0)
  if (key === 'problems') return (c.failed || 0) + (c.unknown || 0)
  if (key === 'responses') return data.value?.unhandledResponses || 0
  return 0
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (view.value === 'responses') responses.value = await get('/api/billing/responses')
    if (view.value === 'setup' || !config.value) {
      config.value = await get('/api/billing/reminders/config')
      hours.value = { ...config.value.settings }
    }
    data.value = await get(`/api/billing/reminders?state=${isQueue.value ? view.value : 'drafts'}`)
    selected.value = new Set()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
function setView(v) { view.value = v; notice.value = ''; load() }

async function act(name, fn, after) {
  busy.value = name
  error.value = ''
  try {
    const r = await fn()
    if (after) notice.value = after(r)
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = ''
  }
}

const runEvaluate = () => act('evaluate', () => post('/api/billing/reminders/evaluate', {}), (r) => {
  const why = r.suppressed.map((s) => `${s.count} × ${s.label.toLowerCase()}`).join('; ')
  return `${r.created} new draft(s).${why ? ` Not created: ${why}.` : ''}`
})
const runDispatch = () => act('dispatch', () => post('/api/billing/reminders/dispatch', {}), (r) => {
  if (r.skipped === 'sending_disabled') return 'Sending is switched off on the server. Approved reminders are waiting.'
  if (r.skipped === 'outside_hours') return `Outside sending hours. Next window: ${shortDate(r.nextOpenAt)}.`
  return `${r.sent} sent, ${r.failed} failed, ${r.unknown} unconfirmed, ${r.cancelled} cancelled before sending.`
})
const approve = (ids) => act('approve', () => post('/api/billing/reminders/approve', { ids }), (r) =>
  `${r.approved.length} approved${r.tasksDone ? `, ${r.tasksDone} follow-up(s) marked done` : ''}${r.notApproved ? `; ${r.notApproved} no longer qualified and were cancelled or skipped` : ''}.`)
const approveSelected = () => approve([...selected.value])
function cancel(r) {
  if (!window.confirm(`Cancel the reminder for ${r.client_name || 'this client'}?`)) return
  act('cancel', () => post(`/api/billing/reminders/${r.id}/cancel`, {}))
}
const retry = (r) => act('retry', () => post(`/api/billing/reminders/${r.id}/retry`, {}), () => 'Moved back to approved. It goes out with the next send.')
function resolve(r, delivered) {
  const q = delivered ? 'Confirm the client received this message (checked in WhatsApp)?' : 'Confirm the client did NOT receive it? It can then be retried.'
  if (!window.confirm(q)) return
  act('resolve', () => post(`/api/billing/reminders/${r.id}/resolve`, { delivered }))
}
const markHandled = (m) => act('handled', () => post(`/api/billing/responses/${m.id}/handled`, {}))
const saveRule = (r) => act('rule', () => put(`/api/billing/reminders/rules/${r.key}`, { days: r.days, enabled: r.enabled }), () => 'Rule saved.')
const saveTemplate = (t) => act('template', () => put(`/api/billing/reminders/templates/${t.key}`, { metaName: t.metaName, languages: t.languages, metaApproved: t.metaApproved }), () => 'Template saved.')
const saveHours = () => act('hours', () => put('/api/billing/reminders/settings', hours.value), () => 'Sending hours saved.')
function toggleDay(i) {
  const d = new Set(hours.value.days)
  if (d.has(i)) d.delete(i); else d.add(i)
  hours.value.days = [...d].sort()
}
function toggle(id) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selected.value = s
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(list.value.map((r) => r.id))
}

onMounted(load)
</script>
