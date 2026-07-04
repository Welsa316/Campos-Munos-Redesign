<template>
  <!-- Shared inline flag so the toggle in LanguageToggle + SiteHeader never drift.
       Inline (not emoji) for cross-platform consistency; size via a class prop. -->
  <svg viewBox="0 0 20 14" class="rounded-sm ring-1 ring-black/10 flex-shrink-0" aria-hidden="true">
    <template v-if="country === 'mx'">
      <rect width="20" height="14" fill="#FFFFFF" />
      <rect width="6.7" height="14" fill="#006847" />
      <rect x="13.3" width="6.7" height="14" fill="#CE1126" />
      <!-- Stylized eagle crest — without it the flag reads as Italy's -->
      <ellipse cx="10" cy="6.6" rx="1.7" ry="1.9" fill="#7A5C22" />
      <path d="M8.2 8.4 Q10 10 11.8 8.4 Q10 9.1 8.2 8.4Z" fill="#4E7C31" />
    </template>
    <template v-else>
      <rect width="20" height="14" fill="#B22234" />
      <path stroke="#FFFFFF" stroke-width="1.08" d="M0 2.15h20M0 4.31h20M0 6.46h20M0 8.62h20M0 10.77h20M0 12.92h20" />
      <rect width="9" height="7.54" fill="#3C3B6E" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  country: { type: String, required: true }, // 'mx' | 'us'
})
</script>
