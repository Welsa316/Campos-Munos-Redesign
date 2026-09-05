<template>
  <div class="h-full flex flex-col bg-white">
    <!-- Empty state -->
    <div v-if="!submission" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-envelope-open text-4xl text-gray-200 mb-4"></i>
        <p class="text-gray-500 font-ui text-sm">Select a message to view</p>
      </div>
    </div>

    <template v-else>
      <!-- Contact info header -->
      <div class="p-6 border-b border-gray-100 flex-shrink-0">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h2 class="font-heading text-2xl text-gray-900">{{ submission.first_name }} {{ submission.last_name }}</h2>
              <span v-if="submission.source === 'chat'" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy text-[10px] font-ui font-semibold uppercase tracking-wider">
                <i class="fa-solid fa-comment-dots text-[10px]"></i>
                Chat
              </span>
            </div>
            <div class="flex items-center gap-4 text-sm font-ui">
              <a :href="'mailto:' + submission.email" class="text-brand-navy hover:text-brand-navy-light transition-colors">
                <i class="fa-solid fa-envelope mr-1.5 text-xs"></i>{{ submission.email }}
              </a>
              <a :href="telHref(submission.phone)" class="text-brand-navy hover:text-brand-navy-light transition-colors">
                <i class="fa-solid fa-phone mr-1.5 text-xs"></i>{{ formatPhone(submission.phone) }}
              </a>
            </div>
            <div class="flex items-center gap-3 text-xs font-ui mt-2">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-navy/10 text-brand-navy font-semibold uppercase tracking-wider">
                <i class="fa-solid fa-briefcase text-[10px]"></i>
                {{ consultationLabel(submission.consultation_type) }}
              </span>
              <span v-if="submission.location" class="inline-flex items-center gap-1.5 text-gray-500">
                <i class="fa-solid fa-location-dot text-[10px]" aria-hidden="true"></i>
                {{ formatCountry(submission.location) }}
              </span>
            </div>

            <!-- Pipeline status -->
            <div class="relative mt-3 inline-block">
              <button
                @click.stop="statusOpen = !statusOpen"
                :aria-expanded="statusOpen"
                aria-label="Change lead status"
                :class="statusMeta(submission.status).pill"
                class="inline-flex items-center gap-2 text-xs font-ui font-semibold px-3 py-1.5 rounded-full ring-1 transition-transform active:scale-95"
              >
                <span :class="statusMeta(submission.status).dot" class="w-2 h-2 rounded-full" aria-hidden="true"></span>
                {{ statusMeta(submission.status).label }}
                <i class="fa-solid fa-chevron-down text-[9px] opacity-60" aria-hidden="true"></i>
              </button>
              <div v-if="statusOpen"
                class="absolute left-0 top-full mt-1 z-30 w-52 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 py-1">
                <button
                  v-for="st in LEAD_STATUSES"
                  :key="st.key"
                  @click.stop="pickStatus(st.key)"
                  class="w-full text-left px-3 py-2 hover:bg-brand-surface transition-colors flex items-center gap-2"
                >
                  <span :class="st.dot" class="w-2 h-2 rounded-full flex-shrink-0" aria-hidden="true"></span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-xs font-ui font-semibold text-gray-800">{{ st.label }}</span>
                    <span class="block text-[10px] text-gray-500 font-ui leading-tight">{{ st.hint }}</span>
                  </span>
                  <i v-if="submission.status === st.key" class="fa-solid fa-check text-[10px] text-brand-navy" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="!submission.is_read" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-red/10 text-brand-red text-xs font-ui font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
              Unread
            </span>
            <button
              v-if="submission.is_read"
              @click="markUnread"
              :disabled="markingUnread"
              class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors"
              title="Mark as unread"
              aria-label="Mark as unread"
            >
              <i class="fa-solid fa-envelope text-sm" aria-hidden="true"></i>
            </button>
            <button
              ref="archiveBtn"
              @click="toggleArchive"
              :disabled="archiving"
              class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors"
              :title="submission.is_archived ? 'Move to Inbox' : 'Archive'"
              :aria-label="submission.is_archived ? 'Move to inbox' : 'Archive'"
            >
              <i :class="submission.is_archived ? 'fa-solid fa-inbox' : 'fa-solid fa-archive'" class="text-sm" aria-hidden="true"></i>
            </button>
            <!-- Back button for mobile -->
            <button v-if="showBack" @click="$emit('back')" aria-label="Back to messages" class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors lg:hidden">
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <p v-if="actionError" role="alert" class="mt-3 text-xs font-ui text-amber-700">
          <i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>{{ actionError }}
        </p>
      </div>

      <!-- Conversation thread -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <template v-for="item in threadItems" :key="`${item.type}-${item.id}`">
          <!-- User message (initial submission or chat follow-up) -->
          <div v-if="item.type === 'user'" class="max-w-[85%]">
            <div class="bg-brand-surface rounded-2xl rounded-tl-sm p-5">
              <p class="text-gray-800 text-sm font-ui leading-relaxed whitespace-pre-wrap">{{ item.body }}</p>
            </div>
            <p class="text-xs text-gray-500 font-ui mt-1.5 ml-1">
              {{ formatDate(item.timestamp) }}
            </p>
          </div>

          <!-- Admin reply -->
          <div v-else-if="item.type === 'reply'" class="flex justify-end">
            <div class="max-w-[85%]">
              <div class="bg-brand-navy/[0.08] rounded-2xl rounded-tr-sm p-5">
                <p class="text-gray-800 text-sm font-ui leading-relaxed whitespace-pre-wrap">{{ item.body }}</p>
              </div>
              <p class="text-xs text-gray-500 font-ui mt-1.5 mr-1 text-right">
                {{ formatDate(item.timestamp) }}
              </p>
            </div>
          </div>
        </template>
      </div>

      <!-- Internal notes: staff-only running log, never sent to the client. -->
      <div class="border-t border-gray-100 flex-shrink-0">
        <button
          @click="notesOpen = !notesOpen"
          :aria-expanded="notesOpen"
          class="w-full flex items-center justify-between px-5 py-2.5 hover:bg-brand-surface transition-colors"
        >
          <span class="flex items-center gap-2 text-xs font-ui font-semibold text-gray-700">
            <i class="fa-solid fa-note-sticky text-brand-navy/70 text-[11px]" aria-hidden="true"></i>
            Internal notes
            <span v-if="notes.length" class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-navy/10 text-brand-navy text-[10px] font-bold">
              {{ notes.length }}
            </span>
          </span>
          <i :class="notesOpen ? 'fa-chevron-up' : 'fa-chevron-down'" class="fa-solid text-[10px] text-gray-400" aria-hidden="true"></i>
        </button>

        <div v-if="notesOpen" class="px-5 pb-4">
          <form @submit.prevent="addNote" class="flex items-start gap-2 mb-3">
            <label for="lead-note" class="sr-only">Add an internal note</label>
            <textarea
              id="lead-note"
              v-model="noteDraft"
              rows="2"
              maxlength="5000"
              :disabled="savingNote"
              placeholder="Log a call, a voicemail, what they need…"
              class="form-input resize-none text-sm flex-1"
              @keydown.enter.exact.prevent="addNote"
            ></textarea>
            <button
              type="submit"
              :disabled="savingNote || !noteDraft.trim()"
              class="bg-brand-navy text-white font-ui font-medium text-xs px-4 py-2.5 rounded-xl btn-magnetic disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none flex-shrink-0"
            >{{ savingNote ? 'Saving…' : 'Add' }}</button>
          </form>

          <p v-if="notes.length === 0" class="text-xs text-gray-400 font-ui italic">
            No notes yet. Anything logged here stays internal.
          </p>
          <ul v-else class="space-y-2 max-h-48 overflow-y-auto">
            <li v-for="note in notes" :key="note.id" class="group bg-brand-surface rounded-lg px-3 py-2 flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-800 font-ui leading-relaxed whitespace-pre-wrap">{{ note.body }}</p>
                <p class="text-[10px] text-gray-500 font-ui mt-1">{{ formatDate(note.created_at) }}</p>
              </div>
              <button
                @click="removeNote(note)"
                :disabled="deletingNoteId === note.id"
                :aria-label="`Delete note from ${formatDate(note.created_at)}`"
                class="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-brand-red hover:bg-brand-red/10 focus-visible:opacity-100 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
              >
                <i :class="deletingNoteId === note.id ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-trash'" class="text-[10px]" aria-hidden="true"></i>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Reply box — keyed by submission so a half-typed draft never carries
           over to a different client when the admin switches messages. -->
      <ReplyBox
        :key="submission.id"
        :submissionId="submission.id"
        @replied="$emit('replied', $event)"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '../../composables/useApi.js'
