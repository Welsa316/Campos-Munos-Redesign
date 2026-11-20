<template>
  <!-- --wa-s: the person's chat text size (TextSizePicker), as a factor of standard. -->
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden" :style="{ '--wa-s': textScale(profile.textSize) }">
    <PortalHeader title="WhatsApp" current="whatsapp" label-at="xl" actions-label-at="lg" show-email :notifications="false" />

    <!-- What sending means right now, before anyone types. Only for accounts
         that may reply: to one that cannot, "replies wait" would promise a
         reply box they will never get. -->
    <p v-if="status && can('whatsapp.send') && !status.sendingEnabled" class="flex-shrink-0 px-4 sm:px-6 py-2 text-xs font-ui text-amber-900 bg-amber-50 border-b border-amber-100">
      <i class="fa-solid fa-circle-pause mr-1.5" aria-hidden="true"></i>
      {{ t('banner.off') }}
    </p>
    <p v-else-if="status && can('whatsapp.send') && status.mode === 'mock'" class="flex-shrink-0 px-4 sm:px-6 py-2 text-xs font-ui text-violet-900 bg-violet-50 border-b border-violet-100">
      <i class="fa-solid fa-flask mr-1.5" aria-hidden="true"></i>
      {{ t('banner.mock') }}
    </p>

    <div v-if="loadingList && !conversations.length" class="flex-1 flex items-center justify-center">
      <p class="text-gray-500 text-sm font-ui"><i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>{{ t('list.loading') }}</p>
    </div>
    <div v-else-if="listError && !conversations.length" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <p class="text-gray-500 text-sm font-ui mb-3">{{ listError }}</p>
        <button @click="loadList()" class="text-brand-navy text-sm font-ui font-medium hover:underline">{{ t('try_again') }}</button>
      </div>
    </div>

    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Conversation list -->
      <div :class="['w-full lg:w-[380px] lg:flex-shrink-0 flex flex-col bg-white lg:border-r border-gray-200', selectedId ? 'hidden lg:flex' : 'flex']">
        <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <!-- Which conversations: the list's own filter, like Inbox/Archived on leads. -->
          <div class="flex flex-1 min-w-0 bg-brand-surface rounded-lg p-0.5" role="group" :aria-label="t('views.label')">
            <button v-for="v in VIEWS" :key="v.key" @click="setView(v.key)" :aria-pressed="view === v.key"
              :class="view === v.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'"
              class="flex-1 text-xs font-ui font-medium px-2 py-1.5 rounded-md transition-colors whitespace-nowrap">{{ t(`view.${v.key}`) }}</button>
          </div>
          <button @click="refresh" :disabled="loadingList" class="p-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors disabled:opacity-50" :aria-label="t('refresh')">
            <FaIcon name="arrows-rotate" :spin="loadingList" class="text-xs" />
          </button>
        </div>
        <p v-if="conversations.length" class="px-5 pt-3 pb-1 text-[11px] font-ui text-gray-500 tabular-nums">{{ t('count', { count: conversations.length }) }}</p>
        <p v-if="!conversations.length" class="p-8 text-center text-sm text-gray-500 font-ui">{{ t(`empty.${view}`) }}</p>
        <ul v-else class="flex-1 overflow-y-auto divide-y divide-gray-100">
          <li v-for="c in conversations" :key="c.id">
            <button @click="select(c.id)" :aria-current="selectedId === c.id ? 'true' : undefined"
              :class="selectedId === c.id ? 'bg-brand-navy/[0.06]' : 'hover:bg-brand-surface/70'"
              class="w-full text-left px-5 py-3.5 transition-colors">
              <div class="flex items-start gap-3">
                <span :class="c.needsReply ? 'bg-brand-red' : 'bg-transparent'" class="wa-dot w-2 h-2 rounded-full flex-shrink-0" aria-hidden="true"></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <p :class="c.needsReply ? 'font-semibold' : 'font-medium'" class="wa-body font-ui text-gray-900 truncate flex-1">{{ c.name || waPhone(c.phone) }}</p>
                    <span class="wa-meta font-ui text-gray-600 whitespace-nowrap tabular-nums">{{ relTime(c.lastAt, lang) }}</span>
                  </div>
                  <p class="wa-sub font-ui text-gray-600 truncate mt-0.5">
                    <span v-if="c.lastDirection === 'out'" class="text-gray-600">{{ t('you') }}</span>{{ c.preview || '—' }}
                  </p>
                  <p class="flex items-center gap-2 mt-1.5 wa-meta font-ui">
                    <span v-if="c.needsReply" class="sr-only">{{ t('waiting_reply') }}</span>
                    <span v-if="c.assignee" class="inline-flex items-center gap-1 text-brand-navy"><i class="fa-solid fa-user text-[9px]" aria-hidden="true"></i>{{ c.assignee.name }}</span>
                    <span v-else class="text-gray-600">{{ t('unassigned') }}</span>
                    <span v-if="c.name" class="text-gray-600 truncate">{{ waPhone(c.phone) }}</span>
                  </p>
                </div>
              </div>
            </button>
          </li>
        </ul>
        <!-- Numbers someone hid (a coworker, a personal chat): only when there are any. -->
        <button v-if="can('whatsapp.delete') && hiddenCount > 0" type="button" @click="hiddenOpen = true"
          class="flex-shrink-0 border-t border-gray-100 px-5 py-2.5 text-left text-xs font-ui font-medium text-gray-600 hover:text-brand-navy hover:bg-brand-surface transition-colors">
          <FaIcon name="eye-slash" class="mr-1.5 text-[11px]" />{{ t('hidden.link', { count: hiddenCount }) }}
        </button>
      </div>

      <!-- Thread -->
      <div :class="['flex-1 flex flex-col min-w-0 bg-white', selectedId ? 'flex' : 'hidden lg:flex']">
        <div v-if="!selectedId" class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <i class="fa-solid fa-comments text-4xl text-gray-200 mb-4" aria-hidden="true"></i>
            <p class="text-gray-500 font-ui text-sm">{{ t('select') }}</p>
          </div>
        </div>
        <div v-else-if="!detail" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <template v-if="detailError">
            <p role="alert" class="text-sm font-ui text-gray-600">{{ detailError }}</p>
            <!-- On a phone the list is hidden while a conversation is open: give a way back. -->
            <div class="flex gap-4 text-sm font-ui">
              <button type="button" @click="loadDetail()" class="font-semibold text-brand-navy underline">{{ t('try_again') }}</button>
              <button type="button" @click="closeThread" class="font-semibold text-brand-navy underline lg:hidden">{{ t('back') }}</button>
            </div>
          </template>
          <FaIcon v-else name="spinner" spin class="text-brand-navy" />
        </div>

        <template v-else>
          <div class="px-5 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div class="flex items-start gap-3">
              <button @click="closeThread" :aria-label="t('back')" class="p-2 -ml-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface transition-colors lg:hidden">
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
              </button>
              <div class="flex-1 min-w-0">
                <h2 class="font-heading text-xl text-gray-900 truncate">{{ title }}</h2>
                <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-ui mt-0.5">
                  <a :href="`tel:+${detail.phone}`" class="text-brand-navy hover:text-brand-navy-light"><i class="fa-solid fa-phone mr-1.5 text-xs" aria-hidden="true"></i>{{ waPhone(detail.phone) }}</a>
                  <span v-if="detail.profileName && detail.profileName !== title" class="text-gray-500 text-xs">{{ t('profile_name', { name: detail.profileName }) }}</span>
                  <span v-for="cl in detail.clients.filter((x) => x.optedOut)" :key="cl.id" class="text-[10px] font-semibold uppercase tracking-wider text-brand-red bg-red-50 px-2 py-0.5 rounded-full">{{ t('opted_out') }}</span>
                </p>
              </div>
              <div class="flex-shrink-0 flex items-center gap-0.5 -mr-2">
                <TextSizePicker />
                <button v-if="can('whatsapp.delete')" type="button" @click="deleteOpen = true" :disabled="Boolean(busy)" :title="t('chat.delete')"
                  class="flex items-center px-2.5 sm:px-3 py-2 rounded-lg text-xs font-ui font-semibold text-gray-600 hover:text-brand-red hover:bg-red-50 transition-colors">
                  <FaIcon name="trash" class="sm:mr-1.5" /><span class="sr-only sm:not-sr-only">{{ t('chat.delete') }}</span>
                </button>
                <button v-if="can('whatsapp.manage')" @click="toggleClosed" :disabled="Boolean(busy)"
                  class="px-3 py-2 rounded-lg text-xs font-ui font-semibold text-gray-600 hover:text-brand-navy hover:bg-brand-surface transition-colors">
                  <FaIcon :name="detail.status === 'closed' ? 'rotate-left' : 'check'" class="mr-1.5" />{{ detail.status === 'closed' ? t('reopen') : t('close') }}
                </button>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-ui">
              <label v-if="can('whatsapp.manage')" class="inline-flex items-center gap-2 text-gray-600">
                {{ t('assigned_to') }}
                <select :value="detail.assignee?.id ?? ''" @change="reassign($event.target.value)" :disabled="Boolean(busy)"
                  class="text-xs font-ui px-2 py-1 rounded-lg border border-gray-300 bg-white focus:border-brand-navy focus:outline-none">
                  <option value="">{{ t('nobody_option') }}</option>
                  <option v-for="a in assignees" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </label>
              <span v-else class="text-gray-600">{{ t('assigned_to_name', { name: detail.assignee?.name || t('nobody') }) }}</span>
              <span v-if="detail.clients.length" class="text-gray-500">{{ t('client', { names: detail.clients.map((x) => x.name).join(', ') }) }}</span>
            </div>

            <!-- Payment status, read-only, for accounts with billing.status. -->
            <div v-if="detail.invoices && detail.invoices.length" class="mt-3 flex flex-wrap gap-2" :aria-label="t('payment_status')">
              <span v-for="inv in detail.invoices" :key="inv.invoiceId" class="inline-flex items-center gap-2 text-[11px] font-ui bg-brand-surface rounded-lg px-2.5 py-1.5">
                <span class="text-gray-700">{{ inv.invoiceId }}</span>
                <span :class="INVOICE_TONE[inv.status] || 'text-gray-700'" class="font-semibold">{{ INVOICE_KEYS.includes(inv.status) ? t(`invoice.${inv.status}`) : inv.status }}</span>
                <span v-if="inv.balanceCents > 0" class="text-gray-600 tabular-nums">{{ inv.nextDue ? t('balance_due_on', { amount: money(inv.balanceCents), date: shortDay(inv.nextDue, lang) }) : t('balance_due', { amount: money(inv.balanceCents) }) }}</span>
              </span>
            </div>
            <p v-if="actionError" role="alert" class="mt-2 text-xs font-ui text-brand-red">{{ actionError }}</p>
          </div>

          <!-- Messages. Not a live region (it would read the whole thread out
               on every refresh); a client's new message is announced below. -->
          <p class="sr-only" role="status">{{ arrivalNote }}</p>
          <div ref="threadEl" class="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <p v-if="!detail.messages.length" class="text-center text-sm text-gray-500 font-ui">{{ t('no_messages') }}</p>
            <div v-for="m in detail.messages" :key="m.key" :class="m.direction === 'out' ? 'flex justify-end' : ''">
              <div class="group max-w-[85%] sm:max-w-[70%]">
                <div :class="m.direction === 'in' ? 'bg-brand-surface rounded-tl-sm' : m.kind === 'reminder' ? 'bg-amber-50 ring-1 ring-amber-100 rounded-tr-sm' : 'bg-brand-navy/[0.08] rounded-tr-sm'"
                  class="rounded-2xl px-4 py-3">
                  <p v-if="m.kind === 'reminder'" class="text-[10px] font-ui font-semibold uppercase tracking-wider text-amber-800 mb-1">{{ t('payment_reminder') }}</p>
                  <p v-if="m.body" class="text-gray-800 wa-body font-ui leading-relaxed whitespace-pre-wrap break-words">{{ m.body }}</p>
                  <p v-else class="text-gray-500 wa-body font-ui italic">{{ m.mediaType ? t('media', { type: m.mediaType }) : t('no_text') }}</p>
                </div>
                <p :class="m.direction === 'out' ? 'justify-end mr-1' : 'ml-1'" class="flex flex-wrap items-center gap-x-1 wa-meta text-gray-500 font-ui mt-1.5 tabular-nums">
                  <span>
                  <span v-if="m.direction === 'out' && m.by">{{ m.by }} · </span>{{ fullTime(m.at, lang) }}
                  <template v-if="m.direction === 'out'">
                    · <span :class="m.status === 'failed' ? 'text-brand-red font-semibold' : m.status === 'unknown' ? 'text-amber-800 font-semibold' : ''">{{ STATUS_KEYS.includes(m.status) ? t(`status.${m.status}`) : m.status }}</span>
                    <span v-if="m.simulated" class="text-violet-700"> {{ t('simulated') }}</span>
                  </template>
                  </span>
                  <!-- Not on payment reminders: those are billing records. On a
                       pointer device it shows with the message under the pointer
                       or with focus; on touch it is always there. -->
                  <button v-if="can('whatsapp.delete') && m.kind !== 'reminder'" type="button" @click="confirmKey = m.key"
                    :aria-label="t('msg.delete')" :title="t('msg.delete')"
                    class="wa-del -my-1 p-1.5 rounded-md text-gray-500 hover:text-brand-red hover:bg-red-50 focus-visible:opacity-100 transition-opacity">
                    <FaIcon name="trash" class="text-[11px]" />
                  </button>
                </p>
                <ConfirmInline v-if="confirmKey === m.key" class="mt-2" :title="t('msg.delete_q')" :body="t('msg.delete_body')"
                  :confirm-label="t('msg.delete_confirm')" :cancel-label="t('cancel')" :busy="busy === 'delete-msg'"
                  @confirm="deleteMessage(m)" @cancel="confirmKey = ''" />
                <p v-if="m.status === 'failed' && m.error" class="wa-meta text-brand-red font-ui mt-0.5 text-right mr-1">{{ m.error }}</p>
                <p v-if="m.status === 'unknown'" class="wa-meta text-amber-800 font-ui mt-0.5 text-right mr-1">{{ t('unknown_hint') }}</p>
              </div>
            </div>
          </div>

          <!-- Internal notes: staff only, never sent. -->
          <div class="border-t border-gray-100 flex-shrink-0">
            <button @click="notesOpen = !notesOpen" :aria-expanded="notesOpen" aria-controls="wa-notes"
              class="w-full flex items-center justify-between px-5 py-2.5 hover:bg-brand-surface transition-colors">
              <span class="flex items-center gap-2 text-xs font-ui font-semibold text-gray-700">
                <i class="fa-solid fa-note-sticky text-brand-navy/70 text-[11px]" aria-hidden="true"></i>
                {{ t('notes.heading') }}
                <span v-if="detail.notes.length" class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-navy/10 text-brand-navy text-[10px] font-bold tabular-nums">{{ detail.notes.length }}</span>
              </span>
              <FaIcon :name="notesOpen ? 'chevron-up' : 'chevron-down'" class="text-[10px] text-gray-400" />
            </button>
            <div v-if="notesOpen" id="wa-notes" class="px-5 pb-4">
              <form v-if="can('whatsapp.manage')" @submit.prevent="addNote" class="flex items-start gap-2 mb-3">
                <label for="wa-note" class="sr-only">{{ t('notes.add_label') }}</label>
                <textarea id="wa-note" v-model="noteDraft" rows="2" maxlength="2000" :disabled="busy === 'note'"
                  :placeholder="t('notes.placeholder')"
                  class="form-input resize-none wa-body flex-1" @keydown.enter.meta="(e) => { if (!isComposing(e)) { e.preventDefault(); addNote() } }" @keydown.enter.ctrl="(e) => { if (!isComposing(e)) { e.preventDefault(); addNote() } }"></textarea>
                <button type="submit" :disabled="busy === 'note' || !noteDraft.trim()"
                  class="bg-brand-navy text-white font-ui font-medium text-xs px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">{{ busy === 'note' ? t('notes.saving') : t('notes.add') }}</button>
              </form>
              <p v-if="!detail.notes.length" class="text-xs text-gray-500 font-ui">{{ t('notes.none') }}</p>
              <ul v-else class="space-y-2 max-h-48 overflow-y-auto">
                <li v-for="n in detail.notes" :key="n.id" class="bg-brand-surface rounded-lg px-3 py-2">
                  <p class="wa-sub text-gray-800 font-ui leading-relaxed whitespace-pre-wrap break-words">{{ n.body }}</p>
                  <p class="wa-meta text-gray-500 font-ui mt-1">{{ n.author || t('notes.staff') }} · {{ fullTime(n.at, lang) }}</p>
                </li>
              </ul>
            </div>
          </div>

          <!-- Reply -->
          <div v-if="can('whatsapp.send')" class="border-t border-gray-200 px-5 sm:px-6 py-4 flex-shrink-0 bg-white">
            <p v-if="!detail.reply.allowed" class="text-xs font-ui text-gray-600 bg-brand-surface rounded-lg px-3 py-2.5">
              <i class="fa-solid fa-circle-info text-brand-navy/70 mr-1.5" aria-hidden="true"></i>{{ detail.reply.message }}
            </p>
            <!-- relative: the emoji panel opens above the form, lined up with its right edge. -->
            <form v-else @submit.prevent="send" class="relative flex items-end gap-2 sm:gap-3">
              <label for="wa-reply" class="sr-only">{{ t('reply.label') }}</label>
              <textarea id="wa-reply" ref="replyField" v-model="draft" rows="2" maxlength="4096" :disabled="busy === 'send'"
                :placeholder="t('reply.placeholder', { name: title })"
                class="form-input resize-none wa-body flex-1" @keydown.enter.meta="(e) => { if (!isComposing(e)) { e.preventDefault(); send() } }" @keydown.enter.ctrl="(e) => { if (!isComposing(e)) { e.preventDefault(); send() } }"></textarea>
              <EmojiPicker v-model="draft" :field="replyField" :maxlength="4096" :disabled="busy === 'send'" />
              <button type="submit" :disabled="busy === 'send' || !draft.trim()"
                class="bg-brand-navy text-white font-ui font-semibold text-sm px-5 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                <FaIcon :name="busy === 'send' ? 'spinner' : 'paper-plane'" :spin="busy === 'send'" class="text-xs mr-1.5" />{{ t('reply.send') }}
              </button>
            </form>
            <p v-if="sendError" role="alert" class="mt-2 text-xs font-ui text-brand-red">{{ sendError }}</p>
          </div>
        </template>
      </div>
    </div>

    <DeleteChatDialog :open="deleteOpen" :conversation-id="detail?.id ?? null" :name="title" :phone="detail ? waPhone(detail.phone) : ''"
      @close="deleteOpen = false" @deleted="onChatDeleted" />
    <HiddenNumbersDialog :open="hiddenOpen" :wa-phone="waPhone" @close="hiddenOpen = false" @changed="(n) => { hiddenCount = n }" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth.js'
