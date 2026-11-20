<template>
  <!-- An inline question in place of window.confirm: shown next to the
       button that asked, focus moves onto it (Cancel) and back afterwards
       (vAlertFocus), Esc cancels. Same look as Team's and Integrations'. -->
  <div role="alertdialog" :aria-labelledby="titleId" :aria-describedby="body ? bodyId : undefined" v-alert-focus
    :class="tone === 'danger' ? 'ring-red-200 bg-red-50' : 'ring-brand-navy/20 bg-brand-surface'"
    class="rounded-lg ring-1 px-3.5 py-3 text-xs font-ui" @keydown.esc.stop="$emit('cancel')">
    <p :id="titleId" class="font-semibold text-gray-900">{{ title }}</p>
    <p v-if="body" :id="bodyId" class="mt-0.5 text-gray-700">{{ body }}</p>
    <div class="mt-2.5 flex flex-wrap gap-2">
      <button type="button" @click="$emit('confirm')" :disabled="busy"
        :class="tone === 'danger' ? 'bg-brand-red hover:bg-brand-red-light' : 'bg-brand-navy hover:bg-brand-navy-dark'"
        class="px-3 py-1.5 rounded-lg text-white font-semibold transition-colors disabled:opacity-50">{{ confirmLabel }}</button>
      <button type="button" data-autofocus @click="$emit('cancel')" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white transition-colors">{{ cancelLabel || t('confirm.cancel') }}</button>
    </div>
  </div>
</template>

<script setup>
import { useId } from 'vue'
import { vAlertFocus } from '../directives/alertFocus.js'
import { useT } from '../i18n/translator.js'
import { COMPONENTS } from '../i18n/components.js'

defineProps({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  confirmLabel: { type: String, required: true },
  // Cancel, in the portal's language, unless the caller names it.
  cancelLabel: { type: String, default: '' },
  // danger: a red action (cancel, unlink, opt out); otherwise navy.
  tone: { type: String, default: 'danger' },
  busy: { type: Boolean, default: false },
})
defineEmits(['confirm', 'cancel'])

const { t } = useT(COMPONENTS)
const uid = useId()
const titleId = `${uid}-q`
const bodyId = `${uid}-d`
</script>
