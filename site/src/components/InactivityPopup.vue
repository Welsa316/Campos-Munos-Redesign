<template>
  <transition name="popup">
    <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center p-4" @click.self="close">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative bg-brand-dark rounded-2xl shadow-2xl border border-white/10 overflow-hidden max-w-lg w-full">
        <!-- Background image -->
        <div class="h-48 bg-cover bg-center relative" style="background-image: url('/PopupPhoto.jpg')">
          <div class="absolute inset-0 bg-gradient-to-b from-transparent to-brand-dark"></div>
          <button @click="close"
            class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white transition-colors"
            :aria-label="$t('backToSite')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="px-8 pb-8 -mt-8 relative text-center">
          <h2 class="font-[var(--font-heading)] text-2xl md:text-3xl text-white mb-2">
            {{ $t('home.popupTitle') }}
          </h2>
          <p class="text-white/70 text-lg mb-6">{{ $t('home.popupSubtitle') }}</p>

          <p class="text-brand-gold text-lg mb-1">{{ $t('home.popupCta') }}</p>
          <a href="tel:+15049106508" class="text-3xl font-bold text-white hover:text-brand-gold transition-colors block mb-6">
            (504) 910-6508
          </a>

          <router-link to="/consulta" @click="close"
            class="inline-block bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3 rounded-lg transition-colors">
            {{ $t('home.popupBtn') }}
          </router-link>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
let timer = null

function resetTimer() {
  clearTimeout(timer)
  if (!visible.value) {
    timer = setTimeout(() => { visible.value = true }, 30000)
  }
}

function close() {
  visible.value = false
  resetTimer()
}

onMounted(() => {
  resetTimer()
  window.addEventListener('mousemove', resetTimer)
  window.addEventListener('keydown', resetTimer)
  window.addEventListener('scroll', resetTimer)
  window.addEventListener('touchstart', resetTimer)
})

onUnmounted(() => {
  clearTimeout(timer)
  window.removeEventListener('mousemove', resetTimer)
  window.removeEventListener('keydown', resetTimer)
  window.removeEventListener('scroll', resetTimer)
  window.removeEventListener('touchstart', resetTimer)
})
</script>

<style scoped>
.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.3s ease;
}
.popup-enter-active .relative,
.popup-leave-active .relative {
  transition: transform 0.3s ease;
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
}
.popup-enter-from .relative {
  transform: scale(0.95) translateY(20px);
}
</style>
