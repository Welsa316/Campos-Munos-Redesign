<template>
  <div>
    <HeroSlideshow />

    <section
      ref="introRef"
      :class="sectionClassesIntro"
      class="bg-white"
    >
      <Container class="py-12 sm:py-16">
        <div class="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {{ t('home.sections.introTitle') }}
            </h2>
            <p class="mt-4 text-sm leading-relaxed text-slate-700">
              {{ t('home.sections.introBody') }}
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
              <Button as="router-link" :to="'/consulta'">
                {{ t('cta.consultation') }}
              </Button>
              <Button as="a" variant="secondary" href="tel:+15049106508">
                {{ t('cta.callNow') }}
              </Button>
            </div>
          </div>
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <p class="font-semibold text-slate-900">
              {{ t('layout.phoneLabel') }}: {{ t('layout.phoneNumber') }}
            </p>
            <p>{{ t('layout.address') }}</p>
            <p>{{ t('layout.mailing') }}</p>
          </div>
        </div>
      </Container>
    </section>

    <ServicesGrid />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import HeroSlideshow from '../components/sections/HeroSlideshow.vue';
import Container from '../components/ui/Container.vue';
import Button from '../components/ui/Button.vue';
import ServicesGrid from '../components/sections/ServicesGrid.vue';

const { t } = useI18n();

const introRef = ref(null);
const introVisible = ref(false);
let introObserver;

onMounted(() => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    introVisible.value = true;
    return;
  }
  const prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  introObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          introVisible.value = true;
          if (introObserver) introObserver.disconnect();
        }
      });
    },
    { threshold: prefersReduced ? 0 : 0.18 }
  );
  if (introRef.value) {
    introObserver.observe(introRef.value);
  }
});

onBeforeUnmount(() => {
  if (introObserver) introObserver.disconnect();
});

const sectionClassesIntro = computed(() =>
  [
    'reveal-section',
    introVisible.value ? 'reveal-section--visible' : ''
  ].join(' ')
);
</script>

