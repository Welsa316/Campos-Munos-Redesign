<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader :title="t('page.title')" current="test-channel" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 space-y-5 font-ui">
        <div>
          <h2 class="text-base font-semibold text-gray-900">{{ t('page.title') }}</h2>
          <p class="text-xs text-gray-500 mt-0.5 max-w-2xl">{{ t('intro') }}</p>
        </div>

        <!-- Said once for the whole page, and again on everything a test produces. -->
        <p class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-amber-50 ring-1 ring-amber-300 px-4 py-3 text-xs text-amber-900" data-test-banner>
          <span class="inline-flex items-center gap-2 font-semibold tracking-[0.06em]"><FaIcon name="flask" class="text-[11px]" />{{ TEST_BANNER }}</span>
          <span>{{ t('banner') }}</span>
        </p>

        <!-- Send a test -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200 px-4 sm:px-5 py-4" aria-labelledby="tc-send">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 id="tc-send" class="text-sm font-semibold text-gray-900">{{ t('send.title') }}</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ t('send.about') }}</p>
            </div>
            <button type="button" @click="makeLink" :disabled="linking"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
              <FaIcon :name="linking ? 'spinner' : 'flask'" :spin="linking" class="text-xs" />{{ t(testLink ? 'send.new_link' : 'send.get_link') }}
            </button>
          </div>
          <p v-if="linkError" role="alert" class="mt-3 text-sm text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ linkError }}</p>

          <div v-if="testLink" class="mt-4 grid gap-2 sm:grid-cols-2">
            <div v-for="l in links" :key="l.key" class="rounded-lg ring-1 ring-gray-200 bg-brand-surface px-3.5 py-3 min-w-0">
              <p class="text-xs font-semibold text-gray-800">{{ t(`link.${l.key}`) }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">{{ t(`link.${l.key}_hint`) }}</p>
              <div class="mt-2.5 flex flex-wrap gap-2">
                <a :href="l.url" target="_blank" rel="noopener"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-xs font-semibold transition-colors">
                  {{ t('link.open') }}<FaIcon name="arrow-right" class="text-[10px]" />
                </a>
                <button type="button" @click="copy(l)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 ring-gray-300 bg-white text-gray-700 hover:bg-brand-surface text-xs font-semibold transition-colors">
                  <FaIcon :name="copied === l.key ? 'check' : 'copy'" class="text-[10px]" />{{ t(copied === l.key ? 'link.copied' : 'link.copy') }}
                </button>
              </div>
            </div>
            <p class="sm:col-span-2 text-[11px] text-gray-500">
              {{ t('link.works_until', { count: clockCount(clock(testLink.expiresAt)) }) }} <time :datetime="testLink.expiresAt" class="tabular-nums">{{ clock(testLink.expiresAt) }}</time>{{ t('link.works_until_after') }}
              {{ t('link.ends_sooner') }}
            </p>
          </div>
        </section>

        <!-- Test automation mode -->
        <p v-if="overviewError" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ overviewError }}</p>
        <TestAutomationStart v-if="overview" :overview="overview" @started="onStarted" @options="(o) => (startOptions = o)" />

        <section v-if="overview?.pending.length" class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" aria-labelledby="ta-waiting">
          <h3 id="ta-waiting" class="px-4 sm:px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">{{ t('waiting.title') }} <span class="text-gray-500 font-normal tabular-nums">({{ overview.pending.length }})</span></h3>
          <ul class="divide-y divide-gray-100" aria-live="polite">
            <li v-for="p in overview.pending" :key="p.testId">
              <button type="button" @click="open(p.testId, true)" class="w-full text-left px-4 sm:px-5 py-2.5 min-h-11 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs hover:bg-brand-surface/60 transition-colors">
                <span class="font-semibold text-gray-900">{{ p.testName || t('list.test', { id: p.testId }) }}</span>
                <span class="text-gray-600">{{ t('waiting.next', { step: stepLabel(p.nextStep, lang) }) }}</span>
                <span class="text-amber-800 font-semibold tabular-nums">{{ dueText(p.nextDueAt, now, lang) }}</span>
                <span class="ml-auto text-gray-500 tabular-nums">{{ t('waiting.count', { count: p.pending }) }}</span>
              </button>
            </li>
          </ul>
        </section>

        <!-- What came in -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" aria-labelledby="tc-received" :aria-busy="loading">
          <div class="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-100">
            <h3 id="tc-received" class="text-sm font-semibold text-gray-900">{{ t('received.title') }} <span class="text-gray-500 font-normal tabular-nums">({{ items.length }})</span></h3>
            <div class="ml-auto flex items-center gap-2">
              <button type="button" @click="load" :disabled="loading" :aria-label="t('refresh')" :title="t('refresh')"
                class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors disabled:opacity-50">
                <FaIcon name="rotate-right" :spin="loading" class="text-xs" />
              </button>
              <button v-if="items.length && !confirmClear" type="button" @click="confirmClear = true"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-red ring-1 ring-red-200 hover:bg-red-50 transition-colors">
                <FaIcon name="trash" class="text-[10px]" />{{ t('reset') }}
              </button>
            </div>
            <ConfirmInline v-if="confirmClear" class="basis-full" :title="t('reset.q', { count: items.length })"
              :body="t('reset.body')" :confirm-label="t('reset')" :busy="clearing"
              @confirm="clearAll" @cancel="confirmClear = false" />
          </div>

          <p v-if="error" role="alert" class="m-4 text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
          <p v-if="loading && !loaded" class="py-12 text-center text-sm text-gray-500">{{ t('loading') }}</p>
          <div v-else-if="loaded && !items.length" class="py-12 px-6 text-center">
            <FaIcon name="flask" class="text-3xl text-gray-200" />
            <p class="mt-3 text-sm text-gray-700">{{ t('empty') }}</p>
            <p class="mt-1 text-xs text-gray-500">{{ t('empty.hint') }}</p>
          </div>

          <div v-else-if="items.length" class="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:min-h-[420px]">
            <!-- The list; on a phone it gives way to the open test. -->
            <ol :class="selected ? 'hidden lg:block' : ''" class="divide-y divide-gray-100 lg:border-r lg:border-gray-100 lg:max-h-[640px] lg:overflow-y-auto">
              <li v-for="f in items" :key="f.id">
                <button type="button" @click="open(f.id)" :aria-current="selectedId === f.id ? 'true' : undefined"
                  :class="selectedId === f.id ? 'bg-brand-surface' : 'hover:bg-brand-surface/60'"
                  class="w-full text-left px-4 sm:px-5 py-3 transition-colors">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-semibold text-gray-900">{{ f.first_name }} {{ f.last_name }}</span>
                    <span :class="f.source === 'chat' ? 'bg-brand-navy/10 text-brand-navy' : 'bg-gray-100 text-gray-600'"
                      class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider">{{ t(SOURCES.includes(f.source) ? `source.${f.source}` : 'source.other') }}</span>
                    <time :datetime="f.created_at" class="ml-auto shrink-0 text-[11px] text-gray-500 tabular-nums">{{ when(f.created_at) }}</time>
                  </span>
                  <span class="block mt-0.5 truncate text-xs text-gray-500">{{ f.message || t('no_message') }}</span>
                  <span v-if="listNote(f)" :class="f.automation_pending ? 'text-amber-800' : 'text-gray-500'" class="block mt-0.5 truncate text-[11px] font-semibold">{{ listNote(f, lang) }}</span>
                </button>
              </li>
            </ol>

            <!-- The open test -->
            <div :class="selected ? '' : 'hidden lg:flex'" class="min-w-0 lg:flex lg:flex-col">
              <div v-if="!selected" class="flex-1 flex items-center justify-center py-12 text-sm text-gray-500">{{ t('select') }}</div>
              <article v-else class="px-4 sm:px-6 py-5" :aria-label="t('form_from', { name: `${selected.first_name} ${selected.last_name}` })">
                <button type="button" @click="close" class="lg:hidden mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
                  <FaIcon name="arrow-left" class="text-[10px]" />{{ t('all_forms') }}
                </button>
                <div class="flex flex-wrap items-start gap-3">
                  <div class="min-w-0">
                    <h4 class="font-heading text-xl text-gray-900 break-words">{{ selected.first_name }} {{ selected.last_name }}</h4>
                    <p class="text-xs text-gray-500 mt-0.5">
                      {{ t(SOURCES.includes(selected.source) ? `source_long.${selected.source}` : 'source_long.other') }} · <time :datetime="selected.created_at">{{ fullTime(selected.created_at) }}</time>
                    </p>
                  </div>
                  <button v-if="!confirmRemove" type="button" @click="confirmRemove = true"
                    class="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 ring-1 ring-gray-300 hover:text-brand-red hover:ring-red-200 hover:bg-red-50 transition-colors">
                    <FaIcon name="trash" class="text-[10px]" />{{ t('remove') }}
                  </button>
                </div>
                <ConfirmInline v-if="confirmRemove" class="mt-3" :title="t('remove.q')" :confirm-label="t('remove')" :busy="removing"
                  @confirm="remove(selected.id)" @cancel="confirmRemove = false" />

                <dl class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div class="min-w-0"><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.email') }}</dt><dd class="text-gray-900 break-all">{{ selected.email }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.phone') }}</dt><dd class="text-gray-900 tabular-nums">{{ formatPhone(selected.phone) }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.service') }}</dt><dd class="text-gray-900">{{ consultationLabel(selected.consultation_type, lang) }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.location') }}</dt><dd class="text-gray-900">{{ selected.location ? countryLabel(selected.location, lang) : '—' }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.language') }}</dt><dd class="text-gray-900">{{ t(['es', 'en'].includes(selected.language) ? `language.${selected.language}` : 'language.unknown') }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.sms') }}</dt><dd class="text-gray-900">{{ t(selected.sms_consent ? 'sms.yes' : 'sms.no') }}</dd></div>
                  <div class="min-w-0 sm:col-span-2"><dt class="text-[11px] font-semibold text-gray-500">{{ t('field.campaign') }}</dt><dd class="text-gray-900 break-all">{{ campaignLine(selected) || '—' }}</dd></div>
                </dl>

                <div class="mt-5 space-y-3">
                  <div class="bg-brand-surface rounded-2xl rounded-tl-sm p-4">
                    <p class="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{{ selected.message || t('no_message') }}</p>
                  </div>
                  <div v-for="m in selected.chat_messages" :key="m.id">
                    <div class="bg-brand-surface rounded-2xl rounded-tl-sm p-4">
                      <p class="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{{ m.body }}</p>
                    </div>
                    <p class="text-[11px] text-gray-500 mt-1 ml-1"><time :datetime="m.sent_at">{{ fullTime(m.sent_at) }}</time></p>
                  </div>
                </div>

                <TestAutomationPanel v-if="overview?.on" ref="panelEl" :test="selected" :options="startOptions" :now="now" :busy="acting" :error="panelError" :ask-known="askKnown"
                  @start="startOn" @action="act" @dismiss="askKnown = ''" />
              </article>
            </div>
          </div>
        </section>

        <!-- Everything any test did: the test-only history -->
        <section v-if="overview" class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" aria-labelledby="ta-history">
          <div class="px-4 sm:px-5 py-3 border-b border-gray-100">
            <h3 id="ta-history" class="text-sm font-semibold text-gray-900">{{ t('history.title') }} <span class="text-gray-500 font-normal tabular-nums">({{ overview.history.length }})</span></h3>
            <p class="text-[11px] text-gray-500 mt-0.5">{{ t('history.about') }}</p>
          </div>
          <p v-if="!overview.history.length" class="py-8 px-6 text-center text-xs text-gray-500">{{ t('history.empty') }}</p>
          <TestEventList v-else :events="overview.history" show-test class="px-4 sm:px-5 max-h-[28rem] overflow-y-auto" @open="(id) => open(id, true)" />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../../composables/useApi.js'
