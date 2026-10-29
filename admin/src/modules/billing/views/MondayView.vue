<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <p v-if="loading && !state" class="py-12 text-center text-sm text-gray-500 font-ui">Loading…</p>

    <template v-if="state">
      <!-- Connection -->
      <section class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 flex flex-wrap items-center gap-3" aria-label="Connection">
        <span v-if="state.mode === 'mock'" class="inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-violet-800 bg-violet-100 px-2.5 py-1 rounded-full">Simulated board</span>
        <span v-else class="inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-brand-navy bg-brand-navy/10 px-2.5 py-1 rounded-full">monday.com API</span>
        <p class="text-xs font-ui text-gray-700 flex-1 min-w-[16rem]">
          <template v-if="state.mode === 'mock'">Synthetic clients only. Nothing here reaches monday.com, and the board resets when the server restarts.</template>
          <template v-else-if="state.configError">{{ state.configError }}</template>
          <template v-else-if="!state.writesEnabled">Connected for reading. Writes are switched off on the server (MONDAY_WRITES_ENABLED), so applying a sync is a dry run.</template>
          <template v-else>Writes are switched on: applying a sync updates the mapped columns on monday.com.</template>
          <span v-if="state.lastCheck" class="block text-gray-500 mt-0.5">Last check {{ shortDate(state.lastCheck.checked_at) }}: {{ state.lastCheck.ok ? 'OK' : 'failed' }}</span>
        </p>
        <button @click="check" :disabled="Boolean(busy)" class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-brand-surface">Check connection</button>
      </section>

      <!-- Board + column mapping -->
      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="cfg-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h2 id="cfg-h" class="text-sm font-ui font-semibold text-gray-900">Board and columns</h2>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">Only the columns chosen here are ever written. Boards are never created or restructured, and status labels must already exist on the column.</p>
        </header>
        <div class="p-5 space-y-5">
          <div class="max-w-md">
            <label for="board" class="text-[11px] font-ui font-semibold text-gray-700">Client board</label>
            <select id="board" v-model="boardId" @change="loadColumns"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
              <option value="">{{ boards.length ? 'Choose a board' : 'Load boards first' }}</option>
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ b.name }} ({{ b.itemsCount }} items)</option>
            </select>
            <button v-if="!boards.length" @click="loadBoards" :disabled="Boolean(busy)" class="mt-2 text-xs font-ui text-brand-navy underline">Load boards</button>
          </div>

          <div v-if="columns.length" class="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-x-6 gap-y-4">
            <div v-for="f in FIELDS" :key="f.key">
              <label :for="`col-${f.key}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ f.label }}</label>
              <select :id="`col-${f.key}`" v-model="map[f.key]"
                class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                <option value="">Don't sync this</option>
                <option v-for="c in columnsOfType(f.types)" :key="c.id" :value="c.id">{{ c.title }} ({{ c.type }})</option>
              </select>
              <p class="mt-1 text-[10px] font-ui text-gray-500">{{ f.help }}</p>
            </div>
            <div>
              <label for="col-eim" class="text-[11px] font-ui font-semibold text-gray-700">Column holding the eImmigration client ID</label>
              <select id="col-eim" v-model="eimIdColumnId"
                class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                <option value="">None (link clients by hand)</option>
                <option v-for="c in columnsOfType(['text', 'numbers'])" :key="c.id" :value="c.id">{{ c.title }} ({{ c.type }})</option>
              </select>
              <p class="mt-1 text-[10px] font-ui text-gray-500">Read only. An exact ID match links a client automatically; names never do.</p>
            </div>
          </div>

          <!-- Status label mapping -->
          <div v-if="statusColumn" class="rounded-lg ring-1 ring-gray-100 p-4">
            <p class="text-[11px] font-ui font-semibold text-gray-700">Which label on “{{ statusColumn.title }}” means…</p>
            <div class="mt-3 grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <div v-for="s in SUMMARY_STATUSES" :key="s.key">
                <label :for="`lbl-${s.key}`" class="text-[11px] font-ui text-gray-600">{{ s.label }}</label>
                <select :id="`lbl-${s.key}`" v-model="labels[s.key]"
                  class="mt-1 w-full text-xs font-ui px-3 py-1.5 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                  <option value="">Choose a label</option>
                  <option v-for="l in statusLabels" :key="l" :value="l">{{ l }}</option>
                </select>
              </div>
            </div>
          </div>

          <div v-if="columns.length" class="flex items-center gap-3">
            <button @click="save" :disabled="busy || !boardId" class="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">Save mapping</button>
            <span v-if="savedAt" role="status" class="text-xs font-ui text-green-700">Saved</span>
          </div>
        </div>
      </section>

      <!-- Sync -->
      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="sync-h">
        <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div>
            <h2 id="sync-h" class="text-sm font-ui font-semibold text-gray-900">Sync payment status</h2>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">Preview first. Only linked clients with a real difference are listed.</p>
          </div>
          <button @click="preview" :disabled="busy || !state.config?.boardId" class="ml-auto px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">
            <FaIcon v-if="busy === 'preview'" name="spinner" spin class="text-xs mr-1" />Preview changes
          </button>
        </header>

        <div v-if="plan" class="p-5 space-y-4">
          <p v-if="!changed.length" class="text-sm font-ui text-gray-600">monday.com already matches the billing data. Nothing to write.</p>
          <ul v-else class="divide-y divide-gray-100 ring-1 ring-gray-100 rounded-lg">
            <li v-for="p in changed" :key="p.itemId" class="px-4 py-3 text-xs font-ui">
              <p class="font-medium text-gray-900">{{ p.itemName }}</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="c in p.changes" :key="c.columnId" class="text-gray-700">
                  <span class="text-gray-500">{{ c.columnTitle }}:</span> {{ c.from || 'empty' }} <span aria-hidden="true">→</span><span class="sr-only">becomes</span> <span class="font-semibold">{{ c.to || 'empty' }}</span>
                </li>
              </ul>
            </li>
          </ul>
          <details v-if="skippedCount" class="text-xs font-ui text-gray-600">
            <summary class="cursor-pointer">{{ skippedCount }} field(s) not synced, with reasons</summary>
            <ul class="mt-2 space-y-0.5">
              <li v-for="(s, i) in skippedList" :key="i">{{ s.itemName }} · {{ s.field }}: {{ SKIP_REASONS[s.reason] || s.reason }}</li>
            </ul>
          </details>
          <div v-if="changed.length" class="flex flex-wrap items-center gap-3 pt-1">
            <button @click="apply" :disabled="Boolean(busy)"
              class="px-4 py-2 rounded-lg text-sm font-ui font-semibold text-white disabled:opacity-50"
              :class="plan.dryRun ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-navy hover:bg-brand-navy-dark'">
              <FaIcon v-if="busy === 'apply'" name="spinner" spin class="text-xs mr-1" />
              {{ plan.providerMode === 'mock' ? `Apply to the simulated board (${changed.length})` : plan.dryRun ? 'Run as dry run (writes off)' : `Write ${changed.length} item(s) to monday.com` }}
            </button>
            <span class="text-[11px] font-ui text-gray-500">This preview expires in an hour.</span>
          </div>
          <p v-if="result" role="status" class="text-sm font-ui rounded-lg px-4 py-3" :class="result.failed ? 'bg-red-50 text-brand-red' : 'bg-green-50 text-green-800'">
            <template v-if="result.dryRun">Dry run complete: nothing was written.</template>
            <template v-else>{{ result.written }} item(s) updated<span v-if="result.failed">, {{ result.failed }} failed</span>.</template>
          </p>
        </div>

        <div class="px-5 pb-5">
          <h3 class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold mt-2 mb-2">History</h3>
          <p v-if="!state.history.length" class="text-xs font-ui text-gray-500">No syncs yet.</p>
          <ul v-else class="text-xs font-ui divide-y divide-gray-50">
            <li v-for="h in state.history" :key="h.id" class="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
              <span class="text-gray-500 tabular-nums">#{{ h.id }}</span>
              <span class="font-semibold" :class="HISTORY_TONE[h.status]">{{ HISTORY_LABEL[h.status] || h.status }}</span>
              <span class="text-gray-600">{{ h.provider_mode === 'mock' ? 'simulated board' : 'monday.com' }}</span>
              <span class="text-gray-600 tabular-nums">{{ h.stats?.withChanges ?? 0 }} items<span v-if="h.stats?.written != null"> · {{ h.stats.written }} written</span><span v-if="h.stats?.failed"> · {{ h.stats.failed }} failed</span></span>
              <span class="ml-auto text-gray-500">{{ shortDate(h.applied_at || h.created_at) }} <span v-if="h.applied_by">· {{ h.applied_by }}</span></span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import FaIcon from '../../../components/FaIcon.vue'
