<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <!-- Upload -->
    <section class="bg-white rounded-xl ring-1 ring-gray-200 p-5" aria-labelledby="upload-h">
      <h2 id="upload-h" class="text-sm font-ui font-semibold text-gray-900">Import an eImmigration report</h2>
      <p class="text-[11px] font-ui text-gray-500 mt-0.5">CSV or Excel (.xlsx), up to 15 MB. Nothing changes until you review the preview and approve it.</p>

      <label
        @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
        :class="dragging ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-300 hover:border-brand-navy/50'"
        class="mt-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors focus-within:border-brand-navy">
        <FaIcon :name="uploading ? 'spinner' : 'file-arrow-up'" :spin="uploading" class="text-2xl text-brand-navy" />
        <span class="text-sm font-ui text-gray-800">{{ uploading ? 'Reading the file…' : 'Drop the report here, or choose a file' }}</span>
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="sr-only" :disabled="uploading" @change="onPick" aria-label="Choose a report file" />
      </label>
      <p v-if="uploadError" role="alert" class="mt-3 text-sm font-ui text-brand-red">{{ uploadError }}</p>
    </section>

    <!-- History -->
    <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="history-h">
      <header class="px-5 py-4 border-b border-gray-100">
        <h2 id="history-h" class="text-sm font-ui font-semibold text-gray-900">Import history</h2>
      </header>
      <p v-if="loading" class="p-6 text-center text-sm text-gray-500 font-ui">Loading…</p>
      <p v-else-if="!jobs.length" class="p-6 text-center text-sm text-gray-500 font-ui">No reports imported yet.</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="j in jobs" :key="j.id">
          <router-link :to="{ name: 'BillingImportDetail', params: { id: j.id } }"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-brand-surface/60 text-xs font-ui">
            <span :class="JOB_STATUS[j.status].tone" class="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-0.5 rounded">{{ JOB_STATUS[j.status].label }}</span>
            <span class="text-gray-900 font-medium min-w-0 truncate max-w-[22rem]">{{ j.filename }}</span>
            <span class="text-gray-500">{{ REPORT_TYPE_LABELS[j.report_type] || 'Type not set' }}</span>
            <span v-if="j.stats" class="text-gray-500 tabular-nums">
              {{ j.stats.counts.invoices }} invoices · {{ j.stats.counts.payments }} payments
              <template v-if="j.stats.counts.errors"> · <span class="text-brand-red">{{ j.stats.counts.errors }} errors</span></template>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBillingApi, uploadReport, shortDate, REPORT_TYPE_LABELS } from '../api.js'

const JOB_STATUS = {
  uploaded: { label: 'Needs mapping', tone: 'bg-amber-100 text-amber-800' },
  previewed: { label: 'Awaiting approval', tone: 'bg-brand-navy/10 text-brand-navy' },
  applied: { label: 'Applied', tone: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', tone: 'bg-red-100 text-brand-red' },
  cancelled: { label: 'Cancelled', tone: 'bg-gray-100 text-gray-600' },
}

const api = useBillingApi()
const router = useRouter()
const jobs = ref([])
const loading = ref(true)
const dragging = ref(false)
const uploading = ref(false)
const uploadError = ref('')

async function load() {
  loading.value = true
  try { jobs.value = await api.imports() } finally { loading.value = false }
}

async function handle(file) {
  if (!file) return
  uploadError.value = ''
  if (file.size > 15 * 1024 * 1024) { uploadError.value = 'That file is larger than 15 MB.'; return }
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

onMounted(load)
</script>
