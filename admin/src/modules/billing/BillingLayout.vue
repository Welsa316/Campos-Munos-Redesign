<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Same shell as the inbox: white bar, logo, section title, actions. -->
    <header class="flex-shrink-0 bg-white border-b border-gray-200 z-10">
      <div class="h-16 flex items-center px-4 sm:px-6 gap-3">
        <div class="flex items-center gap-3 sm:gap-4 min-w-0">
          <img src="/logo.png" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
          <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
          <h1 class="font-heading text-lg text-brand-navy tracking-tight whitespace-nowrap">Billing</h1>
        </div>
        <div class="ml-auto flex items-center gap-1 sm:gap-3">
          <router-link :to="{ name: 'Inbox' }"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors"
            aria-label="Back to client messages">
            <i class="fa-solid fa-inbox text-xs" aria-hidden="true"></i>
            <span class="hidden sm:inline">Messages</span>
          </router-link>
          <span class="text-xs text-gray-500 font-ui hidden lg:inline">{{ adminEmail }}</span>
          <button @click="handleLogout" aria-label="Sign out"
            class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
            <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
            <span class="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
      <nav class="px-2 sm:px-4 flex gap-1 overflow-x-auto" aria-label="Billing sections">
        <router-link v-for="tab in TABS" :key="tab.name" :to="{ name: tab.name }"
          :aria-current="isActive(tab) ? 'page' : undefined"
          :class="isActive(tab) ? 'text-brand-navy border-brand-navy' : 'text-gray-500 border-transparent hover:text-gray-800'"
          class="flex-shrink-0 px-3 py-2.5 text-xs font-ui font-semibold border-b-2 transition-colors whitespace-nowrap">
          {{ tab.label }}
          <span v-if="tab.badge && badges[tab.badge]" class="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold tabular-nums">{{ badges[tab.badge] }}</span>
        </router-link>
      </nav>
    </header>

    <div class="flex-1 overflow-y-auto">
      <router-view @counts="updateBadges" />
    </div>
  </div>
</template>

<script setup>
import { reactive, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'

const TABS = [
  { name: 'BillingOverview', label: 'Overview' },
  { name: 'BillingInvoices', label: 'Invoices' },
  { name: 'BillingImports', label: 'Imports', match: ['BillingImportDetail'] },
  { name: 'BillingMatching', label: 'Client matching', badge: 'unmatched' },
  { name: 'BillingReminders', label: 'Reminders' },
  { name: 'BillingContacts', label: 'WhatsApp contacts' },
  { name: 'BillingMonday', label: 'monday.com' },
  { name: 'BillingSettings', label: 'Integrations' },
]

const route = useRoute()
const router = useRouter()
const { adminEmail, logout } = useAuth()
const badges = reactive({ unmatched: 0 })

const isActive = (tab) => route.name === tab.name || (tab.match || []).includes(route.name)
function updateBadges(counts) { Object.assign(badges, counts) }

watchEffect(() => {
  const tab = TABS.find(isActive)
  document.title = `${tab ? tab.label + ' · ' : ''}Billing | Campos Muños Law`
})

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
