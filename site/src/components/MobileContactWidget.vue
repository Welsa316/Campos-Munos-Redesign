<template>
  <!-- Direct-dial pill, centered at bottom on mobile -->
  <a href="tel:+15049106508"
    class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[145] flex items-center gap-2.5 pl-1.5 pr-5 py-1.5 rounded-full bg-white shadow-[0_8px_30px_rgba(0,63,141,0.18)] border border-gray-100 active:scale-[0.97] transition-all"
    :aria-label="$t('mobileContact.callLabel')">
    <span class="w-10 h-10 rounded-full overflow-hidden bg-brand-navy/5 flex-shrink-0">
      <img src="/JuanChatBubble.png" alt=""
        class="w-full h-full object-cover" />
    </span>
    <span class="font-ui text-sm font-semibold text-brand-navy tracking-wide whitespace-nowrap flex items-center gap-2">
      <i class="fa-solid fa-phone text-xs text-brand-navy/70"></i>
      {{ $t('mobileContact.cta') }}
    </span>
  </a>
</template>

<script setup>
</script>
