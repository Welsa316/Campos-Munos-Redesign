<template>
  <!-- Same pill as the production inbox (leadStatuses.js), keyed so a status
       change replays a short settle instead of silently swapping text. -->
  <span
    :key="status"
    :class="[meta.pill, size === 'lg' ? 'text-xs px-3 py-1.5 gap-2' : 'text-[11px] px-2.5 py-1 gap-1.5']"
    class="status-badge inline-flex items-center font-ui font-semibold rounded-full ring-1 whitespace-nowrap"
    :title="meta.hint"
  >
    <span :class="[meta.dot, size === 'lg' ? 'w-2 h-2' : 'w-1.5 h-1.5']" class="rounded-full" aria-hidden="true"></span>
    {{ meta.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { demoStatusMeta } from '../data/model.js'

const props = defineProps({
  status: { type: String, required: true },
  size: { type: String, default: 'sm' },
})

const meta = computed(() => demoStatusMeta(props.status))
</script>

<style scoped>
.status-badge {
  animation: badge-settle 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes badge-settle {
  from { transform: scale(0.88); opacity: 0.4; }
  to { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .status-badge { animation: none; }
}
</style>