import { consultationLabel } from '../../data/consultationTypes.js'
import { countryLabel } from '../../data/countries.js'
import { formatPhone } from '../../utils/phone.js'
import { campaignLine } from '../../components/messages/campaignText.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import FaIcon from '../../components/FaIcon.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'
import TestAutomationStart from './TestAutomationStart.vue'
import TestAutomationPanel from './TestAutomationPanel.vue'
import TestEventList from './TestEventList.vue'
import { TEST_BANNER, stepLabel, dueText, listNote } from './testAutomationText.js'
import { useT, clockCount } from '../../i18n/translator.js'
import { TEST_CHANNEL } from '../../i18n/testChannel.js'

// Where a test came from: source.<key> and source_long.<key> (i18n/testChannel.js).
const SOURCES = ['chat', 'contact', 'portal']

const { get, post, del } = useApi()
const { t, lang, locale } = useT(TEST_CHANNEL)
const route = useRoute()
const router = useRouter()

const items = ref([])
const loaded = ref(false)
const loading = ref(false)
const error = ref('')
const selected = ref(null)
const selectedId = computed(() => selected.value?.id ?? null)

const testLink = ref(null)
const linking = ref(false)
const linkError = ref('')
const copied = ref('')
const confirmClear = ref(false)
const clearing = ref(false)
const confirmRemove = ref(false)
const removing = ref(false)

