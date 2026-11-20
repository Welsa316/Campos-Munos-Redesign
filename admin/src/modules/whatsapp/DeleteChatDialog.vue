<template>
  <!-- Delete a whole chat from the portal (whatsapp.delete), and optionally
       hide the number so its new messages stay out too: the firm's number
       is also used from a phone, for coworkers and personal chats. Cancel
       is where focus starts; the destructive button says what it will do. -->
  <transition name="fade">
    <div v-if="open" ref="overlayRef" class="fixed inset-0 z-(--z-dialog) flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="wa-del-title" aria-describedby="wa-del-what"
      @keydown.esc="close" @keydown.tab="trapFocus" @click.self="close">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true"></div>

      <form @submit.prevent="confirm" class="relative w-full max-w-[460px] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl font-ui">
        <div class="px-6 pt-6 pb-1 flex items-start justify-between gap-3">
          <h2 id="wa-del-title" class="font-ui text-[19px] font-semibold tracking-tight text-gray-900">{{ t('chat.title') }}</h2>
          <button @click="close" type="button" :aria-label="t('dialog.close')"
            class="w-8 h-8 flex-shrink-0 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors">
            <FaIcon name="xmark" />
          </button>
        </div>

        <div class="px-6 pb-6 pt-2 space-y-4">
          <p class="text-[14px] font-semibold text-gray-900 truncate">{{ name }}</p>
          <div id="wa-del-what" class="space-y-1.5 text-[13px] text-gray-700 leading-relaxed">
            <p>{{ t('chat.what') }}</p>
            <p>{{ t('chat.reminders') }}</p>
          </div>

          <label class="flex items-start gap-3 rounded-xl bg-brand-surface px-3.5 py-3 cursor-pointer">
            <input v-model="hide" type="checkbox" class="mt-0.5 w-4 h-4 flex-shrink-0 accent-brand-navy" />
            <span class="min-w-0">
              <span class="block text-[13px] font-semibold text-gray-900">{{ t('chat.hide') }}</span>
              <span class="block text-[12px] text-gray-600 leading-snug mt-0.5">{{ t('chat.hide_help', { phone }) }}</span>
            </span>
          </label>

          <p v-if="error" role="alert" class="text-[13px] text-brand-red">{{ error }}</p>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button ref="cancelRef" type="button" @click="close" class="px-5 py-2.5 rounded-full text-[13px] font-semibold text-gray-600 hover:bg-gray-100">{{ t('cancel') }}</button>
            <button type="submit" :disabled="busy"
              class="px-5 py-2.5 rounded-full bg-brand-red text-white text-[13px] font-semibold hover:bg-brand-red-light disabled:opacity-50">
              <FaIcon v-if="busy" name="spinner" spin class="mr-1.5" />{{ busy ? t('chat.deleting') : hide ? t('chat.confirm_hide') : t('chat.confirm') }}
            </button>
          </div>
        </div>
      </form>
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
  conversationId: { type: Number, default: null },
  // As the chat's header shows them.
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
})
const emit = defineEmits(['close', 'deleted'])
const { del } = useApi()
const { t } = useT(WHATSAPP)

const hide = ref(false)
const busy = ref(false)
const error = ref('')
const overlayRef = ref(null)
const cancelRef = ref(null)
let previouslyFocused = null

watch(() => props.open, (open) => {
  if (!open) {
    if (previouslyFocused?.isConnected && previouslyFocused.focus) previouslyFocused.focus()
    previouslyFocused = null
    return
  }
  previouslyFocused = document.activeElement
  hide.value = false
  busy.value = false
  error.value = ''
  nextTick(() => cancelRef.value?.focus())
})

async function confirm() {
  if (busy.value || !props.conversationId) return
  busy.value = true
  error.value = ''
  try {
    await del(`/api/whatsapp/conversations/${props.conversationId}${hide.value ? '?hide=true' : ''}`)
    emit('deleted', { hidden: hide.value })
  } catch (e) {
    error.value = e.message || t('action_failed')
  } finally {
    busy.value = false
  }
}

function close() { if (!busy.value) emit('close') }

function trapFocus(e) {
  if (!overlayRef.value) return
  const f = overlayRef.value.querySelectorAll('button:not([disabled]), input:not([disabled])')
  if (!f.length) return
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
}
</script>
