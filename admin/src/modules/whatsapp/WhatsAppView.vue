<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Same shell as the lead inbox: white bar, logo, title, view toggle, actions. -->
    <header class="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img src="/logo.png" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight">WhatsApp</h1>
      </div>
      <div class="ml-auto flex items-center gap-1 sm:gap-3">
        <SectionLinks current="whatsapp" />
        <span class="text-xs text-gray-500 font-ui hidden lg:inline">{{ adminEmail }}</span>
        <button @click="showChangePassword = true" aria-label="Change password" title="Change password"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-key text-xs" aria-hidden="true"></i>
          <span class="hidden lg:inline">Password</span>
        </button>
        <button @click="handleLogout" aria-label="Sign out"
          class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
          <span class="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>

    <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />

    <!-- What sending means right now, before anyone types. -->
    <p v-if="status && !status.sendingEnabled" class="flex-shrink-0 px-4 sm:px-6 py-2 text-xs font-ui text-amber-900 bg-amber-50 border-b border-amber-100">
      <i class="fa-solid fa-circle-pause mr-1.5" aria-hidden="true"></i>
      Sending is switched off. Conversations can be read, assigned and noted; replies wait until an administrator turns WhatsApp sending on.
    </p>
    <p v-else-if="status && status.mode === 'mock'" class="flex-shrink-0 px-4 sm:px-6 py-2 text-xs font-ui text-violet-900 bg-violet-50 border-b border-violet-100">
      <i class="fa-solid fa-flask mr-1.5" aria-hidden="true"></i>
      Simulated sending: replies go to a simulator and no client receives them.
    </p>

    <div v-if="loadingList && !conversations.length" class="flex-1 flex items-center justify-center">
      <p class="text-gray-500 text-sm font-ui"><i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Loading conversations…</p>
    </div>
    <div v-else-if="listError && !conversations.length" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <p class="text-gray-500 text-sm font-ui mb-3">{{ listError }}</p>
        <button @click="loadList()" class="text-brand-navy text-sm font-ui font-medium hover:underline">Try again</button>
      </div>
    </div>

    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Conversation list -->
      <div :class="['w-full lg:w-[380px] lg:flex-shrink-0 flex flex-col bg-white lg:border-r border-gray-200', selectedId ? 'hidden lg:flex' : 'flex']">
        <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <!-- Which conversations: the list's own filter, like Inbox/Archived on leads. -->
          <div class="flex flex-1 min-w-0 bg-brand-surface rounded-lg p-0.5" role="group" aria-label="Which conversations">
            <button v-for="v in VIEWS" :key="v.key" @click="setView(v.key)" :aria-pressed="view === v.key"
              :class="view === v.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'"
              class="flex-1 text-xs font-ui font-medium px-2 py-1.5 rounded-md transition-all whitespace-nowrap">{{ v.label }}</button>
          </div>
          <button @click="refresh" :disabled="loadingList" class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors disabled:opacity-50" aria-label="Refresh conversations">
            <FaIcon name="arrows-rotate" :spin="loadingList" class="text-xs" />
          </button>
        </div>
        <p v-if="conversations.length" class="px-5 pt-3 pb-1 text-[11px] font-ui text-gray-500">{{ conversations.length }} {{ conversations.length === 1 ? 'conversation' : 'conversations' }}</p>
        <p v-if="!conversations.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ EMPTY[view] }}</p>
        <ul v-else class="flex-1 overflow-y-auto divide-y divide-gray-100">
          <li v-for="c in conversations" :key="c.id">
            <button @click="select(c.id)" :aria-current="selectedId === c.id ? 'true' : undefined"
              :class="selectedId === c.id ? 'bg-brand-navy/[0.06]' : 'hover:bg-brand-surface/70'"
              class="w-full text-left px-5 py-3.5 transition-colors">
              <div class="flex items-start gap-3">
                <span :class="c.needsReply ? 'bg-brand-red' : 'bg-transparent'" class="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" aria-hidden="true"></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <p :class="c.needsReply ? 'font-semibold' : 'font-medium'" class="text-sm font-ui text-gray-900 truncate flex-1">{{ c.name || waPhone(c.phone) }}</p>
                    <span class="text-[11px] font-ui text-gray-600 whitespace-nowrap tabular-nums">{{ relTime(c.lastAt) }}</span>
                  </div>
                  <p class="text-xs font-ui text-gray-600 truncate mt-0.5">
                    <span v-if="c.lastDirection === 'out'" class="text-gray-600">You: </span>{{ c.preview || '—' }}
                  </p>
                  <p class="flex items-center gap-2 mt-1.5 text-[11px] font-ui">
                    <span v-if="c.needsReply" class="sr-only">Waiting for a reply.</span>
                    <span v-if="c.assignee" class="inline-flex items-center gap-1 text-brand-navy"><i class="fa-solid fa-user text-[9px]" aria-hidden="true"></i>{{ c.assignee.name }}</span>
                    <span v-else class="text-gray-600">Unassigned</span>
                    <span v-if="c.name" class="text-gray-600 truncate">{{ waPhone(c.phone) }}</span>
                  </p>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </div>

      <!-- Thread -->
      <div :class="['flex-1 flex flex-col min-w-0 bg-white', selectedId ? 'flex' : 'hidden lg:flex']">
        <div v-if="!selectedId" class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <i class="fa-solid fa-comments text-4xl text-gray-200 mb-4" aria-hidden="true"></i>
            <p class="text-gray-500 font-ui text-sm">Select a conversation</p>
          </div>
        </div>
        <div v-else-if="!detail" class="flex-1 flex items-center justify-center">
          <p v-if="detailError" class="text-sm font-ui text-gray-600">{{ detailError }}</p>
          <FaIcon v-else name="spinner" spin class="text-brand-navy" />
        </div>

        <template v-else>
          <div class="px-5 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div class="flex items-start gap-3">
              <button @click="closeThread" aria-label="Back to conversations" class="p-2 -ml-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors lg:hidden">
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
              </button>
              <div class="flex-1 min-w-0">
                <h2 class="font-heading text-xl text-gray-900 truncate">{{ title }}</h2>
                <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-ui mt-0.5">
                  <a :href="`tel:+${detail.phone}`" class="text-brand-navy hover:text-brand-navy-light"><i class="fa-solid fa-phone mr-1.5 text-xs" aria-hidden="true"></i>{{ waPhone(detail.phone) }}</a>
                  <span v-if="detail.profileName && detail.profileName !== title" class="text-gray-500 text-xs">WhatsApp name: {{ detail.profileName }}</span>
                  <span v-for="cl in detail.clients.filter((x) => x.optedOut)" :key="cl.id" class="text-[10px] font-semibold uppercase tracking-wider text-brand-red bg-red-50 px-2 py-0.5 rounded-full">Opted out</span>
                </p>
              </div>
              <button v-if="can('whatsapp.manage')" @click="toggleClosed" :disabled="Boolean(busy)"
                class="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-ui font-semibold text-gray-600 hover:text-brand-navy hover:bg-brand-surface transition-colors">
                <FaIcon :name="detail.status === 'closed' ? 'rotate-left' : 'check'" class="mr-1.5" />{{ detail.status === 'closed' ? 'Reopen' : 'Close' }}
              </button>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-ui">
              <label v-if="can('whatsapp.manage')" class="inline-flex items-center gap-2 text-gray-600">
                Assigned to
                <select :value="detail.assignee?.id ?? ''" @change="reassign($event.target.value)" :disabled="Boolean(busy)"
                  class="text-xs font-ui px-2 py-1 rounded-lg border border-gray-300 bg-white focus:border-brand-navy focus:outline-none">
                  <option value="">Nobody</option>
                  <option v-for="a in assignees" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </label>
              <span v-else class="text-gray-600">Assigned to {{ detail.assignee?.name || 'nobody' }}</span>
              <span v-if="detail.clients.length" class="text-gray-500">Client: {{ detail.clients.map((x) => x.name).join(', ') }}</span>
            </div>

            <!-- Payment status, read-only, for accounts with billing.status. -->
            <div v-if="detail.invoices && detail.invoices.length" class="mt-3 flex flex-wrap gap-2" aria-label="Payment status">
              <span v-for="inv in detail.invoices" :key="inv.invoiceId" class="inline-flex items-center gap-2 text-[11px] font-ui bg-brand-surface rounded-lg px-2.5 py-1.5">
                <span class="text-gray-700">{{ inv.invoiceId }}</span>
                <span :class="INVOICE_TONE[inv.status] || 'text-gray-700'" class="font-semibold">{{ INVOICE_LABEL[inv.status] || inv.status }}</span>
                <span v-if="inv.balanceCents > 0" class="text-gray-600 tabular-nums">{{ money(inv.balanceCents) }} due{{ inv.nextDue ? ` ${shortDay(inv.nextDue)}` : '' }}</span>
              </span>
            </div>
            <p v-if="actionError" role="alert" class="mt-2 text-xs font-ui text-brand-red">{{ actionError }}</p>
          </div>

          <!-- Messages -->
          <div ref="threadEl" class="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4" aria-live="polite">
            <p v-if="!detail.messages.length" class="text-center text-sm text-gray-500 font-ui">No messages yet.</p>
            <div v-for="m in detail.messages" :key="m.key" :class="m.direction === 'out' ? 'flex justify-end' : ''">
              <div class="max-w-[85%] sm:max-w-[70%]">
                <div :class="m.direction === 'in' ? 'bg-brand-surface rounded-tl-sm' : m.kind === 'reminder' ? 'bg-amber-50 ring-1 ring-amber-100 rounded-tr-sm' : 'bg-brand-navy/[0.08] rounded-tr-sm'"
                  class="rounded-2xl px-4 py-3">
                  <p v-if="m.kind === 'reminder'" class="text-[10px] font-ui font-semibold uppercase tracking-wider text-amber-800 mb-1">Payment reminder</p>
                  <p v-if="m.body" class="text-gray-800 text-sm font-ui leading-relaxed whitespace-pre-wrap break-words">{{ m.body }}</p>
                  <p v-else class="text-gray-500 text-sm font-ui italic">{{ m.mediaType ? `Sent a ${m.mediaType} (open WhatsApp to see it)` : 'No text' }}</p>
                </div>
                <p :class="m.direction === 'out' ? 'text-right mr-1' : 'ml-1'" class="text-[11px] text-gray-500 font-ui mt-1.5">
                  <span v-if="m.direction === 'out' && m.by">{{ m.by }} · </span>{{ fullTime(m.at) }}
                  <template v-if="m.direction === 'out'">
                    · <span :class="m.status === 'failed' ? 'text-brand-red font-semibold' : m.status === 'unknown' ? 'text-amber-800 font-semibold' : ''">{{ STATUS_LABEL[m.status] || m.status }}</span>
                    <span v-if="m.simulated" class="text-violet-700"> · simulated</span>
                  </template>
                </p>
                <p v-if="m.status === 'failed' && m.error" class="text-[11px] text-brand-red font-ui mt-0.5 text-right mr-1">{{ m.error }}</p>
                <p v-if="m.status === 'unknown'" class="text-[11px] text-amber-800 font-ui mt-0.5 text-right mr-1">It may or may not have arrived. Check WhatsApp before sending it again.</p>
              </div>
            </div>
          </div>

          <!-- Internal notes: staff only, never sent. -->
          <div class="border-t border-gray-100 flex-shrink-0">
            <button @click="notesOpen = !notesOpen" :aria-expanded="notesOpen" aria-controls="wa-notes"
              class="w-full flex items-center justify-between px-5 py-2.5 hover:bg-brand-surface transition-colors">
              <span class="flex items-center gap-2 text-xs font-ui font-semibold text-gray-700">
                <i class="fa-solid fa-note-sticky text-brand-navy/70 text-[11px]" aria-hidden="true"></i>
                Internal notes
                <span v-if="detail.notes.length" class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-navy/10 text-brand-navy text-[10px] font-bold">{{ detail.notes.length }}</span>
              </span>
              <FaIcon :name="notesOpen ? 'chevron-up' : 'chevron-down'" class="text-[10px] text-gray-400" />
            </button>
            <div v-if="notesOpen" id="wa-notes" class="px-5 pb-4">
              <form v-if="can('whatsapp.manage')" @submit.prevent="addNote" class="flex items-start gap-2 mb-3">
                <label for="wa-note" class="sr-only">Add an internal note</label>
                <textarea id="wa-note" v-model="noteDraft" rows="2" maxlength="2000" :disabled="busy === 'note'"
                  placeholder="For colleagues only: what was agreed, who to call…"
                  class="form-input resize-none text-sm flex-1" @keydown.enter.exact.prevent="addNote"></textarea>
                <button type="submit" :disabled="busy === 'note' || !noteDraft.trim()"
                  class="bg-brand-navy text-white font-ui font-medium text-xs px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">{{ busy === 'note' ? 'Saving…' : 'Add' }}</button>
              </form>
              <p v-if="!detail.notes.length" class="text-xs text-gray-500 font-ui">No notes yet. Notes are never sent to the client.</p>
              <ul v-else class="space-y-2 max-h-48 overflow-y-auto">
                <li v-for="n in detail.notes" :key="n.id" class="bg-brand-surface rounded-lg px-3 py-2">
                  <p class="text-xs text-gray-800 font-ui leading-relaxed whitespace-pre-wrap">{{ n.body }}</p>
                  <p class="text-[10px] text-gray-500 font-ui mt-1">{{ n.author || 'Staff' }} · {{ fullTime(n.at) }}</p>
                </li>
              </ul>
            </div>
          </div>

          <!-- Reply -->
          <div v-if="can('whatsapp.send')" class="border-t border-gray-200 px-5 sm:px-6 py-4 flex-shrink-0 bg-white">
            <p v-if="!detail.reply.allowed" class="text-xs font-ui text-gray-600 bg-brand-surface rounded-lg px-3 py-2.5">
              <i class="fa-solid fa-circle-info text-brand-navy/70 mr-1.5" aria-hidden="true"></i>{{ detail.reply.message }}
            </p>
            <form v-else @submit.prevent="send" class="flex items-end gap-3">
              <label for="wa-reply" class="sr-only">Reply on WhatsApp</label>
              <textarea id="wa-reply" v-model="draft" rows="2" maxlength="4096" :disabled="busy === 'send'"
                :placeholder="`Reply to ${title} on WhatsApp`"
                class="form-input resize-none text-sm flex-1" @keydown.enter.meta.prevent="send" @keydown.enter.ctrl.prevent="send"></textarea>
              <button type="submit" :disabled="busy === 'send' || !draft.trim()"
                class="bg-brand-navy text-white font-ui font-semibold text-sm px-5 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                <FaIcon :name="busy === 'send' ? 'spinner' : 'paper-plane'" :spin="busy === 'send'" class="text-xs mr-1.5" />Send
              </button>
            </form>
            <p v-if="sendError" role="alert" class="mt-2 text-xs font-ui text-brand-red">{{ sendError }}</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { useApi, rawFetch, goToLogin } from '../../composables/useApi.js'
