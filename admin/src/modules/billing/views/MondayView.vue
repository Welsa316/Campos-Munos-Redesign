<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <p v-if="loading && !state" class="py-12 text-center text-sm text-gray-500 font-ui">{{ t('loading') }}</p>

    <template v-if="state">
      <!-- Connection -->
      <section class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 flex flex-wrap items-center gap-3" :aria-label="t('monday.connection')">
        <span v-if="state.mode === 'mock'" class="inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-violet-800 bg-violet-100 px-2.5 py-1 rounded-full">{{ t('monday.simulated_board') }}</span>
        <span v-else class="inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-brand-navy bg-brand-navy/10 px-2.5 py-1 rounded-full">{{ t('monday.api') }}</span>
        <p class="text-xs font-ui text-gray-700 flex-1 min-w-[16rem]">
          <template v-if="state.mode === 'mock'">{{ t('monday.mock_note') }}</template>
          <template v-else-if="state.configError">{{ state.configError }}</template>
          <template v-else-if="!state.writesEnabled">{{ t('monday.read_only') }}</template>
          <template v-else>{{ t('monday.writes_on') }}</template>
          <span v-if="state.lastCheck" class="block text-gray-500 mt-0.5">{{ t('monday.last_check', { date: shortDate(state.lastCheck.checked_at), result: t(state.lastCheck.ok ? 'monday.check_ok' : 'monday.check_failed') }) }}</span>
        </p>
        <button v-if="canConfigure" @click="check" :disabled="Boolean(busy)" class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-brand-surface">{{ t('monday.check') }}</button>
      </section>

      <!-- Board + column mapping (monday.configure, administrators only) -->
      <section v-if="canConfigure" class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="cfg-h">
        <header class="px-5 py-4 border-b border-gray-100">
          <h2 id="cfg-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('monday.board_cols') }}</h2>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ t('monday.board_note') }}</p>
        </header>
        <div class="p-5 space-y-5">
          <div class="max-w-md">
            <label for="board" class="text-[11px] font-ui font-semibold text-gray-700">{{ t('monday.client_board') }}</label>
            <select id="board" v-model="boardId" @change="loadColumns"
              class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
              <option value="">{{ t(boards.length ? 'monday.choose_board' : 'monday.load_first') }}</option>
              <option v-for="b in boards" :key="b.id" :value="b.id">{{ t('monday.board_option', { name: b.name ?? '', count: b.itemsCount ?? '' }) }}</option>
            </select>
            <button v-if="!boards.length" @click="loadBoards" :disabled="Boolean(busy)" class="mt-2 text-xs font-ui text-brand-navy underline">{{ t('monday.load_boards') }}</button>
          </div>

          <div v-if="columns.length" class="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-x-6 gap-y-4">
            <div v-for="f in FIELDS" :key="f.key">
              <label :for="`col-${f.key}`" class="text-[11px] font-ui font-semibold text-gray-700">{{ t(`mfield.${f.key}`) }}</label>
              <select :id="`col-${f.key}`" v-model="map[f.key]"
                class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                <option value="">{{ t('monday.dont_sync') }}</option>
                <option v-for="c in columnsOfType(f.types)" :key="c.id" :value="c.id">{{ c.title }} ({{ c.type }})</option>
              </select>
              <p class="mt-1 text-[10px] font-ui text-gray-500">{{ t(`mfield.${f.key}.help`) }}</p>
            </div>
            <div>
              <label for="col-eim" class="text-[11px] font-ui font-semibold text-gray-700">{{ t('monday.eim_col') }}</label>
              <select id="col-eim" v-model="eimIdColumnId"
                class="mt-1 w-full text-xs font-ui px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                <option value="">{{ t('monday.eim_none') }}</option>
                <option v-for="c in columnsOfType(['text', 'numbers'])" :key="c.id" :value="c.id">{{ c.title }} ({{ c.type }})</option>
              </select>
              <p class="mt-1 text-[10px] font-ui text-gray-500">{{ t('monday.eim_note') }}</p>
            </div>
          </div>

          <!-- Status label mapping -->
          <div v-if="statusColumn" class="rounded-lg ring-1 ring-gray-100 p-4 space-y-5">
            <div>
              <p class="text-[11px] font-ui font-semibold text-gray-700">{{ t('monday.which_label', { column: statusColumn.title ?? '' }) }}</p>
              <p class="text-[10px] font-ui text-gray-500 mt-0.5">{{ t('monday.which_note') }}</p>
              <div class="mt-3 grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div v-for="s in SUMMARY_STATUSES" :key="s.key">
                  <label :for="`lbl-${s.key}`" class="text-[11px] font-ui text-gray-600">{{ t(`summary.${s.key}`) }}</label>
                  <select :id="`lbl-${s.key}`" v-model="labels[s.key]"
                    class="mt-1 w-full text-xs font-ui px-3 py-1.5 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                    <option value="">{{ t('monday.leave_status') }}</option>
                    <option v-for="l in statusLabels" :key="l" :value="l">{{ l }}</option>
                  </select>
                </div>
              </div>
            </div>

            <fieldset v-if="keepable.length">
              <legend class="text-[11px] font-ui font-semibold text-gray-700">{{ t('monday.keep_legend') }}</legend>
              <p class="text-[10px] font-ui text-gray-500 mt-0.5">{{ t('monday.keep_note') }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <label v-for="l in keepable" :key="l"
                  :class="keep.includes(l) ? 'bg-brand-navy/10 ring-brand-navy/40 text-brand-navy' : 'ring-gray-300 text-gray-700 hover:bg-gray-50'"
                  class="inline-flex items-center gap-2 rounded-full ring-1 px-3 py-1.5 min-h-11 sm:min-h-0 text-xs font-ui cursor-pointer transition-colors">
                  <input type="checkbox" :value="l" v-model="keep" class="w-3.5 h-3.5 accent-brand-navy" />
                  {{ l }}
                </label>
              </div>
            </fieldset>
          </div>

          <div v-if="columns.length" class="flex items-center gap-3">
            <button @click="save" :disabled="busy || !boardId" class="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">{{ t('monday.save_mapping') }}</button>
            <span v-if="savedAt" role="status" class="text-xs font-ui text-green-700">{{ t('saved') }}</span>
          </div>
        </div>
      </section>

      <!-- Sync -->
      <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="sync-h">
        <header class="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div>
            <h2 id="sync-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('monday.sync_title') }}</h2>
            <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ t('monday.sync_note') }}</p>
          </div>
          <button v-if="canSync" @click="preview" :disabled="busy || !state.config?.boardId" class="ml-auto px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark disabled:opacity-50">
            <FaIcon v-if="busy === 'preview'" name="spinner" spin class="text-xs mr-1" />{{ t('monday.preview') }}
          </button>
        </header>

        <div v-if="plan" class="p-5 space-y-4">
          <p v-if="!changed.length" class="text-sm font-ui text-gray-600">{{ t('monday.in_sync') }}</p>
          <ul v-else class="divide-y divide-gray-100 ring-1 ring-gray-100 rounded-lg">
            <li v-for="p in changed" :key="p.itemId" class="px-4 py-3 text-xs font-ui">
              <p class="font-medium text-gray-900">{{ p.itemName }}</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="c in p.changes" :key="c.columnId" class="text-gray-700">
                  <span class="text-gray-500">{{ c.columnTitle }}:</span> {{ c.from || t('monday.empty') }} <span aria-hidden="true">→</span><span class="sr-only">{{ t('monday.becomes') }}</span> <span class="font-semibold">{{ c.to || t('monday.empty') }}</span>
                </li>
              </ul>
            </li>
          </ul>
          <details v-if="skippedCount" class="text-xs font-ui text-gray-600">
            <summary class="cursor-pointer">{{ t('monday.skipped', { count: num(skippedCount, lang) }) }}</summary>
            <ul class="mt-2 space-y-0.5">
              <li v-for="(s, i) in skippedList" :key="i">{{ s.itemName }} · {{ word('sfield.', s.field) }}: {{ word('skip.', s.reason) }}</li>
            </ul>
          </details>
          <div v-if="changed.length" class="flex flex-wrap items-center gap-3 pt-1">
            <button @click="confirmingApply = true" :disabled="Boolean(busy)" :aria-expanded="confirmingApply"
              class="px-4 py-2 rounded-lg text-sm font-ui font-semibold text-white disabled:opacity-50"
              :class="plan.dryRun ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-navy hover:bg-brand-navy-dark'">
              <FaIcon v-if="busy === 'apply'" name="spinner" spin class="text-xs mr-1" />
              {{ plan.providerMode === 'mock' ? t('monday.apply_mock', { count: changed.length }) : plan.dryRun ? t('monday.apply_dry') : t('monday.apply_write', { count: num(changed.length, lang) }) }}
            </button>
            <span class="text-[11px] font-ui text-gray-500">{{ t('monday.expires') }}</span>
            <ConfirmInline v-if="confirmingApply" class="basis-full" :title="applyQuestion" :busy="Boolean(busy)"
              :confirm-label="t(plan.providerMode === 'mock' ? 'monday.confirm_mock' : plan.dryRun ? 'monday.confirm_dry' : 'monday.confirm_write')" :cancel-label="t('cancel')" tone="navy"
              @confirm="apply" @cancel="confirmingApply = false" />
          </div>
          <p v-if="result" role="status" class="text-sm font-ui rounded-lg px-4 py-3" :class="result.failed ? 'bg-red-50 text-brand-red' : 'bg-green-50 text-green-800'">
            <template v-if="result.dryRun">{{ t('monday.dry_done') }}</template>
            <template v-else>{{ t('monday.updated', { count: num(result.written, lang) }) }}<span v-if="result.failed">{{ t('monday.failed', { count: result.failed }) }}</span>.</template>
          </p>
        </div>

        <div class="px-5 pb-5">
          <h3 class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold mt-2 mb-2">{{ t('history') }}</h3>
          <p v-if="!state.history.length" class="text-xs font-ui text-gray-500">{{ t('monday.no_syncs') }}</p>
          <ul v-else class="text-xs font-ui divide-y divide-gray-50">
            <li v-for="h in state.history" :key="h.id" class="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
              <span class="text-gray-500 tabular-nums">#{{ h.id }}</span>
              <span class="font-semibold" :class="HISTORY_TONE[h.status]">{{ word('hist.', h.status) }}</span>
              <span class="text-gray-600">{{ h.provider_mode === 'mock' ? t('overview.simulated_board') : 'monday.com' }}</span>
              <span class="text-gray-600 tabular-nums">{{ t('hist.items', { count: h.stats?.withChanges ?? 0 }) }}<span v-if="h.stats?.written != null">{{ t('hist.written', { count: h.stats.written }) }}</span><span v-if="h.stats?.failed">{{ t('hist.failed_count', { count: h.stats.failed }) }}</span></span>
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
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useBillingApi } from '../api.js'
import { shortDate as dateIn } from '../format.js'
import { num, hasWord } from '../billingText.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'
import { can } from '../../../composables/useAuth.js'
import ConfirmInline from '../../../components/ConfirmInline.vue'

