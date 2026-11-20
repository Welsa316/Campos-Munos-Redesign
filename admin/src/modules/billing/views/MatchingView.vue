<template>
  <div class="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 space-y-5">
    <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

    <section v-if="data && !data.board" class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 text-sm font-ui text-gray-700">
      <template v-if="data.mondayStatus === 'not_configured' && can('monday.configure')">{{ chooseBoard[0] }}<router-link :to="{ name: 'BillingMonday' }" class="text-brand-navy underline">monday.com</router-link>{{ chooseBoard[1] }}</template>
      <template v-else-if="data.mondayStatus === 'not_configured'">{{ t('matching.no_board') }}</template>
      <template v-else>{{ t('matching.unreachable') }}</template>
    </section>

    <section class="bg-white rounded-xl ring-1 ring-gray-200">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 space-y-3">
        <div>
          <h2 class="text-sm font-ui font-semibold text-gray-900">{{ t('matching.title') }}</h2>
          <p class="text-[11px] font-ui text-gray-500 mt-0.5">
            {{ t('matching.note') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5" role="group" :aria-label="t('matching.filter_label')">
          <button v-for="f in FILTERS" :key="f.key" @click="filter = f.key" :aria-pressed="filter === f.key"
            :class="filter === f.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-brand-surface text-gray-600 ring-transparent hover:text-gray-900'"
            class="text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap">{{ t(f.label) }} {{ counts[f.key] }}</button>
          <span v-if="data?.invoicesWithoutClientId" class="ml-auto text-[11px] font-ui text-amber-800">
            {{ t('matching.no_id', { count: num(data.invoicesWithoutClientId, lang) }) }}
          </span>
        </div>
      </header>

      <p v-if="loading && !data" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t('loading') }}</p>
      <LoadError v-else-if="loadFailed && !data" :message="t('matching.load_failed')" @retry="load" />
      <p v-else-if="!shown.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t(filter === 'todo' ? 'matching.all_linked' : 'matching.none') }}</p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="c in shown" :key="c.clientId" class="px-4 sm:px-5 py-4 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-3 lg:gap-6">
          <div>
            <p class="text-sm font-ui font-medium text-gray-900">{{ c.name || t('unnamed_client') }}</p>
            <p class="text-[11px] font-ui text-gray-500">{{ c.eimmigrationClientId }} · {{ t('count.invoice', { count: num(c.invoices, lang) }) }} · {{ t('owed', { amount: money(c.owedCents) }) }}</p>
            <p :class="known(STATUS, c.status, 'text-gray-700').tone" class="mt-1 text-[11px] font-ui font-semibold">{{ STATUS[c.status] ? t(`mstatus.${c.status}`) : known(STATUS, c.status).label }}<span class="font-normal text-gray-500"> · {{ c.reason }}</span></p>
          </div>

          <div class="text-xs font-ui">
            <!-- Linked -->
            <ul v-if="c.linked.length" class="space-y-1.5">
              <li v-for="l in c.linked" :key="l.externalId" class="flex flex-wrap items-center gap-2">
                <i class="fa-solid fa-link text-[10px] text-green-700" aria-hidden="true"></i>
                <span class="text-gray-800">{{ l.externalLabel || l.externalId }}</span>
                <button @click="confirmingUnlink = `${c.clientId}:${l.externalId}`" :disabled="Boolean(busy)" :aria-expanded="confirmingUnlink === `${c.clientId}:${l.externalId}`" class="ml-auto px-2 py-1 rounded text-gray-500 hover:text-brand-red hover:bg-red-50">{{ t('matching.unlink') }}</button>
                <ConfirmInline v-if="confirmingUnlink === `${c.clientId}:${l.externalId}`" class="basis-full"
                  :title="t('matching.unlink_title', { name: c.name || t('this_client') })" :body="t('matching.unlink_body')"
                  :confirm-label="t('matching.unlink')" :cancel-label="t('cancel')" :busy="Boolean(busy)" @confirm="unlink(c, l.externalId)" @cancel="confirmingUnlink = null" />
              </li>
            </ul>

            <!-- Proposed by eImmigration ID -->
            <div v-else-if="c.status === 'matched_by_id'" class="flex flex-wrap items-center gap-2">
              <span class="text-gray-700">{{ t('matching.carries_id', { item: itemName(c.itemIds[0]) }) }}</span>
              <button @click="link(c, c.itemIds[0])" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark">{{ t('matching.link_now') }}</button>
            </div>

            <!-- Candidates -->
            <div v-else class="space-y-2">
              <ul v-if="c.candidates.length" class="space-y-1.5">
                <li v-for="cand in c.candidates" :key="cand.itemId" class="flex flex-wrap items-center gap-2">
                  <span class="text-gray-800">{{ cand.name }}</span>
                  <span class="text-[10px] text-gray-500 tabular-nums">{{ t('matching.item', { id: cand.itemId }) }}</span>
                  <span class="text-[10px] text-gray-500 tabular-nums">{{ t('matching.score', { percent: Math.round(cand.score * 100) }) }}</span>
                  <span v-if="cand.linkedElsewhere" class="text-[10px] text-amber-700">{{ t('matching.linked_elsewhere') }}</span>
                  <button @click="link(c, cand.itemId)" :disabled="busy || cand.linkedElsewhere"
                    class="ml-auto px-3 py-1 rounded-lg ring-1 ring-brand-navy/30 text-brand-navy font-semibold hover:bg-brand-navy hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-navy">{{ t('matching.this_is_them') }}</button>
                </li>
              </ul>
              <div v-if="data?.board" class="flex flex-wrap items-center gap-2">
                <label :for="`pick-${c.clientId}`" class="sr-only">{{ t('matching.choose_for', { name: c.name ?? '' }) }}</label>
                <select :id="`pick-${c.clientId}`" v-model="picks[c.clientId]"
                  class="flex-1 min-w-[12rem] text-xs font-ui px-3 py-1.5 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                  <option value="">{{ t('matching.choose_another') }}</option>
                  <option v-for="it in data.board.items" :key="it.id" :value="it.id" :disabled="linkedIds.has(it.id)">{{ t('matching.item_option', { name: it.name ?? '', id: it.id }) }}</option>
                </select>
                <button @click="link(c, picks[c.clientId])" :disabled="busy || !picks[c.clientId]"
                  class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold hover:bg-brand-navy-dark disabled:opacity-40">{{ t('matching.link') }}</button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useBillingApi } from '../api.js'
