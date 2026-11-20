<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <section class="bg-white rounded-xl ring-1 ring-gray-200">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 space-y-3">
        <div>
          <h2 class="text-sm font-ui font-semibold text-gray-900">{{ t('contacts.title') }}</h2>
          <p v-if="policy.firmPolicy" class="text-[11px] font-ui text-gray-500 mt-0.5">
            {{ t('contacts.policy_note', { basis: (policy.basis || t('contacts.default_basis')).toLowerCase() }) }}
          </p>
          <p v-else class="text-[11px] font-ui text-gray-500 mt-0.5">
            {{ t('contacts.no_policy_note') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative w-full sm:w-72">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" aria-hidden="true"></i>
            <input v-model="search" type="search" :placeholder="t('contacts.search_placeholder')" :aria-label="t('contacts.search_label')"
              class="w-full text-xs font-ui pl-8 pr-3 py-2 rounded-lg bg-brand-surface border border-gray-300 focus:bg-white" />
          </div>
          <label v-if="canSeeOwed" class="inline-flex items-center gap-2 text-xs font-ui text-gray-700 ml-auto">
            <input type="checkbox" v-model="owingOnly" class="rounded border-gray-300" /> {{ t('contacts.owing_only') }}
          </label>
        </div>
      </header>

      <p v-if="loading && !rows.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t('loading') }}</p>
      <p v-else-if="!shown.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t('contacts.none') }}</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="c in shown" :key="c.client_id" class="px-4 sm:px-5 py-4 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-3 lg:gap-6 text-xs font-ui">
          <div>
            <p class="text-sm font-medium text-gray-900">{{ c.display_name || t('unnamed_client') }}</p>
            <p class="text-gray-500">{{ c.eimmigration_client_id }}<template v-if="c.owed != null"> · {{ t('owed', { amount: money(c.owed) }) }}</template></p>
            <p class="mt-1 font-semibold" :class="consent(c).tone">{{ consent(c).label }}</p>
            <p v-if="!c.linked" class="text-amber-700">{{ t('contacts.not_linked') }}</p>
            <p v-if="c.shared_with" class="text-amber-700">{{ t('contacts.shared', { others: t('contacts.other_clients', { count: num(c.shared_with, lang) }) }) }}</p>
            <p v-if="c.phone_e164" class="text-gray-500">{{ t('contacts.saved_as', { phone: c.phone_e164 }) }}{{ c.phone_source === 'import' ? t('contacts.from_report') : '' }}</p>
          </div>
          <div class="space-y-2">
            <div class="flex flex-wrap items-end gap-2">
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('contacts.country') }}</span>
                <select v-model="edit(c).country" :aria-label="t('contacts.country_for', { name: String(c.display_name) })" class="px-2 py-1.5 rounded-lg border border-gray-300 bg-white">
                  <option v-for="k in COUNTRIES" :key="k.code" :value="k.code">{{ place('country.', k.code, k.label) }} +{{ k.code }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('contacts.number') }}</span>
                <input v-model="edit(c).phone" type="tel" inputmode="tel" placeholder="504 555 0100" :aria-label="t('contacts.number_for', { name: String(c.display_name) })"
                  class="w-44 px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('contacts.first_name') }}</span>
                <input v-model="edit(c).firstName" :placeholder="firstWord(c.display_name)" :aria-label="t('contacts.first_name_for', { name: String(c.display_name) })"
                  class="w-36 px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('contacts.zone') }}</span>
                <select v-model="edit(c).timezone" :aria-label="t('contacts.zone_for', { name: String(c.display_name) })" class="px-2 py-1.5 rounded-lg border border-gray-300 bg-white">
                  <option v-for="z in ZONES" :key="z.id" :value="z.id">{{ place('zone.', z.id, z.label) }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">{{ t('contacts.language') }}</span>
                <select v-model="edit(c).language" :aria-label="t('contacts.language_for', { name: String(c.display_name) })" class="px-3 py-1.5 rounded-lg border border-gray-300 bg-white">
                  <option value="es">{{ t('lang.es') }}</option>
                  <option value="en">{{ t('lang.en') }}</option>
                </select>
              </label>
              <button @click="save(c)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">{{ t('save') }}</button>
            </div>
            <div v-if="c.phone_e164" class="flex flex-wrap items-end gap-2">
              <template v-if="!isOptedIn(c) && !(policy.firmPolicy && !isOptedOut(c))">
                <label class="flex flex-col gap-1 flex-1 min-w-[14rem]">
                  <span class="text-[11px] font-semibold text-gray-700">{{ t('contacts.how_agreed') }}</span>
                  <input v-model="edit(c).source" :placeholder="t('contacts.source_placeholder')" :aria-label="t('contacts.source_for', { name: String(c.display_name) })"
                    class="px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
                </label>
                <button @click="optIn(c)" :disabled="Boolean(busy) || !(edit(c).source || '').trim()" class="px-3 py-1.5 rounded-lg ring-1 ring-green-600/40 text-green-800 font-semibold hover:bg-green-50 disabled:opacity-40">{{ t('contacts.record_opt_in') }}</button>
              </template>
              <button v-else @click="confirmingOptOut = c.client_id" :disabled="Boolean(busy)" :aria-expanded="confirmingOptOut === c.client_id" class="px-3 py-1.5 rounded-lg text-gray-600 hover:text-brand-red hover:bg-red-50">{{ t('contacts.record_opt_out') }}</button>
            </div>
            <ConfirmInline v-if="confirmingOptOut === c.client_id"
              :title="t('contacts.opt_out_title', { name: c.display_name || t('this_client') })" :body="t('contacts.opt_out_body')"
              :confirm-label="t('contacts.record_opt_out')" :cancel-label="t('cancel')" :busy="Boolean(busy)" @confirm="optOut(c)" @cancel="confirmingOptOut = null" />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useApi } from '../../../composables/useApi.js'
