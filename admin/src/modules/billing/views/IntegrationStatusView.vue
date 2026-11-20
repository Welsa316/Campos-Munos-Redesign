<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <p class="text-xs font-ui text-gray-600 max-w-3xl">
      {{ t('int.intro') }}
    </p>
    <div class="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-4">
      <section v-for="card in cards" :key="card.key" class="bg-white rounded-xl ring-1 ring-gray-200 p-5" :aria-labelledby="`int-${card.key}`">
        <div class="flex items-start gap-3">
          <h2 :id="`int-${card.key}`" class="text-sm font-ui font-semibold text-gray-900 flex-1">{{ cardName(card) }}</h2>
          <span :class="STATE[card.state]?.tone || 'bg-gray-100 text-gray-600'" class="inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full whitespace-nowrap">
            <span :class="STATE[card.state]?.dot || 'bg-gray-400'" class="w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
            {{ STATE[card.state] ? t(`state.${card.state}`) : card.state }}
          </span>
        </div>
        <p class="text-xs font-ui text-gray-600 mt-2 leading-relaxed">{{ card.detail }}</p>
        <p v-if="card.key === 'monday' && card.state !== 'mock'" class="text-[11px] font-ui mt-2" :class="card.writesEnabled ? 'text-brand-red' : 'text-gray-500'">
          {{ t('int.writes', { state: t(card.writesEnabled ? 'int.writes_on' : 'int.writes_off') }) }}
        </p>
        <router-link v-if="card.key === 'monday'" :to="{ name: 'BillingMonday' }" class="inline-block mt-3 text-xs font-ui font-semibold text-brand-navy underline">{{ t('int.board_settings') }}</router-link>
        <router-link v-if="card.key === 'ringcentral' && card.canManage" :to="{ name: 'Integrations' }" class="inline-block mt-3 text-xs font-ui font-semibold text-brand-navy underline">{{ t(card.state === 'connected' ? 'int.manage' : 'int.connect_rc') }}</router-link>
        <p v-else-if="card.key === 'ringcentral' && card.state !== 'connected'" class="text-[11px] font-ui text-gray-500 mt-2">{{ t('int.admin_connects') }}</p>
        <router-link v-if="card.key === 'eimmigration_import'" :to="{ name: 'BillingImports' }" class="inline-block mt-3 text-xs font-ui font-semibold text-brand-navy underline">{{ t('import_report') }}</router-link>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useBillingApi } from '../api.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'
import { hasWord } from '../billingText.js'

// Each state's label is state.<key> in i18n/billing.js.
const STATE = {
  connected: { tone: 'bg-green-100 text-green-800', dot: 'bg-green-600' },
  mock: { tone: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  unverified: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  configured_unverified: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  webhook_configured: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  not_configured: { tone: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  configuration_error: { tone: 'bg-red-100 text-brand-red', dot: 'bg-brand-red' },
  error: { tone: 'bg-red-100 text-brand-red', dot: 'bg-brand-red' },
  disabled: { tone: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  not_connected: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  needs_reauth: { tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
}

const { t, lang } = useT(BILLING)
// The server names each card; only the importer's name is not a product
// name, so only it changes in Spanish. Its details are shown as sent.
const cardName = (card) => (lang.value === 'es' && hasWord(BILLING, `card.${card.key}`) ? t(`card.${card.key}`) : card.name)

const api = useBillingApi()
const cards = ref([])
const error = ref('')
onMounted(async () => {
  try { cards.value = await api.integrations() } catch (err) { error.value = err.message }
})
</script>
