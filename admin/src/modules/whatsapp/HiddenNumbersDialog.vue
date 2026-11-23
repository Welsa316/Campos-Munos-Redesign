<template>
  <!-- Numbers kept out of the portal (whatsapp.delete): the ones someone hid,
       here or from a chat, and the ones Calls marks as someone from the firm
       (shown again there, not here). A number can be hidden by typing it,
       before it ever writes; one that already has a chat asks first, naming
       the chat, because hiding deletes it. Showing a number again does not
       bring back what was deleted; its next message starts a new chat. -->
  <transition name="fade">
    <div v-if="open" ref="overlayRef" class="fixed inset-0 z-(--z-dialog) flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="wa-hidden-title" aria-describedby="wa-hidden-what"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true"></div>

      <div class="relative w-full max-w-[460px] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl font-ui">
        <div class="px-6 pt-6 pb-1 flex items-start justify-between gap-3">
          <h2 id="wa-hidden-title" class="font-ui text-[19px] font-semibold tracking-tight text-gray-900">{{ t('hidden.title') }}</h2>
          <button ref="closeRef" @click="close" type="button" :aria-label="t('dialog.close')"
            class="w-8 h-8 flex-shrink-0 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <FaIcon name="xmark" />
          </button>
        </div>
        <div class="px-6 pb-6 pt-2">
          <p id="wa-hidden-what" class="text-[13px] text-gray-700 leading-relaxed">{{ t('hidden.what') }}</p>

          <form class="mt-4" @submit.prevent="add()">
            <label for="wa-hide-number" class="block text-[12px] font-semibold text-gray-700 mb-1.5">{{ t('hidden.add_label') }}</label>
            <div class="flex gap-2">
              <input id="wa-hide-number" ref="inputRef" v-model="draft" type="tel" inputmode="tel" autocomplete="off" maxlength="40"
                aria-describedby="wa-hide-help" :aria-invalid="addError ? 'true' : undefined" :disabled="adding" @input="resetAdd"
                class="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-brand-surface border border-gray-200 focus:border-brand-navy/40 focus:ring-2 focus:ring-brand-navy/10 focus:outline-none text-[14px] tabular-nums" />
              <button type="submit" :disabled="adding || !draft.trim() || Boolean(pending)"
                class="flex-shrink-0 px-5 py-2.5 rounded-full bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
                {{ t(adding && !pending ? 'hidden.adding' : 'hidden.add') }}
              </button>
            </div>
            <p id="wa-hide-help" class="mt-1.5 text-[12px] text-gray-600 leading-snug">{{ t('hidden.add_help') }}</p>
            <p v-if="addError" role="alert" class="mt-1.5 text-[13px] text-brand-red">{{ addError }}</p>
            <ConfirmInline v-if="pending" class="mt-3" :title="t('hidden.has_chat_q', { name: pending.name })" :body="t('hidden.has_chat_body')"
              :confirm-label="t('hidden.has_chat_confirm')" :cancel-label="t('cancel')" :busy="adding"
              @confirm="add(true)" @cancel="cancelPending" />
          </form>

          <p v-if="loading" class="mt-5 text-[13px] text-gray-500">{{ t('hidden.loading') }}</p>
          <p v-else-if="!rows.length" class="mt-5 text-[13px] text-gray-600">{{ t('hidden.none') }}</p>
          <ul v-else class="mt-5 divide-y divide-gray-100 border-y border-gray-100">
            <li v-for="h in rows" :key="`${h.source}-${h.phone}`" class="py-3 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[14px] font-semibold text-gray-900 tabular-nums">{{ waPhone(h.phone) }}<span v-if="h.note" class="font-normal text-gray-700"> · {{ h.note }}</span></p>
                <p v-if="h.source === 'firm'" class="text-[12px] text-gray-600">{{ t('hidden.firm') }}</p>
                <p v-else class="text-[12px] text-gray-600">{{ h.hiddenBy ? t('hidden.by', { name: h.hiddenBy, date: day(h.hiddenAt) }) : t('hidden.when', { date: day(h.hiddenAt) }) }}</p>
              </div>
              <button v-if="h.source !== 'firm'" type="button" @click="show(h)" :disabled="busy === h.phone" :aria-label="t('hidden.show_aria', { phone: waPhone(h.phone) })"
                class="flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold text-brand-navy ring-1 ring-brand-navy/25 hover:bg-brand-surface disabled:opacity-50">
                {{ t('hidden.show') }}
              </button>
            </li>
          </ul>
          <div v-if="rows.length" class="mt-3 space-y-1.5 text-[12px] text-gray-600 leading-snug">
            <p v-if="rows.some((h) => h.source !== 'firm')">{{ t('hidden.show_note') }}</p>
            <p v-if="rows.some((h) => h.source === 'firm')">{{ t('hidden.firm_note') }}</p>
          </div>
          <p class="sr-only" role="status">{{ note ? t(note.key, note.params) : '' }}</p>
          <p v-if="error" role="alert" class="mt-3 text-[13px] text-brand-red">{{ error }}</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useApi } from '../../composables/useApi.js'
