<template>
  <transition name="popup">
    <div v-if="visible" class="fixed inset-0 z-[150] flex items-center justify-center p-4" @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <!-- Modal -->
      <div class="relative w-full max-w-xl overflow-hidden rounded-3xl">
        <!-- Gradient border effect -->
        <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-brand-navy-light/30 via-transparent to-brand-red/30 p-[1px]">
          <div class="w-full h-full rounded-3xl bg-brand-navy"></div>
        </div>

        <div class="relative">
          <!-- Image with subtle bottom fade -->
          <div class="relative h-80 overflow-hidden rounded-t-3xl">
            <img src="/PopupPhoto.jpg" alt="" class="w-full h-full object-cover object-top" />
            <div class="absolute inset-0 bg-gradient-to-t from-brand-navy via-transparent to-transparent"></div>
            <button @click="close"
              class="absolute top-4 right-4 w-10 h-10 rounded-full glass-dark flex items-center justify-center text-white/60 hover:text-white transition-colors">
              <i class="fa-solid fa-xmark text-base"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="px-10 pb-10 -mt-12 relative z-10 text-center">
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