import { useApi, latestOnly } from '../../composables/useApi.js'
import { formatPhone } from '../../utils/phone.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import { useVisiblePoll } from '../../composables/useVisiblePoll.js'
import FaIcon from '../../components/FaIcon.vue'
import EmojiPicker from '../../components/EmojiPicker.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'
import TextSizePicker from './TextSizePicker.vue'
import DeleteChatDialog from './DeleteChatDialog.vue'
import HiddenNumbersDialog from './HiddenNumbersDialog.vue'
import { textScale } from '../../data/textSizes.js'
import { toast } from '../../composables/useToast.js'
import { toDate, isComposing } from '../../utils/text.js'
import { useT, clockCount } from '../../i18n/translator.js'
import { WHATSAPP } from '../../i18n/whatsapp.js'

const route = useRoute()
const router = useRouter()
const { can, profile } = useAuth()
const { get, post, put, del } = useApi()
const { t, lang } = useT(WHATSAPP)

// Labels, empty states, statuses and invoice states live in i18n/whatsapp.js
// under view.*, empty.*, status.* and invoice.*.
const VIEWS = [{ key: 'open' }, { key: 'mine' }, { key: 'unassigned' }, { key: 'closed' }]
const STATUS_KEYS = ['pending', 'sent', 'delivered', 'read', 'failed', 'unknown']
const INVOICE_KEYS = ['paid', 'partial', 'unpaid', 'overdue', 'needs_review']
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
const replyField = ref(null)
const sendError = ref('')
const threadEl = ref(null)
// Deleting: the message whose inline question is open, the chat dialog,
// and the numbers someone hid.
const confirmKey = ref('')
const deleteOpen = ref(false)
const hiddenOpen = ref(false)
const hiddenCount = ref(0)
// "New message from …" for screen readers when the open thread gets one.
const arrivalNote = ref('')
// One key per message being written: a retried or double-clicked send is
// recognised by the server and goes out once.
let clientKey = crypto.randomUUID()

