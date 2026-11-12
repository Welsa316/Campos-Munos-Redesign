<template>
  <!-- What the portal has done and will do on its own for this lead
       (submission.automation, from GET /api/submissions/:id), and the few
       things a person decides: who follows it up, whether automatic
       messages may go to it, and whether it is a vendor message.
       Two parts, placed apart on the lead's page (the `show` prop):
       'alerts'  what needs someone now, under the lead's header, always visible
       'panel'   the rest, behind "Automatic follow-up", with the notes and
                 the contact history -->
  <div v-if="a" class="font-ui">
    <!-- Needs a person now. -->
    <div v-if="show === 'alerts' && alerts.length" class="px-6 py-3 space-y-2 border-b border-gray-100" data-lead-alerts>
      <div v-for="al in alerts" :key="al.key" role="status" class="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3.5 py-2.5 text-xs text-amber-900 flex flex-wrap items-center gap-x-3 gap-y-2">
        <FaIcon :name="al.icon" class="text-[12px] flex-shrink-0" />
        <p class="flex-1 min-w-[12rem] leading-relaxed"><span class="font-semibold">{{ al.title }}</span> {{ al.text }}</p>
        <span v-if="canManage && al.actions.length" class="flex flex-wrap gap-2">
          <button v-for="act in al.actions" :key="act.label" type="button" @click="act.run" :disabled="busy"
            :class="act.primary ? 'bg-brand-navy text-white hover:bg-brand-navy-dark' : 'text-gray-700 ring-1 ring-gray-300 bg-white hover:bg-brand-surface'"
            class="min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50">{{ act.label }}</button>
        </span>
      </div>
    </div>

    <div v-if="show === 'panel'" class="border-t border-gray-100">
      <button type="button" @click="open = !open" :aria-expanded="open" :aria-controls="`lead-auto-${submission.id}`"
        class="w-full flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-brand-surface transition-colors">
        <span class="flex items-center gap-2 text-xs font-semibold text-gray-700 min-w-0">
          <FaIcon name="bolt" class="text-brand-navy/70 text-[11px] flex-shrink-0" />
          <span class="flex-shrink-0">Automatic follow-up</span>
          <span class="font-normal text-gray-500 truncate">{{ summary }}</span>
        </span>
        <FaIcon :name="open ? 'chevron-up' : 'chevron-down'" class="text-[10px] text-gray-400 flex-shrink-0" />
      </button>

      <div v-if="open" :id="`lead-auto-${submission.id}`" class="px-5 pb-4 space-y-3">
        <p v-if="why" class="text-xs text-gray-600"><span class="font-semibold text-gray-800">Status:</span> {{ why }}</p>

        <ul v-if="lines.length" class="space-y-1.5">
          <li v-for="l in lines" :key="l.key" class="flex items-start gap-2 text-xs leading-relaxed" :class="TONE[l.tone]">
            <FaIcon :name="l.icon" class="text-[11px] mt-[3px] flex-shrink-0" />
            <span>{{ l.text }}</span>
          </li>
        </ul>
        <p v-else class="text-xs text-gray-500">Nothing automatic has been sent or queued for this lead.</p>

        <div v-if="canManage" class="flex flex-wrap items-end gap-x-4 gap-y-3 pt-1">
          <div>
            <label :for="`lead-owner-${submission.id}`" class="block text-[11px] font-semibold text-gray-700 mb-1">Followed up by</label>
            <select :id="`lead-owner-${submission.id}`" :value="a.owner?.id ?? ''" @change="setOwner($event.target.value)" :disabled="busy"
              class="fld w-56">
              <option value="">The front desk (nobody in particular)</option>
              <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <button v-if="!submission.is_archived" type="button" @click="setPaused(!a.paused)" :disabled="busy" :aria-pressed="a.paused"
            class="inline-flex items-center gap-2 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-gray-300 text-gray-700 hover:bg-brand-surface transition-colors disabled:opacity-50">
            <FaIcon :name="a.paused ? 'play' : 'pause'" class="text-[10px]" />{{ a.paused ? 'Allow automatic messages again' : 'Stop automatic messages to this lead' }}
          </button>
        </div>
        <p v-else-if="a.owner" class="text-xs text-gray-600">Followed up by {{ a.owner.name }}.</p>
        <p v-if="error" role="alert" class="text-xs text-amber-700">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import { useApi } from '../../composables/useApi.js'
import { loadAssignees } from '../reminders/assignees.js'
import { leadAutomationLines, statusWhy, reasonText, jobLabel } from './automationText.js'
import { formatDue } from '../reminders/dueChoices.js'

const props = defineProps({
  submission: { type: Object, required: true },
  canManage: { type: Boolean, default: false },
  show: { type: String, default: 'panel', validator: (v) => ['alerts', 'panel'].includes(v) },
})
// 'changed': something here was saved; the parent reloads the lead.
const emit = defineEmits(['changed'])

