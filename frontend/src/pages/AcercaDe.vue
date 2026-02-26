<template>
  <div class="bg-white">
    <Container class="py-10 sm:py-14">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {{ t('about.title') }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-slate-700">
          {{ t('about.intro') }}
        </p>
      </header>

      <section class="mt-8 space-y-4 text-sm leading-relaxed text-slate-700">
        <p>
          MISSING_SOURCE_CONTENT_ACERCA_BODY
        </p>
      </section>
    </Container>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import Container from '../components/ui/Container.vue';

const { t } = useI18n();
</script>

