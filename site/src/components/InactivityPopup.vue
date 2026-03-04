<template>
  <transition name="popup">
    <div v-if="visible" class="fixed inset-0 z-[150] flex items-center justify-center p-4 overflow-y-auto" @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close"></div>

      <!-- Modal -->
      <div class="relative w-full max-w-2xl rounded-3xl my-auto">
        <!-- Close button — outside overflow-hidden so it never gets clipped -->
        <button @click="close" type="button"
          class="absolute top-3 right-3 sm:top-4 sm:right-4 w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all active:scale-95 touch-manipulation z-20">
          <i class="fa-solid fa-xmark text-lg sm:text-base"></i>
        </button>
        <div class="relative overflow-hidden rounded-3xl">
          <!-- Image section -->
          <div class="relative">
            <img src="/PopupPhoto.jpg" alt="" class="w-full h-[220px] sm:h-[420px] object-cover object-top" />
          </div>

          <!-- Content - solid blue, completely separate from image -->
          <div class="px-6 py-8 sm:px-10 sm:py-10 bg-brand-navy text-center rounded-b-3xl">
            <h2 class="font-[var(--font-heading)] text-2xl sm:text-4xl text-white mb-3 sm:mb-4 leading-tight">
              {{ $t('home.popupTitle') }}
            </h2>
            <p class="text-white/80 text-base sm:text-xl font-[var(--font-ui)] mb-6 sm:mb-8">{{ $t('home.popupSubtitle') }}</p>

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
