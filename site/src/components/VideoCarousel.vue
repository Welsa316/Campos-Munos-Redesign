<template>
  <section ref="sectionRef" class="py-14 sm:py-24 bg-brand-surface overflow-hidden">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-8 sm:mb-12 reveal">
        <p class="font-ui text-base tracking-[0.2em] text-brand-navy uppercase mb-3">{{ $t('home.videosEyebrow') }}</p>
        <h2 class="font-heading text-3xl md:text-5xl text-brand-navy leading-tight">{{ $t('home.videosTitle') }}</h2>
        <p class="text-gray-500 text-lg font-ui max-w-2xl mx-auto mt-3">{{ $t('home.videosSubtitle') }}</p>
        <!-- Prominent link to the firm's YouTube channel -->
        <a :href="YOUTUBE_CHANNEL" target="_blank" rel="noopener"
          class="mt-5 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-youtube text-white font-ui font-bold tracking-wide shadow-md hover:bg-[#b30000] hover:scale-[1.03] transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-youtube/40">
          <i class="fa-brands fa-youtube text-xl" aria-hidden="true"></i>
          {{ $t('home.watchOnYoutube') }}
        </a>
      </div>
    </div>

    <!-- Deck: the active video sits flat and forward; each neighbour is pushed
         back (translateZ) and turned (rotateY) so it peeks from the side — a
         sneak-peek of the next/previous video. -->
    <div ref="deckRef" class="deck reveal" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <article v-for="(v, i) in videos" :key="v.slug"
        class="deck-card" :class="{ 'is-active': i === activeIndex }"
        :style="cardStyle(i)"
        :aria-hidden="Math.abs(i - activeIndex) > 1 ? 'true' : null"
        @click="i !== activeIndex && goTo(i, true)">
        <div class="relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl bg-brand-navy">
          <!-- YouTube badge -->
          <a :href="YOUTUBE_CHANNEL" target="_blank" rel="noopener" @click.stop
            class="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-ui font-semibold hover:bg-black/75 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            :aria-label="$t('home.watchOnYoutube')" :tabindex="i === activeIndex ? 0 : -1">
            <i class="fa-brands fa-youtube text-[#FF3D3D] text-base" aria-hidden="true"></i>
            <span>YouTube</span>
          </a>

          <!-- Active + in-view card plays; everything else shows its poster. -->
          <video v-if="i === activeIndex && inView && !errored.has(i)"
            :src="v.videoFile" :aria-label="$t(`services.${v.key}`)"
            class="absolute inset-0 w-full h-full object-contain bg-black"
            autoplay muted playsinline controls @error="errored.add(i)"></video>
          <template v-else>
            <img :src="`${v.thumbnail}?v=2`" :alt="$t(`services.${v.key}`)"
              class="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
            <div class="absolute inset-0 bg-gradient-to-t from-brand-navy/95 via-brand-navy/20 to-brand-navy/10"></div>
            <!-- Video failed to load: the active card has no play button, so surface a notice. -->
            <div v-if="errored.has(i)" class="absolute inset-0 flex items-center justify-center text-center px-6 z-10">
              <p class="text-white/85 font-ui text-sm">{{ $t('serviceDetail.videoUnavailable') }}</p>
            </div>
            <!-- Play button only on the active (paused) card; neighbours are promoted by tapping the whole card. -->
            <button v-if="i === activeIndex" type="button" @click="goTo(i, true)"
              :aria-label="$t('serviceDetail.watchVideo', { service: $t(`services.${v.key}`) })"
              class="absolute inset-0 flex items-center justify-center group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 focus-visible:ring-inset rounded-3xl">
              <span class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-transform duration-300 shadow-xl">
                <i class="fa-solid fa-play text-brand-navy text-xl sm:text-2xl ml-1" aria-hidden="true"></i>
              </span>
            </button>
          </template>
        </div>
      </article>
    </div>

    <!-- Controls: arrows on the left, active label + counter on the right. -->
    <div class="max-w-7xl mx-auto px-6 mt-8 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <button type="button" @click="goTo(activeIndex - 1)" :disabled="activeIndex === 0"
          class="deck-arrow" :aria-label="$t('home.prevVideo')">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button type="button" @click="goTo(activeIndex + 1)" :disabled="activeIndex === videos.length - 1"
          class="deck-arrow deck-arrow--primary" :aria-label="$t('home.nextVideo')">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      <div class="text-right min-w-0">
        <p class="font-heading text-xl sm:text-2xl text-brand-navy truncate" aria-live="polite">
          {{ $t(`services.${videos[activeIndex].key}`) }}
        </p>
        <p class="text-gray-600 font-ui text-sm tracking-wider mt-0.5">
          {{ String(activeIndex + 1).padStart(2, '0') }} / {{ String(videos.length).padStart(2, '0') }}
        </p>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-6 text-center mt-8 reveal">
      <router-link to="/servicios"
        class="inline-flex items-center gap-2 text-brand-navy font-ui font-bold tracking-wider group">
        {{ $t('nav.verTodosServicios') }}
        <i class="fa-solid fa-arrow-right text-sm transition-transform group-hover:translate-x-1" aria-hidden="true"></i>
      </router-link>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { baseServices } from '../data/seoServices.js'

