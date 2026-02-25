<template>
  <div class="bg-white">
    <Container class="py-10 sm:py-14">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {{ t('services.indexTitle') }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-slate-700">
          {{ t('services.indexIntro') }}
        </p>
      </header>

      <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="service in orderedServices"
          :key="service.path"
          :to="service.path"
          class="group flex flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-brand-blue hover:bg-white hover:shadow-soft-card focus-ring"
        >
          <h2 class="text-sm font-semibold text-slate-900">
            {{ t(service.titleKey) }}
          </h2>
          <p class="mt-2 text-xs leading-relaxed text-slate-600">
            MISSING_SOURCE_CONTENT_SERVICE_SUMMARY
          </p>
          <span class="mt-3 inline-flex items-center text-xs font-semibold text-brand-blue">
            Ver más
            <span class="ml-1" aria-hidden="true">→</span>
          </span>
        </RouterLink>
      </div>
    </Container>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import Container from '../components/ui/Container.vue';
import { services } from '../content/services';
import { servicesRoutesInOrder } from '../content/routes';

const { t } = useI18n();

const orderedServices = computed(() => {
  const byPath = Object.fromEntries(services.map((s) => [s.path, s]));
  return servicesRoutesInOrder.map((p) => byPath[p]).filter(Boolean);
});
</script>

