<template>
  <div class="bg-white">
    <Container class="py-10 sm:py-14">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {{ t('consulta.title') }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-slate-700">
          {{ t('consulta.intro') }}
        </p>
      </header>

      <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section class="space-y-4">
          <p class="text-sm leading-relaxed text-slate-700">
            MISSING_SOURCE_CONTENT_CONSULTA_FORM
          </p>
        </section>
        <aside class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <p class="font-semibold text-slate-900">
            {{ t('layout.phoneLabel') }}: {{ t('layout.phoneNumber') }}
          </p>
          <p>{{ t('layout.address') }}</p>
          <p>{{ t('layout.mailing') }}</p>
        </aside>
      </div>
    </Container>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import Container from '../components/ui/Container.vue';

const { t } = useI18n();
</script>

