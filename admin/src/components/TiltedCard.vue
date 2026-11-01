<template>
  <!-- Tilts toward the pointer on a spring, lifts while hovered or focused,
       with a glare and edge light that follow the tilt and a soft shadow that
       moves under it. The content (slot) keeps its own size. -->
  <figure ref="figureRef" class="tilted-card" :style="{ perspective: `${perspective}px` }">
    <div ref="shadowRef" class="tilted-card__shadow" aria-hidden="true" :style="{ borderRadius: `${radius}px` }"></div>
    <div ref="bodyRef" class="tilted-card__body" :style="{ '--tc-radius': `${radius}px`, '--tc-glare-rgb': glareRgb }">
      <div class="tilted-card__face">
        <slot />
        <span class="tilted-card__glare" aria-hidden="true"></span>
        <span class="tilted-card__rim" aria-hidden="true"></span>
        <span class="tilted-card__edge" aria-hidden="true"></span>
      </div>
    </div>
  </figure>
</template>

<script setup>
// TiltedCard from React Bits (reactbits.dev, MIT + Commons Clause), ported to
// Vue 3 for cards that hold their own content. Kept: the spring tilt (same
// spring maths and smoothness), lift and scale on hover, glare, rim, edge
// light, the moving shadow, axis / reverse / trackWindow / floating, and
// reduced-motion handling. Left out on purpose: flipping to a back face,
// the image, caption and overlay, and phone-motion tilt (it would ask phones
// for motion permission). Keyboard focus inside the card lifts it too.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  scaleOnHover: { type: Number, default: 1.05 },
  rotateAmplitude: { type: Number, default: 12 },
  radius: { type: Number, default: 15 },
  perspective: { type: Number, default: 800 },
  smoothness: { type: Number, default: 0.6 },
  glare: { type: Number, default: 0.5 },
  glareColor: { type: String, default: '#ffffff' },
  shadow: { type: Number, default: 0.5 },
  axis: { type: String, default: 'both' }, // both | horizontal | vertical
  reverse: { type: Boolean, default: false },
  trackWindow: { type: Boolean, default: false },
  floating: { type: Boolean, default: false },
})

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const parseColor = (value) => {
  const text = String(value || '').trim()
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].replace(/./g, (d) => d + d) : hex[1]
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text)
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((c) => clamp(Math.round(parseFloat(c)), 0, 255))
  return null
}
const glareRgb = computed(() => (parseColor(props.glareColor) || [255, 255, 255]).join(', '))

// Damped spring step, as in the original.
function step(state, key, target, omega, zeta, dt) {
  const velocity = `v${key}`
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    state[velocity] += (omega * omega * (target - state[key]) - 2 * zeta * omega * state[velocity]) * h
    state[key] += state[velocity] * h
  }
  const settled = Math.abs(target - state[key]) < 0.001 && Math.abs(state[velocity]) < 0.01
  if (settled) {
    state[key] = target
    state[velocity] = 0
  }
  return !settled
}

const figureRef = ref(null)
const bodyRef = ref(null)
const shadowRef = ref(null)
let cleanup = null

