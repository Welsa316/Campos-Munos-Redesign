<template>
  <div class="min-h-screen flex flex-col relative">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[300] focus:bg-brand-navy focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-ui focus:text-sm">
      {{ $t('a11y.skipToContent') }}
    </a>
    <!-- Scroll progress bar — kept BELOW header z-index so modals can fully cover it -->
    <div class="fixed top-0 left-0 w-full h-[2px] bg-brand-navy z-[5] origin-left transition-transform duration-75"
      :style="{ transform: `scaleX(${scrollProgress / 100})` }"
      aria-hidden="true"></div>
    <SiteHeader />

    <main id="main" class="flex-1 pb-24 sm:pb-0">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <SiteFooter />
    <!-- Corner toggle is desktop/tablet only; on phones it would sit under the
         centered call pill, and the mobile menu already has a language switch. -->
    <div class="hidden sm:contents">
      <LanguageToggle />
      <ChatWidget />
    </div>
    <InactivityPopup />
    <div class="sm:hidden">
      <MobileContactWidget />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import LanguageToggle from './components/LanguageToggle.vue'
import InactivityPopup from './components/InactivityPopup.vue'
import ChatWidget from './components/ChatWidget.vue'
import MobileContactWidget from './components/MobileContactWidget.vue'

const { locale } = useI18n()

const scrollProgress = ref(0)

function updateScroll() {
  const h = document.documentElement
  const progress = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100
  scrollProgress.value = Math.min(100, Math.max(0, progress))
}

// Coalesce scroll events through rAF so the forced-reflow reads (scrollHeight /
// clientHeight) happen at most once per frame instead of on every scroll event.
let ticking = false
function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => { updateScroll(); ticking = false })
}

// Keep <html lang> in sync with the active locale so screen readers + Google
// announce/index the right language whenever the user toggles ES <-> EN.
watch(locale, (v) => {
  document.documentElement.lang = v
}, { immediate: true })

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>
