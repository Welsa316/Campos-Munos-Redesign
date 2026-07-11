<template>
  <section class="min-h-[70vh] flex items-center justify-center px-6 py-24 bg-brand-surface">
    <div class="max-w-2xl text-center">
      <p class="font-ui text-sm tracking-[0.25em] text-brand-navy uppercase mb-4">404</p>
      <h1 class="font-heading text-4xl md:text-6xl text-brand-navy mb-6 leading-tight">
        {{ $t('notFound.title') }}
      </h1>
      <p class="text-gray-500 text-lg md:text-xl font-body mb-10 leading-relaxed">
        {{ $t('notFound.body') }}
      </p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <router-link to="/"
          class="inline-flex items-center gap-3 bg-brand-navy text-white font-ui font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
          {{ $t('notFound.homeBtn') }} <i class="fa-solid fa-arrow-right text-sm" aria-hidden="true"></i>
        </router-link>
        <router-link to="/servicios"
          class="inline-flex items-center gap-3 border border-gray-300 text-gray-500 hover:text-brand-navy hover:border-brand-navy/30 font-ui font-medium tracking-wider text-base px-10 py-5 rounded-xl transition-all">
          {{ $t('notFound.servicesBtn') }}
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted } from 'vue'

const { t } = useI18n()

// Tell search engines not to index 404s.
function applyNoindex() {
  const m = document.createElement('meta')
  m.name = 'robots'
  m.content = 'noindex,nofollow'
  m.dataset.dynamic = '404'
  document.head.appendChild(m)
  document.title = `${t('notFound.title')} — Campos Muños Law`
}
function removeNoindex() {
  document.head.querySelectorAll('meta[data-dynamic="404"]').forEach(el => el.remove())
}
onMounted(applyNoindex)
onUnmounted(removeNoindex)
</script>