const { patch, post, put } = useApi()
const a = computed(() => props.submission.automation || null)
const open = ref(false)
const busy = ref(false)
const error = ref('')
const people = ref([])
const TONE = { quiet: 'text-gray-600', good: 'text-gray-800', warn: 'text-amber-800' }

const lines = computed(() => leadAutomationLines(a.value))
const why = computed(() => statusWhy(a.value))

// The one-line state beside the title: the next thing that matters.
const summary = computed(() => {
  const x = a.value
  if (!x) return ''
  if (x.paused) return 'Stopped for this lead'
  const next = (x.pending || []).find((j) => j.type === 'lead_followup')
  if (next) return `Next text ${formatDue(next.at)}`
  if (x.stopped) return 'Stopped'
  const sent = (x.messages || []).filter((m) => m.status === 'sent').length
  return sent ? `${sent} sent` : 'Nothing queued'
})

async function act(fn, failed) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await fn()
    emit('changed')
  } catch {
    error.value = failed
  } finally {
    busy.value = false
  }
}
const id = () => props.submission.id
const setPaused = (paused) => act(() => patch(`/api/submissions/${id()}/automation`, { paused }), 'Could not change that. Try again.')
const setOwner = (value) => act(() => put(`/api/submissions/${id()}/owner`, { ownerId: value === '' ? null : Number(value) }), 'Could not change who follows this up. Try again.')
const markSpam = (state) => act(() => post(`/api/submissions/${id()}/spam`, { state }), 'Could not save that. Try again.')
const repliesSeen = () => act(() => post(`/api/submissions/${id()}/text-replies/handled`, {}), 'Could not save that. Try again.')

const alerts = computed(() => {
  const x = a.value
  if (!x) return []
  const out = []
  if (x.textReplies?.waiting) {
    out.push({
      key: 'reply', icon: 'comment-dots', title: x.textReplies.waiting > 1 ? `They sent ${x.textReplies.waiting} text replies.` : 'They replied by text.',
      text: 'Read and answer it in RingCentral; the automatic follow-ups have stopped.',
      actions: [{ label: 'Seen to', primary: true, run: repliesSeen }],
    })
  }
  if (x.spam?.state === 'possible') {
    out.push({
      key: 'spam', icon: 'ban', title: 'This may be a vendor message.',
      text: 'A phrase on the firm’s list matched, so nothing automatic is sent to it until someone decides.',
      actions: [{ label: 'Not spam', primary: true, run: () => markSpam('cleared') }, { label: 'Spam', primary: false, run: () => markSpam('spam') }],
    })
  } else if (x.spam?.state === 'spam') {
    out.push({
      key: 'spam', icon: 'ban', title: 'Marked as spam.',
      text: x.spam.reason === 'set_by_staff' ? 'A person marked it.' : 'The sender is on the firm’s vendor list, so it was archived.',
      actions: [{ label: 'Not spam', primary: true, run: () => markSpam('cleared') }],
    })
  }
  for (const f of x.failed || []) {
    // An uncertain send is said as uncertain, not as "not sent".
    out.push(f.reason === 'unknown_delivery'
      ? { key: `f-${f.id}`, icon: 'triangle-exclamation', title: `${jobLabel(f.type)} could not be confirmed.`, text: 'It may or may not have reached them, so it was not sent again. Check RingCentral, or contact them yourself.', actions: [] }
      : { key: `f-${f.id}`, icon: 'triangle-exclamation', title: `${jobLabel(f.type)} was not sent:`, text: `${reasonText(f.reason)}. Contact them yourself.`, actions: [] })
  }
  const cancelled = (x.bookings || []).some((b) => b.status === 'cancelled') && !(x.bookings || []).some((b) => b.status === 'booked')
  if (cancelled && props.submission.status === 'scheduled') {
    out.push({ key: 'booking', icon: 'calendar-xmark', title: 'Their consultation was cancelled on the calendar.', text: 'The status still says Scheduled; change it once you know what happened.', actions: [] })
  }
  return out
})

// A different lead: closed again, and nobody's error carried over.
watch(() => props.submission.id, () => { open.value = false; error.value = '' })
// The list of people is only needed once the panel is open.
watch(open, async (isOpen) => {
  if (!isOpen || people.value.length || !props.canManage) return
  try { people.value = (await loadAssignees('submission')).accounts } catch { /* the select still offers "the front desk" */ }
})
</script>

<style scoped>
.fld {
  padding: 0.4rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary);
  font-family: var(--font-ui); font-size: 12px; line-height: 1.5; min-height: 2.75rem; max-width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
@media (min-width: 640px) { .fld { min-height: 2.125rem; } }
.fld:focus { outline: none; border-color: var(--primary-ring); box-shadow: 0 0 0 2px var(--focus-ring); }
textarea.fld { display: block; }
</style>
