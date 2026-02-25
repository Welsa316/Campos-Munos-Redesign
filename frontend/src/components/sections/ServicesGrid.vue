<template>
  <section ref="sectionRef" :class="sectionClasses">
    <Container class="py-12 sm:py-16">
      <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div class="max-w-md">
          <h2 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {{ t('services.indexTitle') }}
          </h2>
          <p class="mt-3 text-sm leading-relaxed text-slate-600">
            {{ t('services.indexIntro') }}
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <Button as="router-link" :to="'/consulta'">
              {{ t('cta.consultation') }}
            </Button>
            <Button as="router-link" :to="'/servicios'" variant="secondary">
              {{ t('cta.seeAllServices') }}
            </Button>
          </div>
        </div>
        <div class="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <RouterLink
            v-for="service in orderedServices"
            :key="service.path"
            :to="service.path"
            class="group flex flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-soft-card focus-ring"
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-slate-900">
                {{ t(service.titleKey) }}
              </h3>
              <span
                class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 group-hover:bg-brand-blue group-hover:text-white"
                aria-hidden="true"
              >
                →
              </span>
            </div>
            <p class="mt-2 text-xs leading-relaxed text-slate-600">
              MISSING_SOURCE_CONTENT_SERVICE_SUMMARY
            </p>
          </RouterLink>
        </div>
      </div>
    </Container>
  </section>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import Container from '../ui/Container.vue';
import Button from '../ui/Button.vue';
import { services } from '../../content/services';
import { servicesRoutesInOrder } from '../../content/routes';

const { t } = useI18n();

const orderedServices = computed(() => {
  const byPath = Object.fromEntries(services.map((s) => [s.path, s]));
  return servicesRoutesInOrder.map((path) => byPath[path]).filter(Boolean);
});

const sectionRef = ref(null);
const visible = ref(false);
let observer;

onMounted(() => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    visible.value = true;
    return;
  }
  const prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visible.value = true;
          if (observer) {
            observer.disconnect();
          }
        }
      });
    },
    {
      threshold: prefersReduced ? 0 : 0.18
    }
  );
  if (sectionRef.value) {
    observer.observe(sectionRef.value);
  }
});

onBeforeUnmount(() => {
  if (observer) observer.disconnect();
});

const sectionClasses = computed(() =>
  [
    'reveal-section',
    visible.value ? 'reveal-section--visible' : ''
  ].join(' ')
);
</script>

