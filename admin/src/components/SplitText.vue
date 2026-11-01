<template>
  <!-- Keyed by the text, like the original, so new text gets a fresh element
       (GSAP's SplitText has replaced the old one's contents with pieces). -->
  <component :is="tag || 'p'" :key="text" ref="el" class="split-parent" :class="className" :style="rootStyle">{{ text }}</component>
</template>

<script setup>
// SplitText from React Bits (reactbits.dev, MIT), ported to Vue 3. Same
// props, effects, triggers, hover effects and loop as the JavaScript + CSS
// variant; it uses GSAP's SplitText plugin (free, in the gsap package). The
// React hooks become onMounted / watch / onBeforeUnmount, @gsap/react's
// useGSAP becomes gsap.context, and onLetterAnimationComplete becomes the
// @letter-animation-complete event. Honours prefers-reduced-motion.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText as GSAPSplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, GSAPSplitText)

const props = defineProps({
  tag: { type: String, default: 'p' },
  text: { type: String, default: '' },
  className: { type: String, default: '' },
  delay: { type: Number, default: 50 }, // ms between pieces
  duration: { type: Number, default: 1.25 },
  ease: { type: [String, Function], default: undefined },
  splitType: { type: String, default: 'chars' },
  from: { type: Object, default: undefined },
  to: { type: Object, default: undefined },
  threshold: { type: Number, default: 0.1 },
  rootMargin: { type: String, default: '-100px' },
  textAlign: { type: String, default: 'center' },
  staggerFrom: { type: String, default: 'start' },
  mask: { type: Boolean, default: false },
  effect: { type: String, default: 'rise' }, // rise | fade | blur | flip | pop | skew | wave
  trigger: { type: String, default: 'view' }, // view | load | hover | click
  loop: { type: Boolean, default: false },
  loopDelay: { type: Number, default: 1.5 },
  hoverEffect: { type: String, default: 'none' }, // none | lift | wave
  color: { type: String, default: undefined },
  accentColor: { type: String, default: undefined },
})
const emit = defineEmits(['letter-animation-complete'])

const DEFAULT_FROM = { opacity: 0, y: 40 }
const DEFAULT_TO = { opacity: 1, y: 0 }
const STIFFNESS = 180
const DAMPING = 19
const KICK = 0.024

const fontsAreLoaded = () => typeof document !== 'undefined' && (!document.fonts || document.fonts.status === 'loaded')
const waveEase = (t) => 1 - Math.cos(t * Math.PI * 1.5) * Math.pow(1 - t, 1.2)

function getEffect(effect, em) {
  switch (effect) {
    case 'fade':
      return { from: { opacity: 0 }, to: { opacity: 1 }, ease: 'power2.inOut' }
    case 'blur':
      return { from: { opacity: 0, filter: `blur(${Math.round(em * 1.4) / 10}px)` }, to: { opacity: 1, filter: 'blur(0px)' }, ease: 'power2.out' }
    case 'flip': {
      const setup = { transformPerspective: em * 6, transformOrigin: '50% 100%' }
      return { from: { ...setup, opacity: 0, rotationX: -90 }, to: { ...setup, opacity: 1, rotationX: 0 }, ease: 'power3.out' }
    }
    case 'pop':
      return { from: { opacity: 0, scale: 0 }, to: { opacity: 1, scale: 1 }, ease: 'back.out(1.6)' }
    case 'skew':
      return {
        from: { transformOrigin: '50% 100%', opacity: 0, x: -em * 0.4, skewX: -24 },
        to: { transformOrigin: '50% 100%', opacity: 1, x: 0, skewX: 0 },
        ease: 'expo.out',
      }
    case 'wave':
      return { from: { opacity: 0, y: em * 0.45 }, to: { opacity: 1, y: 0 }, ease: waveEase }
    default:
      return { from: { ...DEFAULT_FROM }, to: { ...DEFAULT_TO }, ease: 'power3.out' }
  }
}

const el = ref(null)
const ready = ref(false)
const fontsLoaded = ref(fontsAreLoaded())
let completedText = null
let cleanup = null

const clip = computed(() => props.hoverEffect === 'none'
  && (props.from !== undefined || props.to !== undefined || props.effect === 'rise' || props.effect === 'fade'))
const rootStyle = computed(() => ({
  textAlign: props.textAlign,
  overflow: clip.value ? 'hidden' : 'visible',
  display: 'inline-block',
  whiteSpace: 'normal',
  wordWrap: 'break-word',
  color: props.color,
  cursor: props.trigger === 'click' ? 'pointer' : undefined,
  visibility: ready.value ? undefined : 'hidden',
}))

