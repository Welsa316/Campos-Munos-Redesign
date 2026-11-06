<template>
  <!-- One call, or in Needs attention one caller's unanswered calls (an
       episode; c is its latest call). Caller · what happened · received ·
       next step on a wide screen; stacked on a phone, with the next step as
       full-size buttons. -->
  <article class="call-row" :data-call="c.id" :data-episode="episode?.id" :aria-label="`${displayName}, ${summary || status}`"
    :class="c.needsAttention && group !== 'new' ? 'bg-amber-50/30' : ''">
    <div class="call-caller flex items-start gap-3 min-w-0">
      <span :class="c.exclusion ? 'bg-gray-100 text-gray-500' : look.badge"
        class="mt-0.5 w-9 h-9 flex-shrink-0 rounded-full inline-flex items-center justify-center text-sm" :title="look.label">
        <FaIcon :name="look.icon" />
      </span>
      <div class="min-w-0">
        <button type="button" data-row-focus :data-open="c.id" @click="$emit('open', c, $event.currentTarget)"
          class="group/name inline-flex max-w-full items-center gap-1.5 py-2.5 -my-2.5 lg:py-0 lg:my-0 rounded text-left text-[15px] font-ui font-semibold text-gray-900 hover:text-brand-navy">
          <span class="truncate">{{ displayName }}</span>
          <FaIcon name="chevron-right" class="text-[10px] text-gray-400 group-hover/name:text-brand-navy" />
          <span class="sr-only">, open call details</span>
        </button>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-ui text-gray-600">
          <a v-if="c.number" :href="telHref(c.number)" class="tabular-nums hover:text-brand-navy hover:underline">{{ phone(c.number) }}</a>
          <span v-else class="text-gray-500">Number withheld</span>
          <span v-if="!c.name && c.callerLocation" class="text-gray-500">{{ c.callerLocation }}</span>
          <span v-if="c.fromFirm" class="tag bg-gray-100 text-gray-700" title="Marked as someone from the firm for every call from this number">Firm</span>
          <span v-else-if="c.client" class="tag bg-brand-navy/10 text-brand-navy">Client</span>
          <span v-else-if="c.lead" class="tag bg-amber-100 text-amber-900">Website lead</span>
        </p>
      </div>
    </div>

    <div class="call-what min-w-0 font-ui">
      <p class="flex items-start gap-2 text-[13.5px] text-gray-800">
        <span :class="DOT[line?.tone || 'none']" class="mt-[0.45em] w-1.5 h-1.5 rounded-full flex-shrink-0" aria-hidden="true"></span>
        <span :class="summary ? 'line-clamp-3' : 'line-clamp-2'" :title="summary || status">{{ summary || status }}</span>
      </p>
      <p v-if="line" :class="TONE[line.tone]" class="mt-0.5 pl-3.5 text-[12.5px]">{{ line.text }}</p>
      <!-- Several calls: who they were offered to, across all of them; each
           call's own evidence is in the details. -->
      <p v-if="summary && offered" class="mt-0.5 pl-3.5 text-[12px] text-gray-500 truncate">Offered to {{ offered }}</p>
      <p v-else-if="!summary && c.direction === 'inbound' && !c.offeredTo.length && c.firm.extension" class="mt-0.5 pl-3.5 text-[12px] text-gray-500">
        Dialled {{ who({ name: c.firm.name, extension: c.firm.extension }) }}
      </p>
    </div>

    <p class="call-time font-ui text-right lg:text-left tabular-nums">
      <span class="block text-[13px] text-gray-900 whitespace-nowrap">{{ timeOf(c.startedAt) }}</span>
      <span class="block text-[11.5px] text-gray-500 whitespace-nowrap">{{ showDay ? dayName(c.startedAt, now) : duration }}</span>
    </p>

    <div class="call-actions flex items-center justify-end gap-1.5 font-ui">
      <template v-if="open">
        <button v-if="canCall && c.number" type="button" @click="$emit('callback', c)"
          class="act act-call" :aria-label="`Call back ${displayName}`">
          <FaIcon name="phone" />Call back
        </button>
        <span v-else-if="!c.number" class="px-2 text-[11.5px] text-gray-500">No number</span>
        <button v-if="canExclude" type="button" @click="$emit('handled', c)" :disabled="busy" :aria-busy="busy" :data-handled="c.id"
          class="act act-quiet" :aria-label="`Mark ${displayName} handled${summary ? `, all ${episode.attempts} calls` : ''}`">
          <FaIcon :name="busy ? 'spinner' : 'check'" :spin="busy" />{{ busy ? 'Saving…' : 'Handled' }}
        </button>
      </template>
      <template v-else>
        <span v-if="c.exclusion" class="pill bg-gray-100 text-gray-700"><FaIcon name="ban" />No callback needed</span>
        <span v-else-if="line?.tone === 'done'" class="pill bg-green-50 text-green-800"><FaIcon name="circle-check" />{{ c.handled ? 'Handled' : c.connectedFollowUp?.kind === 'called_back' ? 'Called back' : 'Reached later' }}</span>
        <button v-if="canCall && c.number" type="button" @click="$emit('callback', c)" class="act act-quiet" :aria-label="`Call ${displayName}`">
          <FaIcon name="phone" />Call
        </button>
      </template>

      <div class="relative" data-row-menu>
        <button type="button" @click="$emit('menu', c.id)" :data-menu="c.id"
          class="act act-icon" :aria-label="`More actions for ${displayName}`" aria-haspopup="menu" :aria-expanded="menuOpen" :aria-controls="menuOpen ? `call-menu-${c.id}` : null">
          <FaIcon name="ellipsis" />
        </button>
        <Transition name="menu-pop">
          <div v-if="menuOpen" :id="`call-menu-${c.id}`" role="menu" :aria-label="`Actions for ${displayName}`" @keydown="onMenuKey"
            class="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl bg-white ring-1 ring-gray-200 shadow-lg py-1 text-[13px]">
            <button type="button" role="menuitem" class="menu-item" @click="$emit('open', c, menuTrigger())"><FaIcon name="circle-info" />Call details</button>
            <button v-if="canExclude && canMark && !c.exclusion && !c.handled" type="button" role="menuitem" class="menu-item" @click="$emit('exclude', c)"><FaIcon name="ban" />No callback needed</button>
            <button v-if="canExclude && c.exclusion" type="button" role="menuitem" class="menu-item" @click="$emit('count-again', c)"><FaIcon name="rotate-left" />{{ c.exclusion.scope === 'number' ? 'Count this number again' : 'Count it again' }}</button>
            <button v-if="canExclude && c.handled" type="button" role="menuitem" class="menu-item" @click="$emit('reopen', c)"><FaIcon name="rotate-left" />Reopen follow-up</button>
            <router-link v-if="c.lead && canSeeLeads" role="menuitem" class="menu-item" :to="{ name: 'Inbox', query: { lead: c.lead.id } }"><FaIcon name="inbox" />Open website lead</router-link>
          </div>
        </Transition>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import { telHref } from '../../utils/phone.js'
