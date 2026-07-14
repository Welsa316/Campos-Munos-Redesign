<template>
  <!-- ===================== FEATURED ON TV (press) ===================== -->
  <!-- Dark "newsroom" band: a glowing TV frame cycling through Juan's news
       interviews; the station logos below act as channel buttons. -->
  <section ref="sectionRef" class="press-band py-20 sm:py-24 overflow-hidden" :aria-label="$t('home.pressAria')">
    <div class="max-w-5xl mx-auto px-6">
      <div class="text-center mb-10 sm:mb-12 reveal">
        <h2 class="font-heading text-4xl md:text-5xl text-white">
          {{ $t('home.pressHeading') }}
        </h2>
      </div>

      <!-- TV frame -->
      <div
        class="tv-frame reveal relative mx-auto"
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
        @touchstart.passive="hovering = true"
        @touchend.passive="hovering = false"
      >
        <div class="tv-screen relative aspect-video overflow-hidden rounded-xl bg-black">
          <!-- All three stills stay mounted; the active one fades in. -->
          <img
            v-for="(st, i) in stations"
            :key="st.id"
            :src="st.still"
            :alt="$t(st.altKey)"
            :loading="i === 0 ? 'eager' : 'lazy'"
            decoding="async"
            width="1280" height="720"
            class="absolute inset-0 w-full h-full object-contain transition-opacity duration-500"
            :class="i === active ? 'opacity-100' : 'opacity-0'"
          />
          <!-- glass reflection -->
          <div class="absolute inset-0 pointer-events-none tv-glass" aria-hidden="true"></div>
          <!-- channel-change static burst -->
          <div class="absolute inset-0 pointer-events-none tv-static" :class="{ 'is-switching': switching }" aria-hidden="true"></div>
        </div>
      </div>

      <!-- Channel buttons: balanced 3-up grid on mobile, row on desktop -->
      <div class="mt-8 sm:mt-10 grid grid-cols-3 sm:flex sm:flex-wrap sm:items-stretch justify-center gap-2.5 sm:gap-4 max-w-md sm:max-w-none mx-auto reveal" role="group" :aria-label="$t('home.pressHeading')">
        <button
          v-for="(st, i) in stations"
          :key="st.id"
          type="button"
          @click="tune(i)"
          @focus="hovering = true"
          @blur="hovering = false"
          :aria-pressed="i === active"
          :aria-label="$t('home.pressWatch', { station: st.name })"
          class="channel-btn relative flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 px-2 sm:px-6 py-3 rounded-xl border transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          :class="i === active
            ? 'border-white/25 bg-white/10 opacity-100'
            : 'border-white/10 bg-white/[0.03] opacity-50 hover:opacity-80'"
        >
          <img :src="st.logo" :alt="''" aria-hidden="true" class="h-7 sm:h-8 w-auto" :class="{ 'logo-invert': st.invert }" width="32" height="32" />
          <span v-if="st.label" class="text-white font-ui font-semibold text-[10px] sm:text-base tracking-[0.18em] sm:tracking-widest">{{ st.label }}</span>
          <!-- autoplay countdown underline -->
          <span
            v-if="i === active && autoOn"
            :key="`bar-${active}-${cycle}`"
            class="channel-progress absolute left-3 right-3 bottom-1 h-0.5 rounded-full bg-brand-red origin-left"
            :class="{ 'is-paused': hovering || !inView }"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const INTERVAL_MS = 6000

const stations = [
  { id: 'telemundo', name: 'Telemundo', label: 'TELEMUNDO', still: '/press/telemundo.jpg', logo: '/press/telemundo.svg', invert: true, altKey: 'home.pressAltTelemundo' },
  { id: 'univision', name: 'Univision', label: 'Univision', still: '/press/univision.jpg', logo: '/press/univision.svg', invert: true, altKey: 'home.pressAltUnivision' },
  { id: 'tvv', name: 'TVV', label: '', still: '/press/tvv.jpg', logo: '/press/tvv-logo.png', invert: false, altKey: 'home.pressAltTvv' },
]

const active = ref(0)
const switching = ref(false)
const hovering = ref(false)
const inView = ref(false)
const autoOn = ref(true)
// cycle bumps the progress bar's key so its animation restarts each channel
const cycle = ref(0)
const sectionRef = ref(null)

let timer = null
let staticTimer = null
const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function show(i) {
  if (i === active.value) return
  if (!reducedMotion) {
    switching.value = true
    if (staticTimer) clearTimeout(staticTimer)
    staticTimer = setTimeout(() => { switching.value = false }, 340)
  }
  active.value = i
  cycle.value++
}

// Manual selection: tune to the channel and stop auto-rotation — the visitor
// has taken the remote.
function tune(i) {
  autoOn.value = false
  show(i)
}

function tick() {
  if (!autoOn.value || hovering.value || !inView.value) return
  show((active.value + 1) % stations.length)
}

// Same rect-based in-view check the video carousel uses (IntersectionObserver
// proved flaky in the preview environment).
function checkInView() {
  const el = sectionRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  inView.value = r.top < window.innerHeight * 0.9 && r.bottom > window.innerHeight * 0.1
}

onMounted(() => {
  checkInView()
  window.addEventListener('scroll', checkInView, { passive: true })
  window.addEventListener('resize', checkInView, { passive: true })
  timer = setInterval(tick, INTERVAL_MS)
})

onUnmounted(() => {
  clearInterval(timer)
  if (staticTimer) clearTimeout(staticTimer)
  window.removeEventListener('scroll', checkInView)
  window.removeEventListener('resize', checkInView)
})
</script>

<style scoped>
.press-band {
  background:
    radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255, 255, 255, 0.06), transparent 60%),
    linear-gradient(180deg, #041f3d 0%, #062a52 55%, #041f3d 100%);
}

.tv-frame {
  width: min(680px, 100%);
  padding: 10px;
  border-radius: 18px;
  background: linear-gradient(160deg, #1a2430, #0b1219 60%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 24px 60px -12px rgba(0, 0, 0, 0.55),
    0 0 80px -20px rgba(96, 165, 250, 0.25);
}

.tv-glass {
  background: linear-gradient(115deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 28%, transparent 45%);
}

/* Channel-change static: scanlines + noise flash. Hidden unless switching. */
.tv-static {
  opacity: 0;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.14) 0px, rgba(255, 255, 255, 0.14) 1px, transparent 1px, transparent 3px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0px, rgba(255, 255, 255, 0.05) 2px, transparent 2px, transparent 5px);
}
.tv-static.is-switching {
  animation: tv-flicker 0.34s steps(4, end);
}
@keyframes tv-flicker {
  0% { opacity: 0.9; transform: translateY(-2px); }
  35% { opacity: 0.45; transform: translateY(2px); }
  70% { opacity: 0.7; transform: translateY(-1px); }
  100% { opacity: 0; transform: translateY(0); }
}

/* White-out full-colour brand marks so the press bar reads as one system. */
.logo-invert {
  filter: brightness(0) invert(1);
}

.channel-progress {
  animation: channel-countdown 6s linear forwards;
}
.channel-progress.is-paused {
  animation-play-state: paused;
}
@keyframes channel-countdown {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .tv-static.is-switching { animation: none; opacity: 0; }
  .channel-progress { animation: none; transform: scaleX(1); }
}
</style>
