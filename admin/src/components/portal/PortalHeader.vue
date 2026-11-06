<template>
  <!-- The shell every section uses: white bar, logo, title, the other
       sections, password, desktop notifications and sign-out. -->
  <header class="nav-chrome h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
    <div class="flex items-center gap-3 sm:gap-4 min-w-0">
      <img :src="LOGO_SRC" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
      <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
      <h1 class="font-heading text-lg text-brand-navy tracking-tight truncate">{{ title }}</h1>
    </div>
    <div class="ml-auto flex items-center gap-1 sm:gap-3">
      <SectionLinks :current="current" label-at="2xl" />
      <button @click="showChangePassword = true" aria-label="Change password" title="Change password"
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
        <FaIcon name="key" class="text-xs" />
        <span class="hidden 2xl:inline">Password</span>
      </button>
      <button @click="showNotifications = true" aria-label="Desktop notifications" title="Desktop notifications"
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
        <FaIcon name="bell" class="text-xs" />
        <span class="hidden 2xl:inline">Notifications</span>
      </button>
      <button @click="handleLogout" aria-label="Sign out"
        class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
        <FaIcon name="arrow-right-from-bracket" class="text-xs" />
        <span class="hidden sm:inline">Sign Out</span>
      </button>
    </div>
  </header>
  <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />
  <NotificationsModal :visible="showNotifications" @close="showNotifications = false" />
</template>

<script setup>
import { ref } from 'vue'
import { LOGO_SRC } from '../../data/brand.js'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import SectionLinks from './SectionLinks.vue'
import ChangePasswordModal from '../messages/ChangePasswordModal.vue'
import NotificationsModal from './NotificationsModal.vue'
import FaIcon from '../FaIcon.vue'

defineProps({
  title: { type: String, required: true },
  // SectionLinks key of this section (not linked to itself).
  current: { type: String, required: true },
})

const router = useRouter()
const { logout } = useAuth()
const showChangePassword = ref(false)
const showNotifications = ref(false)

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
