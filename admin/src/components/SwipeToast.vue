<template>
  <!-- The portal's toasts (useToast). A port of React Bits Pro's Swipe Toast
       behaviour: they rise in at the bottom, can be swiped sideways to
       dismiss (or closed with the button or Escape), and pause while hovered,
       focused or held. Errors stay until dismissed. -->
  <div class="toast-stack fixed z-[180] inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pointer-events-none font-ui">
    <TransitionGroup name="swipe-toast">
      <div v-for="t in toasts.items" :key="t.id" :role="t.tone === 'error' ? 'alert' : 'status'"
        :class="t.tone === 'error' ? 'bg-brand-red text-white' : 'bg-gray-900 text-white'"
        class="toast-card pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl text-[13px] touch-pan-y select-none"
        :style="drag.id === t.id ? { transform: `translateX(${drag.dx}px)`, opacity: Math.max(0.3, 1 - Math.abs(drag.dx) / 260), transition: 'none' } : null"
        @pointerdown="startDrag(t, $event)" @pointermove="moveDrag" @pointerup="endDrag(t)" @pointercancel="cancelDrag(t)"
        @mouseenter="toastQueue.hold(t.id)" @mouseleave="toastQueue.release(t.id)" @focusin="toastQueue.hold(t.id)" @focusout="toastQueue.release(t.id)"
        @keydown.esc="toastQueue.dismiss(t.id)">
        <FaIcon :name="t.tone === 'error' ? 'circle-exclamation' : t.tone === 'info' ? 'circle-info' : 'circle-check'" class="flex-shrink-0" />
        <span class="flex-1 min-w-0">{{ t.text }}</span>
        <button v-if="t.undo" type="button" @click="runUndo(t)" class="min-h-9 px-2 font-semibold underline">Undo</button>
        <button type="button" @click="toastQueue.dismiss(t.id)" aria-label="Dismiss" class="w-9 h-9 -mr-2 inline-flex items-center justify-center rounded-lg hover:bg-white/10"><FaIcon name="xmark" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import FaIcon from './FaIcon.vue'
import { toasts, toastQueue, toast } from '../composables/useToast.js'

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
async function runUndo(t) {
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
