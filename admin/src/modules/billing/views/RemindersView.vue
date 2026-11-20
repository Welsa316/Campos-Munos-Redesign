<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

    <!-- Sending status -->
    <section v-if="data" class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 flex flex-wrap items-center gap-3" :aria-label="t('sending.label')">
      <span v-if="data.provider.mode === 'mock'" class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-violet-800 bg-violet-100 px-2.5 py-1 rounded-full">{{ t('sending.simulated') }}</span>
      <span v-else-if="data.provider.sendingEnabled" class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-brand-red bg-red-100 px-2.5 py-1 rounded-full">{{ t('sending.live') }}</span>
      <span v-else class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">{{ t('sending.off') }}</span>
      <p class="text-xs font-ui text-gray-700 flex-1 min-w-[16rem]">
        <template v-if="data.provider.mode === 'mock'">{{ t('sending.mock_note') }}</template>
        <template v-else-if="data.provider.sendingEnabled">{{ t('sending.live_note', { hours: hoursLabel }) }}</template>
        <template v-else>{{ t('sending.off_note') }}</template>
        {{ t('sending.never_without') }}
      </p>
      <button v-if="canAct" @click="runEvaluate" :disabled="Boolean(busy)" class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-brand-surface">
        <FaIcon v-if="busy === 'evaluate'" name="spinner" spin class="mr-1" />{{ t('evaluate') }}
      </button>
      <button v-if="canAct" @click="runDispatch" :disabled="Boolean(busy) || !(data.counts.approved > 0)" class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-white bg-brand-navy hover:bg-brand-navy-dark disabled:opacity-50">
        <FaIcon v-if="busy === 'dispatch'" name="spinner" spin class="mr-1" />{{ t('dispatch') }}
      </button>
    </section>
    <p v-if="notice" role="status" class="text-sm font-ui bg-brand-surface text-gray-800 rounded-lg px-4 py-3">{{ notice }}</p>

    <nav class="flex flex-wrap gap-1.5" :aria-label="t('views.label')">
      <button v-for="v in views" :key="v" @click="setView(v)" :aria-pressed="view === v"
        :class="view === v ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:text-gray-900'"
        class="text-xs font-ui font-semibold px-3 py-1.5 rounded-full ring-1 whitespace-nowrap">
        {{ t(`view.${v}`) }}<span v-if="badge(v)" class="ml-1.5 tabular-nums opacity-80">{{ badge(v) }}</span>
      </button>
    </nav>

    <!-- Queue -->
    <section v-if="isQueue" class="bg-white rounded-xl ring-1 ring-gray-200">
      <header v-if="canAct && view === 'drafts' && list.length" class="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <label class="inline-flex items-center gap-2 text-xs font-ui text-gray-700">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" class="rounded border-gray-300" /> {{ t('select_all') }}
        </label>
        <button @click="approveSelected" :disabled="!selected.size || Boolean(busy)" class="ml-auto px-4 py-2 rounded-lg bg-brand-navy text-white text-xs font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">
          {{ t('approve_selected', { count: selected.size || '' }) }}
        </button>
      </header>
      <p v-if="loading && !data" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t('loading') }}</p>
      <p v-else-if="!list.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t(`empty.${view}`) }}</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="r in list" :key="r.id" class="px-5 py-4 grid grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,16rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-xs font-ui">
          <div class="pt-0.5">
            <input v-if="canAct && view === 'drafts'" type="checkbox" :checked="selected.has(r.id)" @change="toggle(r.id)" :aria-label="t('select_for', { name: String(r.client_name) })" class="rounded border-gray-300" />
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900">{{ r.client_name || '—' }}</p>
            <p class="text-gray-500">{{ r.external_invoice_id }} · {{ money(r.balance_cents) }} · {{ t('due_on', { date: shortDate(r.due_date) }) }}</p>
            <p class="text-gray-500">{{ ruleName(r.rule_key) }}<span v-if="r.to_phone"> · {{ r.to_phone }}</span> · {{ t(r.language === 'en' ? 'lang.en' : 'lang.es') }}</p>
          </div>
          <div class="col-start-2 lg:col-start-auto">
            <p v-if="r.action === 'staff_followup'" class="text-amber-800 bg-amber-50 rounded-lg px-3 py-2">{{ t('staff_followup_note') }}</p>
            <p v-else class="text-gray-800 bg-brand-light ring-1 ring-gray-100 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-line">{{ r.preview }}</p>
            <p v-if="r.state === 'unknown'" class="mt-2 text-amber-800">{{ r.last_error }}</p>
            <p v-else-if="r.state === 'failed'" class="mt-2 text-brand-red">{{ r.last_error }}</p>
            <p v-if="r.state === 'cancelled'" class="mt-2 text-gray-500">{{ t('cancelled_reason', { reason: data.cancelReasons[r.cancel_reason] || r.cancel_reason || '' }) }}</p>
          </div>
          <div class="col-start-2 lg:col-start-auto flex flex-wrap lg:flex-col items-start lg:items-end gap-2">
            <span :class="known(STATE, r.state).tone" class="text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded">{{ STATE[r.state] ? t(`state.${r.state}`) : known(STATE, r.state).label }}</span>
            <span v-if="r.simulated" class="text-[10px] font-semibold text-violet-700">{{ t('simulated') }}</span>
            <span v-if="r.sent_at" class="text-gray-500">{{ t('sent_on', { date: shortDate(r.sent_at) }) }}</span>
            <button v-if="canAct && r.state === 'draft'" @click="approve([r.id])" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">{{ t(r.action === 'staff_followup' ? 'mark_done' : 'approve') }}</button>
            <button v-if="canAct && ['draft', 'approved', 'unknown'].includes(r.state)" @click="ask(r, 'cancel')" :disabled="Boolean(busy)" :aria-expanded="isAsking(r, 'cancel')" class="px-3 py-1.5 rounded-lg text-gray-600 hover:text-brand-red hover:bg-red-50">{{ t('cancel') }}</button>
            <button v-if="canAct && r.state === 'failed' && r.last_error_retryable" @click="retry(r)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg ring-1 ring-brand-navy/30 text-brand-navy font-semibold hover:bg-brand-surface">{{ t('retry') }}</button>
            <template v-if="canAct && r.state === 'unknown'">
              <button @click="ask(r, 'arrived')" :disabled="Boolean(busy)" :aria-expanded="isAsking(r, 'arrived')" class="px-3 py-1.5 rounded-lg ring-1 ring-green-600/40 text-green-800 font-semibold hover:bg-green-50">{{ t('it_arrived') }}</button>
              <button @click="ask(r, 'not_arrived')" :disabled="Boolean(busy)" :aria-expanded="isAsking(r, 'not_arrived')" class="px-3 py-1.5 rounded-lg ring-1 ring-gray-300 text-gray-700 hover:bg-gray-50">{{ t('it_did_not') }}</button>
            </template>
          </div>
          <ConfirmInline v-if="asking?.id === r.id" class="col-span-full" :title="askTitle(asking.kind, r)" :body="ASK[asking.kind].body ? t(ASK[asking.kind].body) : ''"
            :confirm-label="t(ASK[asking.kind].action)" :cancel-label="t('cancel')" :tone="asking.kind === 'cancel' ? 'danger' : 'navy'" :busy="Boolean(busy)"
            @confirm="answer(r)" @cancel="asking = null" />
        </li>
      </ul>
    </section>

    <!-- Client replies -->
    <section v-if="view === 'responses'" class="bg-white rounded-xl ring-1 ring-gray-200">
      <LoadError v-if="loadFailed && !responses.length" :message="t('responses.load_error')" @retry="load" />
      <p v-else-if="!responses.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t('responses.none') }}</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="m in responses" :key="m.id" class="px-5 py-4 flex flex-wrap items-start gap-3 text-xs font-ui">
          <div class="flex-1 min-w-[14rem]">
            <p class="text-sm font-medium text-gray-900">{{ m.clientName || t('unknown_client') }} <span class="text-gray-500 font-normal">{{ m.phone }}</span></p>
            <p class="text-gray-500">{{ shortDate(m.receivedAt) }}<span v-if="m.kind === 'opt_in'" class="ml-2 text-amber-800 font-semibold">{{ t('responses.opt_in') }}</span></p>
            <p class="mt-1 text-gray-800 bg-brand-light rounded-lg px-3 py-2">{{ m.text || t('responses.non_text') }}</p>
          </div>
          <button @click="markHandled(m)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg ring-1 ring-brand-navy/30 text-brand-navy font-semibold hover:bg-brand-surface">{{ t('handled') }}</button>
        </li>
      </ul>
    </section>

    <!-- Rules, templates, hours. Read-only without billing.configure: the
         fieldset disables every control inside it. -->
    <fieldset v-if="view === 'setup' && config" :disabled="!canConfigure" class="space-y-5 min-w-0 border-0 p-0 m-0">
      <p v-if="!canConfigure" class="text-xs font-ui text-gray-600 bg-brand-surface rounded-lg px-4 py-3">{{ t('setup.read_only') }}</p>
      <section class="bg-white rounded-xl ring-1 ring-gray-200 p-5 space-y-3" aria-labelledby="consent-h">
        <div>
          <h2 id="consent-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('consent.title') }}</h2>
          <p v-if="setupStatus.section === 'consent'" :role="setupStatus.ok ? 'status' : 'alert'" :class="setupStatus.ok ? 'text-green-700' : 'text-brand-red'" class="text-xs font-ui">{{ setupStatus.text }}</p>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            {{ t('consent.note') }}
          </p>
        </div>
        <label class="flex items-center sm:items-start gap-2.5 min-h-11 sm:min-h-0 text-xs font-ui text-gray-800 cursor-pointer">
          <input type="checkbox" v-model="consent.firmPolicy" class="mt-0.5 rounded border-gray-300" />
          <span><span class="font-semibold">{{ t('consent.policy') }}</span> {{ t('consent.policy_text') }}</span>
        </label>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 flex-1 min-w-[14rem] text-[11px] font-ui font-semibold text-gray-700">
            {{ t('consent.basis') }}
            <input v-model="consent.basis" maxlength="200" class="text-xs font-normal px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy" />
          </label>
          <button @click="saveConsent()" :disabled="Boolean(busy) || !consentChanged" class="min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">{{ t('save') }}</button>
        </div>
        <ConfirmInline v-if="confirmingPolicyOff" :title="t('consent.off_title')" :body="t('consent.off_body')"
          :confirm-label="t('consent.off_action')" :cancel-label="t('cancel')" :busy="Boolean(busy)" @confirm="saveConsent({ confirmed: true })" @cancel="confirmingPolicyOff = false" />
      </section>

      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="rules-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h2 id="rules-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('rules.title') }}</h2>
          <p v-if="setupStatus.section === 'rules'" :role="setupStatus.ok ? 'status' : 'alert'" :class="setupStatus.ok ? 'text-green-700' : 'text-brand-red'" class="text-xs font-ui">{{ setupStatus.text }}</p>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ t('rules.note') }}</p>
        </header>
        <ul class="divide-y divide-gray-100">
          <li v-for="r in config.rules" :key="r.key" class="px-5 py-3 flex flex-wrap items-center gap-3 text-xs font-ui">
            <label class="inline-flex items-center gap-2 min-w-[14rem] flex-1">
              <input type="checkbox" v-model="r.enabled" @change="saveRule(r)" :disabled="Boolean(busy)" class="rounded border-gray-300" />
              <span class="text-gray-900 font-medium">{{ ruleName(r.key) }}</span>
            </label>
            <label class="inline-flex items-center gap-2 text-gray-600">
              <input type="number" min="0" max="60" v-model.number="r.days" @change="saveRule(r)" :disabled="Boolean(busy)" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" :aria-label="t('rules.days_for', { rule: lang === 'es' ? ruleName(r.key) : String(r.label) })" />
              {{ t(r.trigger === 'before_due' ? 'rules.days_before' : 'rules.days_after') }}
            </label>
            <span class="text-gray-500 w-40">{{ r.action === 'staff_followup' ? t('rules.staff_task') : t('rules.template', { key: String(r.templateKey) }) }}</span>
          </li>
        </ul>
      </section>

      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="tpl-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h2 id="tpl-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('tpl.title') }}</h2>
          <p v-if="setupStatus.section === 'templates'" :role="setupStatus.ok ? 'status' : 'alert'" :class="setupStatus.ok ? 'text-green-700' : 'text-brand-red'" class="text-xs font-ui">{{ setupStatus.text }}</p>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            {{ t('tpl.note') }}
            {{ t('tpl.placeholders') }}
          </p>
        </header>
        <div v-for="tpl in config.templates" :key="tpl.key" class="px-5 py-4 border-b border-gray-50 space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label :for="`meta-${tpl.key}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ t('tpl.meta_name') }}</label>
            <input :id="`meta-${tpl.key}`" v-model="tpl.metaName" class="text-xs font-ui px-3 py-1.5 rounded-lg border border-gray-300 w-56" />
            <label class="inline-flex items-center gap-2 text-xs font-ui text-gray-700">
              <input type="checkbox" v-model="tpl.metaApproved" class="rounded border-gray-300" /> {{ t('tpl.approved') }}
            </label>
            <button @click="saveTemplate(tpl)" :disabled="Boolean(busy)" class="ml-auto px-3 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-ui font-semibold hover:bg-brand-navy-dark">{{ t('save') }}</button>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
            <div v-for="(l, tongue) in tpl.languages" :key="tongue">
              <label :for="`body-${tpl.key}-${tongue}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ t(tongue === 'es' ? 'tpl.lang.es' : 'tpl.lang.en') }} ({{ l.code }})</label>
              <textarea :id="`body-${tpl.key}-${tongue}`" v-model="l.body" rows="4" class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none leading-relaxed"></textarea>
            </div>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl ring-1 ring-gray-200 p-5 space-y-3" aria-labelledby="hours-h">
        <h2 id="hours-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('hours.title') }}</h2>
        <p v-if="setupStatus.section === 'hours'" :role="setupStatus.ok ? 'status' : 'alert'" :class="setupStatus.ok ? 'text-green-700' : 'text-brand-red'" class="text-xs font-ui">{{ setupStatus.text }}</p>
        <div class="flex flex-wrap items-center gap-3 text-xs font-ui text-gray-700">
          <label class="inline-flex items-center gap-2">{{ t('hours.from') }} <input type="number" min="0" max="23" v-model.number="hours.startHour" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" />:00</label>
          <label class="inline-flex items-center gap-2">{{ t('hours.to') }} <input type="number" min="1" max="24" v-model.number="hours.endHour" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" />:00</label>
          <span>{{ hours.timeZone }}</span>
          <fieldset class="flex flex-wrap gap-2"><legend class="sr-only">{{ t('hours.days') }}</legend>
            <label v-for="i in DAYS" :key="i" class="inline-flex items-center gap-1"><input type="checkbox" :checked="hours.days.includes(i)" @change="toggleDay(i)" class="rounded border-gray-300" />{{ t(`day.${i}`) }}</label>
          </fieldset>
          <label class="inline-flex items-center gap-2">{{ staleWords[0].trim() }} <input type="number" min="1" max="60" v-model.number="hours.staleAfterDays" class="w-16 px-2 py-1 rounded border border-gray-300 tabular-nums" /> {{ staleWords[1].trim() }}</label>
          <button @click="saveHours" :disabled="Boolean(busy)" class="ml-auto px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">{{ t('save') }}</button>
        </div>
      </section>
    </fieldset>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi, latestOnly } from '../../../composables/useApi.js'
