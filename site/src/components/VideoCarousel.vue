<template>
  <section class="py-16 sm:py-24 bg-brand-surface overflow-hidden">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-8 sm:mb-10 reveal">
        <p class="font-ui text-base tracking-[0.2em] text-brand-navy uppercase mb-3">{{ $t('home.videosEyebrow') }}</p>
        <h2 class="font-heading text-3xl md:text-5xl text-brand-navy leading-tight">{{ $t('home.videosTitle') }}</h2>
        <p class="text-gray-500 text-lg font-ui max-w-2xl mx-auto mt-3">{{ $t('home.videosSubtitle') }}</p>
      </div>

      <!-- Horizontal, snap-scrolling row of clickable video cards. -->
      <div class="flex gap-4 sm:gap-5 overflow-x-auto pb-5 -mx-6 px-6 snap-x snap-mandatory video-carousel">
        <div v-for="(v, i) in videos" :key="v.slug" class="snap-start flex-shrink-0 w-[260px] sm:w-[300px]">
          <div class="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-brand-navy">
            <template v-if="playing !== i">
              <img :src="`${v.thumbnail}?v=2`" :alt="$t(`services.${v.key}`)"
                class="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
              <div class="absolute inset-0 bg-gradient-to-t from-brand-navy/90 via-brand-navy/25 to-transparent"></div>
              <button type="button" @click="playing = i"
                :aria-label="$t('serviceDetail.watchVideo', { service: $t(`services.${v.key}`) })"
                class="absolute inset-0 flex items-center justify-center group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 focus-visible:ring-inset rounded-2xl">
                <span class="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all duration-300 shadow-xl">
                  <i class="fa-solid fa-play text-brand-navy text-xl ml-1" aria-hidden="true"></i>
                </span>
              </button>
              <h3 class="absolute bottom-0 left-0 right-0 p-4 text-white font-heading text-xl leading-tight pointer-events-none">
                {{ $t(`services.${v.key}`) }}
              </h3>
            </template>
            <video v-else :src="v.videoFile" class="absolute inset-0 w-full h-full object-contain bg-black"
              controls autoplay playsinline></video>
          </div>
        </div>
      </div>

      <div class="text-center mt-8 reveal">
        <router-link to="/servicios"
          class="inline-flex items-center gap-2 text-brand-navy font-ui font-bold tracking-wider hover:gap-3 transition-all">
          {{ $t('nav.verTodosServicios') }} <i class="fa-solid fa-arrow-right text-sm" aria-hidden="true"></i>
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { baseServices } from '../data/seoServices.js'

const videos = Object.entries(baseServices)
  .filter(([, s]) => s.video && s.videoFile && s.thumbnail)
  .map(([slug, s]) => ({ slug, key: s.key, videoFile: s.videoFile, thumbnail: s.thumbnail }))

const playing = ref(null)
</script>

<style scoped>
.video-carousel { scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
.video-carousel::-webkit-scrollbar { height: 6px; }
.video-carousel::-webkit-scrollbar-thumb { background: rgba(0, 63, 141, 0.25); border-radius: 9999px; }
</style>