const title = computed(() => {
  if (!detail.value) return ''
  return detail.value.clients[0]?.name || detail.value.profileName || waPhone(detail.value.phone)
})

// A poll that started before a view switch must not repaint the old view.
const latestConversations = latestOnly()
async function loadList({ silent = false } = {}) {
  if (!silent) { loadingList.value = true; listError.value = '' }
  try {
    const r = await latestConversations(() => get(`/api/whatsapp/conversations?view=${view.value}`))
    if (!r.current) return
    conversations.value = r.value
    listError.value = ''
  } catch (err) {
    if (!silent) listError.value = err.message || t('list.load_error')
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
    const sameThread = detail.value?.id === d.id
    // More messages than before: a deletion makes the thread shorter, and
    // must not be announced as a new message.
    const grew = !detail.value || !sameThread || d.messages.length > detail.value.messages.length
    const last = d.messages[d.messages.length - 1]
    if (sameThread && grew && last?.direction === 'in') arrivalNote.value = t('arrival', { name: title.value || t('the_client') })
    detail.value = d
    if (scroll || grew) { await nextTick(); threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight }) }
  } catch (err) {
    if (!silent) { detail.value = null; detailError.value = err.message || t('open_error') }
  }
}

function select(id) {
  if (selectedId.value !== id) {
    draft.value = ''
    noteDraft.value = ''
    sendError.value = ''
    actionError.value = ''
    notesOpen.value = false
    confirmKey.value = ''
    clientKey = crypto.randomUUID()
  }
  selectedId.value = id
  detail.value = null
  arrivalNote.value = ''
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
      sendError.value = r.message.error || t('reply.rejected')
    } else {
      draft.value = ''
    }
    clientKey = crypto.randomUUID()
    await Promise.all([loadDetail({ scroll: true }), loadList({ silent: true })])
  } catch (err) {
    // Same key on the next try: if this one did reach the server, it is not sent twice.
    sendError.value = err.message || t('reply.failed')
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
    actionError.value = err.message || t('action_failed')
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

// Deleting removes it from the portal for everyone (never from the phone).
async function deleteMessage(m) {
  let done = false
  await act('delete-msg', async () => {
    await del(`/api/whatsapp/conversations/${selectedId.value}/messages/${m.key}`)
    confirmKey.value = ''
    done = true
  })
  if (done) arrivalNote.value = t('msg.deleted')
}

function onChatDeleted({ hidden }) {
  deleteOpen.value = false
  if (hidden) hiddenCount.value += 1
  toast({ text: t(hidden ? 'chat.deleted_hidden' : 'chat.deleted') })
  closeThread()
  loadList({ silent: true })
}

function loadHiddenCount() {
  if (!can('whatsapp.delete')) return
  get('/api/whatsapp/hidden-numbers').then((rows) => { hiddenCount.value = rows.length }).catch(() => {})
}

// --- formatting ----------------------------------------------------------------
// Meta's wa_id is E.164 digits without '+': US numbers read as (504) 555-0142,
// everyone else keeps their country code.
const waPhone = (d) => (/^1\d{10}$/.test(String(d)) ? formatPhone(d) : `+${d}`)
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (cents) => usd.format(Number(cents) / 100)
// Dates follow the language switch (lang passed in, so the template
// re-renders when it changes).
const localeOf = (l) => (l === 'es' ? 'es-US' : 'en-US')
function shortDay(value, l = 'en') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return d.toLocaleDateString(localeOf(l), { month: 'short', day: 'numeric' })
}
const clock = (d, l) => d.toLocaleTimeString(localeOf(l), { hour: 'numeric', minute: '2-digit' })
// '' for today, otherwise "Yesterday" or "Nov 3".
function dayWord(d, l) {
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return ''
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return t('yesterday')
  return d.toLocaleDateString(localeOf(l), { month: 'short', day: 'numeric' })
}
function relTime(value, l = 'en') {
  const d = toDate(value)
  if (!d) return ''
  return dayWord(d, l) || clock(d, l)
}
function fullTime(value, l = 'en') {
  const d = toDate(value)
  if (!d) return ''
  const day = dayWord(d, l)
  const time = clock(d, l)
  // count: the hour shown, for Spanish "a la 1:05" against "a las 3:05".
  return day ? t('day_at', { day, time, count: clockCount(time) }) : t('today_at', { time, count: clockCount(time) })
}

