<template>
  <!-- Pinned pill at bottom-right of mobile viewport -->
  <transition name="pill">
    <button v-if="!isOpen" @click="open" type="button"
      class="fixed bottom-5 right-4 z-[145] flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white shadow-[0_8px_30px_rgba(0,63,141,0.18)] border border-gray-100 hover:shadow-[0_10px_35px_rgba(0,63,141,0.25)] active:scale-[0.98] transition-all"
      :aria-label="$t('mobileContact.openLabel')">
      <span class="relative w-10 h-10 rounded-full overflow-hidden bg-brand-navy/5 flex-shrink-0">
        <img src="/JuanHeadshot.jpg" alt=""
          class="w-full h-full object-cover object-top scale-[1.35] origin-top" />
        <span class="absolute -bottom-0 -right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white"></span>
      </span>
      <span class="font-ui text-sm font-semibold text-brand-navy tracking-wide whitespace-nowrap">
        {{ $t('mobileContact.cta') }}
      </span>
    </button>
  </transition>

  <!-- Expanded card at bottom-right (compact, doesn't cover screen) -->
  <transition name="card">
    <div v-if="isOpen"
      class="fixed bottom-4 right-4 z-[150] w-[calc(100vw-2rem)] max-w-[320px] bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,63,141,0.35)] border border-gray-100 overflow-hidden">
      <!-- Close button -->
      <button @click="close" type="button"
        class="absolute top-3 right-3 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors z-10"
        :aria-label="$t('mobileContact.closeLabel')">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>

      <!-- Decorative gold strip -->
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-navy via-brand-navy-light to-brand-navy"></div>

      <div class="px-5 pt-6 pb-5">
        <!-- Avatar + heading row -->
        <div class="flex items-center gap-3 mb-4">
          <div class="relative w-14 h-14 rounded-full overflow-hidden bg-brand-navy/5 flex-shrink-0 border-2 border-white shadow-md">
            <img src="/JuanHeadshot.jpg" alt="Juan Campos"
              class="w-full h-full object-cover object-top scale-[1.35] origin-top" />
            <span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white"></span>
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="font-heading text-lg text-brand-navy leading-tight">
              {{ $t('mobileContact.heading') }}
            </h3>
            <p class="text-gray-500 text-xs font-ui mt-0.5">
              {{ $t('mobileContact.subheading') }}
            </p>
          </div>
        </div>

        <!-- Phone CTA -->
        <a href="tel:+15049106508"
          class="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl bg-brand-navy hover:bg-brand-navy-dark text-white font-ui font-bold tracking-wide text-base shadow-md active:scale-[0.98] transition-all">
          <i class="fa-solid fa-phone text-sm"></i>
          (504) 910-6508
        </a>

        <p class="text-center text-[11px] text-gray-400 font-ui mt-3 tracking-wide">
          {{ $t('mobileContact.hoursHint') }}
        </p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue'

const isOpen = ref(false)

function open() { isOpen.value = true }
function close() { isOpen.value = false }
</script>

<style scoped>
.pill-enter-active,
.pill-leave-active { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.pill-enter-from,
.pill-leave-to { opacity: 0; transform: translateY(20px); }

.card-enter-active { transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.card-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.card-enter-from { opacity: 0; transform: translateY(15px) scale(0.95); transform-origin: bottom right; }
.card-leave-to { opacity: 0; transform: translateY(10px) scale(0.97); transform-origin: bottom right; }
</style>
