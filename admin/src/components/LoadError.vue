<template>
  <!-- A load that failed, said as a failure (never as "nothing here"), with a way to try again. -->
  <div role="alert" class="p-6 text-center text-sm font-ui">
    <p class="text-gray-700">{{ message || t('load.default') }}</p>
    <button type="button" @click="$emit('retry')" class="mt-2 font-semibold text-brand-navy underline">{{ t('load.retry') }}</button>
  </div>
</template>

<script setup>
import { useT } from '../i18n/translator.js'
import { COMPONENTS } from '../i18n/components.js'

// message: what failed to load; without one, a general line in the portal's language.
defineProps({ message: { type: String, default: '' } })
defineEmits(['retry'])
const { t } = useT(COMPONENTS)
</script>