// Each link's name and hint are link.<key> and link.<key>_hint (i18n/testChannel.js).
const links = computed(() => testLink.value ? [
  { key: 'contact', url: testLink.value.contactUrl },
  { key: 'chat', url: testLink.value.siteUrl },
] : [])

const clock = (d) => new Date(d).toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' })
const fullTime = (d) => new Date(d).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
function when(d) {
  const date = new Date(d)
  return date.toDateString() === new Date().toDateString() ? clock(d) : date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
}

// quiet: the refresh a running test does on its own, with no spinner.
async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  if (!quiet) error.value = ''
  try {
    items.value = (await get('/api/test-channel')).items
    loaded.value = true
    // The open one may have been removed meanwhile.
    if (selected.value && !items.value.some((x) => x.id === selected.value.id)) selected.value = null
  } catch (err) {
    if (!quiet) error.value = t('error.load', { error: err.message })
  } finally {
    if (!quiet) loading.value = false
  }
}

async function open(id, reveal = false) {
  confirmRemove.value = false
  panelError.value = ''
  askKnown.value = ''
  try {
    selected.value = await get(`/api/test-channel/${id}`)
    if (String(route.query.test || '') !== String(id)) router.replace({ query: { test: id } })
    if (reveal) nextTick(() => panelEl.value?.$el?.scrollIntoView?.({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' }))
  } catch (err) {
    error.value = t('error.open', { error: err.message })
    selected.value = null
  }
}

// --- test automation mode ---------------------------------------------------------------

const overview = ref(null)
const overviewError = ref('')
const startOptions = ref({ timing: 'accelerated', sendEmail: true, sendSms: false, notifyMe: false })
const acting = ref(false)
const panelError = ref('')
const askKnown = ref('')
const panelEl = ref(null)
// The clock the countdowns read; it only ticks while something is waiting.
const now = ref(Date.now())
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const somethingWaiting = computed(() => Boolean(overview.value?.pending.length))

async function loadOverview() {
  try {
    overview.value = await get('/api/test-channel/automation')
    overviewError.value = ''
  } catch (err) {
    if (!overview.value) overviewError.value = t('error.overview', { error: err.message })
  }
}

/** The open test and the overview, quietly: what the page shows while a test runs. */
async function refreshRunning() {
  now.value = Date.now()
  await Promise.all([loadOverview(), load({ quiet: true })])
  if (selected.value?.automation) {
    try {
      const fresh = await get(`/api/test-channel/${selected.value.id}`)
      if (selected.value?.id === fresh.id) selected.value = fresh
    } catch { /* removed meanwhile: the list says so on its next load */ }
  }
}

async function onStarted(id) {
  await Promise.all([load(), loadOverview()])
  await open(id, true)
}

/** Start the automation test on the open test form, with the choices above. */
async function startOn(confirmKnown) {
  if (!selected.value) return
  acting.value = true
  panelError.value = ''
  try {
    await post(`/api/test-channel/${selected.value.id}/automation`, { ...startOptions.value, confirmKnown: confirmKnown === true })
    askKnown.value = ''
    await Promise.all([open(selected.value.id), loadOverview(), load()])
  } catch (err) {
    if (err.code === 'address_on_a_lead') askKnown.value = err.message
    else panelError.value = t('error.start', { error: err.message })
  } finally {
    acting.value = false
  }
}

async function act(action) {
  if (!selected.value) return
  acting.value = true
  panelError.value = ''
  try {
    const r = await post(`/api/test-channel/${selected.value.id}/automation/actions`, { action })
    selected.value = { ...selected.value, automation: r.automation }
    await Promise.all([loadOverview(), load()])
  } catch (err) {
    panelError.value = t('error.action', { error: err.message })
  } finally {
    acting.value = false
  }
}

// While a test is waiting on a step: a countdown every second, and a look at
// the server every three (the server runs a due step within five).
let clockTimer = null
let pollTimer = null
watch(somethingWaiting, (on) => {
  clearInterval(clockTimer)
  clearInterval(pollTimer)
  if (!on) return
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && !acting.value) refreshRunning() }, 3000)
}, { immediate: true })