const YOUTUBE_CHANNEL = 'https://www.youtube.com/@camposmunoslaw6542'

const videos = Object.entries(baseServices)
  .filter(([, s]) => s.video && s.videoFile && s.thumbnail)
  .map(([slug, s]) => ({ slug, key: s.key, videoFile: s.videoFile, thumbnail: s.thumbnail }))

const deckRef = ref(null)
const sectionRef = ref(null)
const activeIndex = ref(0)
const inView = ref(false)
const errored = reactive(new Set())

// Position each card relative to the active one: the active is flat + forward,
// each step away is pushed back and rotated so it peeks from the side. Cards
// before the first / after the last simply don't exist, so the first video has
// no left peek and the last has no right peek — automatically.
function cardStyle(i) {
  const off = i - activeIndex.value
  const a = Math.abs(off)
  const dir = off < 0 ? -1 : 1
  let x, tz, ry, sc, op, zi, pe
  if (off === 0)    { x = -50;            tz = 0;    ry = 0;         sc = 1;    op = 1;    zi = 30; pe = 'auto' }
  else if (a === 1) { x = -50 + dir * 30; tz = -130; ry = -dir * 18; sc = 0.82; op = 0.55; zi = 20; pe = 'auto' }
  else              { x = -50 + dir * 44; tz = -300; ry = -dir * 22; sc = 0.72; op = 0;    zi = 5;  pe = 'none' }
  return {
    transform: `translateX(${x}%) translateZ(${tz}px) rotateY(${ry}deg) scale(${sc})`,
    zIndex: zi,
    opacity: op,
    pointerEvents: pe,
  }
}

function goTo(i, focusVideo = false) {
  i = Math.max(0, Math.min(videos.length - 1, i))
  if (i === activeIndex.value) return
  activeIndex.value = i
  if (focusVideo) {
    nextTick(() => {
      const vid = deckRef.value && deckRef.value.querySelector('.is-active video')
      if (vid && vid.focus) vid.focus()
    })
  }
}

// Swipe left/right to move through the deck (ignores mostly-vertical drags so it
// doesn't hijack page scrolling).
let touchX = 0, touchY = 0
function onTouchStart(e) { touchX = e.changedTouches[0].clientX; touchY = e.changedTouches[0].clientY }
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
    goTo(activeIndex.value + (dx < 0 ? 1 : -1))
  }
}

// Autoplay only while the carousel is on screen (cheap scroll/resize check —
// reliable across browsers where IntersectionObserver proved flaky).
function checkInView() {
  const el = sectionRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  inView.value = r.bottom > 80 && r.top < window.innerHeight - 80
}
onMounted(() => {
  checkInView()
  window.addEventListener('scroll', checkInView, { passive: true })
  window.addEventListener('resize', checkInView)
})
onUnmounted(() => {
  window.removeEventListener('scroll', checkInView)
  window.removeEventListener('resize', checkInView)
})
</script>

<style scoped>
.deck {
  --card-w: min(620px, 74vw);
  position: relative;
  width: 100%;
  height: calc(var(--card-w) * 9 / 16);
  perspective: 1600px;
  perspective-origin: 50% 50%;
}
.deck-card {
  position: absolute;
  top: 0;
  left: 50%;
  width: var(--card-w);
  transform-origin: center center;
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.55s ease;
  cursor: pointer;
}
.deck-card.is-active { cursor: default; }

.deck-arrow {
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  border: 1px solid rgba(0, 63, 141, 0.25);
  color: var(--color-brand-navy);
  background: #fff;
  transition: transform 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}
.deck-arrow--primary {
  background: var(--color-brand-navy);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 8px 20px rgba(0, 63, 141, 0.35);
}
.deck-arrow:hover:not(:disabled) { transform: scale(1.08); }
.deck-arrow:disabled { opacity: 0.3; cursor: default; }

@media (prefers-reduced-motion: reduce) {
  .deck-card { transition: none; }
}
</style>
