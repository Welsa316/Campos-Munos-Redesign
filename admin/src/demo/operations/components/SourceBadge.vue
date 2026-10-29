<template>
  <span
    v-if="kind === 'method'"
    :class="methodMeta.tone"
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 text-[10px] font-ui font-semibold uppercase tracking-wider whitespace-nowrap"
  >
    <DemoIcon :icon="methodMeta.icon" class="text-[10px]" />
    {{ methodMeta.label }}
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1 text-[11px] font-ui text-gray-500 whitespace-nowrap"
  >
    <DemoIcon :icon="channelMeta.icon" class="text-[10px] text-gray-500" />
    {{ short ? channelMeta.short : channelMeta.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import DemoIcon from './DemoIcon.vue'
import { LEAD_METHODS, CHANNELS } from '../data/model.js'

// kind="method": how they reached the firm (call, form…) as a chip.
// kind="channel": where they came from (Google Ads, organic…) as quiet text.
const props = defineProps({
  kind: { type: String, default: 'method' },
  value: { type: String, required: true },
  short: { type: Boolean, default: false },
})

const methodMeta = computed(() => LEAD_METHODS[props.value] || LEAD_METHODS.website_form)
const channelMeta = computed(() => CHANNELS[props.value] || CHANNELS.direct)
</script>