import { formatPhone } from '../../utils/phone.js'
import SectionLinks from '../../components/portal/SectionLinks.vue'
import FaIcon from '../../components/FaIcon.vue'
import ChangePasswordModal from '../../components/messages/ChangePasswordModal.vue'

const route = useRoute()
const router = useRouter()
const { adminEmail, logout, can } = useAuth()
const { get, post } = useApi()
const put = async (path, body) => {
  const res = await rawFetch(path, { method: 'PUT', body: JSON.stringify(body) })
  if (res.status === 401) { goToLogin(); throw new Error('Unauthorized') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const VIEWS = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'closed', label: 'Closed' },
]
const EMPTY = {
  open: 'No open conversations. Messages clients send to the firm’s WhatsApp number appear here.',
  mine: 'Nothing assigned to you.',
  unassigned: 'Every open conversation has someone on it.',
  closed: 'No closed conversations.',
}
const STATUS_LABEL = { pending: 'sending…', sent: 'sent', delivered: 'delivered', read: 'read', failed: 'not delivered', unknown: 'delivery unknown' }
const INVOICE_LABEL = { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', overdue: 'Overdue', needs_review: 'Being checked' }
const INVOICE_TONE = { paid: 'text-green-800', partial: 'text-amber-800', unpaid: 'text-gray-800', overdue: 'text-brand-red', needs_review: 'text-gray-600' }

const view = ref('open')
const conversations = ref([])
const loadingList = ref(true)
const listError = ref('')
const selectedId = ref(route.params.id ? Number(route.params.id) : null)
const detail = ref(null)
const detailError = ref('')
const assignees = ref([])
const status = ref(null)
const busy = ref('')
const actionError = ref('')
const notesOpen = ref(false)
const noteDraft = ref('')
const draft = ref('')
const sendError = ref('')
const threadEl = ref(null)
const showChangePassword = ref(false)
// One key per message being written: a retried or double-clicked send is
// recognised by the server and goes out once.
let clientKey = crypto.randomUUID()

const title = computed(() => {
  if (!detail.value) return ''
  return detail.value.clients[0]?.name || detail.value.profileName || waPhone(detail.value.phone)
})

async function loadList({ silent = false } = {}) {
  if (!silent) { loadingList.value = true; listError.value = '' }
  try {
    conversations.value = await get(`/api/whatsapp/conversations?view=${view.value}`)
    listError.value = ''
  } catch (err) {
    if (!silent) listError.value = err.message || 'Could not load conversations'
  } finally {
    loadingList.value = false
  }
}

async function loadDetail({ silent = false, scroll = false } = {}) {
  if (!selectedId.value) return
  const id = selectedId.value
  if (!silent) detailError.value = ''
  try {
    const d = await get(`/api/whatsapp/conversations/${id}`)
    if (selectedId.value !== id) return // moved on while this loaded
    const grew = !detail.value || detail.value.id !== d.id || detail.value.messages.length !== d.messages.length
    detail.value = d
    if (scroll || grew) { await nextTick(); threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight }) }
  } catch (err) {
    if (!silent) { detail.value = null; detailError.value = err.message || 'Could not open the conversation' }
  }
}