import { statusLine, who } from './callEvidenceText.js'
import { followUpLine, outboundLine, timeOf, dayName, episodeSummary, episodeLine } from './callsInbox.js'
import { look as lookOf, phone, durationText } from './callLook.js'

const props = defineProps({
  c: { type: Object, required: true },
  now: { type: Number, required: true },
  canCall: Boolean,
  canExclude: Boolean,
  canSeeLeads: Boolean,
  // Only calls counted as missed can be marked as needing no callback.
  canMark: Boolean,
  busy: Boolean,
  menuOpen: Boolean,
  // Needs attention spans days, so each row says which; All calls is grouped by day.
  showDay: Boolean,
  // Needs attention: the caller's episode (attempts, first/last, callbacks tried).
  episode: { type: Object, default: null },
})
defineEmits(['open', 'callback', 'handled', 'menu', 'exclude', 'count-again', 'reopen'])

const look = computed(() => lookOf(props.c))
const displayName = computed(() => props.c.name || (props.c.number ? 'Unknown caller' : 'Private number'))
const status = computed(() => (props.c.direction === 'inbound' ? statusLine(props.c) : outboundLine(props.c)))
const line = computed(() => (props.episode ? episodeLine(props.episode, props.now) : followUpLine(props.c, props.now)))
// Open: Needs attention, or the review group (same actions, quieter).
const open = computed(() => props.c.needsAttention || props.c.needsReview)
const group = computed(() => props.episode?.attentionGroup ?? props.c.attentionGroup)
const summary = computed(() => episodeSummary(props.episode, props.now))
const offered = computed(() => (props.episode?.offeredTo || []).map((p) => p.name || who(p)).join(', '))
const duration = computed(() => durationText(props.c.durationSeconds))

