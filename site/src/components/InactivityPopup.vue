<template>
  <transition name="popup">
    <div v-if="visible" ref="dialogEl"
      class="fixed inset-0 z-[150] flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-popup-title"
      @click.self="close">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" @click="close"></div>

      <!-- Modal -->
      <div class="relative w-full max-w-2xl rounded-3xl my-auto">
        <!-- Close button — outside overflow-hidden so it never gets clipped -->
        <button ref="closeBtn" @click="close" type="button"
          :aria-label="$t('a11y.close')"
          class="absolute top-3 right-3 sm:top-4 sm:right-4 w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all active:scale-95 touch-manipulation z-20">
          <i class="fa-solid fa-xmark text-lg sm:text-base" aria-hidden="true"></i>
        </button>
        <div class="relative overflow-hidden rounded-3xl">
          <!-- Image section -->
          <div class="relative">
            <img src="/PopupPhoto.jpg" alt="" loading="lazy" decoding="async" class="w-full aspect-[4/3] h-auto object-cover" />
          </div>

          <!-- Content - solid blue, completely separate from image -->
          <div class="px-6 py-8 sm:px-10 sm:py-10 bg-brand-navy text-center rounded-b-3xl">
            <h2 id="inactivity-popup-title" class="font-heading text-2xl sm:text-4xl text-white mb-3 sm:mb-4 leading-tight">
              {{ $t('home.popupTitle') }}
            </h2>
            <p class="text-white/80 text-base sm:text-xl font-ui mb-6 sm:mb-8">{{ $t('home.popupSubtitle') }}</p>

            <div class="space-y-4">
              <a href="tel:+15049106508"
                class="flex items-center justify-center gap-3 w-full py-5 rounded-xl bg-brand-red text-white font-ui font-bold text-xl tracking-wider transition-all btn-magnetic">
                <i class="fa-solid fa-phone text-base"></i>
                (504) 910-6508
              </a>
              <router-link to="/consulta" @click="close"
                class="flex items-center justify-center gap-3 w-full py-5 rounded-xl border border-white/20 text-white/80 hover:bg-white hover:text-brand-navy hover:border-white font-ui font-bold text-lg tracking-wider transition-all">
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
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'

import { POPUP_ONLOAD_DELAY_MS, POPUP_DISMISS_TTL_MS } from '../data/timing.js'

const visible = ref(false)
const dialogEl = ref(null)
const closeBtn = ref(null)
let timer = null
let lastFocused = null
// Legacy key name kept as-is so visitors' existing 24h dismissals survive.
const DISMISS_KEY = 'cm_inactivity_dismissed_at'

function isRecentlyDismissed() {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
    return ts && Date.now() - ts < POPUP_DISMISS_TTL_MS
  } catch { return false }
}

function close() {
  visible.value = false
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
}

// Modal focus handling: move focus into the dialog on open, trap Tab within
// it, close on Escape, and restore focus to the trigger element on close.
function onKeydown(e) {
  if (!visible.value) return
  if (e.key === 'Escape') { close(); return }
  if (e.key !== 'Tab' || !dialogEl.value) return
  const focusables = dialogEl.value.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

watch(visible, (v) => {
  if (v) {
    lastFocused = document.activeElement
    nextTick(() => closeBtn.value?.focus())
  } else if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus()
    lastFocused = null
  }
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  if (isRecentlyDismissed()) return
  timer = setTimeout(() => {
    visible.value = true
  }, POPUP_ONLOAD_DELAY_MS)
})
onUnmounted(() => {
  clearTimeout(timer)
  document.removeEventListener('keydown', onKeydown)
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
