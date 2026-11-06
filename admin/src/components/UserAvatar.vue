<template>
  <!-- A profile picture: a 3D animal or an emoji on a coloured circle. -->
  <span class="inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 select-none"
    :style="{ width: `${size}px`, height: `${size}px`, backgroundColor: colorHex(avatar?.bg) }"
    role="img" :aria-label="label">
    <img v-if="avatar?.kind === 'fluent'" :src="fluentSrc(avatar.key)" alt="" draggable="false"
      :width="Math.round(size * 0.72)" :height="Math.round(size * 0.72)" decoding="async"
      :style="{ width: `${Math.round(size * 0.72)}px`, height: `${Math.round(size * 0.72)}px` }" />
    <span v-else-if="avatar?.kind === 'emoji'" aria-hidden="true" class="leading-none"
      :style="{ fontSize: `${Math.round(size * 0.52)}px` }">{{ avatar.key }}</span>
  </span>
</template>

<script setup>
import { colorHex, fluentSrc } from '../data/avatars.js'

defineProps({
  avatar: { type: Object, default: null }, // { kind: 'fluent'|'emoji', key, bg }
  size: { type: Number, default: 40 },
  label: { type: String, default: 'Profile picture' },
})
</script>