// The board mapping is the administrator's setup; running the sync is
// day-to-day work.
const canConfigure = can('monday.configure')
const canSync = can('billing.sync')

// The fields the sync can write; each one's label and help are
// mfield.<key> and mfield.<key>.help in i18n/billing.js.
const FIELDS = [
  { key: 'status', types: ['status'] },
  { key: 'outstanding', types: ['numbers'] },
  { key: 'lastPaymentDate', types: ['date'] },
  { key: 'nextDueDate', types: ['date'] },
  { key: 'lastSync', types: ['date', 'text', 'long_text'] },
]
// The payment states a status label can stand for (labels: summary.<key>).
const SUMMARY_STATUSES = [
  { key: 'paid' },
  { key: 'partial' },
  { key: 'unpaid' },
  { key: 'overdue' },
  { key: 'needs_review' },
  { key: 'no_invoices' },
]
const HISTORY_TONE = { applied: 'text-green-700', failed: 'text-brand-red', dry_run: 'text-amber-700' }

const { t, lang, locale } = useT(BILLING)
const shortDate = (value) => dateIn(value, locale.value)
// A value the server sends with a word for it (a skipped field, the reason,
// a sync's status), or the value itself when it is new.
const word = (prefix, value) => (hasWord(BILLING, prefix + value) ? t(prefix + value) : value)

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
const keep = ref([])
const eimIdColumnId = ref('')
const savedAt = ref(null)
// "Saved" describes the mapping as it was saved; any change since makes it untrue.
watch([boardId, eimIdColumnId, keep, () => ({ ...map }), () => ({ ...labels })], () => { savedAt.value = null }, { deep: true })
const plan = ref(null)
const result = ref(null)

