<template>
  <section class="relative overflow-hidden bg-black text-white">
    <Swiper
      v-if="!prefersReducedMotion"
      :modules="modules"
      :effect="'fade'"
      :speed="fadeDuration"
      :autoplay="{
        delay: slideDuration,
        disableOnInteraction: false
      }"
      :loop="true"
      :allow-touch-move="false"
      :fade-effect="{ crossFade: true }"
      class="h-[420px] sm:h-[500px] lg:h-[560px]"
    >
      <SwiperSlide
        v-for="slide in heroSlides"
        :key="slide.id"
        class="relative h-full w-full"
      >
        <div class="absolute inset-0">
          <img
            :src="slide.image"
            class="h-full w-full object-cover"
            alt=""
          />
          <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/20" />
        </div>
        <Container class="relative z-10 flex h-full flex-col justify-center">
          <div class="max-w-xl space-y-4">
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-brand-red">
              {{ t('home.hero.accent') }}
            </p>
            <h1 class="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              {{ t(slide.headlineKey) }}
            </h1>
            <p
              class="max-w-lg text-sm sm:text-base text-slate-100/90"
              :style="subtextStyle"
            >
              {{ t(slide.subheadlineKey) }}
            </p>
            <div class="flex flex-wrap gap-3 pt-2">
              <Button as="router-link" :to="'/consulta'">
                {{ t('cta.consultation') }}
              </Button>
              <Button as="a" variant="secondary" href="tel:+15049106508">
                {{ t('cta.callNow') }}
              </Button>
            </div>
          </div>
        </Container>
      </SwiperSlide>
    </Swiper>

    <div
      v-else
      class="relative h-[360px] sm:h-[420px] lg:h-[480px]"
    >
      <div class="absolute inset-0">
        <img
          :src="heroSlides[0]?.image"
          class="h-full w-full object-cover"
          alt=""
        />
        <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/20" />
      </div>
      <Container class="relative z-10 flex h-full flex-col justify-center">
        <div class="max-w-xl space-y-4">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-brand-red">
            {{ t('home.hero.accent') }}
          </p>
          <h1 class="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
            {{ t(heroSlides[0]?.headlineKey || 'home.hero.headline') }}
          </h1>
          <p
            class="max-w-lg text-sm sm:text-base text-slate-100/90"
            :style="subtextStyle"
          >
            {{ t(heroSlides[0]?.subheadlineKey || 'home.hero.subheadline') }}
          </p>
          <div class="flex flex-wrap gap-3 pt-2">
            <Button as="router-link" :to="'/consulta'">
              {{ t('cta.consultation') }}
            </Button>
            <Button as="a" variant="secondary" href="tel:+15049106508">
              {{ t('cta.callNow') }}
            </Button>
          </div>
        </div>
      </Container>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { EffectFade, Autoplay, A11y } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';

import Container from '../ui/Container.vue';
import Button from '../ui/Button.vue';
import {
  heroSlides,
  HERO_SLIDE_DURATION_MS,
  HERO_FADE_DURATION_MS,
  HERO_SUBTEXT_FADE_DURATION_MS,
  HERO_SUBTEXT_DELAY_MS
} from '../../content/slideshow';

const { t } = useI18n();

const modules = [EffectFade, Autoplay, A11y];

const slideDuration = HERO_SLIDE_DURATION_MS;
const fadeDuration = HERO_FADE_DURATION_MS;

const subtextStyle = {
  transition: `opacity ${HERO_SUBTEXT_FADE_DURATION_MS}ms ease-soft-ease, transform ${HERO_SUBTEXT_FADE_DURATION_MS}ms ease-soft-ease`,
  transitionDelay: `${HERO_SUBTEXT_DELAY_MS}ms`
};

const prefersReducedMotion = ref(false);

onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = mq.matches;
  const handler = (event) => {
    prefersReducedMotion.value = event.matches;
  };
  mq.addEventListener('change', handler);
});
</script>

