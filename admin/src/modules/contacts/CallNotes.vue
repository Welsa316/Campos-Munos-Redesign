<template>
  <!-- Internal notes about this caller, written from Calls. Staff only:
       never sent to the client or through any phone or email system. -->
  <div class="font-ui" data-call-notes>
    <h3 class="label">Notes <span class="font-normal normal-case tracking-normal text-gray-500">· staff only</span></h3>
    <p v-if="loading" class="mt-2 text-[13px] text-gray-500"><FaIcon name="spinner" spin class="mr-1.5" />Loading…</p>
    <p v-else-if="loadError" class="mt-2 text-[13px] text-gray-600">Could not load the notes. <button type="button" class="font-semibold text-brand-navy underline" @click="load">Try again</button></p>
    <ol v-else-if="notes.length" class="mt-2 space-y-2">
      <li v-for="n in notes" :key="n.id" class="rounded-xl bg-gray-50 ring-1 ring-gray-200 px-3.5 py-2.5">
        <template v-if="editing === n.id">
          <label :for="`note-edit-${n.id}`" class="sr-only">Edit note</label>
          <textarea :id="`note-edit-${n.id}`" v-model="draft" rows="2" maxlength="5000" class="field" @keydown="onKey($event, () => saveEdit(n))"></textarea>
          <div class="mt-2 flex gap-2">
            <button type="button" class="btn btn-primary" :disabled="busy || !draft.trim()" @click="saveEdit(n)">{{ busy ? 'Saving…' : 'Save' }}</button>
            <button type="button" class="btn btn-quiet" @click="editing = null">Cancel</button>
          </div>
        </template>
        <template v-else>
          <p class="text-[13.5px] text-gray-900 whitespace-pre-line break-words">{{ n.body }}</p>
          <p class="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-gray-500 tabular-nums">
            <span>{{ n.author || 'A former user' }} · {{ when(n.createdAt) }}<template v-if="n.edited"> · edited</template></span>
            <template v-if="n.mine && canWrite">
              <button type="button" class="font-semibold text-brand-navy hover:underline" @click="startEdit(n)">Edit</button>
              <button type="button" class="font-semibold text-brand-red hover:underline" @click="confirming = n.id">Delete</button>
            </template>
            <button v-else-if="canDeleteAny" type="button" class="font-semibold text-brand-red hover:underline" @click="confirming = n.id">Delete</button>
          </p>
          <ConfirmInline v-if="confirming === n.id" class="mt-2" title="Delete this note?" body="It is kept in the audit trail, but nobody will see it here." confirm-label="Delete note" :busy="busy" @confirm="remove(n)" @cancel="confirming = null" />
        </template>
      </li>
    </ol>
    <p v-else class="mt-2 text-[13px] text-gray-600">No notes yet.</p>

    <form v-if="canWrite" class="mt-3" @submit.prevent="add">
      <label :for="`note-new-${callId}`" class="sr-only">Add a note</label>
      <textarea :id="`note-new-${callId}`" v-model="body" rows="2" maxlength="5000" placeholder="Add a note, e.g. “Wants to speak to the attorney”" class="field" @keydown="onKey($event, add)"></textarea>
      <div class="mt-2 flex items-center gap-2">
        <button type="submit" class="btn btn-primary" :disabled="busy || !body.trim()">{{ busy && !editing ? 'Saving…' : 'Save note' }}</button>
        <span class="text-[12px] text-gray-500 hidden sm:inline">Ctrl+Enter to save</span>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useApi } from '../../composables/useApi.js'
import { toast } from '../../composables/useToast.js'
import FaIcon from '../../components/FaIcon.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'
import { when as whenOf } from '../calls/callsInbox.js'

const props = defineProps({
  callId: { type: Number, required: true },
  canWrite: Boolean,
  canDeleteAny: Boolean,
})
const emit = defineEmits(['changed'])
const { get, post, del, patch } = useApi()

const notes = ref([])
const loading = ref(true)
const loadError = ref(false)
const body = ref('')
const busy = ref(false)
const editing = ref(null)
const draft = ref('')
const confirming = ref(null)
const when = (d) => whenOf(d)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    notes.value = (await get(`/api/contacts/notes?callId=${props.callId}`)).notes
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}
watch(() => props.callId, () => { body.value = ''; editing.value = null; confirming.value = null; load() }, { immediate: true })

// Ctrl/Cmd+Enter saves; plain Enter is a new line. Never mid-IME.
function onKey(e, fn) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); fn() } }

async function add() {
  if (!body.value.trim() || busy.value) return
  busy.value = true
  try {
    const n = await post('/api/contacts/notes', { callId: props.callId, body: body.value })
    notes.value = [...notes.value, n]
    body.value = ''
    toast('Note saved.')
    emit('changed')
  } catch (e) {
    toast({ text: `The note was not saved: ${e.message}`, tone: 'error' })
  } finally {
    busy.value = false
  }
}
function startEdit(n) { editing.value = n.id; draft.value = n.body; confirming.value = null }
async function saveEdit(n) {
  if (!draft.value.trim() || busy.value) return
  busy.value = true
  try {
    const updated = await patch(`/api/contacts/notes/${n.id}`, { body: draft.value })
    notes.value = notes.value.map((x) => (x.id === n.id ? { ...x, ...updated, author: x.author } : x))
    editing.value = null
    toast('Note updated.')
  } catch (e) {
    toast({ text: `The note was not changed: ${e.message}`, tone: 'error' })
  } finally {
    busy.value = false
  }
}
async function remove(n) {
  busy.value = true
  try {
    await del(`/api/contacts/notes/${n.id}`)
    notes.value = notes.value.filter((x) => x.id !== n.id)
    confirming.value = null
    toast('Note deleted.')
    emit('changed')
  } catch (e) {
    toast({ text: `The note was not deleted: ${e.message}`, tone: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.label { font-family: var(--font-ui); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); }
.field { width: 100%; padding: 10px 12px; border-radius: 10px; background: var(--input-bg, var(--surface)); color: var(--text-primary); box-shadow: inset 0 0 0 1px var(--input-border, var(--border)); font-size: 14px; resize: vertical; }
.field:focus { outline: 2px solid var(--primary-ring); outline-offset: 1px; }
.btn { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: var(--text-on-primary); }
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
.btn-quiet { color: var(--text-strong); box-shadow: inset 0 0 0 1px var(--border); }
.btn-quiet:hover { background: var(--surface-hover); }
</style>