import { consultationLabel as consultationLabelShared } from '../../data/consultationTypes.js'
import { countryLabel } from '../../data/countries.js'
import { formatPhone, telHref } from '../../utils/phone.js'
import ReplyBox from './ReplyBox.vue'
import { LEAD_STATUSES, statusMeta } from '../../data/leadStatuses.js'

const { t, te, locale } = useI18n()
const consultationLabel = (key) => consultationLabelShared(key, t, te)
const formatCountry = (code) => countryLabel(code, locale.value)

const props = defineProps({
  submission: { type: Object, default: null },
  showBack: { type: Boolean, default: false },
  // Set when the front desk opened this lead via the notes button in the list.
  startWithNotesOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['replied', 'back', 'archived', 'unread', 'setStatus', 'noteAdded'])

const { patch, post, del } = useApi()

// --- Pipeline status ---
const statusOpen = ref(false)
function pickStatus(status) {
  statusOpen.value = false
  if (!props.submission || props.submission.status === status) return
  emit('setStatus', { id: props.submission.id, status })
}
function closeStatusMenu(event) {
  if (event.type === 'keydown' && event.key !== 'Escape') return
  statusOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', closeStatusMenu)
  document.addEventListener('keydown', closeStatusMenu)
})
onUnmounted(() => {
  document.removeEventListener('click', closeStatusMenu)
  document.removeEventListener('keydown', closeStatusMenu)
})

