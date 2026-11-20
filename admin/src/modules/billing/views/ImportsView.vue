<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <!-- Upload (billing.import) -->
    <section v-if="canImport" class="bg-white rounded-xl ring-1 ring-gray-200 p-5" aria-labelledby="upload-h">
      <h2 id="upload-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('imports.upload_title') }}</h2>
      <p class="text-[11px] font-ui text-gray-500 mt-0.5">{{ t('imports.upload_note') }}</p>

      <label
        @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
        :class="dragging ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-300 hover:border-brand-navy/50'"
        class="mt-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors focus-within:border-brand-navy">
        <FaIcon :name="uploading ? 'spinner' : 'file-arrow-up'" :spin="uploading" class="text-2xl text-brand-navy" />
        <span class="text-sm font-ui text-gray-800">{{ t(uploading ? 'imports.reading' : 'imports.drop') }}</span>
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="sr-only" :disabled="uploading" @change="onPick" :aria-label="t('imports.choose_label')" />
      </label>
      <p v-if="uploadError" role="alert" class="mt-3 text-sm font-ui text-brand-red">{{ uploadError }}</p>
    </section>

    <!-- History -->
    <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="history-h">
      <header class="px-5 py-4 border-b border-gray-100">
        <h2 id="history-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('imports.history') }}</h2>
      </header>
      <p v-if="loading" class="p-6 text-center text-sm text-gray-500 font-ui">{{ t('loading') }}</p>
      <LoadError v-else-if="loadFailed" :message="t('imports.load_error')" @retry="load" />
      <p v-else-if="!jobs.length" class="p-6 text-center text-sm text-gray-500 font-ui">{{ t('imports.none') }}</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="j in jobs" :key="j.id">
          <router-link :to="{ name: 'BillingImportDetail', params: { id: j.id } }"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-brand-surface/60 text-xs font-ui">
            <span :class="known(JOB_STATUS, j.status).tone" class="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded">{{ jobLabel(j.status) }}</span>
            <span class="text-gray-900 font-medium min-w-0 truncate max-w-[22rem]">{{ j.filename }}</span>
            <span class="text-gray-500">{{ REPORT_TYPES.includes(j.report_type) ? t(`report_type.${j.report_type}`) : t('type_not_set') }}</span>
            <span v-if="j.stats?.counts" class="text-gray-500 tabular-nums">
              {{ counted('count.invoice', j.stats.counts.invoices) }} · {{ counted('count.payment', j.stats.counts.payments) }}
              <template v-if="j.stats.counts.errors"> · <span class="text-brand-red">{{ counted('count.error', j.stats.counts.errors) }}</span></template>
            </span>
            <span class="ml-auto text-gray-500 whitespace-nowrap">{{ shortDate(j.applied_at || j.created_at) }} · {{ j.uploaded_by || '—' }}</span>
          </router-link>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import FaIcon from '../../../components/FaIcon.vue'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBillingApi, uploadReport, REPORT_TYPES } from '../api.js'
import { shortDate as dateIn } from '../format.js'
import { num } from '../billingText.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'
import { can } from '../../../composables/useAuth.js'
import LoadError from '../../../components/LoadError.vue'
import { known, isReportFile } from '../../../utils/text.js'

const canImport = can('billing.import')

// Each status's label is job.<key> in i18n/billing.js.
const JOB_STATUS = {
  uploaded: { tone: 'bg-amber-100 text-amber-800' },
  previewed: { tone: 'bg-brand-navy/10 text-brand-navy' },
  applied: { tone: 'bg-green-100 text-green-800' },
  failed: { tone: 'bg-red-100 text-brand-red' },
  cancelled: { tone: 'bg-gray-100 text-gray-600' },
}

const { t, lang, locale } = useT(BILLING)
const shortDate = (value) => dateIn(value, locale.value)
const counted = (key, n) => t(key, { count: num(n, lang.value) })
// A status the server adds later shows as itself (known()).
const jobLabel = (status) => (JOB_STATUS[status] ? t(`job.${status}`) : known(JOB_STATUS, status).label)

const api = useBillingApi()
const router = useRouter()
const jobs = ref([])
const loading = ref(true)
const dragging = ref(false)
const uploading = ref(false)
const uploadError = ref('')

const loadFailed = ref(false)
async function load() {
  loading.value = true
  loadFailed.value = false
  try { jobs.value = await api.imports() } catch { loadFailed.value = true } finally { loading.value = false }
}

async function handle(file) {
  if (!file) return
  uploadError.value = ''
  if (!isReportFile(file)) { uploadError.value = t('imports.not_report'); return }
  if (file.size > 15 * 1024 * 1024) { uploadError.value = t('imports.too_large'); return }
  uploading.value = true
  try {
    const job = await uploadReport(file)
    router.push({ name: 'BillingImportDetail', params: { id: job.id } })
  } catch (err) {
    uploadError.value = err.message
  } finally {
    uploading.value = false
  }
}
function onPick(e) { handle(e.target.files?.[0]); e.target.value = '' }
function onDrop(e) { dragging.value = false; handle(e.dataTransfer?.files?.[0]) }

// A file that misses the drop box would otherwise replace the portal with
// the file itself.
const stopStrayDrop = (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault() }
onMounted(() => {
  load()
  window.addEventListener('dragover', stopStrayDrop)
  window.addEventListener('drop', stopStrayDrop)
})
onUnmounted(() => {
  window.removeEventListener('dragover', stopStrayDrop)
  window.removeEventListener('drop', stopStrayDrop)
})
</script>