function select(id) {
  if (selectedId.value !== id) {
    draft.value = ''
    noteDraft.value = ''
    sendError.value = ''
    actionError.value = ''
    notesOpen.value = false
    clientKey = crypto.randomUUID()
  }
  selectedId.value = id
  detail.value = null
  router.replace({ name: 'WhatsApp', params: { id } })
  loadDetail({ scroll: true })
}

function closeThread() {
  selectedId.value = null
  detail.value = null
  router.replace({ name: 'WhatsApp' })
}

function setView(v) {
  view.value = v
  loadList()
}

async function refresh() {
  await loadList()
  await loadDetail({ silent: true })
}

async function send() {
  const body = draft.value.trim()
  if (!body || busy.value === 'send') return
  busy.value = 'send'
  sendError.value = ''
  try {
    const r = await post(`/api/whatsapp/conversations/${selectedId.value}/messages`, { body, clientKey })
    if (r.message.status === 'failed') {
      sendError.value = r.message.error || 'WhatsApp did not accept the message.'
    } else {
      draft.value = ''
    }
    clientKey = crypto.randomUUID()
    await Promise.all([loadDetail({ scroll: true }), loadList({ silent: true })])
  } catch (err) {
    // Same key on the next try: if this one did reach the server, it is not sent twice.
    sendError.value = err.message || 'Could not send. Try again.'
    await loadDetail({ silent: true })
  } finally {
    busy.value = ''
  }
}

