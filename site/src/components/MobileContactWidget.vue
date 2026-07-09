<template>
  <!-- Mobile-only contact bar pinned to the bottom edge (Morgan & Morgan-style:
       a clean, always-present CTA). Hidden while the nav overlay is open. -->
  <div v-show="!mobileMenuOpen" class="fixed bottom-4 left-4 right-4 z-[145] flex items-center gap-2.5">
    <!-- Call Us — primary, keeps Juan's face. Gradient + inset highlight + layered
         shadow give it real depth (was a flat, cartoony fill). -->
    <a href="tel:+15049106508"
      class="group relative flex-1 min-w-0 flex items-center justify-center pl-14 pr-5 py-3.5 rounded-full text-white
        bg-gradient-to-b from-brand-navy-light to-brand-navy-dark ring-1 ring-white/10
        shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-3px_9px_rgba(0,0,0,0.3),0_10px_26px_rgba(0,45,102,0.5),0_3px_8px_rgba(0,0,0,0.22)]
        active:scale-[0.98] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)] transition-all"
      :aria-label="$t('mobileContact.callLabel')">
      <!-- Juan's face overlapping the left edge (Morgan & Morgan style) -->
      <span class="absolute -left-1 top-1/2 -translate-y-1/2 w-[3.4rem] h-[3.4rem] rounded-full overflow-hidden ring-[3px] ring-white shadow-md bg-white">
        <img src="/JuanChatBubble.png" alt="" class="w-full h-full object-cover" />
      </span>
      <span class="font-ui text-lg font-bold tracking-wide whitespace-nowrap flex items-center gap-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
        <i class="fa-solid fa-phone text-base" aria-hidden="true"></i>{{ $t('mobileContact.cta') }}
      </span>
    </a>

    <!-- WhatsApp on the Spanish site (Hispanic clients favor it), SMS/Text on the
         English site. Switches with the active locale. The pulsing rings draw the
         eye; the icon is bigger and centered. -->
    <a :href="isSpanish ? 'https://wa.me/15049106508' : 'sms:+15049106508'"
      :target="isSpanish ? '_blank' : null" :rel="isSpanish ? 'noopener' : null"
      class="relative w-14 h-14 rounded-full flex items-center justify-center text-white flex-shrink-0
        shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_26px_rgba(0,0,0,0.32)]
        active:scale-95 transition-all"
      :class="isSpanish ? 'bg-[#25D366]' : 'bg-brand-navy'"
      :aria-label="isSpanish ? $t('mobileContact.whatsappLabel') : $t('mobileContact.textUs')">
      <!-- Pulsating halo rings (compositor-only transform/opacity; removed for
           reduced-motion). pointer-events-none so the expanded ring never eats taps. -->
      <span aria-hidden="true" class="contact-pulse pointer-events-none absolute inset-0 rounded-full"
        :class="isSpanish ? 'bg-[#25D366]' : 'bg-brand-navy'"></span>
      <span aria-hidden="true" class="contact-pulse contact-pulse--delay pointer-events-none absolute inset-0 rounded-full"
        :class="isSpanish ? 'bg-[#25D366]' : 'bg-brand-navy'"></span>
      <!-- Keyed wrapper: FontAwesome's dom.watch() replaces the <i> it converts with
           an <svg>, so a plain :class swap on locale change leaves a stale icon
           (whatsapp logo stuck in the blue bubble). Re-keying forces a fresh node. -->
      <span :key="isSpanish ? 'wa' : 'sms'" class="relative z-10 flex items-center justify-center">
        <i :class="isSpanish ? 'fa-brands fa-whatsapp' : 'fa-solid fa-comment-dots'" class="text-[1.75rem] leading-none"></i>
      </span>
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

<style scoped>
/* Radar-style pulse behind the WhatsApp/Text FAB. Transform + opacity only so it
   stays on the compositor; two staggered rings read as a steady heartbeat. */
@keyframes contact-pulse {
  0%   { transform: scale(1);   opacity: 0.5; }
  70%  { opacity: 0; }
  100% { transform: scale(2.1); opacity: 0; }
}
.contact-pulse {
  animation: contact-pulse 2.1s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.contact-pulse--delay {
  animation-delay: 1.05s;
}
@media (prefers-reduced-motion: reduce) {
  .contact-pulse { display: none; }
}
</style>