import FaIcon from '../../components/FaIcon.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'
import { useT } from '../../i18n/translator.js'
import { WHATSAPP } from '../../i18n/whatsapp.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Formats a wa_id the way the inbox does.
  waPhone: { type: Function, required: true },
})
const emit = defineEmits(['close', 'changed'])
const { get, post, del } = useApi()
const { t, locale } = useT(WHATSAPP)

const rows = ref([])
const loading = ref(false)
const busy = ref('')
const error = ref('')
// What just happened, for screen readers: a key, so it follows the language switch.
const note = ref(null)
// Hiding a typed number: what is in the box, the refusal under it, and the
// chat the server says would be deleted (asked about before anything is).
const draft = ref('')
const adding = ref(false)
const addError = ref('')
const pending = ref(null)
const inputRef = ref(null)
const overlayRef = ref(null)
const closeRef = ref(null)
let previouslyFocused = null

const day = (v) => new Date(v).toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await get('/api/whatsapp/hidden-numbers')
  } catch (e) {
    error.value = e.message || t('action_failed')
  } finally {
    loading.value = false
  }
}

const ADD_ERRORS = { bad_number: 'hidden.bad_number', already_hidden: 'hidden.already' }

function resetAdd() {
  addError.value = ''
  pending.value = null
}

function cancelPending() {
  pending.value = null
  nextTick(() => inputRef.value?.focus())
}

// deleteChat only after the question about that chat was answered.
async function add(deleteChat = false) {
  const phone = draft.value.trim()
  if (!phone || adding.value) return
  adding.value = true
  addError.value = ''
  try {
    const r = await post('/api/whatsapp/hidden-numbers', { phone, deleteChat })
    draft.value = ''
    pending.value = null
    note.value = { key: r.chatDeleted ? 'hidden.added_chat' : 'hidden.added', params: { phone: props.waPhone(r.phone) } }
    await load()
    emit('changed', { count: rows.value.length, chatDeleted: r.chatDeleted, phone: r.phone })
  } catch (e) {
    if (e.code === 'has_chat' && e.data?.chat) {
      pending.value = { name: e.data.chat.name || props.waPhone(e.data.chat.phone) }
    } else {
      pending.value = null
      addError.value = ADD_ERRORS[e.code] ? t(ADD_ERRORS[e.code]) : (e.message || t('action_failed'))
    }
  } finally {
    adding.value = false
    // A disabled field drops focus: put it back where the person was typing.
    if (!pending.value) nextTick(() => inputRef.value?.focus())
  }
}

async function show(h) {
  busy.value = h.phone
  error.value = ''
  try {
    await del(`/api/whatsapp/hidden-numbers/${encodeURIComponent(h.phone)}`)
    rows.value = rows.value.filter((r) => r.phone !== h.phone)
    note.value = { key: 'hidden.shown', params: { phone: props.waPhone(h.phone) } }
    emit('changed', { count: rows.value.length, chatDeleted: false, phone: h.phone })
    // The button that had focus is gone: keep focus inside the dialog.
    nextTick(() => closeRef.value?.focus())
  } catch (e) {
    error.value = e.message || t('action_failed')
  } finally {
    busy.value = ''
  }
}

watch(() => props.open, (open) => {
  if (!open) {
    if (previouslyFocused?.isConnected && previouslyFocused.focus) previouslyFocused.focus()
    previouslyFocused = null
    return
  }
  previouslyFocused = document.activeElement
  note.value = null
  draft.value = ''
  resetAdd()
  load()
  nextTick(() => closeRef.value?.focus())
})

function close() { emit('close') }

function trapFocus(e) {
  if (!overlayRef.value) return
  const f = overlayRef.value.querySelectorAll('button:not([disabled]), input:not([disabled])')
  if (!f.length) return
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
}
</script>