import { can } from '../../../composables/useAuth.js'

// Acting on reminders and changing their setup are separate capabilities.
const canAct = can('billing.reminders')
const canConfigure = can('billing.configure')
import { money as moneyIn, shortDate as dateIn } from '../format.js'
import { ruleLabel, sendingHours, evaluateNotice, dispatchNotice, approveNotice, around } from '../billingText.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING_REMINDERS } from '../../../i18n/billingReminders.js'
import FaIcon from '../../../components/FaIcon.vue'
import LoadError from '../../../components/LoadError.vue'
import ConfirmInline from '../../../components/ConfirmInline.vue'
import { known } from '../../../utils/text.js'

// Each view's label is view.<key>, and a queue's empty line empty.<key>,
// in i18n/billingReminders.js.
const VIEWS = ['drafts', 'approved', 'sent', 'problems', 'cancelled', 'responses', 'setup']
// Client replies are part of working the reminders.
const views = VIEWS.filter((v) => v !== 'responses' || canAct)
// A reminder's state; its label is state.<key>.
const STATE = {
  draft: { tone: 'bg-gray-100 text-gray-700' },
  approved: { tone: 'bg-brand-navy/10 text-brand-navy' },
  queued: { tone: 'bg-brand-navy/10 text-brand-navy' },
  sent: { tone: 'bg-green-100 text-green-800' },
  delivered: { tone: 'bg-green-100 text-green-800' },
  read: { tone: 'bg-green-100 text-green-800' },
  failed: { tone: 'bg-red-100 text-brand-red' },
  unknown: { tone: 'bg-amber-100 text-amber-800' },
  cancelled: { tone: 'bg-gray-100 text-gray-500' },
}
// Sunday first, as the server counts them (day.<n>).
const DAYS = [0, 1, 2, 3, 4, 5, 6]

