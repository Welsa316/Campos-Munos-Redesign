<template>
  <transition name="lang-fade">
    <div v-if="shouldShow" class="fixed bottom-8 left-8 z-[90]">
      <div
        class="h-12 p-1.5 rounded-2xl bg-white shadow-md border border-gray-200 flex items-center gap-1 transition-shadow duration-300 hover:shadow-lg hover:shadow-brand-navy/10">
        <button @click="switchTo('es')" :aria-pressed="currentLang === 'es'" aria-label="Español"
          class="h-full px-2.5 rounded-[10px] flex items-center gap-1.5 font-ui text-xs font-bold tracking-wider transition-all duration-300"
          :class="currentLang === 'es' ? 'bg-brand-navy text-white' : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'">
          <svg viewBox="0 0 20 14" class="w-5 h-3.5 rounded-sm ring-1 ring-black/10 flex-shrink-0" aria-hidden="true">
            <rect width="20" height="14" fill="#FFFFFF" />
            <rect width="6.7" height="14" fill="#006847" />
            <rect x="13.3" width="6.7" height="14" fill="#CE1126" />
            <!-- Stylized eagle crest — without it the flag reads as Italy's -->
            <ellipse cx="10" cy="6.6" rx="1.7" ry="1.9" fill="#7A5C22" />
            <path d="M8.2 8.4 Q10 10 11.8 8.4 Q10 9.1 8.2 8.4Z" fill="#4E7C31" />
          </svg>
          ES
        </button>
        <button @click="switchTo('en')" :aria-pressed="currentLang === 'en'" aria-label="English"
          class="h-full px-2.5 rounded-[10px] flex items-center gap-1.5 font-ui text-xs font-bold tracking-wider transition-all duration-300"
          :class="currentLang === 'en' ? 'bg-brand-navy text-white' : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'">
          <svg viewBox="0 0 20 14" class="w-5 h-3.5 rounded-sm ring-1 ring-black/10 flex-shrink-0" aria-hidden="true">
            <rect width="20" height="14" fill="#B22234" />
            <path stroke="#FFFFFF" stroke-width="1.08" d="M0 2.15h20M0 4.31h20M0 6.46h20M0 8.62h20M0 10.77h20M0 12.92h20" />
            <rect width="9" height="7.54" fill="#3C3B6E" />
          </svg>
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
