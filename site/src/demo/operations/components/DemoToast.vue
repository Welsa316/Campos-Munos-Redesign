<template>
  <div class="fixed bottom-5 right-5 z-[210] pointer-events-none" role="status" aria-live="polite">
    <transition name="toast">
      <div v-if="toast" :key="toast.id"
        class="pointer-events-auto w-[340px] max-w-[calc(100vw-2.5rem)] bg-brand-navy text-white rounded-xl shadow-xl px-4 py-3 flex items-start gap-3">
        <span class="mt-0.5 w-5 h-5 rounded-full bg-white/15 inline-flex items-center justify-center text-[10px] flex-shrink-0">
          <DemoIcon :icon="faCheck" />
        </span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-ui font-semibold">{{ toast.title }}</p>
          <p class="text-xs font-ui text-white/80 mt-0.5 leading-relaxed">{{ toast.body }}</p>
          <p class="text-[10px] font-ui text-white/75 mt-1 uppercase tracking-wider">Simulated — nothing was sent</p>
        </div>
        <button @click="$emit('dismiss')" aria-label="Dismiss" class="p-1 -m-1 text-white/60 hover:text-white">
          <DemoIcon :icon="faXmark" class="text-xs" />
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import DemoIcon from './DemoIcon.vue'

defineProps({ toast: { type: Object, default: null } })
defineEmits(['dismiss'])
</script>

<style scoped>
.toast-enter-active { transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.toast-leave-active { transition: opacity 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(10px); }
.toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active { transition: none; }
}
</style>
