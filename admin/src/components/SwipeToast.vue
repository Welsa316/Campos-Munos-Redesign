<template>
  <!-- The portal's toasts (useToast). A port of React Bits Pro's Swipe Toast
       behaviour: they rise in at the bottom, can be swiped sideways to
       dismiss (or closed with the button or Escape), and pause while hovered,
       focused or held. Errors stay until dismissed.
       Two live regions are always in the page, one polite and one assertive
       (errors), and each toast is added inside one: a screen reader
       announces text added to a region it already knows, while a region
       inserted together with its text is often missed. -->
  <div ref="stack" class="toast-stack fixed z-(--z-toast) inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pointer-events-none font-ui"
    @focusin="noteOrigin">
    <TransitionGroup v-for="region in REGIONS" :key="region.key" tag="div" name="swipe-toast"
      :role="region.role" :aria-live="region.live" aria-atomic="false" class="w-full flex flex-col items-center gap-2">
      <div v-for="t in region.items()" :key="t.id" :data-toast="t.id"
        :class="t.tone === 'error' ? 'bg-brand-red text-white' : 'bg-gray-900 text-white'"
        class="toast-card pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl text-[13px] touch-pan-y select-none"
        :style="drag.id === t.id ? { transform: `translateX(${drag.dx}px)`, opacity: Math.max(0.3, 1 - Math.abs(drag.dx) / 260), transition: 'none' } : null"
        @pointerdown="startDrag(t, $event)" @pointermove="moveDrag" @pointerup="endDrag(t)" @pointercancel="cancelDrag(t)"
        @mouseenter="toastQueue.hold(t.id)" @mouseleave="toastQueue.release(t.id)" @focusin="toastQueue.hold(t.id)" @focusout="toastQueue.release(t.id)"
        @keydown.esc="close(t)">
        <FaIcon :name="t.tone === 'error' ? 'circle-exclamation' : t.tone === 'info' ? 'circle-info' : 'circle-check'" class="flex-shrink-0" />
        <span class="flex-1 min-w-0">{{ t.text }}</span>
        <button v-if="t.undo" type="button" @click="runUndo(t)" class="min-h-9 px-2 font-semibold underline">Undo</button>
        <button v-if="t.action" type="button" @click="runAction(t)" class="min-h-9 px-2 font-semibold underline">{{ t.action.label }}</button>
        <button type="button" @click="close(t)" aria-label="Dismiss" class="w-9 h-9 -mr-2 inline-flex items-center justify-center rounded-lg hover:bg-white/10"><FaIcon name="xmark" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue'
import FaIcon from './FaIcon.vue'
import { toasts, toastQueue, toast } from '../composables/useToast.js'

const REGIONS = [
  { key: 'alerts', role: 'alert', live: 'assertive', items: () => toasts.items.filter((t) => t.tone === 'error') },
  { key: 'status', role: 'status', live: 'polite', items: () => toasts.items.filter((t) => t.tone !== 'error') },
]

// Where focus was before it moved into a toast, so closing that toast gives
// it back instead of dropping it on the page.
const stack = ref(null)
let origin = null
function noteOrigin(e) {
  const from = e.relatedTarget
  if (from instanceof HTMLElement && !stack.value?.contains(from)) origin = from
}
// Called before a toast leaves: if focus is inside it, move it to the next
// toast still showing, else back where it came from, else the page.
function keepFocus(id) {
  const el = stack.value?.querySelector(`[data-toast="${id}"]`)
  if (!el || !el.contains(document.activeElement)) return
  nextTick(() => {
    const next = [...(stack.value?.querySelectorAll('[data-toast]') || [])].find((x) => x.dataset.toast !== String(id))
    const target = next?.querySelector('button')
      || (origin && document.contains(origin) ? origin : null)
      || document.getElementById('main')
    target?.focus({ preventScroll: true })
  })
}
function close(t) { keepFocus(t.id); toastQueue.dismiss(t.id) }

// Past this many pixels sideways, letting go dismisses the toast.
const SWIPE_AWAY = 80
const drag = reactive({ id: null, x0: 0, dx: 0 })

function startDrag(t, e) {
  if (e.target.closest('button') || e.button > 0) return
  drag.id = t.id
  drag.x0 = e.clientX
  drag.dx = 0
  toastQueue.hold(t.id)
  e.currentTarget.setPointerCapture?.(e.pointerId)
}
function moveDrag(e) { if (drag.id != null) drag.dx = e.clientX - drag.x0 }
function endDrag(t) {
  if (drag.id !== t.id) return
  const away = Math.abs(drag.dx) > SWIPE_AWAY
  drag.id = null
  if (away) toastQueue.dismiss(t.id)
  else toastQueue.release(t.id)
}
function cancelDrag(t) { if (drag.id === t.id) { drag.id = null; toastQueue.release(t.id) } }
async function runAction(t) {
  keepFocus(t.id)
  try { await toastQueue.act(t.id) } catch (e) { toast({ text: e.message || 'Could not open that.', tone: 'error' }) }
}
async function runUndo(t) {
  keepFocus(t.id)
  try { await toastQueue.undo(t.id) } catch (e) { toast({ text: e.message || 'Could not undo that.', tone: 'error' }) }
}
</script>

<style scoped>
.toast-stack { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
@media (min-width: 640px) { .toast-stack { padding-bottom: max(24px, env(safe-area-inset-bottom)); } }
.toast-card { transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease; }
.swipe-toast-enter-active { transition: opacity 220ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1); }
.swipe-toast-leave-active { transition: opacity 180ms ease, transform 220ms ease-in; }
.swipe-toast-enter-from { opacity: 0; transform: translateY(10px); }
.swipe-toast-leave-to { opacity: 0; transform: translateX(40px); }
.swipe-toast-move { transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) {
  .toast-card, .swipe-toast-move { transition: none; }
  .swipe-toast-enter-active, .swipe-toast-leave-active { transition: opacity 120ms ease; }
  .swipe-toast-enter-from, .swipe-toast-leave-to { transform: none; }
}
</style>
