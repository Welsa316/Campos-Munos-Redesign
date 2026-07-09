<template>
  <!-- Mobile-only pinned contact controls. Hidden while the nav overlay is open. -->
  <div v-show="!mobileMenuOpen">
    <!-- Call Us — pinned top-center, just below the header. Moved up here because
         at the bottom it collided with the hero's "Consulta" + language buttons. -->
    <a href="tel:+15049106508"
      class="fixed top-[4.75rem] left-1/2 -translate-x-1/2 z-[145] inline-flex items-center gap-3 px-8 py-4 rounded-full bg-brand-navy text-white shadow-[0_10px_30px_rgba(0,63,141,0.4)] active:scale-[0.97] transition-all"
      :aria-label="$t('mobileContact.callLabel')">
      <i class="fa-solid fa-phone text-base" aria-hidden="true"></i>
      <span class="font-ui text-lg font-bold tracking-wide whitespace-nowrap">{{ $t('mobileContact.cta') }}</span>
    </a>

    <!-- Bottom-right: WhatsApp on the Spanish site (Hispanic clients favor it),
         SMS/Text on the English site. Switches with the active locale. -->
    <a :href="isSpanish ? 'https://wa.me/15049106508' : 'sms:+15049106508'"
      :target="isSpanish ? '_blank' : null" :rel="isSpanish ? 'noopener' : null"
      class="fixed bottom-5 right-4 z-[145] w-14 h-14 rounded-full flex items-center justify-center text-white shadow-[0_8px_30px_rgba(0,0,0,0.28)] active:scale-[0.95] transition-all"
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