import { ref, reactive, computed, onMounted } from 'vue'
import { useBillingApi, shortDate } from '../api.js'

const FIELDS = [
  { key: 'status', label: 'Overall payment status', types: ['status'], help: 'A status column; map its labels below.' },
  { key: 'outstanding', label: 'Total outstanding balance', types: ['numbers'], help: 'Written in dollars with cents.' },
  { key: 'lastPaymentDate', label: 'Last verified payment date', types: ['date'], help: 'From imported reports.' },
  { key: 'nextDueDate', label: 'Next payment due', types: ['date'], help: 'Next installment when on a plan.' },
  { key: 'lastSync', label: 'Last billing sync', types: ['date', 'text', 'long_text'], help: 'Only updated when something else changed.' },
]
const SUMMARY_STATUSES = [
  { key: 'paid', label: 'Paid in full' },
  { key: 'partial', label: 'Partially paid' },
  { key: 'unpaid', label: 'Unpaid (not due yet)' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'no_invoices', label: 'No invoices' },
]
const SKIP_REASONS = {
  item_not_found: 'item no longer on the board', not_mapped: 'not mapped', column_missing: 'column removed from the board',
  wrong_column_type: 'column type changed', duplicate_column: 'column used twice', label_not_mapped: 'status label not chosen',
  unknown_label: 'label no longer exists', invalid_value: 'value not accepted', no_other_changes: 'nothing else changed',
  duplicate_summary: 'item linked to two clients',
}
const HISTORY_LABEL = { previewed: 'Previewed', applying: 'Applying', applied: 'Applied', dry_run: 'Dry run', failed: 'Failed', superseded: 'Superseded' }
const HISTORY_TONE = { applied: 'text-green-700', failed: 'text-brand-red', dry_run: 'text-amber-700' }