import { money as moneyIn } from '../format.js'
import { num, hasWord, isOptedIn, isOptedOut, consentLine } from '../billingText.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING_REMINDERS } from '../../../i18n/billingReminders.js'
import { can } from '../../../composables/useAuth.js'
import ConfirmInline from '../../../components/ConfirmInline.vue'

const { get, post, put } = useApi()
const { t, lang, locale } = useT(BILLING_REMINDERS)
const money = (cents) => moneyIn(cents, locale.value)

const rows = ref([])
const edits = reactive({})
const loading = ref(true)
const busy = ref('')
const error = ref('')
const search = ref('')
// Amounts owed come back only with billing.status; without them the
// "owes money" filter would hide everyone.
const canSeeOwed = can('billing.status')
const owingOnly = ref(canSeeOwed)

// The firm's clients by origin. Any other country: type the number with +.
// Names are already Spanish except the ones with a word in
// i18n/billingReminders.js (country.<code>, zone.<id>).
const COUNTRIES = [
  { code: '1', label: 'US' }, { code: '52', label: 'México' }, { code: '502', label: 'Guatemala' },
  { code: '504', label: 'Honduras' }, { code: '503', label: 'El Salvador' }, { code: '505', label: 'Nicaragua' },
  { code: '506', label: 'Costa Rica' }, { code: '507', label: 'Panamá' }, { code: '57', label: 'Colombia' },
  { code: '58', label: 'Venezuela' }, { code: '53', label: 'Cuba' }, { code: '51', label: 'Perú' }, { code: '593', label: 'Ecuador' },
]
const ZONES = [
  { id: 'America/Chicago', label: 'Central (New Orleans)' }, { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Denver', label: 'Mountain' }, { id: 'America/Phoenix', label: 'Arizona' }, { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Mexico_City', label: 'Ciudad de México' }, { id: 'America/Guatemala', label: 'Centroamérica' },
  { id: 'America/Bogota', label: 'Colombia / Perú' }, { id: 'America/Caracas', label: 'Venezuela' },
]
const firstWord = (n) => String(n || '').trim().split(/\s+/)[0] || ''
const place = (prefix, id, label) => (hasWord(BILLING_REMINDERS, prefix + id) ? t(prefix + id) : label)
// The firm-wide consent policy (Billing → Reminders → Rules & templates).
const policy = ref({ firmPolicy: false, basis: '' })
const consent = (c) => consentLine(c, policy.value.firmPolicy, lang.value)
function edit(c) {
  if (!edits[c.client_id]) {
    edits[c.client_id] = {
      // A saved number is shown in full international form, so the country
      // field does not apply to it until it is edited.
      phone: c.phone_e164 ? `+${c.phone_e164}` : '', country: '1', firstName: c.first_name || '',
      language: c.language || 'es', timezone: c.timezone || 'America/Chicago', source: '',
    }
  }
  return edits[c.client_id]
}
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((c) => (!owingOnly.value || c.owed > 0)
    && (!q || String(c.display_name || '').toLowerCase().includes(q) || String(c.eimmigration_client_id || '').toLowerCase().includes(q)))
})

async function load() {
  loading.value = true
  try {
    const [list, p] = await Promise.all([get('/api/billing/contacts'), get('/api/billing/consent')])
    rows.value = list
    policy.value = p
  } catch (err) { error.value = err.message } finally { loading.value = false }
}
async function act(name, fn) {
  busy.value = name
  error.value = ''
  try { await fn(); await load() } catch (err) { error.value = err.message } finally { busy.value = '' }
}
const save = (c) => act('save', async () => {
  const e = edit(c)
  await put(`/api/billing/contacts/${c.client_id}`, { phone: e.phone, country: e.country, firstName: e.firstName, language: e.language, timezone: e.timezone })
  // Reload first, then drop the edit buffer, so it is rebuilt from the saved
  // row rather than from the stale one still on screen.
  await load()
  delete edits[c.client_id]
})
const optIn = (c) => act('optin', () => post(`/api/billing/contacts/${c.client_id}/opt-in`, { source: edit(c).source }))
const confirmingOptOut = ref(null)
function optOut(c) {
  confirmingOptOut.value = null
  act('optout', () => post(`/api/billing/contacts/${c.client_id}/opt-out`, {}))
}

onMounted(load)
</script>
