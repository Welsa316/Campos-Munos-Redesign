<template>
  <!-- Text + call pills, stacked and centered at bottom on mobile.
       Hidden while the nav overlay is open so it can't sit on top of the menu. -->
  <div v-show="!mobileMenuOpen" class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[145] flex flex-col items-center gap-2">
    <a href="sms:+15049106508"
      class="flex items-center gap-2 px-5 py-3 rounded-full bg-white shadow-[0_8px_30px_rgba(0,63,141,0.18)] border border-gray-100 active:scale-[0.97] transition-all">
      <span class="font-ui text-sm font-semibold text-brand-navy tracking-wide whitespace-nowrap flex items-center gap-2">
        <i class="fa-solid fa-comment-dots text-xs text-brand-navy/70"></i>
        {{ $t('mobileContact.textUs') }}
      </span>
    </a>
    <a href="tel:+15049106508"
      class="flex items-center gap-2.5 pl-1.5 pr-5 py-1.5 rounded-full bg-brand-navy shadow-[0_8px_30px_rgba(0,63,141,0.3)] active:scale-[0.97] transition-all"
      :aria-label="$t('mobileContact.callLabel')">
      <span class="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
        <img src="/JuanChatBubble.png" alt=""
          class="w-full h-full object-cover" />
      </span>
      <span class="font-ui text-sm font-semibold text-white tracking-wide whitespace-nowrap flex items-center gap-2">
        <i class="fa-solid fa-phone text-xs text-white/70"></i>
        {{ $t('mobileContact.cta') }}
      </span>
    </a>
  </div>
</template>

<script setup>
import { useMobileMenu } from '../composables/useMobileMenu.js'

const { isOpen: mobileMenuOpen } = useMobileMenu()
</script>
