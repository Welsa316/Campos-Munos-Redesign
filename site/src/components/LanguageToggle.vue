<template>
  <div class="fixed bottom-8 left-8 z-[90]">
    <button @click="toggleLang"
      class="group relative w-12 h-12 rounded-2xl bg-white shadow-md border border-gray-200 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-brand-navy/10">
      <!-- Rotating ring -->
      <div class="absolute inset-0 rounded-2xl border border-brand-navy/20 group-hover:border-brand-navy/50 transition-all duration-500 group-hover:rotate-90"></div>
      <span class="font-[var(--font-ui)] text-xs font-bold tracking-wider text-brand-navy">
        {{ currentLang.toUpperCase() }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const currentLang = computed(() => locale.value)
function toggleLang() { locale.value = locale.value === 'es' ? 'en' : 'es' }
</script>
