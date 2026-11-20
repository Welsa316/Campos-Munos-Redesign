<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- The shared header, with the billing tabs as its second row. -->
    <PortalHeader :title="t('title')" current="billing" label-at="xl" actions-label-at="lg" show-email :notifications="false">
      <nav class="px-2 sm:px-4 flex gap-1 overflow-x-auto" :aria-label="t('tabs.label')">
        <router-link v-for="tab in tabs" :key="tab.name" :to="{ name: tab.name }"
          :aria-current="isActive(tab) ? 'page' : undefined"
          :class="isActive(tab) ? 'text-brand-navy border-brand-navy' : 'text-gray-500 border-transparent hover:text-gray-800'"
          class="flex-shrink-0 px-3 py-2.5 text-xs font-ui font-semibold border-b-2 transition-colors whitespace-nowrap">
          {{ t(tab.label) }}
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
import { useT } from '../../i18n/translator.js'
import { BILLING } from '../../i18n/billing.js'

const { t } = useT(BILLING)

// label: the tab's word in i18n/billing.js.
const TABS = [
  { name: 'BillingOverview', label: 'tab.overview' },
  { name: 'BillingInvoices', label: 'tab.invoices' },
  { name: 'BillingImports', label: 'tab.imports', match: ['BillingImportDetail'] },
  { name: 'BillingMatching', label: 'tab.matching', badge: 'unmatched' },
  { name: 'BillingReminders', label: 'tab.reminders' },
  { name: 'BillingContacts', label: 'tab.contacts' },
  { name: 'BillingMonday', label: 'tab.monday' },
  { name: 'BillingSettings', label: 'tab.settings' },
]

const route = useRoute()
const router = useRouter()
const { canAny } = useAuth()
// Only the tabs this account may open; each route names its capability.
const tabs = computed(() => TABS.filter((tab) => {
  const cap = router.getRoutes().find((r) => r.name === tab.name)?.meta?.capability
  return !cap || canAny(...[].concat(cap))
}))
const badges = reactive({ unmatched: 0 })

const isActive = (tab) => route.name === tab.name || (tab.match || []).includes(route.name)
function updateBadges(counts) { Object.assign(badges, counts) }

watchEffect(() => {
  const tab = tabs.value.find(isActive)
  document.title = `${tab ? t(tab.label) + ' · ' : ''}${t('title')} | Campos Muños Law`
})
</script>