const columnsOfType = (types) => columns.value.filter((c) => types.includes(c.type))
const statusColumn = computed(() => columns.value.find((c) => c.id === map.status) || null)
const statusLabels = computed(() => {
  const raw = statusColumn.value?.settings?.labels
  if (!raw) return []
  return (Array.isArray(raw) ? raw.map((l) => (typeof l === 'string' ? l : l?.label ?? l?.name)) : Object.values(raw)).filter(Boolean)
})
// A label the sync writes cannot also be one it leaves alone.
const chosenLabels = computed(() => new Set(SUMMARY_STATUSES.map((s) => labels[s.key]).filter(Boolean)))
const keepable = computed(() => statusLabels.value.filter((l) => !chosenLabels.value.has(l)))
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
      for (const s of SUMMARY_STATUSES) labels[s.key] = cfg.columnMap?.status?.labels?.[s.key] || ''
      keep.value = [...(cfg.columnMap?.status?.keep || [])]
      // The board lists feed only the setup section (monday.configure).
      if (canConfigure) {
        await loadBoards()
        await loadColumns(false)
      }
    } else if (!state.value.configError && canConfigure) {
      await loadBoards()
    }
  } catch (err) {
    error.value = t('monday.load_error', { message: err.message })
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
  if (reset) { for (const k of Object.keys(map)) map[k] = ''; for (const s of SUMMARY_STATUSES) labels[s.key] = ''; keep.value = []; eimIdColumnId.value = '' }
  try { columns.value = (await api.mondayColumns(boardId.value)).columns } catch (err) { error.value = err.message }
}

