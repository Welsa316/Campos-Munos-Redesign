<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- The shared header, with the billing tabs as its second row. -->
    <PortalHeader title="Billing" current="billing" label-at="xl" actions-label-at="lg" show-email :notifications="false">
      <nav class="px-2 sm:px-4 flex gap-1 overflow-x-auto" aria-label="Billing sections">
        <router-link v-for="tab in tabs" :key="tab.name" :to="{ name: tab.name }"
          :aria-current="isActive(tab) ? 'page' : undefined"
          :class="isActive(tab) ? 'text-brand-navy border-brand-navy' : 'text-gray-500 border-transparent hover:text-gray-800'"
          class="flex-shrink-0 px-3 py-2.5 text-xs font-ui font-semibold border-b-2 transition-colors whitespace-nowrap">
          {{ tab.label }}
          <span v-if="tab.badge && badges[tab.badge]" class="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold tabular-nums">{{ badges[tab.badge] }}</span>
        </router-link>
      </nav>
    </PortalHeader>

    <div class="flex-1 overflow-y-auto">
      <router-view @counts="updateBadges" />
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'

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
const { canAny } = useAuth()
// Only the tabs this account may open; each route names its capability.
const tabs = computed(() => TABS.filter((t) => {
  const cap = router.getRoutes().find((r) => r.name === t.name)?.meta?.capability
  return !cap || canAny(...[].concat(cap))
}))
const badges = reactive({ unmatched: 0 })

const isActive = (tab) => route.name === tab.name || (tab.match || []).includes(route.name)
function updateBadges(counts) { Object.assign(badges, counts) }

watchEffect(() => {
  const tab = tabs.value.find(isActive)
  document.title = `${tab ? tab.label + ' · ' : ''}Billing | Campos Muños Law`
})
</script>
