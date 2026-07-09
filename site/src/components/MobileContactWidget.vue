<template>
  <!-- Mobile-only contact bar pinned to the bottom edge (Morgan & Morgan-style:
       a clean, always-present CTA). Hidden while the nav overlay is open. -->
  <div v-show="!mobileMenuOpen" class="fixed bottom-4 left-4 right-4 z-[145] flex items-center gap-2.5">
    <!-- Call Us — primary, keeps Juan's face -->
    <a href="tel:+15049106508"
      class="flex-1 min-w-0 flex items-center justify-center gap-3 pl-2 pr-5 py-2.5 rounded-full bg-brand-navy text-white shadow-[0_12px_34px_rgba(0,63,141,0.45)] active:scale-[0.98] transition-all"
      :aria-label="$t('mobileContact.callLabel')">
      <span class="w-11 h-11 rounded-full overflow-hidden bg-white/15 ring-2 ring-white/40 flex-shrink-0">
        <img src="/JuanChatBubble.png" alt="" class="w-full h-full object-cover" />
      </span>
      <span class="font-ui text-lg font-bold tracking-wide whitespace-nowrap flex items-center gap-2">
        <i class="fa-solid fa-phone text-base" aria-hidden="true"></i>{{ $t('mobileContact.cta') }}
      </span>
    </a>

    <!-- WhatsApp on the Spanish site (Hispanic clients favor it), SMS/Text on the
         English site. Switches with the active locale. -->
    <a :href="isSpanish ? 'https://wa.me/15049106508' : 'sms:+15049106508'"
      :target="isSpanish ? '_blank' : null" :rel="isSpanish ? 'noopener' : null"
      class="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-[0_12px_34px_rgba(0,0,0,0.3)] active:scale-[0.95] transition-all flex-shrink-0"
      :class="isSpanish ? 'bg-[#25D366]' : 'bg-brand-navy'"
      :aria-label="isSpanish ? $t('mobileContact.whatsappLabel') : $t('mobileContact.textUs')">
      <i :class="isSpanish ? 'fa-brands fa-whatsapp' : 'fa-solid fa-comment-dots'" class="text-2xl"></i>
    </a>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMobileMenu } from '../composables/useMobileMenu.js'

const { locale } = useI18n()
const isSpanish = computed(() => locale.value === 'es')
const { isOpen: mobileMenuOpen } = useMobileMenu()
</script>
