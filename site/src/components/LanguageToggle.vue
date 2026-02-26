<template>
  <div class="fixed bottom-6 left-6 z-50">
    <button @click="toggleLang"
      class="flex items-center gap-2 px-3 py-2 bg-brand-dark/90 backdrop-blur-md border border-white/20 rounded-full text-sm font-[var(--font-ui)] text-white/80 hover:text-white hover:border-brand-gold transition-all shadow-lg">
      <span class="text-base">{{ currentLang === 'es' ? '🇪🇸' : '🇺🇸' }}</span>
      <span class="font-medium tracking-wider">{{ currentLang.toUpperCase() }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const currentLang = computed(() => locale.value)

function toggleLang() {
  locale.value = locale.value === 'es' ? 'en' : 'es'
}
</script>
