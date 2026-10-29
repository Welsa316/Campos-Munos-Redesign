<template>
  <!-- Renders the SVG itself. Use this instead of <i class="fa-…"> whenever
       the icon is conditional (v-if) or changes (:class): FontAwesome's DOM
       watcher replaces <i> elements behind Vue's back, so toggling one throws
       "reading 'insertBefore'" and freezes the component's updates. -->
  <span class="inline-flex" aria-hidden="true" v-html="svg"></span>
</template>

<script setup>
import { computed } from 'vue'
import { icon, findIconDefinition } from '@fortawesome/fontawesome-svg-core'

const props = defineProps({
  name: { type: String, required: true },
  spin: { type: Boolean, default: false },
})

const svg = computed(() => {
  const def = findIconDefinition({ prefix: 'fas', iconName: props.name })
  if (!def) return ''
  return icon(def, { classes: props.spin ? ['fa-spin'] : [] }).html.join('')
})
</script>
