<template>
  <transition name="lang-fade">
    <div v-if="scrolled" class="fixed bottom-8 left-8 z-[90]">
      <button @click="toggleLang"
        class="group relative h-12 px-3.5 rounded-2xl bg-white shadow-md border border-gray-200 flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-brand-navy/10">
        <div class="absolute inset-0 rounded-2xl border border-brand-navy/20 group-hover:border-brand-navy/50 transition-all duration-500"></div>
        <span class="text-base leading-none" aria-hidden="true">{{ currentLang === 'es' ? '🇲🇽' : '🇺🇸' }}</span>
        <span class="font-ui text-xs font-bold tracking-wider text-brand-navy">
          {{ currentLang.toUpperCase() }}
        </span>
      </button>
    </div>
  </transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const currentLang = computed(() => locale.value)
function toggleLang() { locale.value = locale.value === 'es' ? 'en' : 'es' }

const scrolled = ref(false)
const SCROLL_THRESHOLD = 200

function updateScrolled() {
  scrolled.value = window.scrollY > SCROLL_THRESHOLD
}

onMounted(() => {
  updateScrolled()
  window.addEventListener('scroll', updateScrolled, { passive: true })
})

onUnmounted(() => window.removeEventListener('scroll', updateScrolled))
</script>

<style scoped>
.lang-fade-enter-active,
.lang-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.lang-fade-enter-from,
.lang-fade-leave-to { opacity: 0; transform: translateY(15px); }
</style>