import { money as moneyIn } from '../format.js'
import { num, around } from '../billingText.js'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'
import { can } from '../../../composables/useAuth.js'
import LoadError from '../../../components/LoadError.vue'
import ConfirmInline from '../../../components/ConfirmInline.vue'
import { known } from '../../../utils/text.js'

const emit = defineEmits(['counts'])
// A client's match; its label is mstatus.<key> in i18n/billing.js.
const STATUS = {
  linked: { tone: 'text-green-700' },
  matched_by_id: { tone: 'text-brand-navy' },
  ambiguous: { tone: 'text-amber-700' },
  unmatched: { tone: 'text-brand-red' },
}
// label: a word in i18n/billing.js.
const FILTERS = [
  { key: 'todo', label: 'mfilter.todo' },
  { key: 'linked', label: 'mfilter.linked' },
  { key: 'all', label: 'mfilter.all' },
]

const { t, lang, locale } = useT(BILLING)
const money = (cents) => moneyIn(cents, locale.value)
// "Choose the client board on the {link} tab…" around the tab link.
const chooseBoard = computed(() => around(t('matching.choose_board'), 'link'))

const api = useBillingApi()
const data = ref(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const loadFailed = ref(false)
const filter = ref('todo')
const picks = reactive({})

const isTodo = (c) => !c.linked.length
const counts = computed(() => {
  const list = data.value?.clients || []
  return { todo: list.filter(isTodo).length, linked: list.filter((c) => c.linked.length).length, all: list.length }
})
const shown = computed(() => {
  const list = data.value?.clients || []
  if (filter.value === 'todo') return list.filter(isTodo)
  if (filter.value === 'linked') return list.filter((c) => c.linked.length)
  return list
})
const linkedIds = computed(() => new Set((data.value?.clients || []).flatMap((c) => c.linked.map((l) => l.externalId))))
const itemName = (id) => data.value?.board?.items.find((i) => i.id === id)?.name || id

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.matching()
    for (const c of data.value.clients) if (picks[c.clientId] == null) picks[c.clientId] = ''
    emit('counts', { unmatched: counts.value.todo })
  } catch (err) {
    error.value = t('matching.load_error', { message: err.message })
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function link(c, itemId) {
  if (!itemId) return
  busy.value = true
  error.value = ''
  try {
    await api.link(c.clientId, itemId)
    picks[c.clientId] = ''
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

const confirmingUnlink = ref(null)
async function unlink(c, itemId) {
  confirmingUnlink.value = null
  busy.value = true
  try {
    await api.unlink(c.clientId, itemId)
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>