async function check() {
  busy.value = 'check'
  try { await api.mondayCheck(); await load() } catch (err) { error.value = err.message } finally { busy.value = '' }
}

async function save() {
  busy.value = 'save'
  error.value = ''
  savedAt.value = null
  try {
    const columnMap = {}
    for (const f of FIELDS) {
      if (!map[f.key]) continue
      columnMap[f.key] = { columnId: map[f.key] }
      if (f.key === 'status') {
        columnMap.status.labels = Object.fromEntries(SUMMARY_STATUSES.map((s) => [s.key, labels[s.key] || null]))
        columnMap.status.keep = keep.value.filter((l) => keepable.value.includes(l))
      }
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

const confirmingApply = ref(false)
const applyQuestion = computed(() => (plan.value?.providerMode === 'mock'
  ? t('monday.ask_mock')
  : plan.value?.dryRun ? t('monday.ask_dry') : t('monday.ask_write', { count: num(changed.value.length, lang.value) })))
async function apply() {
  confirmingApply.value = false
  busy.value = 'apply'
  error.value = ''
  try {
    result.value = await api.syncApply(plan.value.jobId)
  } catch (err) {
    error.value = err.message
  } finally {
    // A plan is used once, whatever happened: a timed-out apply may still have
    // written to monday.com, so the next step is a fresh preview, never a retry.
    plan.value = null
    state.value = await api.monday().catch(() => state.value)
    busy.value = ''
  }
}

onMounted(load)
</script>
