<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader title="Test channel" current="test-channel" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 space-y-5 font-ui">
        <div>
          <h2 class="text-base font-semibold text-gray-900">Test channel</h2>
          <p class="text-xs text-gray-500 mt-0.5 max-w-2xl">Send test forms through the real website. They go through the same checks as a client’s, then land here instead of the inbox: no lead, no office email, and no notification for anyone but you.</p>
        </div>

        <!-- Send a test -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200 px-4 sm:px-5 py-4" aria-labelledby="tc-send">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 id="tc-send" class="text-sm font-semibold text-gray-900">Send a test</h3>
              <p class="text-xs text-gray-500 mt-0.5">Open a test link, then fill in the contact form or start a chat. The site shows “Test mode” while it is on.</p>
            </div>
            <button type="button" @click="makeLink" :disabled="linking"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
              <FaIcon :name="linking ? 'spinner' : 'flask'" :spin="linking" class="text-xs" />{{ testLink ? 'New test link' : 'Get a test link' }}
            </button>
          </div>
          <p v-if="linkError" role="alert" class="mt-3 text-sm text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ linkError }}</p>

          <div v-if="testLink" class="mt-4 grid gap-2 sm:grid-cols-2">
            <div v-for="l in links" :key="l.key" class="rounded-lg ring-1 ring-gray-200 bg-brand-surface px-3.5 py-3 min-w-0">
              <p class="text-xs font-semibold text-gray-800">{{ l.label }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">{{ l.hint }}</p>
              <div class="mt-2.5 flex flex-wrap gap-2">
                <a :href="l.url" target="_blank" rel="noopener"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-xs font-semibold transition-colors">
                  Open the website<FaIcon name="arrow-right" class="text-[10px]" />
                </a>
                <button type="button" @click="copy(l)"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 ring-gray-300 bg-white text-gray-700 hover:bg-brand-surface text-xs font-semibold transition-colors">
                  <FaIcon :name="copied === l.key ? 'check' : 'copy'" class="text-[10px]" />{{ copied === l.key ? 'Copied' : 'Copy link' }}
                </button>
              </div>
            </div>
            <p class="sm:col-span-2 text-[11px] text-gray-500">
              Works until <time :datetime="testLink.expiresAt" class="tabular-nums">{{ clock(testLink.expiresAt) }}</time>, in the browser tab it opens.
              Changing your password or signing out everywhere ends it sooner.
            </p>
          </div>
        </section>

        <!-- What came in -->
        <section class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" aria-labelledby="tc-received" :aria-busy="loading">
          <div class="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-b border-gray-100">
            <h3 id="tc-received" class="text-sm font-semibold text-gray-900">Received <span class="text-gray-500 font-normal tabular-nums">({{ items.length }})</span></h3>
            <div class="ml-auto flex items-center gap-2">
              <button type="button" @click="load" :disabled="loading" aria-label="Refresh" title="Refresh"
                class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors disabled:opacity-50">
                <FaIcon name="rotate-right" :spin="loading" class="text-xs" />
              </button>
              <button v-if="items.length && !confirmClear" type="button" @click="confirmClear = true"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-red ring-1 ring-red-200 hover:bg-red-50 transition-colors">
                <FaIcon name="trash" class="text-[10px]" />Clear all
              </button>
            </div>
            <ConfirmInline v-if="confirmClear" class="basis-full" :title="`Remove all ${items.length} test form${items.length === 1 ? '' : 's'}?`"
              body="Only test forms are removed. Leads in the inbox are not touched." confirm-label="Remove all" :busy="clearing"
              @confirm="clearAll" @cancel="confirmClear = false" />
          </div>

          <p v-if="error" role="alert" class="m-4 text-sm text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
          <p v-if="loading && !loaded" class="py-12 text-center text-sm text-gray-500">Loading…</p>
          <div v-else-if="loaded && !items.length" class="py-12 px-6 text-center">
            <FaIcon name="flask" class="text-3xl text-gray-200" />
            <p class="mt-3 text-sm text-gray-700">No test forms yet.</p>
            <p class="mt-1 text-xs text-gray-500">Get a test link above and send one from the website. It shows here when you come back to this tab.</p>
          </div>

          <div v-else-if="items.length" class="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:min-h-[420px]">
            <!-- The list; on a phone it gives way to the open test. -->
            <ol :class="selected ? 'hidden lg:block' : ''" class="divide-y divide-gray-100 lg:border-r lg:border-gray-100 lg:max-h-[640px] lg:overflow-y-auto">
              <li v-for="t in items" :key="t.id">
                <button type="button" @click="open(t.id)" :aria-current="selectedId === t.id ? 'true' : undefined"
                  :class="selectedId === t.id ? 'bg-brand-surface' : 'hover:bg-brand-surface/60'"
                  class="w-full text-left px-4 sm:px-5 py-3 transition-colors">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-semibold text-gray-900">{{ t.first_name }} {{ t.last_name }}</span>
                    <span :class="t.source === 'chat' ? 'bg-brand-navy/10 text-brand-navy' : 'bg-gray-100 text-gray-600'"
                      class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider">{{ t.source === 'chat' ? 'Chat' : 'Form' }}</span>
                    <time :datetime="t.created_at" class="ml-auto shrink-0 text-[11px] text-gray-500 tabular-nums">{{ when(t.created_at) }}</time>
                  </span>
                  <span class="block mt-0.5 truncate text-xs text-gray-500">{{ t.message || '(no message)' }}</span>
                </button>
              </li>
            </ol>

            <!-- The open test -->
            <div :class="selected ? '' : 'hidden lg:flex'" class="min-w-0 lg:flex lg:flex-col">
              <div v-if="!selected" class="flex-1 flex items-center justify-center py-12 text-sm text-gray-500">Select a test form to see it.</div>
              <article v-else class="px-4 sm:px-6 py-5" :aria-label="`Test form from ${selected.first_name} ${selected.last_name}`">
                <button type="button" @click="close" class="lg:hidden mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy">
                  <FaIcon name="arrow-left" class="text-[10px]" />All test forms
                </button>
                <div class="flex flex-wrap items-start gap-3">
                  <div class="min-w-0">
                    <h4 class="font-heading text-xl text-gray-900 break-words">{{ selected.first_name }} {{ selected.last_name }}</h4>
                    <p class="text-xs text-gray-500 mt-0.5">
                      {{ selected.source === 'chat' ? 'Chat' : 'Contact form' }} · <time :datetime="selected.created_at">{{ fullTime(selected.created_at) }}</time>
                    </p>
                  </div>
                  <button v-if="!confirmRemove" type="button" @click="confirmRemove = true"
                    class="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 ring-1 ring-gray-300 hover:text-brand-red hover:ring-red-200 hover:bg-red-50 transition-colors">
                    <FaIcon name="trash" class="text-[10px]" />Remove
                  </button>
                </div>
                <ConfirmInline v-if="confirmRemove" class="mt-3" title="Remove this test form?" confirm-label="Remove" :busy="removing"
                  @confirm="remove(selected.id)" @cancel="confirmRemove = false" />

                <dl class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div class="min-w-0"><dt class="text-[11px] font-semibold text-gray-500">Email</dt><dd class="text-gray-900 break-all">{{ selected.email }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">Phone</dt><dd class="text-gray-900 tabular-nums">{{ formatPhone(selected.phone) }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">Service</dt><dd class="text-gray-900">{{ consultationLabel(selected.consultation_type) }}</dd></div>
                  <div><dt class="text-[11px] font-semibold text-gray-500">Location</dt><dd class="text-gray-900">{{ selected.location ? countryLabel(selected.location, adminLocale()) : '—' }}</dd></div>
                </dl>

                <div class="mt-5 space-y-3">
                  <div class="bg-brand-surface rounded-2xl rounded-tl-sm p-4">
                    <p class="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{{ selected.message || '(no message)' }}</p>
                  </div>
                  <div v-for="m in selected.chat_messages" :key="m.id">
                    <div class="bg-brand-surface rounded-2xl rounded-tl-sm p-4">
                      <p class="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{{ m.body }}</p>
                    </div>
                    <p class="text-[11px] text-gray-500 mt-1 ml-1"><time :datetime="m.sent_at">{{ fullTime(m.sent_at) }}</time></p>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../../composables/useApi.js'
import { consultationLabel } from '../../data/consultationTypes.js'
import { countryLabel } from '../../data/countries.js'
import { adminLocale } from '../../utils/locale.js'
import { formatPhone } from '../../utils/phone.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import FaIcon from '../../components/FaIcon.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'

const { get, post, del } = useApi()
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

const links = computed(() => testLink.value ? [
  { key: 'contact', label: 'Contact form', hint: 'The consultation page, ready to fill in.', url: testLink.value.contactUrl },
  { key: 'chat', label: 'Chat', hint: 'The home page; open the chat bubble in the corner.', url: testLink.value.siteUrl },
] : [])

const clock = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fullTime = (d) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
function when(d) {
  const date = new Date(d)
  return date.toDateString() === new Date().toDateString() ? clock(d) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = (await get('/api/test-channel')).items
    loaded.value = true
    // The open one may have been removed meanwhile.
    if (selected.value && !items.value.some((t) => t.id === selected.value.id)) selected.value = null
  } catch (err) {
    error.value = `Could not load the test channel: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function open(id) {
  confirmRemove.value = false
  try {
    selected.value = await get(`/api/test-channel/${id}`)
    if (String(route.query.test || '') !== String(id)) router.replace({ query: { test: id } })
  } catch (err) {
    error.value = `Could not open that test form: ${err.message}`
    selected.value = null
  }
}
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
    linkError.value = `Could not make a test link: ${err.message}`
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
    linkError.value = 'Could not copy the link. Use “Open the website” instead.'
  }
}

async function remove(id) {
  removing.value = true
  try {
    await del(`/api/test-channel/${id}`)
    confirmRemove.value = false
    close()
    await load()
  } catch (err) {
    error.value = `Could not remove it: ${err.message}`
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
    await load()
  } catch (err) {
    error.value = `Could not clear the test channel: ${err.message}`
  } finally {
    clearing.value = false
  }
}

// Coming back from the website tab is when a new test has arrived.
const onVisible = () => { if (document.visibilityState === 'visible') load() }

// ?test=<id>: a test form's notification opens it.
watch(() => route.query.test, (id) => {
  if (/^\d+$/.test(String(id || '')) && Number(id) !== selectedId.value) open(Number(id))
}, { immediate: true })

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  clearTimeout(copiedTimer)
})
</script>