onMounted(() => {
  const figure = figureRef.value
  const body = bodyRef.value
  if (!figure || !body) return

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const state = { rx: 0, vrx: 0, ry: 0, vry: 0, lift: 0, vlift: 0, ty: 0, vty: 0 }
  const pointer = { nx: 0, ny: 0, inside: false, mouse: false, seen: false }
  let time = Math.random() * 10
  let focused = false
  let raf = 0
  let last = 0
  let visible = true

  const frame = (now) => {
    raf = 0
    const p = props
    const dt = clamp((now - last) / 1000 || 0, 0, 0.05)
    last = Math.max(last, now)
    time += dt
    let busy = false

    const amplitude = clamp(p.rotateAmplitude, 0, 60) * (reduced ? 0.3 : 1)
    const hovering = pointer.inside && pointer.mouse
    const following = hovering || (p.trackWindow && pointer.seen && !coarse)
    let inputX = 0
    let inputY = 0
    if (following) {
      inputX = pointer.nx
      inputY = pointer.ny
    } else if (p.floating && !reduced && visible) {
      inputX = 0.32 * Math.sin(time * 0.62) + 0.12 * Math.sin(time * 1.31 + 0.7)
      inputY = 0.26 * Math.sin(time * 0.83 + 1.9) + 0.1 * Math.sin(time * 1.57)
      busy = true
    }
    if (p.axis === 'horizontal') inputY = 0
    if (p.axis === 'vertical') inputX = 0
    const sign = p.reverse ? -1 : 1
    const smooth = clamp(p.smoothness, 0, 1)
    const omega = 20 * Math.pow(0.2, smooth)
    const zeta = 1 - 0.3 * smooth
    const lifted = hovering || focused ? 1 : 0

    busy = step(state, 'rx', -inputY * amplitude * sign, omega, zeta, dt) || busy
    busy = step(state, 'ry', inputX * amplitude * sign, omega, zeta, dt) || busy
    busy = step(state, 'ty', p.floating && !following && !reduced ? -4 * Math.sin(time * 0.9) : 0, omega * 0.8, 0.9, dt) || busy
    busy = step(state, 'lift', lifted, omega, Math.max(zeta, 0.85), dt) || busy

    const active = lifted > 0 || state.lift > 0.01
    if (active !== figure.hasAttribute('data-active')) figure.toggleAttribute('data-active', active)
    const scale = 1 + (Math.max(0.5, p.scaleOnHover) - 1) * state.lift
    const rx = state.rx
    const ry = state.ry
    const radX = (rx * Math.PI) / 180
    const radY = (ry * Math.PI) / 180
    body.style.transform = `translate3d(0, ${state.ty.toFixed(2)}px, 0) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${scale.toFixed(4)})`
    const reach = Math.max(amplitude, 1)
    body.style.setProperty('--tc-gx', `${(50 + (ry / reach) * 46).toFixed(2)}%`)
    body.style.setProperty('--tc-gy', `${(50 - (rx / reach) * 46).toFixed(2)}%`)
    const energy = Math.min(1, Math.hypot(rx, ry) / reach)
    body.style.setProperty('--tc-glare', (clamp(p.glare, 0, 1) * Math.max(state.lift, energy)).toFixed(3))

    const shade = shadowRef.value
    if (shade) {
      const offsetX = -Math.sin(radY) * 22
      const offsetY = 12 + 16 * state.lift + Math.sin(radX) * 18 - state.ty * 0.6
      const spread = scale * (0.86 + 0.04 * state.lift)
      shade.style.transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0) scale(${spread.toFixed(4)})`
      shade.style.opacity = (clamp(p.shadow, 0, 1) * (0.6 + 0.4 * state.lift)).toFixed(3)
    }

    if (busy && visible) raf = requestAnimationFrame(frame)
  }

  const wake = () => {
    if (raf || !visible) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  const track = (event) => {
    const rect = figure.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    pointer.nx = clamp((event.clientX - rect.left - w / 2) / (w / 2), -1, 1)
    pointer.ny = clamp((event.clientY - rect.top - h / 2) / (h / 2), -1, 1)
  }
  const isMouse = (e) => e.pointerType === 'mouse' || e.pointerType === 'pen'
  const onEnter = (e) => { pointer.inside = true; pointer.mouse = isMouse(e); track(e); wake() }
  const onMove = (e) => { pointer.mouse = isMouse(e); if (pointer.mouse) pointer.inside = true; track(e); wake() }
  const onLeave = () => { pointer.inside = false; wake() }
  const onWindowMove = (e) => {
    if (pointer.inside && pointer.mouse && !figure.contains(e.target)) onLeave()
    if (!props.trackWindow || pointer.inside) return
    const rect = figure.getBoundingClientRect()
    pointer.seen = true
    pointer.nx = clamp((e.clientX - (rect.left + rect.width / 2)) / Math.max(1, window.innerWidth / 2), -1, 1)
    pointer.ny = clamp((e.clientY - (rect.top + rect.height / 2)) / Math.max(1, window.innerHeight / 2), -1, 1)
    wake()
  }
  // The link inside takes the focus, so listen for focus within the card.
  const onFocusIn = () => { focused = Boolean(figure.querySelector(':focus-visible')); wake() }
  const onFocusOut = () => { focused = false; wake() }

  figure.addEventListener('pointerenter', onEnter)
  figure.addEventListener('pointermove', onMove)
  figure.addEventListener('pointerleave', onLeave)
  figure.addEventListener('focusin', onFocusIn)
  figure.addEventListener('focusout', onFocusOut)
  window.addEventListener('pointermove', onWindowMove, { passive: true })
  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting)
    wake()
  })
  observer.observe(figure)
  wake()

  cleanup = () => {
    cancelAnimationFrame(raf)
    observer.disconnect()
    figure.removeEventListener('pointerenter', onEnter)
    figure.removeEventListener('pointermove', onMove)
    figure.removeEventListener('pointerleave', onLeave)
    figure.removeEventListener('focusin', onFocusIn)
    figure.removeEventListener('focusout', onFocusOut)
    window.removeEventListener('pointermove', onWindowMove)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<style>
/* From React Bits' TiltedCard.css, without the back face, image, caption
   and overlay. No transform-style: preserve-3d (nothing sits at a depth),
   which also keeps backdrop blur working for glass content. */
.tilted-card {
  position: relative;
  margin: 0;
  outline: none;
  touch-action: pan-y pinch-zoom;
  -webkit-tap-highlight-color: transparent;
}
.tilted-card[data-active] { z-index: 2; }
.tilted-card__shadow {
  position: absolute;
  inset: 0;
  background: var(--tc-shadow-color, rgba(22, 28, 45, 0.5));
  filter: blur(20px);
  opacity: 0;
  pointer-events: none;
  will-change: transform, opacity;
}
.tilted-card__body { position: relative; height: 100%; will-change: transform; }
.tilted-card__face {
  position: relative;
  height: 100%;
  border-radius: var(--tc-radius);
  overflow: hidden;
  isolation: isolate;
}
.tilted-card__glare {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: radial-gradient(
    farthest-corner circle at var(--tc-gx, 50%) var(--tc-gy, 50%),
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.34)) 0%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.331)) 9%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.285)) 18%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.202)) 27%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.108)) 36%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.035)) 45%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.003)) 54%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), 0) 60%
  );
  mix-blend-mode: screen;
  pointer-events: none;
}
.tilted-card__rim {
  position: absolute;
  inset: 0;
  z-index: 6;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px var(--tc-rim-color, rgba(255, 255, 255, 0.08)),
    inset 0 1px 0 var(--tc-rim-light, rgba(255, 255, 255, 0.12));
  pointer-events: none;
}
.tilted-card__edge {
  position: absolute;
  inset: 0;
  z-index: 7;
  box-sizing: border-box;
  padding: 1px;
  border-radius: inherit;
  background: radial-gradient(
    farthest-side circle at var(--tc-gx, 50%) var(--tc-gy, 50%),
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.85)) 0%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.71)) 18%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.43)) 36%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.16)) 54%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), calc(var(--tc-glare, 0) * 0.02)) 72%,
    rgba(var(--tc-glare-rgb, 255, 255, 255), 0) 85%
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  pointer-events: none;
}
</style>
