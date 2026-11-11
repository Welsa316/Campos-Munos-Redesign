<template>
  <!-- Click-to-play with sound everywhere (no autoplay, per client decision).
       Remount with :key when the source changes so it resets to the poster. -->
  <div class="rounded-2xl overflow-hidden shadow-lg">
    <div class="aspect-video relative bg-brand-navy">
      <!-- Graceful fallback when the video source fails to load -->
      <div v-if="videoError"
        class="absolute inset-0 flex items-center justify-center text-center px-6 text-white/70 font-ui text-base">
        {{ $t('serviceDetail.videoUnavailable') }}
      </div>

      <template v-else>
        <img v-if="!playing" :src="poster" :alt="alt"
          class="absolute inset-0 w-full h-full object-cover" />
        <button v-if="!playing" type="button" @click="play"
          :aria-label="label"
          class="absolute inset-0 cursor-pointer group z-10 bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80 focus-visible:ring-inset rounded-2xl">
          <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24">
            <span class="absolute inset-0 rounded-full border-2 border-white/70 play-pulse-ring" aria-hidden="true"></span>
            <span class="relative w-full h-full rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-transform duration-300 shadow-2xl">
              <i class="fa-solid fa-play text-brand-navy text-2xl sm:text-3xl ml-1"></i>
            </span>
          </span>
        </button>
        <video
          v-if="playing"
          ref="videoRef"
          :src="src"
          :aria-label="label"
          class="w-full h-full object-contain bg-black"
          controls
          autoplay
          playsinline
          @error="videoError = true"
        ></video>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

defineProps({
  src: { type: String, required: true },
  poster: { type: String, required: true },
  // Accessible name for the play button and the player.
  label: { type: String, required: true },
  // Alt text for the poster frame.
  alt: { type: String, default: '' },
})

const playing = ref(false)
const videoRef = ref(null)
// Set when the <video> emits an error (missing/unreachable source); hides the
// broken player and shows a graceful notice instead.
const videoError = ref(false)

function play() {
  playing.value = true
  nextTick(() => {
    const video = videoRef.value
    if (video) {
      video.play().catch(() => {})
      // The play <button> just unmounted; move focus onto the player so it
      // doesn't fall back to <body>.
      video.focus()
    }
  })
}
</script>

<style scoped>
/* Subtle expanding ring behind the play button (same easing as .btn-magnetic) */
@keyframes play-pulse {
  0% { transform: scale(1); opacity: 0.7; }
  70%, 100% { transform: scale(1.35); opacity: 0; }
}
.play-pulse-ring {
  animation: play-pulse 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .play-pulse-ring { animation: none; }
}
</style>