// --- Internal notes ---
const notesOpen = ref(props.startWithNotesOpen)
const noteDraft = ref('')
const savingNote = ref(false)
// Read from the loaded submission so the background poll keeps the log current.
const notes = computed(() => props.submission?.notes || [])

watch(() => props.submission?.id, () => {
  // A different lead is on screen — never carry a half-typed note across.
  noteDraft.value = ''
  savingNote.value = false
  statusOpen.value = false
  notesOpen.value = props.startWithNotesOpen
})
watch(() => props.startWithNotesOpen, (open) => { if (open) notesOpen.value = true })

const deletingNoteId = ref(null)

async function removeNote(note) {
  if (deletingNoteId.value || !props.submission) return
  // A note is a deliberate record, so confirm before it disappears.
  if (!window.confirm('Delete this note? This cannot be undone.')) return
  deletingNoteId.value = note.id
  try {
    await del(`/api/submissions/${props.submission.id}/notes/${note.id}`)
    emit('noteAdded') // reuse the refresh path so the log and count update
  } catch {
    showActionError('Could not delete the note — please try again.')
  } finally {
    deletingNoteId.value = null
  }
}

async function addNote() {
  const body = noteDraft.value.trim()
  if (!body || savingNote.value || !props.submission) return
  savingNote.value = true
  try {
    await post(`/api/submissions/${props.submission.id}/notes`, { body })
    noteDraft.value = ''
    emit('noteAdded')
  } catch {
    showActionError('Could not save the note — please try again.')
  } finally {
    savingNote.value = false
  }
}
const archiving = ref(false)
const markingUnread = ref(false)
const actionError = ref('')
const archiveBtn = ref(null)

let errorTimer = null
function showActionError(msg) {
  actionError.value = msg
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => { actionError.value = '' }, 5000)
}
onBeforeUnmount(() => { if (errorTimer) clearTimeout(errorTimer) })

// Re-flag a message the admin already opened (opening auto-marks it read) so it
// resurfaces as unread for whoever reads the inbox next.
async function markUnread() {
  if (!props.submission || markingUnread.value) return
  markingUnread.value = true
  actionError.value = ''
  try {
    await patch(`/api/submissions/${props.submission.id}/read`, { read: false })
    emit('unread', props.submission.id)
    // The button removes itself once the message is unread — move focus to a
    // stable control so keyboard/AT users don't get dropped to <body>.
    nextTick(() => archiveBtn.value?.focus())
  } catch {
    showActionError('Could not mark as unread — please try again.')
  } finally {
    markingUnread.value = false
  }
}

// Interleave the original message, any follow-up chat messages, and admin replies, all sorted by timestamp.
const threadItems = computed(() => {
  if (!props.submission) return []
  const items = [
    {
      type: 'user',
      id: `initial-${props.submission.id}`,
      body: props.submission.message || '(no message provided)',
      timestamp: props.submission.created_at,
    },
    ...(props.submission.chat_messages || []).map(m => ({
      type: 'user',
      id: `chat-${m.id}`,
      body: m.body,
      timestamp: m.sent_at,
    })),
    ...(props.submission.replies || []).map(r => ({
      type: 'reply',
      id: `reply-${r.id}`,
      body: r.body,
      timestamp: r.sent_at,
    })),
  ]
  return items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
})

async function toggleArchive() {
  if (!props.submission || archiving.value) return
  const wasArchived = props.submission.is_archived
  archiving.value = true
  actionError.value = ''
  try {
    // Send the explicit target state so concurrent/stale tabs converge on the
    // same result instead of flip-flopping through the server's NOT-toggle.
    await patch(`/api/submissions/${props.submission.id}/archive`, { archived: !wasArchived })
    emit('archived')
  } catch {
    showActionError(wasArchived ? 'Could not move to inbox — please try again.' : 'Could not archive — please try again.')
  } finally {
    archiving.value = false
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  if (isToday) return `Today at ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` at ${time}`
}
</script>
