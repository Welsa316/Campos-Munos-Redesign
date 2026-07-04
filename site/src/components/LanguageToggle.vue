<template>
  <transition name="lang-fade">
    <div v-if="shouldShow" class="fixed bottom-8 left-8 z-[90]">
      <div
        class="h-14 p-1.5 rounded-2xl bg-white shadow-md border border-gray-200 flex items-center gap-1 transition-shadow duration-300 hover:shadow-lg hover:shadow-brand-navy/10">
        <button @click="switchTo('es')" :aria-pressed="currentLang === 'es'" aria-label="Español"
          class="h-full px-3 rounded-[10px] flex items-center gap-1.5 font-ui text-xs font-bold tracking-wider transition-all duration-300"
          :class="currentLang === 'es' ? 'bg-brand-navy text-white' : 'text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5'">
          <FlagIcon country="mx" class="w-5 h-3.5" />
          ES
        </button>
        <button @click="switchTo('en')" :aria-pressed="currentLang === 'en'" aria-label="English"
          class="h-full px-3 rounded-[10px] flex items-center gap-1.5 font-ui text-xs font-bold tracking-wider transition-all duration-300"
          :class="currentLang === 'en' ? 'bg-brand-navy text-white' : 'text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5'">
          <FlagIcon country="us" class="w-5 h-3.5" />
          EN
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useLocaleToggle } from '../composables/useLocaleToggle.js'
import { LANG_TOGGLE_SCROLL_THRESHOLD } from '../data/timing.js'
import FlagIcon from './FlagIcon.vue'

const { currentLang, toggleLang } = useLocaleToggle()
const route = useRoute()

function switchTo(lang) {
  if (currentLang.value !== lang) toggleLang()
}

// Only the home page has a hero-section translate button to compete with;
// elsewhere the toggle should stay pinned in the corner all the time.
const isHomePage = computed(() => route.path === '/home' || route.path === '/')

const scrolled = ref(false)

function updateScrolled() {
  scrolled.value = window.scrollY > LANG_TOGGLE_SCROLL_THRESHOLD
}

const shouldShow = computed(() => !isHomePage.value || scrolled.value)

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
