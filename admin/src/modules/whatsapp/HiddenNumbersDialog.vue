<template>
  <!-- Numbers kept out of the portal (whatsapp.delete), and the way to let
       one back in. Showing a number again does not bring back what was
       deleted; its next message starts a new chat. -->
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

          <p v-if="loading" class="mt-4 text-[13px] text-gray-500">{{ t('hidden.loading') }}</p>
          <p v-else-if="!rows.length" class="mt-4 text-[13px] text-gray-600">{{ t('hidden.none') }}</p>
          <ul v-else class="mt-4 divide-y divide-gray-100 border-y border-gray-100">
            <li v-for="h in rows" :key="h.phone" class="py-3 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[14px] font-semibold text-gray-900 tabular-nums">{{ waPhone(h.phone) }}</p>
                <p class="text-[12px] text-gray-600">{{ h.hiddenBy ? t('hidden.by', { name: h.hiddenBy, date: day(h.hiddenAt) }) : t('hidden.when', { date: day(h.hiddenAt) }) }}</p>
              </div>
              <button type="button" @click="show(h)" :disabled="busy === h.phone" :aria-label="t('hidden.show_aria', { phone: waPhone(h.phone) })"
                class="flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold text-brand-navy ring-1 ring-brand-navy/25 hover:bg-brand-surface disabled:opacity-50">
                {{ t('hidden.show') }}
              </button>
            </li>
          </ul>
          <p class="sr-only" role="status">{{ note }}</p>
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
import { useT } from '../../i18n/translator.js'
import { WHATSAPP } from '../../i18n/whatsapp.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Formats a wa_id the way the inbox does.
  waPhone: { type: Function, required: true },
})
const emit = defineEmits(['close', 'changed'])
const { get, del } = useApi()
const { t, locale } = useT(WHATSAPP)

const rows = ref([])
const loading = ref(false)
const busy = ref('')
const error = ref('')
const note = ref('')
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

async function show(h) {
  busy.value = h.phone
  error.value = ''
  try {
    await del(`/api/whatsapp/hidden-numbers/${encodeURIComponent(h.phone)}`)
    rows.value = rows.value.filter((r) => r.phone !== h.phone)
    note.value = t('hidden.shown', { phone: props.waPhone(h.phone) })
    emit('changed', rows.value.length)
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
  note.value = ''
  load()
  nextTick(() => closeRef.value?.focus())
})

function close() { emit('close') }

function trapFocus(e) {
  if (!overlayRef.value) return
  const f = overlayRef.value.querySelectorAll('button:not([disabled])')
  if (!f.length) return
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
}
</script>
