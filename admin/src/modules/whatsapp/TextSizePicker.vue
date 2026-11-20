<template>
  <!-- How large this person reads chats. Each step shows its own "A" at the
       size it gives, so the choice is visible before it is made; the chat
       behind changes as soon as one is picked. Saved to the account. -->
  <div ref="rootEl" class="relative" @keydown.esc.stop="close(true)">
    <button ref="buttonEl" type="button" @click="toggle" :aria-expanded="open" aria-controls="wa-text-size"
      :title="t('size.button')"
      class="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-ui font-semibold text-gray-600 hover:text-brand-navy hover:bg-brand-surface transition-colors">
      <span aria-hidden="true" class="leading-none"><span class="text-[11px]">A</span><span class="text-[15px]">A</span></span>
      <span class="sr-only sm:not-sr-only">{{ t('size.button') }}</span>
    </button>

    <!-- Placed against the window, not the button: the button is not at the
         edge of the header, so lining up with it ran off a phone's screen. -->
    <div v-if="open" id="wa-text-size" role="group" aria-labelledby="wa-text-size-heading" :style="panelStyle"
      class="fixed z-30 w-[min(19rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-lg ring-1 ring-gray-200 p-4 font-ui">
      <p id="wa-text-size-heading" class="text-[13px] font-semibold text-gray-900">{{ t('size.heading') }}</p>
      <div class="mt-3 grid grid-cols-5 gap-1 bg-brand-surface rounded-xl p-1">
        <label v-for="s in TEXT_SIZES" :key="s.key"
          :class="current === s.key ? 'bg-white shadow-sm text-brand-navy ring-1 ring-brand-navy/30' : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'"
          class="relative h-12 flex items-end justify-center pb-2 rounded-lg cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-navy">
          <input type="radio" name="wa-text-size" class="sr-only" :value="s.key" :checked="current === s.key" @change="choose(s.key)" />
          <span aria-hidden="true" class="font-semibold leading-none" :style="{ fontSize: `${s.px}px` }">A</span>
          <span class="sr-only">{{ t(`size.${s.key}`) }}</span>
        </label>
      </div>
      <p class="mt-2 text-[13px] text-gray-900 font-medium" aria-live="polite">{{ t(`size.${current}`) }}</p>
      <p class="mt-1 text-[12px] text-gray-600 leading-snug">{{ t('size.help') }}</p>
      <p v-if="error" role="alert" class="mt-2 text-[12px] text-brand-red">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuth, setTextSize } from '../../composables/useAuth.js'
import { useApi } from '../../composables/useApi.js'
import { TEXT_SIZES } from '../../data/textSizes.js'
import { useT } from '../../i18n/translator.js'
import { WHATSAPP } from '../../i18n/whatsapp.js'

const { profile } = useAuth()
const { put } = useApi()
const { t } = useT(WHATSAPP)

const open = ref(false)
const error = ref('')
const rootEl = ref(null)
const buttonEl = ref(null)
const panelStyle = ref({})
const GUTTER = 16

// Right edge under the button's right edge where it fits; otherwise pushed
// in so a 16px margin stays on both sides.
function place() {
  const b = buttonEl.value?.getBoundingClientRect()
  if (!b) return
  const width = Math.min(19 * 16, window.innerWidth - 2 * GUTTER)
  const left = Math.max(GUTTER, Math.min(b.right - width, window.innerWidth - GUTTER - width))
  panelStyle.value = { top: `${Math.round(b.bottom + 6)}px`, left: `${Math.round(left)}px` }
}

function toggle() {
  if (!open.value) place()
  open.value = !open.value
}
const onResize = () => { if (open.value) place() }
const current = computed(() => profile.value.textSize)

// Shown at once; saved behind it. A failed save keeps the size on screen
// (the person can still read) and says it was not kept.
let saving = 0
async function choose(key) {
  error.value = ''
  setTextSize(key)
  const mine = ++saving
  try {
    await put('/api/auth/text-size', { size: key })
  } catch {
    if (mine === saving) error.value = t('size.save_failed')
  }
}

function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) buttonEl.value?.focus()
}

// A click anywhere else closes it, like the emoji panel.
const onDocPointer = (e) => { if (open.value && rootEl.value && !rootEl.value.contains(e.target)) close() }
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  window.removeEventListener('resize', onResize)
})
</script>