async function act(name, fn) {
  busy.value = name
  actionError.value = ''
  try {
    await fn()
    await Promise.all([loadDetail({ silent: true }), loadList({ silent: true })])
  } catch (err) {
    actionError.value = err.message || 'That did not work. Try again.'
  } finally {
    busy.value = ''
  }
}

const reassign = (value) => act('assign', () => put(`/api/whatsapp/conversations/${selectedId.value}/assignee`, { accountId: value ? Number(value) : null }))
const toggleClosed = () => act('status', () => put(`/api/whatsapp/conversations/${selectedId.value}/status`, { status: detail.value.status === 'closed' ? 'open' : 'closed' }))
async function addNote() {
  const body = noteDraft.value.trim()
  if (!body) return
  await act('note', async () => {
    await post(`/api/whatsapp/conversations/${selectedId.value}/notes`, { body })
    noteDraft.value = ''
  })
}

// --- formatting ----------------------------------------------------------------
// Meta's wa_id is E.164 digits without '+': US numbers read as (504) 555-0142,
// everyone else keeps their country code.
const waPhone = (d) => (/^1\d{10}$/.test(String(d)) ? formatPhone(d) : `+${d}`)
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (cents) => usd.format(Number(cents) / 100)
function shortDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function relTime(value) {
  if (!value) return ''
  const d = new Date(value)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fullTime(value) {
  const d = new Date(value)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = relTime(value)
  return day.includes(':') ? `Today at ${time}` : `${day} at ${time}`
}

// --- live updates: same polling as the lead inbox -------------------------------
const POLL_INTERVAL_MS = 15000
let timer = null
let inFlight = false
async function poll() {
  if (inFlight) return
  inFlight = true
  try { await loadList({ silent: true }); await loadDetail({ silent: true }) } finally { inFlight = false }
}
const onVisible = () => { if (!document.hidden) poll() }

watch(() => route.params.id, (id) => {
  const n = id ? Number(id) : null
  if (n !== selectedId.value) { if (n) select(n); else closeThread() }
})

watch(title, (t) => { document.title = `${t ? t + ' · ' : ''}WhatsApp | Campos Muños Law` }, { immediate: true })

onMounted(async () => {
  get('/api/whatsapp/status').then((s) => { status.value = s }).catch(() => {})
  if (can('whatsapp.manage')) get('/api/whatsapp/assignees').then((a) => { assignees.value = a }).catch(() => {})
  await loadList()
  if (selectedId.value) loadDetail({ scroll: true })
  timer = setInterval(poll, POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)
})
onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
