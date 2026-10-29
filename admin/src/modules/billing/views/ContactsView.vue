<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>
    <section class="bg-white rounded-xl ring-1 ring-gray-200">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 space-y-3">
        <div>
          <h2 class="text-sm font-ui font-semibold text-gray-900">WhatsApp contacts and consent</h2>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            A payment reminder is only drafted for a client with a number, a recorded opt-in and a monday.com link. Record how the client agreed
            (signed intake form, said yes at a consultation). Changing a number clears the consent: it belongs to the number.
            A client who replies STOP or BAJA is opted out automatically.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative w-full sm:w-72">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" aria-hidden="true"></i>
            <input v-model="search" type="search" placeholder="Client name or ID" aria-label="Search clients"
              class="w-full text-xs font-ui pl-8 pr-3 py-2 rounded-lg bg-brand-surface border border-transparent focus:border-brand-navy/30 focus:bg-white focus:outline-none" />
          </div>
          <label class="inline-flex items-center gap-2 text-xs font-ui text-gray-700 ml-auto">
            <input type="checkbox" v-model="owingOnly" class="rounded border-gray-300" /> Only clients who owe money
          </label>
        </div>
      </header>

      <p v-if="loading && !rows.length" class="p-8 text-center text-sm text-gray-500 font-ui">Loading…</p>
      <p v-else-if="!shown.length" class="p-8 text-center text-sm text-gray-500 font-ui">No clients match.</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="c in shown" :key="c.client_id" class="px-4 sm:px-5 py-4 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-3 lg:gap-6 text-xs font-ui">
          <div>
            <p class="text-sm font-medium text-gray-900">{{ c.display_name || 'Unnamed client' }}</p>
            <p class="text-gray-500">{{ c.eimmigration_client_id }} · {{ money(c.owed) }} owed</p>
            <p class="mt-1 font-semibold" :class="consent(c).tone">{{ consent(c).label }}</p>
            <p v-if="!c.linked" class="text-amber-700">Not linked to monday.com yet</p>
            <p v-if="c.shared_with" class="text-amber-700">Number shared with {{ c.shared_with }} other client(s): a STOP from it stops messages to all of them</p>
            <p v-if="c.phone_e164" class="text-gray-500">Saved as +{{ c.phone_e164 }}</p>
          </div>
          <div class="space-y-2">
            <div class="flex flex-wrap items-end gap-2">
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">Country</span>
                <select v-model="edit(c).country" :aria-label="`Country of the number for ${c.display_name}`" class="px-2 py-1.5 rounded-lg border border-gray-300 bg-white">
                  <option v-for="k in COUNTRIES" :key="k.code" :value="k.code">{{ k.label }} +{{ k.code }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">WhatsApp number</span>
                <input v-model="edit(c).phone" type="tel" inputmode="tel" placeholder="504 555 0100" :aria-label="`WhatsApp number for ${c.display_name}`"
                  class="w-44 px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">First name in messages</span>
                <input v-model="edit(c).firstName" :placeholder="firstWord(c.display_name)" :aria-label="`First name for ${c.display_name}`"
                  class="w-36 px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">Time zone</span>
                <select v-model="edit(c).timezone" :aria-label="`Time zone for ${c.display_name}`" class="px-2 py-1.5 rounded-lg border border-gray-300 bg-white">
                  <option v-for="z in ZONES" :key="z.id" :value="z.id">{{ z.label }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[11px] font-semibold text-gray-700">Language</span>
                <select v-model="edit(c).language" :aria-label="`Language for ${c.display_name}`" class="px-3 py-1.5 rounded-lg border border-gray-300 bg-white">
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </label>
              <button @click="save(c)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">Save</button>
            </div>
            <div v-if="c.phone_e164" class="flex flex-wrap items-end gap-2">
              <template v-if="!isOptedIn(c)">
                <label class="flex flex-col gap-1 flex-1 min-w-[14rem]">
                  <span class="text-[11px] font-semibold text-gray-700">How did the client agree to WhatsApp messages?</span>
                  <input v-model="edit(c).source" placeholder="e.g. signed intake form, 10/12/2026" :aria-label="`Consent source for ${c.display_name}`"
                    class="px-3 py-1.5 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
                </label>
                <button @click="optIn(c)" :disabled="Boolean(busy) || !(edit(c).source || '').trim()" class="px-3 py-1.5 rounded-lg ring-1 ring-green-600/40 text-green-800 font-semibold hover:bg-green-50 disabled:opacity-40">Record opt-in</button>
              </template>
              <button v-else @click="optOut(c)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg text-gray-600 hover:text-brand-red hover:bg-red-50">Record opt-out</button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useApi, rawFetch, goToLogin } from '../../../composables/useApi.js'
import { money, shortDate } from '../api.js'

const { get, post } = useApi()
const put = async (path, body) => {
  const res = await rawFetch(path, { method: 'PUT', body: JSON.stringify(body) })
  if (res.status === 401) { goToLogin(); throw new Error('Unauthorized') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const rows = ref([])
const edits = reactive({})
const loading = ref(true)
const busy = ref('')
const error = ref('')
const search = ref('')
const owingOnly = ref(true)

// The firm's clients by origin. Any other country: type the number with +.
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
const isOptedIn = (c) => Boolean(c.opted_in_at) && !(c.opted_out_at && c.opted_out_at > c.opted_in_at)
function consent(c) {
  if (!c.phone_e164) return { label: 'No WhatsApp number', tone: 'text-gray-500' }
  if (c.opted_out_at && (!c.opted_in_at || c.opted_out_at > c.opted_in_at)) return { label: `Opted out ${shortDate(c.opted_out_at)}${c.opt_out_source === 'whatsapp_reply' ? ' (replied STOP)' : ''}`, tone: 'text-brand-red' }
  if (c.opted_in_at) return { label: `Opted in ${shortDate(c.opted_in_at)} · ${c.opt_in_source}`, tone: 'text-green-700' }
  return { label: 'No consent recorded', tone: 'text-amber-700' }
}
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
  try { rows.value = await get('/api/billing/contacts') } catch (err) { error.value = err.message } finally { loading.value = false }
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
function optOut(c) {
  if (!window.confirm(`Record that ${c.display_name} does not want WhatsApp messages? Pending reminders for them are cancelled.`)) return
  act('optout', () => post(`/api/billing/contacts/${c.client_id}/opt-out`, {}))
}

onMounted(load)
</script>