function setup() {
  const node = el.value
  const p = props
  if (!node || !p.text || !fontsLoaded.value) return
  node.getBoundingClientRect()
  if (!fontsAreLoaded()) {
    // Measuring can start a font load (a weight not used before); split once
    // it has finished, or the pieces would be measured in the fallback font.
    fontsLoaded.value = false
    waitForFonts()
    return
  }

  const finish = () => {
    if (completedText === p.text) return
    completedText = p.text
    emit('letter-animation-complete')
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    ready.value = true
    finish()
    return
  }

  const ctx = gsap.context(() => {
    const startPct = (1 - p.threshold) * 100
    const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(p.rootMargin)
    const marginValue = marginMatch ? parseFloat(marginMatch[1]) : 0
    const marginUnit = marginMatch ? marginMatch[2] || 'px' : 'px'
    const sign = marginValue === 0 ? '' : marginValue < 0 ? `-=${Math.abs(marginValue)}${marginUnit}` : `+=${marginValue}${marginUnit}`
    const start = `top ${startPct}%${sign}`
    const unit = p.splitType.includes('chars') ? 'chars' : p.splitType.includes('words') ? 'words' : 'lines'

    const em = parseFloat(getComputedStyle(node).fontSize) || 16
    const custom = p.from !== undefined || p.to !== undefined
    const look = getEffect(p.effect, em)
    const fromVars = custom ? { ...(p.from || DEFAULT_FROM) } : look.from
    const toVars = custom ? { ...(p.to || DEFAULT_TO) } : look.to
    const easing = p.ease || (custom ? 'power3.out' : look.ease)
    const settle = custom ? 'willChange' : 'transform,filter,willChange'
    const exit = Math.max(0.35, p.duration * 0.55)

    let pieces = []
    let movers = []
    let order = gsap.utils.distribute({ each: p.delay / 1000, from: p.staggerFrom })
    let revealed = completedText === p.text
    let intro = null
    let busy = null
    let queued = null
    let raf = 0
    let last = 0
    let centers = null
    const lift = em * 0.2
    const springs = []
    const kicks = []
    const pointer = { x: 0, y: 0, inside: false }

    const reveal = (initial, vars) => {
      const accent = props.accentColor
      const tl = gsap.timeline(vars)
      tl.fromTo(pieces, { ...fromVars, willChange: 'transform, opacity' },
        { ...toVars, duration: p.duration, ease: easing, stagger: order, immediateRender: initial }, 0)
      if (accent) {
        tl.fromTo(pieces, { color: accent },
          { color: getComputedStyle(node).color, duration: p.duration * 0.7, ease: 'power1.inOut', stagger: order, immediateRender: initial },
          p.duration * 0.3)
      }
      tl.set(pieces, { clearProps: accent ? `${settle},color` : settle })
      return tl
    }

    const conceal = () => {
      const accent = props.accentColor
      const tl = gsap.timeline()
      tl.fromTo(pieces, { ...toVars, willChange: 'transform, opacity' },
        { ...fromVars, duration: exit, ease: 'power2.in', stagger: order, immediateRender: false }, 0)
      if (accent) tl.to(pieces, { color: accent, duration: exit, ease: 'power1.in', stagger: order }, 0)
      return tl
    }

    const cycle = () => {
      if (busy || !revealed || !pieces.length) return
      queued?.kill()
      queued = null
      busy = gsap.timeline({ onComplete: () => { busy = null; queue() } })
        .add(conceal(), 0)
        .add(reveal(false), exit)
    }

    const queue = () => {
      queued?.kill()
      queued = p.loop ? gsap.delayedCall(p.loopDelay, cycle) : null
    }

    const measure = () => {
      const box = node.getBoundingClientRect()
      centers = movers.map((m, i) => {
        const rect = m.getBoundingClientRect()
        return { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top - (springs[i]?.y || 0) }
      })
    }

    const tick = (now) => {
      raf = 0
      const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000))
      last = now
      const spots = props.hoverEffect === 'lift' && pointer.inside && revealed ? centers : null
      const radius = em * 1.15
      let moving = false
      for (let k = kicks.length - 1; k >= 0; k--) {
        if (now < kicks[k].at) continue
        const spring = springs[kicks[k].index]
        if (spring) spring.v -= kicks[k].velocity
        kicks.splice(k, 1)
      }
      movers.forEach((m, i) => {
        const spring = springs[i] || (springs[i] = { y: 0, v: 0 })
        const spot = spots?.[i]
        let target = 0
        if (spot) {
          const dx = (spot.x - pointer.x) / radius
          const dy = (spot.y - pointer.y) / (radius * 1.4)
          target = -lift * Math.exp(-(dx * dx + dy * dy) * 0.5)
        }
        spring.v += (STIFFNESS * (target - spring.y) - DAMPING * spring.v) * dt
        spring.y += spring.v * dt
        if (Math.abs(target - spring.y) < 0.02 && Math.abs(spring.v) < 0.05) {
          spring.y = target
          spring.v = 0
        } else {
          moving = true
        }
        m.style.translate = Math.abs(spring.y) > 0.01 ? `0 ${spring.y.toFixed(2)}px` : ''
      })
      if (moving || kicks.length) raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }

    const locate = (e) => {
      const box = node.getBoundingClientRect()
      pointer.x = e.clientX - box.left
      pointer.y = e.clientY - box.top
    }

    const onEnter = (e) => {
      locate(e)
      pointer.inside = true
      if (!revealed) return
      if (props.trigger === 'hover') cycle()
      if (props.hoverEffect === 'none') return
      measure()
      if (props.hoverEffect === 'wave') {
        const now = performance.now()
        const speed = em * 9
        const velocity = (em * 0.16) / KICK
        centers.forEach((center, index) => {
          kicks.push({ index, velocity, at: now + (Math.abs(center.x - pointer.x) / speed) * 1000 })
        })
      }
      wake()
    }

    const onMove = (e) => {
      locate(e)
      pointer.inside = true
      if (!revealed || props.hoverEffect !== 'lift') return
      if (!centers) measure()
      wake()
    }

    const onLeave = () => {
      pointer.inside = false
      wake()
    }

    const onClick = () => {
      if (props.trigger === 'click') cycle()
    }

    const splitInstance = new GSAPSplitText(node, {
      type: p.splitType,
      smartWrap: true,
      autoSplit: p.splitType === 'lines',
      mask: p.mask ? unit : undefined,
      linesClass: 'split-line',
      wordsClass: 'split-word',
      charsClass: 'split-char',
      reduceWhiteSpace: false,
      onSplit: (self) => {
        pieces = [self[unit], self.chars, self.words, self.lines].find((list) => list.length) || []
        movers = p.mask && self.masks?.length === pieces.length ? self.masks : pieces
        order = gsap.utils.distribute({ each: p.delay / 1000, from: p.staggerFrom })
        centers = null
        springs.length = 0
        kicks.length = 0
        if (busy && busy !== intro) {
          busy.kill()
          busy = null
        }
        if (revealed) return undefined
        intro = reveal(true, {
          scrollTrigger: p.trigger === 'load' ? undefined : { trigger: node, start, once: true, fastScrollEnd: true, anticipatePin: 0.4 },
          onComplete: () => {
            revealed = true
            intro = null
            busy = null
            finish()
            queue()
          },
        })
        busy = intro
        return intro
      },
    })
    ready.value = true
    if (revealed) queue()

    node.addEventListener('pointerenter', onEnter)
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    node.addEventListener('click', onClick)

    cleanup = () => {
      cancelAnimationFrame(raf)
      queued?.kill()
      busy?.kill()
      node.removeEventListener('pointerenter', onEnter)
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('click', onClick)
      movers.forEach((m) => { m.style.translate = '' })
      ScrollTrigger.getAll().forEach((st) => { if (st.trigger === node) st.kill() })
      splitInstance.revert()
    }
  }, node)

  const inner = cleanup
  cleanup = () => {
    inner?.()
    ctx.revert()
  }
}

// Like the original's effect on fontsLoaded: every time fonts are loading,
// wait for them once more (document.fonts.ready is a new promise each time).
let waiting = false
function waitForFonts() {
  if (fontsLoaded.value || waiting || typeof document === 'undefined' || !document.fonts) return
  waiting = true
  document.fonts.ready.then(() => {
    waiting = false
    fontsLoaded.value = true
  })
}

function teardown() {
  cleanup?.()
  cleanup = null
}

onMounted(() => {
  waitForFonts()
  setup()
})
onBeforeUnmount(teardown)

// Like the original's dependency list (accentColor and hoverEffect are read
// live, so they need no restart). A new text gets a new element (the key),
// so wait for it before splitting.
watch(
  () => [props.text, props.delay, props.duration, props.ease, props.splitType, JSON.stringify(props.from), JSON.stringify(props.to),
    props.threshold, props.rootMargin, props.staggerFrom, props.mask, props.effect, props.trigger, props.loop, props.loopDelay, fontsLoaded.value],
  async () => {
    teardown()
    await nextTick()
    setup()
  }
)
</script>
