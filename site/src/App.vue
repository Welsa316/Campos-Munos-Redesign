<template>
  <div class="min-h-screen flex flex-col relative">
    <template v-if="!isAdminRoute">
      <!-- Scroll progress bar -->
      <div class="fixed top-0 left-0 h-[2px] bg-brand-navy z-[200] transition-all duration-75"
        :style="{ width: scrollProgress + '%' }"></div>
      <SiteHeader />
    </template>

    <main class="flex-1">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <template v-if="!isAdminRoute">
      <SiteFooter />
      <LanguageToggle />
      <InactivityPopup />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import LanguageToggle from './components/LanguageToggle.vue'
import InactivityPopup from './components/InactivityPopup.vue'

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

const scrollProgress = ref(0)

function updateScroll() {
  const h = document.documentElement
  const progress = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100
  scrollProgress.value = Math.min(100, Math.max(0, progress))
}

onMounted(() => window.addEventListener('scroll', updateScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', updateScroll))
</script>
