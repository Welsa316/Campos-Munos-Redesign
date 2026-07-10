<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Top bar -->
    <header class="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-6 z-10">
      <div class="flex items-center gap-4">
        <img src="/logo.png" alt="Campos Muños Law" class="h-9" />
        <div class="w-px h-8 bg-gray-200"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight">Client Messages</h1>
        <span v-if="viewMode === 'inbox' && unreadCount > 0" class="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-red text-white text-xs font-ui font-bold">
          {{ unreadCount }}
        </span>
      </div>
      <div class="ml-auto flex items-center gap-4">
        <button
          @click="exportCsv"
          :disabled="exporting"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :title="exportFailed ? 'Export failed — try again' : 'Export CSV'"
          aria-label="Export messages as CSV"
        >
          <i :class="exporting ? 'fa-solid fa-spinner fa-spin' : (exportFailed ? 'fa-solid fa-triangle-exclamation text-brand-red' : 'fa-solid fa-download')" class="text-xs" aria-hidden="true"></i>
          <span class="hidden sm:inline">{{ exporting ? 'Exporting…' : (exportFailed ? 'Failed' : 'Export') }}</span>
        </button>
        <span class="text-xs text-gray-500 font-ui hidden sm:inline">{{ adminEmail }}</span>
        <button
          @click="showChangePassword = true"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors"
          title="Change password"
          aria-label="Change password"
        >
          <i class="fa-solid fa-key text-xs" aria-hidden="true"></i>
          <span class="hidden sm:inline">Password</span>
        </button>
        <button
          @click="handleLogout"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors"
        >
          <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
          Sign Out
        </button>
      </div>
    </header>

    <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />

    <!-- Full-screen loading/error only when there's nothing to show yet. A manual
         refresh or view switch with data already loaded updates in place instead
         of tearing down the open conversation + reply draft. -->
    <div v-if="loadingList && submissions.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-brand-navy mb-3"></i>
        <p class="text-gray-500 text-sm font-ui">Loading messages...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="listError && submissions.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-exclamation-triangle text-2xl text-brand-red mb-3"></i>
        <p class="text-gray-500 text-sm font-ui mb-4">Failed to load messages</p>
        <button @click="fetchSubmissions" class="text-brand-navy text-sm font-ui font-medium hover:underline">
          Try again
        </button>
      </div>
    </div>

    <!-- Main content — two panel layout -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Left panel -->
      <div :class="[
        'w-full lg:w-[380px] lg:flex-shrink-0 flex flex-col',
        selectedId !== null ? 'hidden lg:flex' : 'flex'
      ]">
        <SubmissionList
          ref="listRef"
          :submissions="submissions"
          :selectedId="selectedId"
          :viewMode="viewMode"
          :refreshing="loadingList"
          @select="selectSubmission"
          @refresh="fetchSubmissions"
          @changeView="changeView"
        />
      </div>

      <!-- Right panel -->
      <div :class="[
        'flex-1 flex flex-col min-w-0',
        selectedId === null ? 'hidden lg:flex' : 'flex'
      ]">
        <SubmissionDetail
          :submission="selectedSubmission"
          :showBack="true"
          @replied="refreshSelected"
          @back="selectedId = null"
          @archived="handleArchived"
          @unread="handleUnread"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useApi, rawFetch } from '../composables/useApi.js'
import SubmissionList from '../components/admin/SubmissionList.vue'
import SubmissionDetail from '../components/admin/SubmissionDetail.vue'
import ChangePasswordModal from '../components/admin/ChangePasswordModal.vue'

const router = useRouter()
const { adminEmail, logout } = useAuth()
const { get, patch } = useApi()

const submissions = ref([])
const selectedId = ref(null)
const selectedSubmission = ref(null)
const loadingList = ref(true)
const listError = ref(false)
const viewMode = ref('inbox')
const showChangePassword = ref(false)
const exporting = ref(false)
const exportFailed = ref(false)
const listRef = ref(null)

const unreadCount = computed(() => submissions.value.filter(s => !s.is_read).length)

onMounted(() => {
  fetchSubmissions()
})

async function fetchSubmissions() {
  loadingList.value = true
  listError.value = false

  try {
    const archived = viewMode.value === 'archived' ? 'true' : 'false'
    submissions.value = await get(`/api/submissions?archived=${archived}`)
  } catch {
    listError.value = true
  } finally {
    loadingList.value = false
  }
}

function changeView(mode) {
  viewMode.value = mode
  selectedId.value = null
  selectedSubmission.value = null
  fetchSubmissions()
}

async function selectSubmission(id) {
  if (selectedId.value === id && selectedSubmission.value) return
  selectedId.value = id

  try {
    selectedSubmission.value = await get(`/api/submissions/${id}`)

    const sub = submissions.value.find(s => s.id === id)
    if (sub && !sub.is_read) {
      await patch(`/api/submissions/${id}/read`)
      sub.is_read = true
      // Keep the open detail in step with the list so it doesn't keep showing the
      // "Unread" pill (and hide the mark-unread button) on the just-opened message.
      if (selectedSubmission.value && selectedSubmission.value.id === id) {
        selectedSubmission.value.is_read = true
      }
    }
  } catch {
    // Clear the selection too, so a failed detail-fetch on mobile falls back to
    // the list instead of stranding the admin on a blank pane with no way back.
    selectedSubmission.value = null
    selectedId.value = null
  }
}

async function refreshSelected() {
  if (selectedId.value) {
    try {
      selectedSubmission.value = await get(`/api/submissions/${selectedId.value}`)
    } catch {
      // Keep existing data on error
    }
  }
}

async function handleArchived() {
  selectedId.value = null
  selectedSubmission.value = null
  await fetchSubmissions()
  // The detail (and its focused archive button) just unmounted — move focus to a
  // stable control in the list instead of letting it fall to <body>.
  nextTick(() => listRef.value?.focusTop?.())
}

// Reflect a mark-as-unread in the list (dot + counters) and the open detail (pill),
// without refetching — the row is already loaded.
function handleUnread(id) {
  const sub = submissions.value.find(s => s.id === id)
  if (sub) sub.is_read = false
  if (selectedSubmission.value && selectedSubmission.value.id === id) {
    selectedSubmission.value.is_read = false
  }
}

let exportMsgTimer = null
async function exportCsv() {
  if (exporting.value) return
  exporting.value = true
  exportFailed.value = false
  try {
    const res = await rawFetch('/api/submissions/export/csv')
    if (res.status === 401) { window.location.href = '/admin/login'; return }
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Surface the failure on the button instead of silently doing nothing.
    exportFailed.value = true
    if (exportMsgTimer) clearTimeout(exportMsgTimer)
    exportMsgTimer = setTimeout(() => { exportFailed.value = false }, 4000)
  } finally {
    exporting.value = false
  }
}

async function handleLogout() {
  await logout()
  router.push({ name: 'AdminLogin' })
}
</script>
