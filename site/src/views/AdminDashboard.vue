<template>
  <div class="h-screen flex flex-col bg-brand-surface overflow-hidden">
    <!-- Top bar -->
    <header class="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-6 z-10">
      <div class="flex items-center gap-4">
        <img src="/logo.png" alt="Campos Munos Law" class="h-9" />
        <div class="w-px h-8 bg-gray-200"></div>
        <h1 class="font-[var(--font-heading)] text-lg text-brand-navy tracking-tight">Client Messages</h1>
        <span v-if="unreadCount > 0" class="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-red text-white text-xs font-[var(--font-ui)] font-bold">
          {{ unreadCount }}
        </span>
      </div>
      <div class="ml-auto flex items-center gap-4">
        <span class="text-xs text-gray-400 font-[var(--font-ui)] hidden sm:inline">{{ adminEmail }}</span>
        <button
          @click="handleLogout"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-[var(--font-ui)] font-medium transition-colors"
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
        <p class="text-gray-400 text-sm font-[var(--font-ui)]">Loading messages...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="listError" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-exclamation-triangle text-2xl text-brand-red mb-3"></i>
        <p class="text-gray-500 text-sm font-[var(--font-ui)] mb-4">Failed to load messages</p>
        <button @click="fetchSubmissions" class="text-brand-navy text-sm font-[var(--font-ui)] font-medium hover:underline">
          Try again
        </button>
      </div>
    </div>

    <!-- Main content — two panel layout -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Left panel — visible on desktop always, on mobile when no detail selected -->
      <div :class="[
        'w-full lg:w-[380px] lg:flex-shrink-0 flex flex-col',
        selectedId !== null ? 'hidden lg:flex' : 'flex'
      ]">
        <SubmissionList
          :submissions="submissions"
          :selectedId="selectedId"
          @select="selectSubmission"
          @refresh="fetchSubmissions"
        />
      </div>

      <!-- Right panel — visible on desktop always, on mobile only when detail selected -->
      <div :class="[
        'flex-1 flex flex-col min-w-0',
        selectedId === null ? 'hidden lg:flex' : 'flex'
      ]">
        <SubmissionDetail
          :submission="selectedSubmission"
          :showBack="true"
          @replied="refreshSelected"
          @back="selectedId = null"
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

const submissions = ref([])
const selectedId = ref(null)
const selectedSubmission = ref(null)
const loadingList = ref(true)
const listError = ref(false)

const unreadCount = computed(() => submissions.value.filter(s => !s.is_read).length)

onMounted(() => {
  fetchSubmissions()
})

async function fetchSubmissions() {
  loadingList.value = true
  listError.value = false

  try {
    submissions.value = await get('/api/submissions')
  } catch {
    listError.value = true
  } finally {
    loadingList.value = false
  }
}

async function selectSubmission(id) {
  selectedId.value = id

  try {
    selectedSubmission.value = await get(`/api/submissions/${id}`)

    // Mark as read if unread
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

async function handleLogout() {
  await logout()
  router.push({ name: 'AdminLogin' })
}
</script>
