<template>
  <!-- Home: the few things waiting for me, most urgent first (GET
       /api/work-queue): my callback reminders, then website messages nobody
       has opened. Each row opens the record; View all opens the full lists. -->
  <section aria-labelledby="my-follow-ups-h" class="font-ui">
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
      <h2 id="my-follow-ups-h" class="font-ui text-[17px] font-semibold tracking-tight text-gray-900">My follow-ups</h2>
      <div class="ml-auto flex items-center gap-1 text-[13px]">
        <span class="text-gray-600">View all:</span>
        <router-link v-if="sections.calls" :to="{ name: 'Calls' }" class="mf-link">Needs attention</router-link>
        <span v-if="sections.calls && sections.leads" class="text-gray-400" aria-hidden="true">·</span>
        <router-link v-if="sections.leads" :to="{ name: 'Inbox' }" class="mf-link">Messages</router-link>
      </div>
    </div>

    <div class="mt-2 glass rounded-[24px] overflow-hidden">
      <p v-if="error && !items.length" class="px-5 py-4 text-[13px] text-gray-600">Could not load your follow-ups. Reload the page to try again.</p>
      <p v-else-if="loaded && !items.length" class="flex items-center gap-2.5 px-5 py-4 text-[13.5px] text-gray-700">
        <FaIcon name="circle-check" class="text-green-700" />Nothing waiting for you right now.
      </p>
      <div v-else-if="!loaded" class="px-5 py-4 text-[13px] text-gray-500" aria-busy="true">Loading…</div>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="item in rows" :key="item.key">
          <router-link :to="item.path"
            class="mf-row flex items-center gap-3 px-4 sm:px-5 py-3 min-h-14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy">
            <span :class="TILE[item.tone]" class="w-9 h-9 flex-shrink-0 rounded-full inline-flex items-center justify-center text-[13px]" aria-hidden="true">
              <FaIcon :name="item.icon" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] font-semibold text-gray-900">{{ item.title }}</span>
              <span :class="WHEN[item.tone]" class="block text-[12.5px] tabular-nums">{{ item.when }}</span>
            </span>
            <FaIcon name="chevron-right" class="text-[11px] text-gray-400 flex-shrink-0" />
          </router-link>
        </li>
      </ul>
      <p v-if="hasMore" class="px-5 py-2.5 border-t border-gray-100 text-[12.5px] text-gray-600">
        More waiting:
        <router-link v-if="sections.calls" :to="{ name: 'Calls' }" class="mf-link">Needs attention</router-link><template v-if="sections.calls && sections.leads"> and </template><router-link v-if="sections.leads" :to="{ name: 'Inbox' }" class="mf-link">Messages</router-link>.
      </p>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import { useApi, latestOnly } from '../../composables/useApi.js'
import { workItemText } from './workQueueText.js'

const { get } = useApi()
const items = ref([])
const hasMore = ref(false)
const sections = ref({ calls: false, leads: false })
const loaded = ref(false)
const error = ref(false)
const now = ref(Date.now())

const rows = computed(() => items.value.map((it, i) => ({ ...it, ...workItemText(it, now.value), key: `${it.kind}-${it.reminderId ?? it.path}-${i}` })))

const latest = latestOnly()
async function load() {
  try {
    const r = await latest(() => get('/api/work-queue'))
    if (!r.current) return
    items.value = r.value.items || []
    hasMore.value = Boolean(r.value.hasMore)
    sections.value = r.value.sections || sections.value
    error.value = false
  } catch {
    // A failed refresh keeps what is shown.
    error.value = true
  } finally {
    loaded.value = true
    now.value = Date.now()
  }
}

// Refreshed every minute while Home is showing, and on coming back to it.
let timer = null
const onVisible = () => { if (document.visibilityState === 'visible') load() }
function start() {
  stop()
  timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60 * 1000)
  document.addEventListener('visibilitychange', onVisible)
}
function stop() {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
}
let activations = 0
onMounted(() => { load(); start() })
onActivated(() => { if (activations++) { load(); start() } })
onDeactivated(stop)
onBeforeUnmount(stop)

const TILE = { overdue: 'bg-amber-100 text-amber-900', due: 'bg-amber-50 text-amber-800', quiet: 'bg-gray-100 text-gray-700' }
const WHEN = { overdue: 'text-amber-800 font-semibold', due: 'text-amber-800', quiet: 'text-gray-600' }
</script>

<style scoped>
.mf-row { transition: background-color 160ms ease; }
.mf-row:hover { background: var(--surface-hover); }
.mf-link { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; font-weight: 600; color: var(--text-link); border-radius: 6px; }
@media (min-width: 640px) { .mf-link { min-height: 32px; } }
.mf-link:hover { text-decoration: underline; }
.mf-link:focus-visible { outline: 2px solid var(--primary-ring); outline-offset: 1px; }
</style>
