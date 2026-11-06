<template>
  <!-- Remind me: a small panel, not a modal. Floating under the button that
       opened it (a row's ⋯ menu), or in the flow of a card (floating off).
       Quick times, or a date and time; the exact time is shown before
       saving; who it is for; an optional internal note. -->
  <div ref="root" data-reminder-popover role="dialog" :aria-modal="false" :aria-labelledby="`${uid}-title`" @keydown.esc.stop.prevent="$emit('close')"
    :class="floating ? ['rp-floating absolute right-0 z-40 w-[22rem] shadow-lg', above ? 'bottom-full mb-1.5 rp-above' : 'top-full mt-1.5'] : 'w-full'"
    class="rp rounded-xl bg-white ring-1 ring-gray-200 p-4 text-left font-ui text-[13px] text-gray-800">
    <div class="flex items-start gap-2">
      <h3 :id="`${uid}-title`" class="flex-1 font-ui text-[14px] font-semibold text-gray-900">{{ editing ? 'Change reminder' : 'Remind me' }}</h3>
      <button type="button" @click="$emit('close')" aria-label="Close" class="-mr-2 -mt-1.5 w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-800">
        <FaIcon name="xmark" />
      </button>
    </div>

    <fieldset class="mt-2">
      <legend class="sr-only">When</legend>
      <div class="grid grid-cols-2 gap-1.5">
        <label v-for="c in choices" :key="c.key" :class="choice === c.key ? 'rp-picked' : 'ring-1 ring-gray-200 hover:bg-gray-50'"
          class="rp-choice relative flex items-center min-h-11 px-3 rounded-lg cursor-pointer">
          <input v-model="choice" type="radio" :name="`${uid}-when`" :value="c.key" class="sr-only" />
          <span class="font-medium">{{ c.label }}</span>
        </label>
      </div>
      <div v-if="choice === 'pick'" class="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
        <label class="block">
          <span class="sr-only">Date</span>
          <input v-model="pickDate" type="date" :min="minDate" class="rp-input w-full" />
        </label>
        <label class="block">
          <span class="sr-only">Time</span>
          <input v-model="pickTime" type="time" step="300" class="rp-input" />
        </label>
      </div>
    </fieldset>

    <!-- Not a live region itself: "In 1 hour" moves with the clock, and
         a region would re-read it every half minute. What is said is only
         what follows from the person's own choice (spoken, below). -->
    <p class="mt-2.5 flex items-center gap-2 text-[13px]">
      <FaIcon name="clock" class="text-gray-400" />
      <span v-if="problem" class="text-brand-red">{{ problem }}</span>
      <span v-else><span class="text-gray-600">Due</span> <strong class="font-semibold text-gray-900 tabular-nums">{{ formatDue(dueAt) }}</strong></span>
    </p>
    <span class="sr-only" aria-live="polite">{{ spoken }}</span>

    <label class="mt-3 block">
      <span class="rp-label">For</span>
      <select v-model="assignee" class="rp-input w-full" :disabled="!accounts.length">
        <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.id === me ? `${a.name} (me)` : a.name }}</option>
      </select>
    </label>

    <label class="mt-3 block">
      <span class="rp-label">Note <span class="normal-case tracking-normal font-normal text-gray-500">optional, only staff see it</span></span>
      <textarea v-model="note" rows="2" maxlength="500" class="rp-input w-full py-2 resize-y min-h-[2.75rem]"></textarea>
    </label>

    <!-- Already one for this person, or changed by someone else meanwhile. -->
    <div v-if="clash" role="alert" class="mt-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2.5 text-[12.5px] text-amber-900">
      <p>{{ clash.text }}</p>
      <div v-if="clash.kind === 'duplicate'" class="mt-2 flex flex-wrap gap-2">
        <button type="button" @click="editExisting" class="rp-btn rp-quiet">Change that one</button>
        <button type="button" @click="save(true)" class="rp-btn rp-quiet">Add another</button>
      </div>
    </div>
    <p v-if="error" role="alert" class="mt-3 text-[12.5px] text-brand-red">{{ error }}</p>

    <div class="mt-4 flex items-center justify-end gap-2">
      <button type="button" @click="$emit('close')" class="rp-btn rp-quiet">Cancel</button>
      <button type="button" @click="save(false)" :disabled="saving || Boolean(problem)" :aria-busy="saving" class="rp-btn rp-primary">
        <FaIcon :name="saving ? 'spinner' : 'bell'" :spin="saving" />{{ saving ? 'Saving…' : editing ? 'Save' : 'Set reminder' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, useId } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import { dueChoices, formatDue, toInputs, fromInputs, dueProblem, nextBusinessMorning } from './dueChoices.js'
import { remindersApi } from './remindersApi.js'
import { loadAssignees } from './assignees.js'

const props = defineProps({
  // { kind: 'call' | 'submission', id }
  target: { type: Object, required: true },
  // Changing an existing reminder; otherwise a new one.
  reminder: { type: Object, default: null },
  floating: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'saved'])
const uid = `rp-${useId()}`
const root = ref(null)
const above = ref(false)

// The clock the quick choices count from; moves while the panel is open.
const now = ref(Date.now())
let tick = null
const choices = computed(() => [...dueChoices(now.value).map((c) => ({ key: c.key, label: c.label })), { key: 'pick', label: 'Pick date and time' }])

const current = ref(props.reminder)
const editing = computed(() => Boolean(current.value))
const choice = ref(current.value ? 'pick' : 'in_60')
const start = toInputs(current.value ? current.value.dueAt : nextBusinessMorning(now.value))
const pickDate = ref(start.date)
const pickTime = ref(start.time)
const minDate = computed(() => toInputs(now.value).date)
const note = ref(current.value?.note || '')
const accounts = ref([])
const me = ref(null)
const assignee = ref(current.value?.assignee?.id ?? null)
const saving = ref(false)
const error = ref('')
const clash = ref(null)

const dueAt = computed(() => {
  if (choice.value === 'pick') return fromInputs(pickDate.value, pickTime.value)
  return dueChoices(now.value).find((c) => c.key === choice.value)?.at || null
})
const problem = computed(() => dueProblem(dueAt.value, now.value))

function fill(r) {
  current.value = r
  const at = toInputs(r.dueAt)
  choice.value = 'pick'
  pickDate.value = at.date
  pickTime.value = at.time
  note.value = r.note || ''
  assignee.value = r.assignee?.id ?? assignee.value
}

onMounted(async () => {
  tick = setInterval(() => { now.value = Date.now() }, 30 * 1000)
  document.addEventListener('pointerdown', onOutside, true)
  nextTick(() => {
    // Near the bottom of the screen, open upwards instead (wide screens; a phone shows it at the bottom).
    const box = root.value?.getBoundingClientRect()
    if (props.floating && box && window.innerWidth >= 640 && box.bottom > window.innerHeight - 8 && box.top - box.height - 60 > 64) above.value = true
    // The picked choice takes focus, as in any radio group.
    root.value?.querySelector('input[type="radio"]:checked')?.focus({ preventScroll: true })
  })
  try {
    const list = await loadAssignees(props.target.kind)
    accounts.value = list.accounts
    me.value = list.me
    if (assignee.value == null) assignee.value = list.me
    // Assigned to someone no longer listed (disabled since): keep showing them.
    const a = current.value?.assignee
    if (a && !list.accounts.some((x) => x.id === a.id)) accounts.value = [...list.accounts, { id: a.id, name: a.name }]
  } catch (e) {
    error.value = e.message
  }
})
onBeforeUnmount(() => { clearInterval(tick); document.removeEventListener('pointerdown', onOutside, true) })
function onOutside(e) { if (props.floating && root.value && !root.value.contains(e.target) && !e.target.closest?.('[data-reminder-trigger]')) emit('close') }

watch([choice, pickDate, pickTime, assignee], () => { error.value = '' })
// Said once when the person changes the time, never when the clock ticks.
const spoken = ref('')
watch([choice, pickDate, pickTime], () => {
  spoken.value = problem.value || `Due ${formatDue(dueAt.value)}`
})

async function save(allowDuplicate) {
  if (saving.value || problem.value) return
  // The quick choices count from the moment of saving.
  now.value = Date.now()
  const at = dueAt.value
  if (dueProblem(at, now.value)) return
  saving.value = true
  error.value = ''
  try {
    const out = current.value
      ? await remindersApi.update(current.value.id, { version: current.value.version, dueAt: at.toISOString(), assignee: assignee.value, note: note.value })
      : await remindersApi.create({ target: props.target, dueAt: at.toISOString(), assignee: assignee.value, note: note.value, allowDuplicate })
    clash.value = null
    emit('saved', out.reminder, { created: !current.value })
  } catch (e) {
    if (e.code === 'duplicate' && e.data?.reminder) {
      const r = e.data.reminder
      clash.value = { kind: 'duplicate', reminder: r, text: `${r.assignee?.id === me.value ? 'You already have' : `${r.assignee?.name || 'They'} already has`} a reminder for this, due ${formatDue(r.dueAt)}.` }
    } else if (e.code === 'conflict' && e.data?.reminder) {
      fill(e.data.reminder)
      clash.value = { kind: 'conflict', text: 'Someone else changed this reminder meanwhile. It now shows their version; save again to change it.' }
    } else {
      error.value = e.message
    }
  } finally {
    saving.value = false
  }
}

function editExisting() {
  const r = clash.value?.reminder
  clash.value = null
  if (r) fill(r)
}
</script>

<style scoped>
.rp-label { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
/* A field's edge is how it is found: the input tokens (3:1), as in CallNotes. */
.rp-input { min-height: 44px; padding: 0 10px; border-radius: 8px; background: var(--input-bg); color: var(--text-primary); box-shadow: inset 0 0 0 1px var(--input-border); font-size: 13px; }
.rp-input:focus { outline: 2px solid var(--primary-ring); outline-offset: 1px; }
/* A phone zooms into a field under 16px when it takes focus. */
@media (pointer: coarse) { .rp-input { font-size: 16px; } }
/* Picked: filled, with a check-like inner ring; focus: an outline outside it. */
.rp-picked { background: var(--surface-selected); color: var(--text-primary); box-shadow: inset 0 0 0 2px var(--primary-ring); font-weight: 600; }
.rp-choice:has(input:focus-visible) { outline: 2px solid var(--primary-ring); outline-offset: 2px; }
.rp-btn { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 600; transition: background-color 160ms ease, color 160ms ease; }
.rp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.rp-primary { background: var(--primary); color: var(--text-on-primary); }
.rp-primary:hover:not(:disabled) { background: var(--primary-hover); }
.rp-quiet { background: var(--surface); color: var(--text-strong); box-shadow: inset 0 0 0 1px var(--border); }
.rp-quiet:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
@media (min-width: 1024px) {
  .rp-input, .rp-btn { min-height: 36px; }
  .rp-choice { min-height: 38px; }
}
/* On a phone the floating panel sits at the bottom of the screen, full width. */
@media (max-width: 639px) {
  .rp-floating { position: fixed; left: 16px; right: 16px; top: auto; bottom: max(16px, env(safe-area-inset-bottom)); width: auto; max-height: calc(100dvh - 32px); overflow-y: auto; }
}
.rp-floating { animation: rp-in 200ms cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
@keyframes rp-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rp-floating { animation: rp-fade 120ms ease; } }
@keyframes rp-fade { from { opacity: 0; } to { opacity: 1; } }
</style>