const api = useBillingApi()
const state = ref(null)
const loading = ref(true)
const busy = ref('')
const error = ref('')
const boards = ref([])
const boardId = ref('')
const columns = ref([])
const map = reactive({ status: '', outstanding: '', lastPaymentDate: '', nextDueDate: '', lastSync: '' })
const labels = reactive({})
const eimIdColumnId = ref('')
const savedAt = ref(null)
const plan = ref(null)
const result = ref(null)

const columnsOfType = (types) => columns.value.filter((c) => types.includes(c.type))
const statusColumn = computed(() => columns.value.find((c) => c.id === map.status) || null)
const statusLabels = computed(() => {
  const raw = statusColumn.value?.settings?.labels
  if (!raw) return []
  return (Array.isArray(raw) ? raw.map((l) => (typeof l === 'string' ? l : l?.label ?? l?.name)) : Object.values(raw)).filter(Boolean)
})
const changed = computed(() => (plan.value?.proposed || []).filter((p) => p.changes.length))
const skippedList = computed(() => (plan.value?.proposed || []).flatMap((p) => p.skipped.filter((s) => s.reason !== 'no_other_changes' && s.reason !== 'not_mapped').map((s) => ({ ...s, itemName: p.itemName }))))
const skippedCount = computed(() => skippedList.value.length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    state.value = await api.monday()
    const cfg = state.value.config
    if (cfg?.boardId) {
      boardId.value = cfg.boardId
      eimIdColumnId.value = cfg.eimIdColumnId || ''
      for (const f of FIELDS) map[f.key] = cfg.columnMap?.[f.key]?.columnId || ''
      Object.assign(labels, cfg.columnMap?.status?.labels || {})
      await loadBoards()
      await loadColumns(false)
    } else if (!state.value.configError) {
      await loadBoards()
    }
  } catch (err) {
    error.value = `Could not load monday.com settings: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function loadBoards() {
  try { boards.value = await api.mondayBoards() } catch (err) { error.value = err.message }
}
async function loadColumns(reset = true) {
  columns.value = []
  if (!boardId.value) return
  if (reset) { for (const k of Object.keys(map)) map[k] = ''; eimIdColumnId.value = '' }
  try { columns.value = (await api.mondayColumns(boardId.value)).columns } catch (err) { error.value = err.message }
}

async function check() {
  busy.value = 'check'
  try { await api.mondayCheck(); await load() } catch (err) { error.value = err.message } finally { busy.value = '' }
}

async function save() {
  busy.value = 'save'
  error.value = ''
  try {
    const columnMap = {}
    for (const f of FIELDS) {
      if (!map[f.key]) continue
      columnMap[f.key] = { columnId: map[f.key] }
      if (f.key === 'status') columnMap.status.labels = Object.fromEntries(SUMMARY_STATUSES.map((s) => [s.key, labels[s.key] || null]))
    }
    await api.saveMondayConfig({ boardId: boardId.value, columnMap, eimIdColumnId: eimIdColumnId.value || null })
    savedAt.value = Date.now()
    state.value = await api.monday()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = ''
  }
}

async function preview() {
  busy.value = 'preview'
  error.value = ''
  result.value = null
  try { plan.value = await api.syncPreview() } catch (err) { error.value = err.message } finally { busy.value = '' }
}

async function apply() {
  const msg = plan.value.providerMode === 'mock'
    ? 'Apply these changes to the simulated board?'
    : plan.value.dryRun ? 'Run a dry run? Nothing will be written.' : `Write ${changed.value.length} item(s) to monday.com?`
  if (!window.confirm(msg)) return
  busy.value = 'apply'
  error.value = ''
  try {
    result.value = await api.syncApply(plan.value.jobId)
    state.value = await api.monday()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>
