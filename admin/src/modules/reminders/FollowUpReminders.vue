<template>
  <!-- The callback reminders on one caller or lead: when, for whom, the
       note, and Edit / Done / Cancel; Remind me adds one. Each change waits
       for the server before the list shows it. -->
  <section v-if="!compact || canSet || list.length" :aria-labelledby="`${uid}-h`" class="font-ui">
    <div class="flex items-center gap-2">
      <h3 :id="`${uid}-h`" :class="compact && !list.length && !form ? 'sr-only' : 'fr-label flex-1'">Reminders</h3>
      <button v-if="canSet && !form" type="button" data-reminder-trigger @click="openForm(null)" ref="addBtn"
        class="fr-btn fr-quiet"><FaIcon name="bell" />Remind me</button>
    </div>

    <ul v-if="list.length" class="mt-2 space-y-2">
      <li v-for="r in list" :key="r.id" :class="STATE_BOX[dueState(r, now)]" class="rounded-xl px-3.5 py-3">
        <template v-if="form?.reminder?.id !== r.id">
          <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div class="min-w-0 flex-1">
              <p class="text-[13.5px] text-gray-900">
                <FaIcon name="clock" :class="dueState(r, now) === 'upcoming' ? 'text-gray-400' : 'text-amber-700'" class="mr-1.5" />
                <span class="font-semibold tabular-nums">{{ dueLine(r, now) }}</span>
                <span class="text-gray-600"> · {{ r.assignee.id === meId ? 'you' : r.assignee.name }}</span>
              </p>
              <p v-if="r.note" class="mt-1 text-[13px] text-gray-700 whitespace-pre-wrap break-words">{{ r.note }}</p>
              <p v-if="deliveryText(r)" class="mt-1 text-[12px]" :class="deliveryProblem(r) ? 'text-brand-red' : 'text-gray-500'">{{ deliveryText(r) }}</p>
            </div>
            <div v-if="canSet" class="flex items-center gap-1.5">
              <button type="button" @click="openForm(r)" class="fr-btn fr-quiet" :aria-label="`Change the reminder due ${dueLine(r, now)}`"><FaIcon name="pen" />Edit</button>
              <button type="button" @click="finish(r, 'complete')" :disabled="busyId === r.id" class="fr-btn fr-quiet" :aria-label="`Mark the reminder due ${dueLine(r, now)} done`"><FaIcon name="check" />Done</button>
              <button type="button" @click="finish(r, 'cancel')" :disabled="busyId === r.id" class="fr-btn fr-quiet" :aria-label="`Cancel the reminder due ${dueLine(r, now)}`"><FaIcon name="xmark" />Cancel</button>
            </div>
          </div>
        </template>
        <ReminderPopover v-else :target="target" :reminder="r" @close="closeForm" @saved="afterSave" />
      </li>
    </ul>
    <p v-else-if="!form && !compact" class="mt-1 text-[13px] text-gray-600">{{ loading ? 'Loading…' : 'No reminder set.' }}</p>

    <ReminderPopover v-if="form && !form.reminder" class="mt-2" :target="target" @close="closeForm" @saved="afterSave" />
    <p v-if="error" role="alert" class="mt-2 text-[12.5px] text-brand-red">{{ error }}</p>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, useId } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import ReminderPopover from './ReminderPopover.vue'
import { remindersApi } from './remindersApi.js'
import { loadAssignees } from './assignees.js'
import { dueLine, dueState, formatTime } from './dueChoices.js'
import { deliveryNote } from './reminderText.js'
import { toast } from '../../composables/useToast.js'

const props = defineProps({
  // { kind: 'call' | 'submission', id }
  target: { type: Object, required: true },
  // The reminders, when the page already has them (Calls); otherwise this loads them (a lead).
  reminders: { type: Array, default: null },
  canSet: Boolean,
  // In a lead's header: only the Remind me button until there is a reminder.
  compact: Boolean,
})
const emit = defineEmits(['changed'])
const uid = `fr-${useId()}`
const addBtn = ref(null)

const own = ref([])
const loading = ref(false)
const error = ref('')
const list = computed(() => props.reminders ?? own.value)
const form = ref(null)
const busyId = ref(null)
const meId = ref(null)
const now = ref(Date.now())
let tick = null

async function load() {
  if (props.reminders || props.target.kind !== 'submission') return
  loading.value = true
  try {
    own.value = (await remindersApi.forLead(props.target.id)).reminders
    error.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
watch(() => props.target.id, () => { form.value = null; own.value = []; load() })
// Archiving a lead closes its reminders on the server.
watch(() => props.canSet, () => load())
onMounted(() => {
  load()
  tick = setInterval(() => { now.value = Date.now() }, 30 * 1000)
  loadAssignees(props.target.kind).then((a) => { meId.value = a.me }).catch(() => {})
})
onBeforeUnmount(() => clearInterval(tick))

function openForm(r) { error.value = ''; form.value = { reminder: r } }
function closeForm() {
  form.value = null
  nextTick(() => addBtn.value?.focus())
}
async function afterSave(r, { created }) {
  form.value = null
  toast({ text: created ? `Reminder set for ${formatWhen(r)}.` : `Reminder changed to ${formatWhen(r)}.` })
  await refresh()
  nextTick(() => addBtn.value?.focus())
}
const formatWhen = (r) => dueLine(r, Date.now()).replace(/^Due now$/, 'now')

async function finish(r, how) {
  if (busyId.value) return
  busyId.value = r.id
  error.value = ''
  try {
    await (how === 'complete' ? remindersApi.complete(r.id, r.version) : remindersApi.cancel(r.id, r.version))
    toast({ text: how === 'complete' ? 'Reminder done.' : 'Reminder cancelled.' })
    await refresh()
  } catch (e) {
    error.value = e.code === 'conflict' ? 'Someone else changed this reminder meanwhile. Check it and try again.' : e.message
    await refresh()
  } finally {
    busyId.value = null
  }
}
async function refresh() {
  await load()
  emit('changed')
}

const deliveryText = (r) => deliveryNote(r, formatTime)
const deliveryProblem = (r) => ['failed', 'skipped_no_email'].includes(r.delivery?.email?.status) && !r.delivery?.email?.nextAttemptAt
const STATE_BOX = { upcoming: 'bg-gray-50 ring-1 ring-gray-200', due: 'bg-amber-50 ring-1 ring-amber-200', overdue: 'bg-amber-50 ring-1 ring-amber-300' }
</script>

<style scoped>
.fr-label { font-family: var(--font-ui); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.fr-btn { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 12px; border-radius: 10px; font-size: 12.5px; font-weight: 600; white-space: nowrap; transition: background-color 160ms ease, color 160ms ease; }
@media (min-width: 640px) { .fr-btn { min-height: 34px; } }
.fr-btn:disabled { opacity: 0.6; cursor: progress; }
.fr-quiet { background: var(--surface); color: var(--text-strong); box-shadow: inset 0 0 0 1px var(--border); }
.fr-quiet:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
</style>
