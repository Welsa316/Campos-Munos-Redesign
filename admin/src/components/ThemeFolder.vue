<template>
  <!-- A small folder (palette + "Themes") that grows, in place, into a
       floating panel of miniature dashboards, like an iOS app folder opening.
       Non-modal: the page stays visible and usable around it. -->
  <div ref="rootRef" class="relative">
    <button ref="tileRef" type="button" class="theme-folder group flex flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none"
      :aria-expanded="open" aria-controls="theme-folder-panel" aria-haspopup="dialog" @click="toggle">
      <span ref="tileFaceRef" class="glass w-[52px] h-[52px] rounded-[16px] grid grid-cols-2 gap-[3px] p-[7px] transition-colors duration-200">
        <!-- Four tiny swatches of the palettes on offer, with the palette mark. -->
        <span v-for="t in THEMES.slice(0, 3)" :key="t.key" class="rounded-[5px]" :style="{ background: t.tokens['sidebar-bg'] }"></span>
        <span class="rounded-[5px] bg-white/80 flex items-center justify-center text-brand-navy"><FaIcon name="palette" class="text-[11px]" /></span>
      </span>
      <span class="text-[11px] font-ui font-semibold text-gray-600 group-hover:text-gray-900">Themes</span>
    </button>

    <div v-if="open" id="theme-folder-panel" ref="panelRef" role="dialog" aria-modal="false" aria-labelledby="theme-folder-title"
      class="theme-panel glass absolute right-0 top-0 z-40 w-[min(600px,calc(100vw-2rem))] rounded-[26px] p-4 sm:p-5 font-ui"
      @keydown.esc.stop.prevent="close(true)" @focusout="onFocusOut">
      <div ref="headRef" class="flex items-start justify-between gap-3 mb-3.5 px-1">
        <div>
          <h2 id="theme-folder-title" class="text-[17px] font-semibold tracking-tight text-gray-900">Themes</h2>
          <p class="text-[12px] text-gray-500 mt-0.5">Saved to your account; colleagues keep their own.</p>
        </div>
        <button type="button" @click="close(true)" aria-label="Close themes"
          class="w-8 h-8 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-900/5 flex items-center justify-center transition-colors">
          <FaIcon name="xmark" class="text-sm" />
        </button>
      </div>

      <div ref="gridRef" class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3" role="group" aria-label="Theme" @keydown="onArrows">
        <button v-for="(t, i) in THEMES" :key="t.key" type="button" :data-index="i"
          :aria-pressed="current === t.key" :tabindex="focusIndex === i ? 0 : -1"
          @click="choose(t.key)" @focus="focusIndex = i"
          :class="current === t.key ? 'ring-2 ring-brand-navy' : 'ring-1 ring-gray-900/10 hover:ring-gray-900/25'"
          class="theme-option group/opt text-left rounded-[18px] bg-white/70 p-2 transition-[box-shadow,background-color] duration-200 hover:bg-white/90 hover:ring-1 hover:ring-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
          <!-- Miniature dashboard: rail, greeting, the two summary cards, the section cards. -->
          <span class="block h-[84px] rounded-[12px] overflow-hidden flex"
            :style="{ background: t.tokens['app-bg'], boxShadow: `inset 0 0 0 1px ${t.tokens.border}` }" aria-hidden="true">
            <span class="w-[20%] h-full flex flex-col items-center gap-[5px] pt-2.5" :style="{ background: t.tokens['sidebar-bg'] }">
              <span class="w-2.5 h-2.5 rounded-full bg-white/80"></span>
              <span class="w-3.5 h-[3px] rounded-full bg-white/35"></span>
              <span class="w-3.5 h-[3px] rounded-full bg-white/35"></span>
              <span class="w-3.5 h-[3px] rounded-full bg-white/35"></span>
            </span>
            <span class="flex-1 p-2 flex flex-col gap-[5px] min-w-0">
              <span class="h-[5px] w-[55%] rounded-full" :style="{ background: t.tokens['text-primary'], opacity: 0.75 }"></span>
              <span class="flex gap-[5px] h-[24px]">
                <span class="flex-[7] rounded-[6px]" :style="{ background: t.tokens['error-soft'] }"></span>
                <span class="flex-[5] rounded-[6px]" :style="{ background: t.tokens.primary }"></span>
              </span>
              <span class="flex gap-[5px] flex-1">
                <span v-for="n in 3" :key="n" class="flex-1 rounded-[6px] p-[4px]" :style="{ background: t.tokens.surface, boxShadow: `inset 0 0 0 1px ${t.tokens.border}` }">
                  <span class="block w-[9px] h-[9px] rounded-[3px]" :style="{ background: n === 1 ? t.tokens.accent : n === 2 ? t.tokens.primary : t.tokens['primary-soft'] }"></span>
                </span>
              </span>
            </span>
          </span>
          <span class="block mt-2 px-1 text-[13px] font-semibold text-gray-900 leading-tight">{{ t.name }}</span>
          <span class="block px-1 mt-0.5 text-[11px] text-gray-500 leading-snug min-h-[28px]">{{ t.description }}</span>
          <span v-if="current === t.key" class="flex items-center gap-1 px-1 mt-1 text-[11px] font-semibold text-brand-navy">
            <FaIcon name="circle-check" class="text-[11px]" />Selected
          </span>
        </button>
      </div>
      <p v-if="error" role="alert" class="mt-3 px-1 text-[12px] text-brand-red">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
