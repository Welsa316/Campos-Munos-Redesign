<template>
  <!-- One colour in the custom theme editor: suggested swatches (one Tab
       stop, arrows to move) and the browser's own picker for any colour.
       An optional colour ("More colours") can go back to Automatic. -->
  <div class="flex flex-col gap-2 min-w-0" role="group" :aria-labelledby="`${id}-label`">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p :id="`${id}-label`" class="text-[13px] font-semibold text-gray-900 leading-tight">{{ name }}</p>
        <p v-if="hint" class="text-[11px] text-gray-500 mt-0.5 leading-snug">{{ hint }}</p>
      </div>
      <span class="flex items-center gap-1.5 flex-shrink-0 text-[11px] font-medium text-gray-600 tabular-nums">
        <span class="w-4 h-4 rounded-full ring-1 ring-gray-900/15" :style="{ background: shown }" aria-hidden="true"></span>
        <template v-if="optional && !value">{{ t('auto.on', { hex: autoValue || '' }) }}</template>
        <template v-else>{{ shown }}</template>
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <div role="radiogroup" :aria-label="t('swatches', { name })" class="flex flex-wrap gap-2" @keydown="rovingKeydown">
        <button v-for="(hex, i) in swatches" :key="hex" type="button" role="radio"
          :aria-checked="value === hex" :aria-label="t('swatch', { hex })" :title="hex"
          :tabindex="rovingTabindex(value === hex, i, swatches.includes(value))"
          @click="$emit('pick', hex)" :style="{ background: hex }"
          :class="value === hex ? 'ring-2 ring-offset-2 ring-brand-navy' : 'ring-1 ring-gray-900/15 hover:ring-gray-900/40'"
          class="swatch w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 rounded-full ring-offset-white transition-shadow"></button>
        <!-- Any colour: the native picker, drawn as a swatch with a palette,
             in the same row (not a radio, so the arrows skip it). -->
        <label :title="t('any')" :class="custom ? 'ring-2 ring-offset-2 ring-brand-navy' : 'ring-1 ring-gray-900/15 hover:ring-gray-900/40'"
          class="any-colour relative w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 rounded-full flex items-center justify-center cursor-pointer focus-within:outline-2 focus-within:outline-offset-2"
          :style="custom ? { background: value } : null">
          <input type="color" :value="(value || autoValue || '#000000').toLowerCase()" :aria-label="t('any_for', { name })"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" @input="$emit('pick', $event.target.value)" />
          <span class="w-5 h-5 rounded-full flex items-center justify-center pointer-events-none" :style="custom ? { color: iconOn } : { background: 'rgb(0 0 0 / 0.55)', color: '#fff' }">
            <FaIcon name="palette" class="text-[11px]" />
          </span>
        </label>
      </div>
      <button v-if="optional && value" type="button" @click="$emit('auto')"
        class="h-8 pointer-coarse:h-11 px-3 rounded-full text-[12px] font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">{{ t('auto.use') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { contrast } from '../data/themes.js'
import { rovingKeydown, rovingTabindex } from '../utils/roving.js'
import FaIcon from './FaIcon.vue'

const props = defineProps({
  id: { type: String, required: true },
  name: { type: String, required: true },
  hint: { type: String, default: '' },
  value: { type: String, default: null }, // #RRGGBB, or null = Automatic
  autoValue: { type: String, default: null }, // set for optional colours
  swatches: { type: Array, required: true },
  t: { type: Function, required: true },
})
defineEmits(['pick', 'auto'])

const optional = computed(() => props.autoValue !== null)
const shown = computed(() => props.value || props.autoValue || '')
// A colour chosen with the picker (not one of the suggestions).
const custom = computed(() => Boolean(props.value) && !props.swatches.includes(props.value))
const iconOn = computed(() => (props.value && contrast(props.value, '#FFFFFF') >= contrast(props.value, '#000000') ? '#FFFFFF' : '#000000'))
</script>

<style>
.any-colour { background: conic-gradient(from 90deg, #E53935, #FDD835, #43A047, #1E88E5, #8E24AA, #E53935); }
.any-colour:focus-within { outline-color: var(--focus-ring); outline-style: solid; }
</style>
