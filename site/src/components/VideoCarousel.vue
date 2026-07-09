<template>
  <section class="py-14 sm:py-24 bg-brand-surface overflow-hidden">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-8 sm:mb-10 reveal">
        <p class="font-ui text-base tracking-[0.2em] text-brand-navy uppercase mb-3">{{ $t('home.videosEyebrow') }}</p>
        <h2 class="font-heading text-3xl md:text-5xl text-brand-navy leading-tight">{{ $t('home.videosTitle') }}</h2>
        <p class="text-gray-500 text-lg font-ui max-w-2xl mx-auto mt-3">{{ $t('home.videosSubtitle') }}</p>
      </div>
    </div>

    <!-- One big video at a time; swipe/scroll horizontally for the next (like a
         short-form feed, laid out sideways). The track is full-bleed so the
         neighbouring cards peek in and hint that it scrolls. -->
    <div class="video-reel flex items-stretch gap-4 sm:gap-6 overflow-x-auto pb-6 snap-x snap-mandatory reveal">
      <article v-for="(v, i) in videos" :key="v.slug"
        class="video-card relative snap-center flex-shrink-0 rounded-3xl overflow-hidden shadow-2xl bg-brand-navy">
        <div class="aspect-video relative">
          <template v-if="playing !== i">
            <img :src="`${v.thumbnail}?v=2`" :alt="$t(`services.${v.key}`)"
              class="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
            <div class="absolute inset-0 bg-gradient-to-t from-brand-navy/95 via-brand-navy/20 to-brand-navy/10"></div>

            <!-- YouTube badge, rides in the corner of each card as they scroll.
                 Links to the firm's channel; kept off the central play target. -->
            <a :href="YOUTUBE_CHANNEL" target="_blank" rel="noopener" @click.stop
              class="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-xs font-ui font-semibold tracking-wide hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              :aria-label="$t('home.watchOnYoutube')">
              <i class="fa-brands fa-youtube text-[#FF3D3D] text-base" aria-hidden="true"></i>
              <span>YouTube</span>
            </a>

            <button type="button" @click="playing = i"
              :aria-label="$t('serviceDetail.watchVideo', { service: $t(`services.${v.key}`) })"
              class="absolute inset-0 flex items-center justify-center group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 focus-visible:ring-inset rounded-3xl">
              <span class="relative w-20 h-20 sm:w-[5.5rem] sm:h-[5.5rem]">
                <span class="absolute inset-0 rounded-full border-2 border-white/70 reel-pulse-ring" aria-hidden="true"></span>
                <span class="relative w-full h-full rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all duration-300 shadow-2xl">
                  <i class="fa-solid fa-play text-brand-navy text-2xl sm:text-3xl ml-1" aria-hidden="true"></i>
                </span>
              </span>
            </button>

            <h3 class="absolute bottom-0 left-0 right-0 p-5 text-white font-heading text-2xl leading-tight pointer-events-none">
              {{ $t(`services.${v.key}`) }}
            </h3>
          </template>
          <video v-else :src="v.videoFile" class="absolute inset-0 w-full h-full object-contain bg-black"
            controls autoplay playsinline></video>
        </div>
      </article>
    </div>

    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mt-6 reveal">
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

const YOUTUBE_CHANNEL = 'https://www.youtube.com/@camposmunoslaw6542'

const videos = Object.entries(baseServices)
  .filter(([, s]) => s.video && s.videoFile && s.thumbnail)
  .map(([slug, s]) => ({ slug, key: s.key, videoFile: s.videoFile, thumbnail: s.thumbnail }))

const playing = ref(null)
</script>

<style scoped>
/* Full-bleed track: one card sits centred with the neighbours peeking in. The
   side padding lets the first and last cards reach the centre too. */
.video-reel {
  --card-w: min(680px, 86vw);
  padding-inline: calc((100% - var(--card-w)) / 2);
  scroll-padding-inline: calc((100% - var(--card-w)) / 2);
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}
.video-reel > .video-card {
  flex-basis: var(--card-w);
  width: var(--card-w);
}
.video-reel::-webkit-scrollbar { height: 6px; }
.video-reel::-webkit-scrollbar-thumb { background: rgba(0, 63, 141, 0.25); border-radius: 9999px; }

/* Expanding ring behind the play button (matches the service-page treatment). */
@keyframes reel-pulse {
  0% { transform: scale(1); opacity: 0.7; }
  70%, 100% { transform: scale(1.35); opacity: 0; }
}
.reel-pulse-ring {
  animation: reel-pulse 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .reel-pulse-ring { animation: none; }
}
</style>