function close() {
  selected.value = null
  router.replace({ query: {} })
}

async function makeLink() {
  linking.value = true
  linkError.value = ''
  try {
    testLink.value = await post('/api/test-channel/link', {})
  } catch (err) {
    linkError.value = t('link.error', { error: err.message })
  } finally {
    linking.value = false
  }
}

let copiedTimer = null
async function copy(l) {
  try {
    await navigator.clipboard.writeText(l.url)
    copied.value = l.key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = '' }, 2000)
  } catch {
    linkError.value = t('link.copy_failed')
  }
}

async function remove(id) {
  removing.value = true
  try {
    await del(`/api/test-channel/${id}`)
    confirmRemove.value = false
    close()
    await Promise.all([load(), loadOverview()])
  } catch (err) {
    error.value = t('error.remove', { error: err.message })
  } finally {
    removing.value = false
  }
}

async function clearAll() {
  clearing.value = true
  try {
    await del('/api/test-channel')
    confirmClear.value = false
    close()
    await Promise.all([load(), loadOverview()])
  } catch (err) {
    error.value = t('error.clear', { error: err.message })
  } finally {
    clearing.value = false
  }
}

// Coming back from the website tab is when a new test has arrived.
const onVisible = () => { if (document.visibilityState === 'visible') { load(); refreshRunning() } }

// ?test=<id>: a test form's notification opens it.
watch(() => route.query.test, (id) => {
  if (/^\d+$/.test(String(id || '')) && Number(id) !== selectedId.value) open(Number(id))
}, { immediate: true })

onMounted(() => {
  load()
  loadOverview()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  clearTimeout(copiedTimer)
  clearInterval(clockTimer)
  clearInterval(pollTimer)
})
</script>
