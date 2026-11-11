<template>
  <!-- The article's video poster, or — for an article with no single video —
       a typographic tile in the brand navy. Decorative: the title beside it
       carries the meaning, so the image has empty alt text. -->
  <div class="relative aspect-video overflow-hidden bg-brand-navy">
    <img v-if="poster" :src="poster" alt="" loading="lazy" decoding="async"
      class="absolute inset-0 w-full h-full object-cover" />
    <div v-else class="absolute inset-0 flex items-center justify-center px-4">
      <span class="font-heading text-white text-center leading-none tracking-tight"
        :class="compact ? 'text-lg sm:text-2xl' : 'text-4xl md:text-5xl'">{{ post.coverText }}</span>
    </div>
    <span v-if="poster && !compact"
      class="absolute left-4 bottom-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 font-ui text-xs font-semibold tracking-wider uppercase text-brand-navy">
      <i class="fa-solid fa-play text-[0.65rem]" aria-hidden="true"></i> Video
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { posterFor } from '../data/blog/index.js'

const props = defineProps({
  post: { type: Object, required: true },
  compact: { type: Boolean, default: false },
})
const poster = computed(() => posterFor(props.post))
</script>
