<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    class="inline-block h-[1em] w-auto flex-shrink-0 overflow-visible"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  ><path :d="path" /></svg>
</template>

<script setup>
// Renders a FontAwesome definition straight to SVG. The site's global
// dom.watch() swaps <i class="fa-..."> for an <svg> behind Vue's back, so an
// icon bound to reactive state never updates. Rendering the path here keeps
// icons reactive and leaves the global icon library untouched.
import { computed } from 'vue'

const props = defineProps({
  icon: { type: Object, required: true },
})

const width = computed(() => props.icon.icon[0])
const height = computed(() => props.icon.icon[1])
const path = computed(() => {
  const d = props.icon.icon[4]
  return Array.isArray(d) ? d.join(' ') : d
})
</script>