// Native Vue + GSAP (already in the portal); no React or Motion. The opening
// follows Motion's iOS app-folder example: the panel grows out of the folder
// (a clip-path from the folder's box to the full panel, so nothing inside is
// stretched), the folder fades as it does, and the previews spring in one
// after another. Closing runs it backwards into the folder.
import { ref, nextTick, onBeforeUnmount } from 'vue'
import { gsap } from 'gsap'
import { THEMES, DEFAULT_THEME } from '../data/themes.js'
import { useAuth, setTheme } from '../composables/useAuth.js'
import { rawFetch, goToLogin } from '../composables/useApi.js'
import FaIcon from './FaIcon.vue'

const { profile } = useAuth()
const open = ref(false)
const current = ref(profile.value.theme || DEFAULT_THEME)
const focusIndex = ref(0)
const error = ref('')
const rootRef = ref(null)
const tileRef = ref(null)
const tileFaceRef = ref(null)
const panelRef = ref(null)
const headRef = ref(null)
const gridRef = ref(null)
let tl = null
let busy = false

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The panel's own box, clipped down to where the folder sits.
function folderClip() {
  const p = panelRef.value.getBoundingClientRect()
  const t = tileFaceRef.value.getBoundingClientRect()
  const px = (n) => `${Math.max(0, n).toFixed(1)}px`
  return `inset(${px(t.top - p.top)} ${px(p.right - t.right)} ${px(p.bottom - t.bottom)} ${px(t.left - p.left)} round 16px)`
}
const FULL = 'inset(0px 0px 0px 0px round 26px)'

function toggle() { open.value ? close(true) : show() }

async function show() {
  if (open.value || busy) return
  current.value = profile.value.theme || DEFAULT_THEME
  focusIndex.value = Math.max(0, THEMES.findIndex((t) => t.key === current.value))
  error.value = ''
  open.value = true
  await nextTick()
  document.addEventListener('pointerdown', onOutside, true)
  const panel = panelRef.value
  const items = gridRef.value ? Array.from(gridRef.value.children) : []
  tl?.kill()
  if (reduced()) {
    gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.12 })
  } else {
    busy = true
    // No backdrop blur while the shape is moving: blur under an animating
    // clip and springing children is costly and can render garbage on some
    // GPUs. The panel is nearly opaque, so the switch is not visible.
    panel.classList.add('is-moving')
    tl = gsap.timeline({ onComplete: () => { busy = false; panel.classList.remove('is-moving') } })
      .fromTo(panel, { clipPath: folderClip() }, { clipPath: FULL, duration: 0.55, ease: 'expo.out' }, 0)
      .to(tileFaceRef.value, { opacity: 0, scale: 0.9, duration: 0.18, ease: 'power2.out' }, 0)
      .fromTo(headRef.value, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.12)
      .fromTo(items, { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.5)', stagger: 0.045, clearProps: 'transform' }, 0.14)
  }
  // Focus the chosen theme, so arrows and Enter work straight away.
  items[focusIndex.value]?.focus({ preventScroll: true })
}

