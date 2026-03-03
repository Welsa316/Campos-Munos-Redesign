<template>
  <transition name="popup">
    <div v-if="visible" class="fixed inset-0 z-[150] flex items-center justify-center p-4" @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <!-- Modal -->
      <div class="relative w-full max-w-2xl overflow-hidden rounded-3xl">
        <div class="relative">
          <!-- Image section - no gradient, clean separation -->
          <div class="relative overflow-hidden rounded-t-3xl">
            <img src="/PopupPhoto.jpg" alt="" class="w-full h-[420px] object-cover object-top" />
            <button @click="close"
              class="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all">
              <i class="fa-solid fa-xmark text-base"></i>
            </button>
          </div>

          <!-- Content - solid blue, completely separate from image -->
          <div class="px-10 py-10 bg-brand-navy text-center rounded-b-3xl">
            <h2 class="font-[var(--font-heading)] text-4xl text-white mb-4 leading-tight">
              {{ $t('home.popupTitle') }}
            </h2>
            <p class="text-white/80 text-xl font-[var(--font-ui)] mb-8">{{ $t('home.popupSubtitle') }}</p>

            <div class="space-y-4">
              <a href="tel:+15049106508"
                class="flex items-center justify-center gap-3 w-full py-5 rounded-xl bg-brand-red text-white font-[var(--font-ui)] font-bold text-xl tracking-wider transition-all btn-magnetic">
                <i class="fa-solid fa-phone text-base"></i>
                (504) 910-6508
              </a>
              <router-link to="/consulta" @click="close"
                class="flex items-center justify-center gap-3 w-full py-5 rounded-xl border border-white/20 text-white/80 hover:bg-white hover:text-brand-navy hover:border-white font-[var(--font-ui)] font-bold text-lg tracking-wider transition-all">
                <i class="fa-solid fa-message text-sm"></i>
                {{ $t('home.popupBtn') }}
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
let timer = null
let hasTriggered = false
const events = ['mousemove', 'keydown', 'scroll', 'touchstart']

function stopListening() {
  clearTimeout(timer)
  events.forEach(e => window.removeEventListener(e, resetTimer))
}

function resetTimer() {
  clearTimeout(timer)
  if (hasTriggered) return
  timer = setTimeout(() => {
    visible.value = true
    hasTriggered = true
    stopListening()
  }, 10000)
}

function close() {
  visible.value = false
}

onMounted(() => {
  resetTimer()
  events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
})
onUnmounted(() => {
  stopListening()
})
</script>

<style scoped>
.popup-enter-active { transition: opacity 0.4s ease; }
.popup-enter-active .relative { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease; }
.popup-leave-active { transition: opacity 0.2s ease; }
.popup-leave-active .relative { transition: transform 0.2s ease; }
.popup-enter-from { opacity: 0; }
.popup-enter-from .relative { transform: translateY(30px) scale(0.95); opacity: 0; }
.popup-leave-to { opacity: 0; }
.popup-leave-to .relative { transform: scale(0.95); }
</style>
