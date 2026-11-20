<template>
  <!-- What the portal does on its own (GET /api/automation/*): is it on, is
       it working, what failed, and the few things an administrator decides.
       Switching an automation ON is a variable on the API service, never a
       button here, so nothing starts sending because of a click; this page
       can only pause one that is on. -->
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Icons only below 2xl: an administrator has ten sections, and their labels push Sign out off a laptop screen. -->
    <PortalHeader :title="t('page.title')" current="automation" label-at="2xl" actions-label-at="2xl" :notifications="false" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1080px] mx-auto px-4 sm:px-6 py-6 space-y-5 font-ui">
        <LoadError v-if="error && !health" :message="error" @retry="load" />
        <div v-else-if="!health" class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-10 text-center text-sm text-gray-500" aria-busy="true">
          <FaIcon name="spinner" spin class="mr-2" />{{ t('loading') }}
        </div>

        <template v-else>
          <!-- The three things to know before anything else. -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200 grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100" :aria-label="t('glance.label')">
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
              <h2 id="ex-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('ex.title') }}</h2>
              <p class="text-[11px] text-gray-500">{{ t('ex.about') }}</p>
            </header>
            <p v-if="!exceptions.length" class="px-5 py-4 text-[13px] text-gray-700 flex items-center gap-2.5">
              <FaIcon name="circle-check" class="text-green-700" />{{ t('ex.none') }}
            </p>
            <ul v-else class="divide-y divide-gray-100">
              <li v-for="x in exceptions" :key="x.id" class="px-5 py-3 grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center text-[13px]">
                <div class="min-w-0">
                  <p class="text-gray-900"><span class="font-semibold">{{ jobLabel(x.type, lang) }}</span><span v-if="x.name">{{ t('ex.to', { name: x.name }) }}</span></p>
                  <p class="text-xs text-gray-600 mt-0.5">{{ capital(reasonText(x.reason, MESSAGE_REASONS, lang)) }} · {{ when(x.at) }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <router-link v-if="x.path" :to="x.path" class="btn-quiet">{{ t('ex.open') }}</router-link>
                  <button v-if="x.reason !== 'unknown_delivery' && x.reason !== 'not_delivered'" type="button" @click="retry(x)" :disabled="Boolean(busy)" class="btn-quiet">{{ t('ex.retry') }}</button>
                  <button type="button" @click="dismiss(x)" :disabled="Boolean(busy)" class="btn-quiet">{{ t('ex.dismiss') }}</button>
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
                <FaIcon name="arrows-rotate" :spin="busy === 'sms'" class="text-[11px]" />{{ t('ask_rc') }}
              </button>
            </header>
            <ul class="divide-y divide-gray-100">
              <li v-for="f in g.flags" :key="f.key" class="px-5 py-3 grid gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,17rem)_5.5rem_minmax(0,1fr)_auto] md:items-center">
                <p class="text-[13px] font-semibold text-gray-900">{{ f.label }}<span v-if="f.sends" class="ml-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">{{ t('flag.sends') }}</span></p>
                <p><span :class="CHIP[flagChip(f, lang).tone]" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold">{{ flagChip(f, lang).label }}</span></p>
                <div class="text-xs leading-relaxed">
                  <p class="text-gray-600">{{ f.about }}</p>
                  <p v-if="!f.on && flagWhy(f, health.flags, lang)" class="text-gray-700 font-medium mt-0.5">{{ flagWhy(f, health.flags, lang) }}</p>
                </div>
                <p class="md:text-right">
                  <button v-if="f.on || f.paused" type="button" @click="setPaused(f, !f.paused)" :disabled="Boolean(busy)" :aria-label="t(f.paused ? 'flag.resume_aria' : 'flag.pause_aria', { label: f.label })" class="btn-quiet">
                    <FaIcon :name="f.paused ? 'play' : 'pause'" class="text-[10px]" />{{ t(f.paused ? 'flag.resume' : 'flag.pause') }}
                  </button>
                </p>
              </li>
            </ul>
          </section>

          <AutomationSettings :health="health" @saved="onSaved" />

          <!-- Who gets no automatic messages. -->
          <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="so-h">
            <header class="px-5 py-4 border-b border-gray-100">
              <h2 id="so-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('so.title') }}</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">{{ t('so.about') }}</p>
            </header>
            <form @submit.prevent="addSuppression" class="px-5 py-4 flex flex-wrap items-end gap-3 border-b border-gray-100">
              <div class="flex-1 min-w-[14rem]">
                <label for="so-address" class="block text-[11px] font-semibold text-gray-700 mb-1">{{ t('so.address') }}</label>
                <input id="so-address" v-model.trim="newAddress" type="text" maxlength="254" autocomplete="off" class="fld w-full" :placeholder="t('so.placeholder')" />
              </div>
              <button type="submit" :disabled="Boolean(busy) || !newAddress" class="min-h-11 sm:min-h-0 px-4 py-2 rounded-lg bg-brand-navy text-white text-[13px] font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50">{{ t('so.add') }}</button>
            </form>
            <p v-if="!suppressions.length" class="px-5 py-4 text-[13px] text-gray-600">{{ t('so.empty') }}</p>
            <ul v-else class="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              <li v-for="s in suppressions" :key="s.id" class="px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <span class="font-semibold text-gray-900 tabular-nums break-all">{{ s.address }}</span>
                <span class="text-xs text-gray-600">{{ SUPPRESSION.includes(s.reason) ? t(`so.reason.${s.reason}`) : s.reason }} · {{ t(s.channel === 'sms' ? 'so.channel.sms' : s.channel === 'email' ? 'so.channel.email' : 'so.channel.both') }} · {{ when(s.at) }}<template v-if="s.by"> · {{ s.by }}</template></span>
                <button type="button" @click="removeSuppression(s)" :disabled="Boolean(busy)" :aria-label="t('so.remove_aria', { address: s.address })" class="btn-quiet ml-auto">{{ t('so.remove') }}</button>
              </li>
            </ul>
          </section>

          <p class="text-xs text-gray-600 px-1">
            {{ t('footer.before') }}
            <router-link :to="{ name: 'Activity', query: { actor: 'system' } }" class="font-semibold text-brand-navy underline">{{ t('footer.link') }}</router-link>{{ t('footer.after') }}
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
import { flagChip, flagWhy, jobLabel, reasonText, MESSAGE_REASONS } from './automationText.js'
import { useT } from '../../i18n/translator.js'
import { AUTOMATION } from '../../i18n/automation.js'

const { get, post, put, del } = useApi()
const { t, lang, locale } = useT(AUTOMATION)
const health = ref(null)
const exceptions = ref([])
const suppressions = ref([])
const error = ref('')
const notice = ref('')
const busy = ref(null)
const newAddress = ref('')

const CHIP = { good: 'bg-emerald-50 text-emerald-800', warn: 'bg-amber-50 text-amber-800', quiet: 'bg-gray-100 text-gray-600' }
const SUPPRESSION = ['opt_out', 'staff', 'invalid']
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function when(value) {
  if (!value) return t('never')
  return new Date(value).toLocaleString(locale.value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const plural = (key, count) => t(key, { count })

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
const setPaused = (f, paused) => act(`flag-${f.key}`, () => put(`/api/automation/flags/${f.key}`, { paused }), t(paused ? 'notice.paused' : 'notice.resumed', { label: f.label }))
const retry = (x) => act(`job-${x.id}`, () => post(`/api/automation/jobs/${x.id}/retry`, {}), t('notice.retried'))
const dismiss = (x) => act(`job-${x.id}`, () => post(`/api/automation/jobs/${x.id}/acknowledge`, {}))
const checkSms = () => act('sms', () => post('/api/automation/sms/check', {}), (r) => (r.available ? t('sms.can', { sender: r.sender }) : t('sms.cannot', { why: r.reasonText || r.reason })))
const removeSuppression = (s) => act(`so-${s.id}`, () => del(`/api/automation/suppressions/${s.id}`))
async function addSuppression() {
  const address = newAddress.value
  await act('so-add', () => post('/api/automation/suppressions', { channel: address.includes('@') ? 'email' : 'sms', address, reason: 'staff' }), t('notice.added'))
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
    ? { value: t('glance.clients'), detail: t('glance.clients_detail'), tone: 'text-gray-900' }
    : h.recipients.mode === 'test_list'
      ? { value: plural('glance.test_only', h.recipients.count), detail: t('glance.test_detail'), tone: 'text-amber-800' }
      : { value: t('glance.nobody'), detail: t('glance.nobody_detail'), tone: 'text-gray-900' }
  return [
    { key: 'worker', label: t('glance.worker'), value: t(worker.on ? 'glance.running' : worker.paused ? 'glance.paused' : 'glance.off'), tone: worker.on ? 'text-emerald-800' : 'text-gray-900',
      detail: worker.on ? t('glance.worker_on', { when: when(ran), count: on }) : flagWhy(worker, h.flags, lang.value) || t('glance.worker_off') },
    { key: 'where', label: t('glance.where'), ...where },
    { key: 'failed', label: t('glance.failed'), value: failing ? plural('glance.failed_count', failing) : t('glance.nothing'), tone: failing ? 'text-amber-800' : 'text-gray-900',
      detail: failing ? t('glance.failed_detail') : t('glance.none_detail') },
  ]
})

const groups = computed(() => {
  const h = health.value
  const of = (group) => h.flags.filter((f) => f.group === group)
  const sent = (purpose) => h.messages.filter((m) => m.purpose === purpose).reduce((n, m) => n + m.sent7d, 0)
  const sms = h.sms
  const cal = h.scheduling
  return [
    { key: 'core', title: t('group.core'), flags: of('core'), stats: null },
    { key: 'leads', title: t('group.leads'), flags: of('leads'),
      stats: t('stats.leads', { acks: plural('n.ack', sent('lead_ack')), followups: plural('n.followup', sent('lead_followup')), steps: plural('n.followup_step', h.leadFollowup.pending), deadlines: plural('n.deadline', h.escalation.pending) }),
      problem: !h.email.configured ? t('problem.email', { problems: h.email.problems.join('; ') }) : null },
    { key: 'phone', title: t('group.phone'), flags: of('phone'),
      stats: sms.checkedAt
        ? (sms.available ? t('stats.sms', { sender: sms.sender, when: when(sms.checkedAt), texts: plural('n.missed_text', sent('missed_call')) }) : t('stats.sms_last_asked', { when: when(sms.checkedAt) }))
        : t('stats.sms_never'),
      problem: [sms.checkedAt && !sms.available ? `${t('sms.cannot', { why: sms.reasonText || sms.reason })}.` : null,
        sms.inbound?.lastError ? t('problem.replies', { error: sms.inbound.lastError, when: when(sms.inbound.lastFailureAt) }) : null].filter(Boolean).join(' ') || null },
    { key: 'scheduling', title: t('group.scheduling'), flags: of('scheduling'),
      stats: cal.configured ? `${t('stats.calendar', { when: when(cal.lastSuccessAt) })} ${t(cal.bookingLinkSet ? 'stats.link_set' : 'stats.link_unset')}` : null,
      problem: !cal.configured ? t('problem.calendar', { problems: cal.problems.join('; ') }) : cal.lastError ? t('problem.calendar_failed', { error: cal.lastError, when: when(cal.lastFailureAt) }) : null },
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