const { t, lang, locale } = useT(BILLING_REMINDERS)
const money = (cents) => moneyIn(cents, locale.value)
const shortDate = (value) => dateIn(value, locale.value)
// "Data older than {input} days…" around the number box.
const staleWords = computed(() => around(t('hours.stale'), 'input'))

const { get, post, put } = useApi()

const view = ref('drafts')
const data = ref(null)
const responses = ref([])
const config = ref(null)
const hours = ref({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5], timeZone: 'America/Chicago', staleAfterDays: 10 })
const consent = ref({ firmPolicy: false, basis: '' })
const consentChanged = computed(() => {
  const saved = config.value?.consent
  return Boolean(saved) && (saved.firmPolicy !== consent.value.firmPolicy || saved.basis !== consent.value.basis.trim())
})
const loading = ref(true)
const busy = ref('')
const error = ref('')
const loadFailed = ref(false)
const notice = ref('')
const selected = ref(new Set())

const isQueue = computed(() => ['drafts', 'approved', 'sent', 'problems', 'cancelled'].includes(view.value))
const list = computed(() => data.value?.reminders || [])
const allSelected = computed(() => list.value.length > 0 && list.value.every((r) => selected.value.has(r.id)))
const hoursLabel = computed(() => sendingHours(data.value?.settings, lang.value))
// A rule by what it does now (billingText.ruleLabel), or its key before the
// rules have loaded.
function ruleName(key) {
  const r = config.value?.rules.find((x) => x.key === key)
  return r ? ruleLabel(r, lang.value) : key
}

