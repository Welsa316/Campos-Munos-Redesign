<template>
  <transition name="popup">
    <div v-if="visible" class="fixed inset-0 z-[150] flex items-center justify-center p-4" @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/70 backdrop-blur-lg"></div>

      <!-- Modal - bigger -->
      <div class="relative w-full max-w-xl overflow-hidden rounded-3xl">
        <!-- Gradient border effect -->
        <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-brand-navy/30 via-transparent to-brand-red/30 p-[1px]">
          <div class="w-full h-full rounded-3xl bg-brand-dark"></div>
        </div>

        <div class="relative">
          <!-- Image with overlay - taller -->
          <div class="relative h-80 overflow-hidden rounded-t-3xl">
            <img src="/PopupPhoto.jpg" alt="" class="w-full h-full object-cover object-top kenburns" />
            <div class="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/40 to-transparent"></div>
            <button @click="close"
              class="absolute top-4 right-4 w-8 h-8 rounded-full glass flex items-center justify-center text-white/60 hover:text-white transition-colors">
              <i class="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>

          <!-- Content -->
          <div class="px-10 pb-10 -mt-12 relative z-10 text-center">
            <h2 class="font-[var(--font-heading)] text-3xl text-white mb-3 leading-tight">
              {{ $t('home.popupTitle') }}
            </h2>
            <p class="text-white/50 text-base font-[var(--font-ui)] mb-8">{{ $t('home.popupSubtitle') }}</p>

            <div class="space-y-4">
              <a href="tel:+15049106508"
                class="flex items-center justify-center gap-3 w-full py-4 rounded-xl bg-brand-red text-white font-[var(--font-ui)] font-bold text-lg tracking-wider transition-all btn-magnetic">
                <i class="fa-solid fa-phone text-sm"></i>
                (504) 910-6508
              </a>
              <router-link to="/consulta" @click="close"
                class="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-brand-navy/30 font-[var(--font-ui)] text-sm tracking-wider transition-all">
                <i class="fa-solid fa-message text-xs"></i>
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

function resetTimer() {
  clearTimeout(timer)
  if (!visible.value) {
    timer = setTimeout(() => { visible.value = true }, 30000)
  }
}
function close() { visible.value = false; resetTimer() }

onMounted(() => {
  resetTimer()
  const events = ['mousemove', 'keydown', 'scroll', 'touchstart']
  events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
})
onUnmounted(() => {
  clearTimeout(timer)
  const events = ['mousemove', 'keydown', 'scroll', 'touchstart']
  events.forEach(e => window.removeEventListener(e, resetTimer))
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
