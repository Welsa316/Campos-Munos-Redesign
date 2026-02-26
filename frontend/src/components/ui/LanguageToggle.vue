<template>
  <div class="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-1 py-0.5 text-xs font-semibold">
    <button
      type="button"
      class="rounded-full px-2 py-0.5 focus-ring"
      :class="locale === 'es' ? 'bg-brand-red text-white' : 'text-slate-700 hover:text-slate-900'"
      @click="setLocale('es')"
    >
      ES
    </button>
    <button
      type="button"
      class="rounded-full px-2 py-0.5 focus-ring"
      :class="locale === 'en' ? 'bg-brand-red text-white' : 'text-slate-700 hover:text-slate-900'"
      @click="setLocale('en')"
    >
      EN
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { locale } = useI18n();

const setLocale = (next) => {
  if (next !== 'es' && next !== 'en') return;
  locale.value = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('cm_locale', next);
  }
};

computed(() => locale.value);
</script>