// --- live updates: same polling as the lead inbox -------------------------------
const POLL_INTERVAL_MS = 15000
const poll = useVisiblePoll(async () => { await loadList({ silent: true }); await loadDetail({ silent: true }) }, POLL_INTERVAL_MS)

watch(() => route.params.id, (id) => {
  // Kept alive: leaving for another section is not closing the thread.
  if (route.name !== 'WhatsApp') return
  const n = id ? Number(id) : null
  if (n !== selectedId.value) { if (n) select(n); else closeThread() }
})

const active = ref(true)
const setTitle = () => { document.title = `${title.value ? title.value + ' · ' : ''}WhatsApp | Campos Muños Law` }
watch(title, () => { if (active.value) setTitle() }, { immediate: true })

const listen = () => poll.start()
const unlisten = () => poll.stop()

onMounted(async () => {
  get('/api/whatsapp/status').then((s) => { status.value = s }).catch(() => {})
  if (can('whatsapp.manage')) get('/api/whatsapp/assignees').then((a) => { assignees.value = a }).catch(() => {})
  loadHiddenCount()
  listen()
  await loadList()
  if (selectedId.value) loadDetail({ scroll: true })
})
// Kept alive between sections (App.vue): coming back shows the inbox at
// once and refreshes it in the background; while away it does not poll.
let activations = 0
onActivated(() => {
  active.value = true
  if (activations++ === 0) return
  setTitle()
  // Returning by a link to another conversation opens that one.
  const n = route.params.id ? Number(route.params.id) : null
  if (n !== selectedId.value) { if (n) select(n); else closeThread() }
  listen()
  poll.tick()
})
onDeactivated(() => { active.value = false; unlisten() })
onUnmounted(unlisten)

</script>

<style scoped>
/* Chat text at the person's chosen size (--wa-s, set on the page root):
   standard is exactly what Tailwind's text-sm / text-xs / 11px gave. */
.wa-body { font-size: calc(0.875rem * var(--wa-s, 1)); }
.wa-sub { font-size: calc(0.75rem * var(--wa-s, 1)); }
.wa-meta { font-size: calc(11px * var(--wa-s, 1)); }
/* The unread dot stays level with the name as it grows. */
.wa-dot { margin-top: calc(0.375rem * var(--wa-s, 1)); }

/* A message's delete button: with the message under the pointer or focus
   inside it on a mouse or trackpad; always on touch, which has no hover. */
@media (hover: hover) and (pointer: fine) {
  .wa-del { opacity: 0; }
  .group:hover .wa-del, .group:focus-within .wa-del { opacity: 1; }
}
</style>