function badge(key) {
  const c = data.value?.counts || {}
  if (key === 'drafts') return c.draft || 0
  if (key === 'approved') return (c.approved || 0) + (c.queued || 0)
  if (key === 'problems') return (c.failed || 0) + (c.unknown || 0)
  if (key === 'responses') return data.value?.unhandledResponses || 0
  return 0
}

const latestQueue = latestOnly()
async function load() {
  loading.value = true
  error.value = ''
  try {
    if (view.value === 'responses') responses.value = await get('/api/billing/responses')
    if (view.value === 'setup' || !config.value) {
      config.value = await get('/api/billing/reminders/config')
      hours.value = { ...config.value.settings }
      consent.value = { firmPolicy: config.value.consent.firmPolicy, basis: config.value.consent.basis }
    }
    // A slow answer for a tab she has since left (Drafts with Approve buttons
    // under "Sent") is dropped.
    const r = await latestQueue(() => get(`/api/billing/reminders?state=${isQueue.value ? view.value : 'drafts'}`))
    if (!r.current) return
    data.value = r.value
    selected.value = new Set()
    loadFailed.value = false
  } catch (err) {
    error.value = err.message
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}
function setView(v) { view.value = v; notice.value = ''; load() }

// Queue actions (approve, cancel, send...): the list is read again whether
// the action worked or not, since a failure can still have changed some rows.
async function act(name, fn, after) {
  busy.value = name
  error.value = ''
  try {
    const r = await fn()
    if (after) notice.value = after(r)
  } catch (err) {
    error.value = err.message
  } finally {
    await load()
    busy.value = ''
  }
}

// Setup saves (a rule, a template, the hours, the consent policy) change one
// thing: on success the rest of the page is left as it is (other unsaved
// edits survive); on failure only that thing is put back to what the server
// has, and the reason is shown next to it.
const setupStatus = ref({ section: '', ok: true, text: '' })
async function saveSetup(section, fn, { ok, revert, after }) {
  busy.value = section
  setupStatus.value = { section, ok: true, text: t('saving') }
  try {
    const r = await fn()
    setupStatus.value = { section, ok: true, text: typeof ok === 'function' ? ok(r) : ok }
    await after?.(r)
  } catch (err) {
    setupStatus.value = { section, ok: false, text: t('not_saved', { message: err.message }) }
    const fresh = await get('/api/billing/reminders/config').catch(() => null)
    if (fresh) revert(fresh)
  } finally {
    busy.value = ''
  }
}

const runEvaluate = () => act('evaluate', () => post('/api/billing/reminders/evaluate', {}), (r) => evaluateNotice(r, lang.value))
const runDispatch = () => act('dispatch', () => post('/api/billing/reminders/dispatch', {}), (r) => dispatchNotice(r, lang.value))
const approve = (ids) => act('approve', () => post('/api/billing/reminders/approve', { ids }), (r) => approveNotice(r, lang.value))
const approveSelected = () => approve([...selected.value])
// Cancelling a reminder, and saying whether an unconfirmed one arrived, are
// asked inline under that reminder (ConfirmInline) rather than in a browser dialog.
// Words in i18n/billingReminders.js.
const ASK = {
  cancel: { title: 'ask.cancel.title', body: '', action: 'ask.cancel.action' },
  arrived: { title: 'ask.arrived.title', body: 'ask.arrived.body', action: 'ask.arrived.action' },
  not_arrived: { title: 'ask.not_arrived.title', body: 'ask.not_arrived.body', action: 'ask.not_arrived.action' },
}
const askTitle = (kind, r) => t(ASK[kind].title, { name: r.client_name || t('this_client') })
const asking = ref(null)
const ask = (r, kind) => { asking.value = { id: r.id, kind } }
const isAsking = (r, kind) => asking.value?.id === r.id && asking.value.kind === kind
function answer(r) {
  const kind = asking.value?.kind
  asking.value = null
  if (kind === 'cancel') act('cancel', () => post(`/api/billing/reminders/${r.id}/cancel`, {}))
  else if (kind) act('resolve', () => post(`/api/billing/reminders/${r.id}/resolve`, { delivered: kind === 'arrived' }))
}
const retry = (r) => act('retry', () => post(`/api/billing/reminders/${r.id}/retry`, {}), () => t('notice.retried'))
const markHandled = (m) => act('handled', () => post(`/api/billing/responses/${m.id}/handled`, {}))
const saveRule = (r) => saveSetup('rules', () => put(`/api/billing/reminders/rules/${r.key}`, { days: r.days, enabled: r.enabled }), {
  ok: () => t('saved.rule'),
  revert: (c) => { const f = c.rules.find((x) => x.key === r.key); if (f) Object.assign(r, f) },
})
const saveTemplate = (tpl) => saveSetup('templates', () => put(`/api/billing/reminders/templates/${tpl.key}`, { metaName: tpl.metaName, languages: tpl.languages, metaApproved: tpl.metaApproved }), {
  ok: () => t('saved.template'),
  revert: (c) => { const f = c.templates.find((x) => x.key === tpl.key); if (f) Object.assign(tpl, f) },
})
const confirmingPolicyOff = ref(false)
function saveConsent({ confirmed = false } = {}) {
  const turningOff = config.value.consent.firmPolicy && !consent.value.firmPolicy
  if (turningOff && !confirmed) { confirmingPolicyOff.value = true; return }
  confirmingPolicyOff.value = false
  saveSetup('consent', () => put('/api/billing/consent', { firmPolicy: consent.value.firmPolicy, basis: consent.value.basis.trim() }), {
    ok: (r) => t(r.firmPolicy ? 'saved.policy_on' : 'saved.policy_off'),
    // Saved: it is now what the server has. Turning it off cancels waiting reminders.
    after: async () => { config.value.consent = { ...config.value.consent, ...consent.value } },
    revert: (c) => { consent.value = { firmPolicy: c.consent.firmPolicy, basis: c.consent.basis } },
  })
}
const saveHours = () => saveSetup('hours', () => put('/api/billing/reminders/settings', hours.value), {
  ok: () => t('saved.hours'),
  after: () => { config.value.settings = { ...hours.value } },
  revert: (c) => { hours.value = { ...c.settings } },
})
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