function close(returnFocus = false) {
  if (!open.value) return
  document.removeEventListener('pointerdown', onOutside, true)
  const panel = panelRef.value
  const items = gridRef.value ? Array.from(gridRef.value.children) : []
  const finish = () => {
    open.value = false
    busy = false
    gsap.set(tileFaceRef.value, { clearProps: 'opacity,transform' })
    if (returnFocus) tileRef.value?.focus({ preventScroll: true })
  }
  tl?.kill()
  if (reduced() || !panel) {
    finish()
    return
  }
  busy = true
  panel.classList.add('is-moving')
  tl = gsap.timeline({ onComplete: finish })
    .to([headRef.value, ...items], { opacity: 0, duration: 0.14, ease: 'power1.in' }, 0)
    .to(panel, { clipPath: folderClip(), duration: 0.42, ease: 'expo.inOut' }, 0.04)
    .to(tileFaceRef.value, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(1.6)' }, 0.26)
}

function onOutside(e) {
  if (!rootRef.value?.contains(e.target)) close(false)
}
// Tabbing out of the panel closes it, as a popover would.
function onFocusOut(e) {
  if (e.relatedTarget && !rootRef.value?.contains(e.relatedTarget)) close(false)
}

function onArrows(e) {
  const cols = window.matchMedia('(min-width: 640px)').matches ? 3 : 2
  const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -99, End: 99 }
  if (!(e.key in moves)) return
  e.preventDefault()
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? THEMES.length - 1 : Math.min(THEMES.length - 1, Math.max(0, focusIndex.value + moves[e.key]))
  focusIndex.value = next
  gridRef.value?.children[next]?.focus()
}

async function choose(key) {
  if (key === current.value) {
    close(true)
    return
  }
  const previous = current.value
  current.value = key
  error.value = ''
  switchTheme(key)
  try {
    const res = await rawFetch('/api/auth/theme', { method: 'PUT', body: JSON.stringify({ theme: key }) })
    if (res.status === 401) return goToLogin()
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the theme')
  } catch (e) {
    // Put the screen back the way the server has it.
    current.value = previous
    switchTheme(previous)
    error.value = `${e.message}. Your previous theme is back.`
    return
  }
  // Let the new colours settle and the check mark show, then fold away.
  setTimeout(() => close(true), reduced() ? 0 : 420)
}

// Cross-fade every colour on the page while the theme changes.
let switchTimer = null
function switchTheme(key) {
  const root = document.documentElement
  if (!reduced()) {
    root.classList.add('theme-switching')
    clearTimeout(switchTimer)
    switchTimer = setTimeout(() => root.classList.remove('theme-switching'), 260)
  }
  setTheme(key)
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  tl?.kill()
  clearTimeout(switchTimer)
  document.documentElement.classList.remove('theme-switching')
})
</script>

<style>
/* The panel is more opaque than the cards so its text reads over anything. */
.theme-panel.glass.is-moving { -webkit-backdrop-filter: none; backdrop-filter: none; --glass-amount: 96%; }
.theme-panel.glass { --glass-fill: var(--surface-elevated); --glass-amount: 90%; box-shadow: inset 0 1px 0 var(--glass-hi), 0 24px 60px -24px var(--shadow-color), 0 2px 8px var(--shadow-color); }
</style>
