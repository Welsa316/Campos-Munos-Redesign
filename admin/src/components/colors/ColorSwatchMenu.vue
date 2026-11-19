<template>
  <!-- The colour picker: No colour and the ten colours, each named for screen
       readers and on hover. A small panel, not a modal: floating under (or
       over) what opened it. Arrow keys move, Enter or Space picks, Escape
       or a click outside closes; the opener gets focus back. -->
  <div ref="root" role="dialog" :aria-modal="false" :aria-labelledby="`${uid}-t`" data-color-picker
    :class="floating ? ['absolute right-0 z-40', above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'] : ''"
    :style="shift ? { transform: `translateX(${shift}px)` } : null"
    class="csm rounded-xl bg-white ring-1 ring-gray-200 shadow-lg p-3 font-ui text-left"
    @keydown.esc.stop.prevent="close(true)">
    <p :id="`${uid}-t`" class="text-[13px] font-semibold text-gray-900">{{ title }}</p>
    <div role="radiogroup" :aria-labelledby="`${uid}-t`" class="csm-grid mt-2" @keydown="onKey">
      <button v-for="(o, i) in options" :key="o.key ?? 'none'" ref="optionEls" type="button" role="radio"
        :aria-checked="o.key === current" :tabindex="i === focusIndex ? 0 : -1" :title="o.name" :aria-label="o.name"
        :data-swatch="o.key || undefined" :data-color-option="o.key ?? 'none'"
        class="csm-opt" :class="[o.key ? '' : 'csm-none', o.key === current ? 'csm-on' : '']"
        @click="pick(o.key)" @focus="focusIndex = i">
        <FaIcon v-if="o.key === current" name="check" class="csm-check" />
        <FaIcon v-else-if="!o.key" name="ban" class="text-gray-500" />
      </button>
    </div>
    <p class="mt-2 text-[12px] text-gray-600 max-w-[17rem]">{{ t('picker.hint') }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, useId } from 'vue'
import FaIcon from '../FaIcon.vue'
import { ENTRY_COLORS, ensureEntryColorStyles } from '../../data/entryColors.js'
import { COLOURS } from '../../i18n/colours.js'
import { useT } from '../../i18n/translator.js'
import { useApi } from '../../composables/useApi.js'
import { toast } from '../../composables/useToast.js'
import { setEntryColor } from './entryColorStore.js'

const props = defineProps({
  kind: { type: String, required: true }, // 'caller' | 'lead' | 'reminder'
  id: { type: Number, required: true },
  // The number (caller) or id the rows match on; defaults to id.
  match: { type: [String, Number], default: null },
  // The colour shown now (null: none).
  current: { type: String, default: null },
  // Objects on screen that carry this entry's color, updated once saved.
  targets: { type: Array, default: () => [] },
  floating: Boolean,
})
const emit = defineEmits(['close', 'changed'])
const { t } = useT(COLOURS)
const { put } = useApi()
const uid = `csm-${useId()}`
const root = ref(null)
const optionEls = ref([])
const above = ref(false)
const shift = ref(0)

ensureEntryColorStyles()

const options = computed(() => [{ key: null, name: t('none') }, ...ENTRY_COLORS.map((k) => ({ key: k, name: t(`name.${k}`) }))])
const title = computed(() => t(`picker.${props.kind}`))
const focusIndex = ref(Math.max(0, options.value.findIndex((o) => o.key === (props.current || null))))

// Six to a row: the grid's own columns, for Up and Down.
const COLS = 6
function onKey(e) {
  const n = options.value.length
  const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }
  let next = null
  if (e.key in moves) {
    next = focusIndex.value + moves[e.key]
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') next = (next + n) % n
    else next = Math.min(Math.max(next, 0), n - 1)
  } else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  if (next == null) return
  e.preventDefault()
  focusIndex.value = next
  optionEls.value[next]?.focus()
}

function close(restore) { emit('close', { restore }) }

async function pick(key) {
  const color = key || null
  close(true)
  if (color === (props.current || null)) return
  const name = color ? t(`name.${color}`) : null
  const ok = await setEntryColor({
    kind: props.kind, id: props.id, match: props.match ?? props.id, color, targets: props.targets,
    send: (body) => put('/api/colors', body),
    onError: (err) => toast({ text: t('error', { message: err?.message || '' }), tone: 'error' }),
  })
  if (!ok) return
  emit('changed', color)
  if (props.kind === 'caller') toast({ text: color ? t('saved.caller', { name: name.toLocaleLowerCase() }) : t('saved.caller_none') })
}

function onDocPointer(e) {
  if (root.value && !root.value.contains(e.target)) close(false)
}
onMounted(() => {
  // Not cut off by the bottom of the window: open upwards instead. Not off
  // either side (on a phone the ⋯ button sits at the left of the row): slide
  // back inside with a 16px margin.
  if (props.floating && root.value) {
    const r = root.value.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8 && r.top - r.height - 48 > 0) above.value = true
    const vw = document.documentElement.clientWidth
    if (r.left < 16) shift.value = Math.round(16 - r.left)
    else if (r.right > vw - 16) shift.value = Math.round(vw - 16 - r.right)
  }
  nextTick(() => optionEls.value[focusIndex.value]?.focus({ preventScroll: false }))
  // After the click that opened it has finished.
  setTimeout(() => document.addEventListener('pointerdown', onDocPointer, true), 0)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true))
</script>

<style scoped>
.csm { width: max-content; max-width: calc(100vw - 32px); }
.csm-grid { display: grid; grid-template-columns: repeat(6, 44px); gap: 6px; }
@media (min-width: 1024px) { .csm-grid { grid-template-columns: repeat(6, 36px); } }
.csm-opt {
  position: relative; width: 44px; height: 44px; border-radius: 9999px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: box-shadow 140ms ease;
}
@media (min-width: 1024px) { .csm-opt { width: 36px; height: 36px; } }
.csm-none { background: var(--surface); box-shadow: inset 0 0 0 1px var(--border-strong); }
.csm-opt:hover { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--border-strong); }
.csm-none:hover { box-shadow: inset 0 0 0 1px var(--border-strong), 0 0 0 2px var(--surface), 0 0 0 4px var(--border-strong); }
.csm-opt:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--focus-ring); }
.csm-on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text-primary); }
.csm-none.csm-on { box-shadow: inset 0 0 0 1px var(--border-strong), 0 0 0 2px var(--surface), 0 0 0 4px var(--text-primary); }
/* The tick sits on the colour itself: white on a fill, ink on No colour. */
.csm-check { color: #fff; filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.6)); }
.csm-none .csm-check { color: var(--text-primary); filter: none; }
[data-scheme="dark"] .csm-opt[data-swatch] .csm-check { color: #111820; filter: none; }
</style>
