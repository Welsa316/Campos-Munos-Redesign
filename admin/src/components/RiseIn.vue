<template>
  <!-- Children rise into place one after another (cards on Home). Hidden by
       a class until the animation has its starting values, so nothing
       flashes; the class is reactive, so a parent re-render cannot re-hide
       finished content. -->
  <div ref="el" :class="{ 'rise-in-init': !started }"><slot /></div>
</template>

<style>
.rise-in-init > * { opacity: 0; }
</style>

<script setup>
// Lift-and-settle entrance with GSAP: each direct child moves up a little,
// grows from 96 % and fades in, staggered, with a soft overshoot. Skipped
// (content just appears) when the visitor prefers reduced motion.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { gsap } from 'gsap'

const props = defineProps({
  delay: { type: Number, default: 0 },
  duration: { type: Number, default: 0.9 },
  stagger: { type: Number, default: 0.1 },
  distance: { type: Number, default: 28 },
})

const el = ref(null)
const started = ref(false)
let tween = null

onMounted(() => {
  const targets = el.value ? Array.from(el.value.children) : []
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (!targets.length || reduce) {
    started.value = true
    return
  }
  tween = gsap.fromTo(targets,
    { opacity: 0, y: props.distance, scale: 0.96 },
    {
      opacity: 1, y: 0, scale: 1,
      duration: props.duration, delay: props.delay, stagger: props.stagger,
      ease: 'back.out(1.4)',
      clearProps: 'transform,opacity',
    })
  // fromTo has applied the starting values: the class is no longer needed.
  started.value = true
})

onBeforeUnmount(() => tween?.kill())
</script>