const DOT = { open: 'bg-amber-500', done: 'bg-green-500', quiet: 'bg-gray-400', none: 'bg-gray-300' }
const TONE = { open: 'text-amber-800', done: 'text-green-800', quiet: 'text-gray-600' }

const menuTrigger = () => document.querySelector(`[data-menu="${props.c.id}"]`)

// Up and down move through the menu; Escape (handled by the page) closes it.
function onMenuKey(e) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]')]
  const i = items.indexOf(document.activeElement)
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[next]?.focus()
}
</script>

<style scoped>
.call-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "caller time" "what what" "actions actions";
  column-gap: 12px;
  row-gap: 10px;
  padding: 14px 16px;
}
.call-caller { grid-area: caller; }
.call-what { grid-area: what; padding-left: 48px; }
.call-time { grid-area: time; }
.call-actions { grid-area: actions; padding-left: 48px; justify-content: flex-start; }
@media (min-width: 640px) {
  .call-row { padding: 14px 20px; }
}
/* Tablet: next step beside what happened. */
@media (min-width: 768px) {
  .call-row { grid-template-areas: "caller time" "what actions"; }
  .call-actions { padding-left: 0; justify-content: flex-end; align-self: end; }
}
/* Desktop: one line per call, in the four columns of the list header. */
@media (min-width: 1024px) {
  .call-row {
    grid-template-columns: var(--call-cols);
    grid-template-areas: "caller what time actions";
    align-items: center;
    column-gap: 20px;
    padding: 16px 20px;
  }
  .call-what { padding-left: 0; }
  .call-actions { align-self: center; }
}

.tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 4px; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; white-space: nowrap; }

.act {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 44px; padding: 0 14px; border-radius: 10px;
  font-size: 12.5px; font-weight: 600; white-space: nowrap;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}
@media (min-width: 1024px) { .act { min-height: 34px; padding: 0 12px; } }
.act:disabled { opacity: 0.6; cursor: progress; }
.act-call { background: var(--color-green-50); color: var(--success); box-shadow: inset 0 0 0 1px var(--color-green-300); }
.act-call:hover { background: color-mix(in srgb, var(--success) 18%, var(--success-soft)); }
.act-quiet { color: var(--text-strong); }
.act-quiet:hover:not(:disabled) { background: var(--surface-hover, var(--color-gray-50)); color: var(--text-primary); }
.act-icon { width: 44px; padding: 0; justify-content: center; color: var(--text-secondary); }
@media (min-width: 1024px) { .act-icon { width: 34px; } }
.act-icon:hover, .act-icon[aria-expanded="true"] { background: var(--surface-hover, var(--color-gray-50)); color: var(--text-primary); }

.menu-item { display: flex; width: 100%; align-items: center; gap: 10px; padding: 10px 14px; text-align: left; color: var(--text-strong); font-weight: 500; }
.menu-item:hover, .menu-item:focus-visible { background: var(--surface-hover, var(--color-gray-50)); color: var(--text-primary); outline: none; }
.menu-item :deep(svg) { width: 14px; color: var(--text-muted); }

.menu-pop-enter-active, .menu-pop-leave-active { transition: opacity 160ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
.menu-pop-enter-from, .menu-pop-leave-to { opacity: 0; transform: translateY(-4px) scale(0.97); }
@media (prefers-reduced-motion: reduce) {
  .menu-pop-enter-active, .menu-pop-leave-active { transition: opacity 120ms ease; }
  .menu-pop-enter-from, .menu-pop-leave-to { transform: none; }
}
</style>
