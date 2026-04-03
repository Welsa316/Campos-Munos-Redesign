<template>
  <div class="h-screen flex flex-col bg-brand-surface overflow-hidden">
    <!-- Top bar -->
    <header class="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-6 z-10">
      <div class="flex items-center gap-4">
        <img src="/logo.png" alt="Campos Munos Law" class="h-9" />
        <div class="w-px h-8 bg-gray-200"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight">Client Messages</h1>
        <span v-if="unreadCount > 0" class="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-red text-white text-xs font-ui font-bold">
          {{ unreadCount }}
        </span>
      </div>
      <div class="ml-auto flex items-center gap-4">
        <button
          @click="exportCsv"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors"
          title="Export CSV"
        >
          <i class="fa-solid fa-download text-xs"></i>
          <span class="hidden sm:inline">Export</span>
        </button>
        <span class="text-xs text-gray-400 font-ui hidden sm:inline">{{ adminEmail }}</span>
        <button
          @click="handleLogout"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors"
        >
          <i class="fa-solid fa-arrow-right-from-bracket text-xs"></i>
          Sign Out
        </button>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="loadingList" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-brand-navy mb-3"></i>
        <p class="text-gray-400 text-sm font-ui">Loading messages...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="listError" class="flex-1 flex items-center justify-center">
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
          :submissions="submissions"
          :selectedId="selectedId"
          :viewMode="viewMode"
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
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useApi } from '../composables/useApi.js'
import SubmissionList from '../components/admin/SubmissionList.vue'
import SubmissionDetail from '../components/admin/SubmissionDetail.vue'

const router = useRouter()
const { adminEmail, logout } = useAuth()
const { get, patch } = useApi()

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

const submissions = ref([])
const selectedId = ref(null)
const selectedSubmission = ref(null)
const loadingList = ref(true)
const listError = ref(false)
const viewMode = ref('inbox')

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
  selectedId.value = id

  try {
    selectedSubmission.value = await get(`/api/submissions/${id}`)

    const sub = submissions.value.find(s => s.id === id)
    if (sub && !sub.is_read) {
      await patch(`/api/submissions/${id}/read`)
      sub.is_read = true
    }
  } catch {
    selectedSubmission.value = null
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
}

async function exportCsv() {
  try {
    const res = await fetch(`${API_BASE}/api/submissions/export/csv`, { credentials: 'include' })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Silently fail — could add toast here
  }
}

async function handleLogout() {
  await logout()
  router.push({ name: 'AdminLogin' })
}
</script>
