<template>
  <section ref="sectionRef" class="py-14 sm:py-24 bg-brand-surface overflow-hidden">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-7 sm:mb-9 reveal">
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

    <!-- One big video centered and autoplaying (muted); the neighbours peek in so
         you can swipe/scroll or use the arrows to move to the next one. -->
    <div class="relative">
      <div ref="reelRef" class="video-reel flex items-stretch gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory reveal"
        @scroll.passive="onScroll">
        <article v-for="(v, i) in videos" :key="v.slug"
          class="video-card relative snap-center flex-shrink-0 rounded-3xl overflow-hidden shadow-2xl bg-brand-navy transition-opacity duration-500"
          :class="i === activeIndex ? 'opacity-100' : 'opacity-55'">
          <div class="aspect-video relative">
            <!-- YouTube badge — rides in the corner of every card as they scroll -->
            <a :href="YOUTUBE_CHANNEL" target="_blank" rel="noopener" @click.stop
              class="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-ui font-semibold hover:bg-black/75 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              :aria-label="$t('home.watchOnYoutube')">
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
              <!-- Tapping a non-active card promotes it (and it starts playing). -->
              <button v-if="i !== activeIndex" type="button" @click="goTo(i, true)"
                :aria-label="$t('serviceDetail.watchVideo', { service: $t(`services.${v.key}`) })"
                class="absolute inset-0 flex items-center justify-center group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 focus-visible:ring-inset rounded-3xl">
                <span class="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-transform duration-300 shadow-xl">
                  <i class="fa-solid fa-play text-brand-navy text-xl ml-1" aria-hidden="true"></i>
                </span>
              </button>
              <h3 class="absolute bottom-0 left-0 right-0 p-5 text-white font-heading text-2xl leading-tight pointer-events-none">
                {{ $t(`services.${v.key}`) }}
              </h3>
            </template>
          </div>
        </article>
      </div>

      <!-- Prev / next arrows -->
      <button type="button" @click="goTo(activeIndex - 1)" :disabled="activeIndex === 0"
        class="carousel-arrow left-2 sm:left-6" :aria-label="$t('home.prevVideo')">
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <button type="button" @click="goTo(activeIndex + 1)" :disabled="activeIndex === videos.length - 1"
        class="carousel-arrow right-2 sm:right-6" :aria-label="$t('home.nextVideo')">
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Active label — updates to the service of whichever video is centred. -->
    <div class="max-w-7xl mx-auto px-6 text-center mt-6">
      <p class="font-heading text-2xl sm:text-3xl text-brand-navy" aria-live="polite">
        {{ $t(`services.${videos[activeIndex].key}`) }}
      </p>
      <p class="text-gray-600 font-ui text-sm mt-1">{{ activeIndex + 1 }} / {{ videos.length }}</p>
      <router-link to="/servicios"
        class="mt-4 inline-flex items-center gap-2 text-brand-navy font-ui font-bold tracking-wider group">
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

const reelRef = ref(null)
const sectionRef = ref(null)
const activeIndex = ref(0)
const inView = ref(false)
const errored = reactive(new Set())

// Centre card `i` in the reel; optionally move focus to the player that mounts
// (the tapped poster button unmounts, so focus would otherwise fall to <body>).
function goTo(i, focusVideo = false) {
  i = Math.max(0, Math.min(videos.length - 1, i))
  activeIndex.value = i
  const reel = reelRef.value
  const card = reel && reel.children[i]
  if (reel && card) {
    const cardRect = card.getBoundingClientRect()
    const reelRect = reel.getBoundingClientRect()
    const delta = (cardRect.left + cardRect.width / 2) - (reelRect.left + reelRect.width / 2)
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    reel.scrollBy({ left: delta, behavior: reduceMotion ? 'auto' : 'smooth' })
  }
  if (focusVideo) {
    nextTick(() => {
      const vid = card && card.querySelector('video')
      if (vid && vid.focus) vid.focus()
    })
  }
}

// While the user free-scrolls, keep the active (playing) card in sync with
// whichever card is nearest the centre — debounced until the scroll settles.
let scrollTimer = null
function onScroll() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const reel = reelRef.value
    if (!reel) return
    const center = reel.getBoundingClientRect().left + reel.clientWidth / 2
    let best = 0, bestDist = Infinity
    Array.from(reel.children).forEach((c, i) => {
      const r = c.getBoundingClientRect()
      const d = Math.abs((r.left + r.width / 2) - center)
      if (d < bestDist) { bestDist = d; best = i }
    })
    if (best !== activeIndex.value) activeIndex.value = best
  }, 140)
}

// Autoplay only while the carousel is on screen. A cheap scroll/resize check is
// used instead of IntersectionObserver, which proved unreliable in some render
// contexts — this fires everywhere.
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
  if (scrollTimer) clearTimeout(scrollTimer)
})
</script>

<style scoped>
/* Full-bleed track: the current card sits centred with its neighbours peeking. */
.video-reel {
  --card-w: min(1040px, 88vw);
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

.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  width: 3rem;
  height: 3rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-brand-navy);
  font-size: 1.1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}
.carousel-arrow:hover:not(:disabled) {
  background: #fff;
  transform: translateY(-50%) scale(1.08);
}
.carousel-arrow:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
