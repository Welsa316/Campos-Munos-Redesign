<template>
  <!-- A smiley button beside a reply box. It opens a small panel of emoji
       above the box; picking one puts it where the caret was, and the panel
       stays open for another. Escape, the button again, or a click outside
       closes it and puts you back in the box to keep typing.

       The panel is positioned against the nearest positioned ancestor (the
       reply form, given `relative`), not against this button, so it lines up
       with the form's right edge and stays on screen on a phone. -->
  <button ref="toggle" type="button" @click="open ? close(true) : show()" :disabled="disabled"
    :aria-expanded="open" :aria-controls="panelId" aria-label="Add an emoji" title="Add an emoji"
    :class="open ? 'bg-brand-surface text-brand-navy' : 'text-gray-500 hover:text-brand-navy hover:bg-brand-surface'"
    class="flex-shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
    <FaIcon name="face-smile" class="text-lg" />
  </button>

  <div v-if="open" :id="panelId" ref="panel" role="dialog" aria-label="Emoji" @keydown.esc.stop.prevent="close(true)" @mousedown="keepFocus"
    class="ep absolute bottom-full right-0 z-30 mb-2 w-[21rem] max-w-full rounded-xl bg-white ring-1 ring-gray-200 shadow-lg p-2 font-ui">
    <!-- Each group is one Tab stop (Recently used, then all); the arrow keys
         move inside a group, Enter or Space puts the emoji in. -->
    <template v-for="group in groups" :key="group.key">
      <p :id="`${panelId}-${group.key}`" class="px-1.5 pt-1 pb-1 text-[11px] font-semibold text-gray-600">{{ group.label }}</p>
      <div role="group" :aria-labelledby="`${panelId}-${group.key}`" class="grid grid-cols-8" @keydown="onGridKey($event, group.items.length)">
        <button v-for="(e, i) in group.items" :key="e" type="button" data-emoji
          :tabindex="i === (group.key === focusGroup ? focusIndex : 0) ? 0 : -1"
          :aria-label="emojiName(e)" :title="emojiName(e)"
          @click="pick(e)" @focus="focusGroup = group.key; focusIndex = i"
          class="ep-emoji aspect-square w-full inline-flex items-center justify-center rounded-lg text-[22px] leading-none hover:bg-brand-surface focus-visible:bg-brand-surface">{{ e }}</button>
      </div>
    </template>
    <p v-if="note" role="status" class="px-1.5 pt-2 pb-1 text-[11px] text-brand-red">{{ note }}</p>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount, useId } from 'vue'
import FaIcon from './FaIcon.vue'
import { EMOJI, insertEmoji, pushRecent, cleanRecent, gridIndex, emojiName, GRID_COLUMNS } from '../utils/emoji.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // The reply's textarea element (a template ref): where the caret is.
  field: { type: Object, default: null },
  maxlength: { type: Number, default: Infinity },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const panelId = `emoji-${useId()}`
const open = ref(false)
const toggle = ref(null)
const panel = ref(null)
const note = ref('')
const focusGroup = ref('all')
const focusIndex = ref(0)

// Recently used, on this computer only: a convenience, so a storage that
// throws (private window, blocked site data) just means no Recent row.
// The row is read when the panel opens and then held still, so the emoji
// under the pointer never move while someone is picking.
const RECENT_KEY = 'cm-recent-emoji'
const readRecent = () => {
  try { return cleanRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')) } catch { return [] }
}
const recent = ref([])

const groups = computed(() => [
  ...(recent.value.length ? [{ key: 'recent', label: 'Recently used', items: recent.value }] : []),
  { key: 'all', label: 'Emoji', items: EMOJI.map((e) => e.char) },
])

// Where the caret was in the box when the panel opened, then after each
// emoji: the box is not focused while the panel is, so read it once and
// carry it forward.
let caret = { start: null, end: null }

function show() {
  recent.value = readRecent()
  const f = props.field
  caret = f ? { start: f.selectionStart, end: f.selectionEnd } : { start: null, end: null }
  note.value = ''
  focusGroup.value = groups.value[0].key
  focusIndex.value = 0
  open.value = true
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('focusin', onFocusIn)
  // preventScroll: the panel is already on screen above the box, and letting
  // the browser "reveal" it scrolled the whole Messages page up and out of
  // its frame.
  nextTick(() => panel.value?.querySelector('[data-emoji]')?.focus({ preventScroll: true }))
}

function close(backToBox = false) {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('focusin', onFocusIn)
  if (!backToBox) return
  nextTick(() => {
    const f = props.field
    if (!f) return toggle.value?.focus({ preventScroll: true })
    f.focus({ preventScroll: true })
    if (caret.start != null) f.setSelectionRange(caret.start, caret.end ?? caret.start)
  })
}

function onOutside(e) {
  if (panel.value?.contains(e.target) || toggle.value?.contains(e.target)) return
  // A click into the reply box itself: let it place the caret there.
  close(false)
}

function pick(char) {
  const out = insertEmoji(props.modelValue, caret.start, caret.end, char, props.maxlength)
  if (!out) {
    note.value = 'The reply is at its length limit.'
    return
  }
  note.value = ''
  emit('update:modelValue', out.value)
  caret = { start: out.caret, end: out.caret }
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(readRecent(), char)))
  } catch { /* no storage: no Recent row */ }
}

// Focus arriving anywhere else on the page closes the panel: Tab on to
// Send, Shift+Tab back to the box, or round through the browser's own bar
// and in again at the top. Switching to another window moves no focus on
// the page, so the panel is still there on return.
function onFocusIn(e) {
  if (panel.value?.contains(e.target) || toggle.value?.contains(e.target)) return
  close(false)
}

// A click on the panel's own background or a heading keeps focus where it
// was, rather than dropping it to the page (which would close the panel).
function keepFocus(e) {
  if (!e.target.closest('button')) e.preventDefault()
}

function onGridKey(e, count) {
  const items = [...e.currentTarget.querySelectorAll('[data-emoji]')]
  const next = gridIndex(e.key, items.indexOf(e.target), count, GRID_COLUMNS)
  if (next === null) return
  e.preventDefault()
  items[next]?.focus({ preventScroll: true })
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('focusin', onFocusIn)
})
</script>

<style scoped>
/* Emoji are drawn by the computer's own emoji font: ask for it by name, so
   a UI font with its own (monochrome) symbols never wins. */
.ep-emoji {
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif;
  min-height: 2.25rem;
}
</style>
