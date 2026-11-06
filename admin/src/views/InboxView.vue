<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Top bar: the busiest header in the portal, so it sheds by width.
         Phones (below 768px): the Inbox/Contacts switch moves to its own row
         under the bar, and Alerts, Export and Password share one More menu,
         leaving the section links and Sign Out. From 768px the switch is
         back in the bar; from 1024px the three actions are buttons again;
         the title shows from 1280px, button labels from 1536px. Icons keep
         their aria-labels and tooltips throughout. -->
    <header class="nav-chrome h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img :src="LOGO_SRC" alt="Campos Muños Law" class="hidden sm:block h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <!-- Always in the document (announced, and focused after a move here);
             shown from 1280px. -->
        <h1 class="font-heading text-lg text-brand-navy tracking-tight sr-only xl:not-sr-only whitespace-nowrap">Client Messages</h1>
        <div class="hidden md:flex bg-brand-surface rounded-lg p-0.5 xl:ml-1" role="group" aria-label="Show">
          <button
            type="button"
            @click="changeView('inbox')"
            :aria-pressed="viewMode === 'inbox'"
            :class="viewMode === 'inbox' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
            class="text-xs font-ui font-medium px-3 py-1.5 rounded-md transition-colors"
          >Inbox</button>
          <button
            type="button"
            @click="changeView('contacts')"
            :aria-pressed="viewMode === 'contacts'"
            :class="viewMode === 'contacts' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
            class="text-xs font-ui font-medium px-3 py-1.5 rounded-md transition-colors"
          >Contacts</button>
        </div>
        <span v-if="viewMode === 'inbox' && unreadCount > 0" class="hidden md:inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-red text-white text-xs font-ui font-bold tabular-nums">
          {{ unreadCount }}<span class="sr-only"> unread</span>
        </span>
      </div>
      <div class="ml-auto flex items-center gap-1 lg:gap-2 2xl:gap-3">
        <SectionLinks current="messages" label-at="never" />

        <!-- From 1024px: the account actions as buttons. -->
        <button
          v-if="notifyPermission === 'default'"
          type="button"
          @click="enableNotifications"
          :class="ACTION"
          class="hidden lg:flex"
          title="Get a desktop alert when a new inquiry arrives"
          aria-label="Turn on desktop notifications"
        >
          <i class="fa-solid fa-bell text-xs" aria-hidden="true"></i>
          <span class="hidden 2xl:inline">Alerts</span>
        </button>
        <span
          v-else-if="notifyPermission === 'denied'"
          class="hidden 2xl:flex items-center gap-2 px-3 py-2 text-xs text-gray-500 font-ui whitespace-nowrap"
          title="Notifications are blocked for this site. Re-enable them in your browser's site settings."
        >
          <i class="fa-solid fa-bell-slash text-xs" aria-hidden="true"></i>
          Alerts blocked
        </span>
        <button
          v-if="can('crm.export')"
          type="button"
          @click="exportCsv"
          :disabled="exporting"
          :class="ACTION"
          class="hidden lg:flex disabled:opacity-50 disabled:cursor-not-allowed"
          :title="exportFailed ? 'Export failed — try again' : 'Export CSV'"
          aria-label="Export messages as CSV"
        >
          <FaIcon :name="exporting ? 'spinner' : exportFailed ? 'triangle-exclamation' : 'download'" :spin="exporting" :class="exportFailed ? 'text-brand-red' : ''" class="text-xs" />
          <span class="hidden 2xl:inline">{{ exporting ? 'Exporting…' : (exportFailed ? 'Failed' : 'Export') }}</span>
        </button>
        <span class="text-xs text-gray-500 font-ui hidden min-[1720px]:inline">{{ adminEmail }}</span>
        <button
          type="button"
          @click="showChangePassword = true"
          :class="ACTION"
          class="hidden lg:flex"
          title="Change password"
          aria-label="Change password"
        >
          <i class="fa-solid fa-key text-xs" aria-hidden="true"></i>
          <span class="hidden 2xl:inline">Password</span>
        </button>

        <!-- Below 1024px: the same three in one menu. -->
        <details ref="moreMenu" class="relative lg:hidden">
          <summary :class="ACTION" class="list-none [&::-webkit-details-marker]:hidden" aria-label="More: alerts, export, password" title="More">
            <FaIcon :name="exporting ? 'spinner' : 'ellipsis'" :spin="exporting" class="text-xs" />
          </summary>
          <ul class="absolute right-0 top-full mt-2 w-60 rounded-xl bg-white ring-1 ring-gray-200 shadow-lg py-1 z-30 font-ui">
            <li v-if="adminEmail" class="px-3 pt-2 pb-2.5 text-[11px] text-gray-500 border-b border-gray-100 truncate" :title="adminEmail">Signed in as {{ adminEmail }}</li>
            <li v-if="notifyPermission === 'default'">
              <button type="button" @click="closeMore(); enableNotifications()" :class="MENU_ITEM">
                <FaIcon name="bell" class="text-xs w-4" />Turn on desktop alerts
              </button>
            </li>
            <li v-else-if="notifyPermission === 'denied'" class="flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-500">
              <FaIcon name="bell-slash" class="text-xs w-4" />Alerts are blocked in this browser
            </li>
            <li v-if="can('crm.export')">
              <button type="button" @click="closeMore(); exportCsv()" :disabled="exporting" :class="MENU_ITEM" class="disabled:opacity-50">
                <FaIcon :name="exportFailed ? 'triangle-exclamation' : 'download'" :class="exportFailed ? 'text-brand-red' : ''" class="text-xs w-4" />{{ exporting ? 'Exporting…' : exportFailed ? 'Export failed, try again' : 'Export as CSV' }}
              </button>
            </li>
            <li>
              <button type="button" @click="closeMore(); showChangePassword = true" :class="MENU_ITEM">
                <FaIcon name="key" class="text-xs w-4" />Change password
              </button>
            </li>
          </ul>
        </details>

        <button
          type="button"
          @click="handleLogout"
          aria-label="Sign out"
          title="Sign out"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors"
        >
          <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
          <span class="hidden 2xl:inline">Sign Out</span>
        </button>
      </div>
    </header>

    <!-- Phones: the Inbox/Contacts switch on its own row, full width, with
         the unread count inside Inbox. Part of the navigation chrome. -->
    <div class="nav-chrome md:hidden flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2">
      <div class="flex bg-brand-surface rounded-lg p-0.5" role="group" aria-label="Show">
        <button
          type="button"
          @click="changeView('inbox')"
          :aria-pressed="viewMode === 'inbox'"
          :class="viewMode === 'inbox' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 inline-flex items-center justify-center gap-2 min-h-9 text-sm font-ui font-medium rounded-md transition-colors"
        >
          Inbox
          <span v-if="unreadCount > 0" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-red text-white text-[11px] font-bold tabular-nums">{{ unreadCount }}<span class="sr-only"> unread</span></span>
        </button>
        <button
          type="button"
          @click="changeView('contacts')"
          :aria-pressed="viewMode === 'contacts'"
          :class="viewMode === 'contacts' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
          class="flex-1 inline-flex items-center justify-center min-h-9 text-sm font-ui font-medium rounded-md transition-colors"
        >Contacts</button>
      </div>
    </div>

    <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />

    <!-- A write that failed (status, mark as read, opening a lead): said where she is. -->
    <p v-if="inboxNotice" role="alert" class="flex items-center gap-3 px-4 sm:px-6 py-2 bg-amber-50 text-amber-900 text-[13px] font-ui border-b border-amber-100">
      <span class="flex-1">{{ inboxNotice }}</span>
      <button type="button" @click="inboxNotice = ''" class="font-semibold underline">Dismiss</button>
    </p>

    <!-- Always mounted, so screen readers hear the change (a region inserted
         with its text already in it is often not announced). -->
    <p class="sr-only" role="status">{{ listStatus }}</p>

    <!-- Full-screen loading/error only when there's nothing to show yet. A manual
         refresh or view switch with data already loaded updates in place instead
         of tearing down the open conversation + reply draft. -->
    <div v-if="loadingList && submissions.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-brand-navy mb-3" aria-hidden="true"></i>
        <p class="text-gray-500 text-sm font-ui">Loading messages...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="listError && submissions.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-exclamation-triangle text-2xl text-brand-red mb-3" aria-hidden="true"></i>
        <p class="text-gray-500 text-sm font-ui mb-4">Failed to load messages</p>
        <button @click="fetchSubmissions" class="text-brand-navy text-sm font-ui font-medium hover:underline">
          Try again
        </button>
      </div>
    </div>

    <!-- Contacts — the whole book of leads as a table -->
    <div v-else-if="viewMode === 'contacts'" class="flex-1 flex overflow-hidden relative">
      <ContactsTable
        :contacts="submissions"
        :archivedView="contactsArchived"
        :total="total"
        :loadingOlder="loadingOlder"
        @loadOlder="loadOlder"
        @select="selectSubmission"
        @setStatus="updateStatus"
        @changeArchived="changeContactsArchived"
      />

      <!-- Detail opens over the table so the table keeps its full width -->
      <div v-if="selectedId !== null" ref="contactPanel" class="absolute inset-0 z-20 flex" role="dialog" aria-modal="true" aria-label="Contact details"
        @keydown.esc="closeDetail" @keydown.tab="trapTab(contactPanel, $event)">
        <button class="flex-1 scrim-soft" aria-label="Close contact details" tabindex="-1" @click="closeDetail"></button>
        <div class="w-full max-w-2xl bg-white shadow-2xl flex flex-col">
          <SubmissionDetail
            :submission="selectedSubmission"
            :showBack="true"
            :startWithNotesOpen="notesRequestedFor === selectedId"
            @replied="handleReplied"
            @back="closeDetail"
            @archived="handleArchived"
            @unread="handleUnread"
            @setStatus="updateStatus"
            @noteAdded="refreshSelected"
          />
        </div>
      </div>
    </div>

    <!-- Main content — two panel layout -->
    <div v-else class="flex-1 flex overflow-hidden">
      <!-- Left panel -->
      <div :class="[
        'w-full lg:w-[380px] lg:flex-shrink-0 flex flex-col',
        selectedId !== null ? 'hidden lg:flex' : 'flex'
      ]">
        <SubmissionList
          ref="listRef"
          :submissions="submissions"
          :selectedId="selectedId"
          :viewMode="viewMode"
          :refreshing="loadingList"
          :total="total"
          :loadingOlder="loadingOlder"
          @loadOlder="loadOlder"
          @select="selectSubmission"
          @refresh="fetchSubmissions"
          @changeView="changeView"
          @setStatus="updateStatus"
          @openNotes="openNotes"
        />
      </div>

      <!-- Right panel -->
      <div :class="[
        'flex-1 flex flex-col min-w-0',
        selectedId === null ? 'hidden lg:flex' : 'flex'
      ]">
        <SubmissionDetail
          :submission="selectedSubmission"
          :showBack="true"
          :startWithNotesOpen="notesRequestedFor === selectedId"
          @replied="handleReplied"
          @back="selectedId = null"
          @archived="handleArchived"
          @unread="handleUnread"
          @setStatus="updateStatus"
          @noteAdded="refreshSelected"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, watchEffect } from 'vue'
import { LOGO_SRC, NOTIFY_ICON } from '../data/brand.js'
import { leadName } from '../utils/text.js'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useApi, rawFetch, goToLogin, latestOnly } from '../composables/useApi.js'
import { trapTab, rememberFocus } from '../utils/focusTrap.js'
import SubmissionList from '../components/messages/SubmissionList.vue'
import SubmissionDetail from '../components/messages/SubmissionDetail.vue'
import ChangePasswordModal from '../components/messages/ChangePasswordModal.vue'
import ContactsTable from '../components/messages/ContactsTable.vue'
import SectionLinks from '../components/portal/SectionLinks.vue'
import FaIcon from '../components/FaIcon.vue'

const router = useRouter()
const route = useRoute()
const { adminEmail, logout, can } = useAuth()
const { get, patch } = useApi()

const submissions = ref([])
const selectedId = ref(null)
const selectedSubmission = ref(null)
const loadingList = ref(true)
const listError = ref(false)
// Leads come a page at a time: the newest page is re-read by every poll, and
// older pages, once loaded with "Load older", are kept below it.
const PAGE = 100
const total = ref(null)
const older = ref([])
const loadingOlder = ref(false)
const latestList = latestOnly()
const latestDetail = latestOnly()
// A failed write the person should know about (status, mark as read).
const inboxNotice = ref('')
const viewMode = ref('inbox')
// Which book of leads the Contacts table is showing. Archived leads used to
// be listed alongside live ones, which both read as active work and — since
// the list route caps at 100 rows — pushed real leads off the bottom.
const contactsArchived = ref(false)
const showChangePassword = ref(false)
const exporting = ref(false)
const exportFailed = ref(false)
const listRef = ref(null)
const notesRequestedFor = ref(null)

const unreadCount = computed(() => submissions.value.filter(s => !s.is_read).length)

// Header actions (whole class names, so Tailwind sees them), and the More
// menu that holds them below 1024px: closes on a choice, outside, or Esc.
const ACTION = 'flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors cursor-pointer'
const MENU_ITEM = 'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-ui font-medium text-gray-700 hover:bg-brand-surface hover:text-brand-navy transition-colors'
const moreMenu = ref(null)
const closeMore = () => { if (moreMenu.value) moreMenu.value.open = false }
function onMoreOutside(e) { if (moreMenu.value?.open && !moreMenu.value.contains(e.target)) closeMore() }
function onMoreKey(e) {
  if (e.key === 'Escape' && moreMenu.value?.open) { closeMore(); moreMenu.value.querySelector('summary')?.focus() }
}
onMounted(() => { document.addEventListener('click', onMoreOutside); document.addEventListener('keydown', onMoreKey) })
onUnmounted(() => { document.removeEventListener('click', onMoreOutside); document.removeEventListener('keydown', onMoreKey) })
const listStatus = computed(() => {
  if (submissions.value.length) return ''
  if (loadingList.value) return 'Loading messages…'
  return listError.value ? 'Failed to load messages.' : ''
})

// --- Live inbox -------------------------------------------------------------
// The inbox refreshes itself so a new inquiry appears without anyone pressing
// refresh. Polling rather than a socket: this is a low-volume inbox on a single
// Railway service, and polling survives restarts, redeploys and multiple
// instances with no reconnect logic to get wrong.
const POLL_INTERVAL_MS = 15000
let pollTimer = null
let inFlight = false

async function pollNow() {
  if (inFlight) return // never stack requests
  inFlight = true
  try {
    await fetchSubmissions({ silent: true })
    await refreshSelected({ silent: true })
  } finally {
    inFlight = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(pollNow, POLL_INTERVAL_MS)
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

// Polling deliberately continues while the tab is in the background — that is
// exactly when a desktop notification is worth sending. Returning to the tab
// just triggers an immediate check so it feels instant.
function onVisibilityChange() {
  if (!document.hidden) pollNow()
}

// --- Desktop notifications --------------------------------------------------
// Browsers only allow requesting permission from a real user gesture, so this is
// opt-in via the bell in the header rather than a prompt on load.
const NOTIFY_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window
const notifyPermission = ref(NOTIFY_SUPPORTED ? Notification.permission : 'unsupported')

// Ids already accounted for. Seeded on the first load so opening the dashboard
// doesn't fire a notification for every inquiry already sitting in the inbox.
const knownIds = new Set()
let seeded = false

async function enableNotifications() {
  if (!NOTIFY_SUPPORTED) return
  try {
    notifyPermission.value = await Notification.requestPermission()
  } catch { /* older browsers use the callback form; ignore */ }
}

function notifyOnNewArrivals(list) {
  if (!seeded) {
    list.forEach(s => knownIds.add(s.id))
    seeded = true
    return
  }

  const arrivals = list.filter(s => !knownIds.has(s.id))
  list.forEach(s => knownIds.add(s.id))

  if (!arrivals.length) return
  if (!NOTIFY_SUPPORTED || notifyPermission.value !== 'granted') return
  // Nothing to alert about while they're already looking at the inbox.
  if (!document.hidden) return

  const open = (id) => {
    window.focus()
    selectSubmission(id)
  }

  if (arrivals.length === 1) {
    const s = arrivals[0]
    const body = (s.message || '').trim() || 'No message provided'
    const note = new Notification(`New inquiry — ${leadName(s, 'no name given')}`, {
      body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
      icon: NOTIFY_ICON,
      // Same tag replaces rather than stacks if this fires twice for one message.
      tag: `cm-submission-${s.id}`,
    })
    note.onclick = () => { open(s.id); note.close() }
  } else {
    const note = new Notification(`${arrivals.length} new inquiries`, {
      body: arrivals.map((s) => leadName(s, 'no name given')).join(', ').slice(0, 160),
      icon: NOTIFY_ICON,
      tag: 'cm-submissions-batch',
    })
    note.onclick = () => { open(arrivals[0].id); note.close() }
  }
}

// Mirror the unread count into the tab title, so a parked tab still shows that
// something came in.
const active = ref(true)
function setTitle() {
  const n = viewMode.value === 'inbox' ? unreadCount.value : 0
  document.title = `${n > 0 ? `(${n}) ` : ''}Client Messages | Campos Muños Law`
}
watchEffect(() => { if (active.value) setTitle() })

// Opened from elsewhere in the portal (a call matched to this lead).
function openLinkedLead() {
  const lead = Number(route.query.lead)
  if (Number.isInteger(lead) && lead > 0) {
    selectSubmission(lead)
    router.replace({ query: {} })
  }
}
function listen() {
  startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', pollNow)
}
function unlisten() {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', pollNow)
}

// Kept alive between sections (App.vue): coming back shows the inbox at once
// and refreshes it in the background; while away it does not poll or own
// the tab title (active).
let activations = 0
onMounted(() => {
  fetchSubmissions()
  openLinkedLead()
  listen()
})
onActivated(() => {
  active.value = true
  if (activations++ === 0) return
  setTitle()
  openLinkedLead()
  listen()
  pollNow()
})
onDeactivated(() => { active.value = false; unlisten() })
onUnmounted(unlisten)

// `silent` is the background refresh: it must not flash the loading state, show
// an error banner on a transient blip, or spin the refresh button.
async function fetchSubmissions({ silent = false } = {}) {
  if (!silent) {
    loadingList.value = true
    listError.value = false
  }

  try {
    // Every view asks for one side of the archive divide, so archived rows
    // never consume the row budget of the list she's actually working.
    const archived = viewMode.value === 'contacts'
      ? contactsArchived.value
      : viewMode.value === 'archived'
    const r = await latestList(() => get(`/api/submissions?archived=${archived}&limit=${PAGE}&withTotal=1`))
    // A slow answer for a list she has since switched away from is dropped.
    if (!r.current) return
    const page = Array.isArray(r.value) ? r.value : r.value.rows
    total.value = Array.isArray(r.value) ? null : r.value.total
    // Replacing the array is safe for the open conversation: the detail pane
    // renders from selectedSubmission, not from this list.
    const ids = new Set(page.map((s) => s.id))
    submissions.value = [...page, ...older.value.filter((s) => !ids.has(s.id))]
    notifyOnNewArrivals(page)
  } catch {
    if (!silent) listError.value = true
  } finally {
    if (!silent) loadingList.value = false
  }
}

function changeView(mode) {
  viewMode.value = mode
  // Arriving at Contacts always lands on the live leads — coming back to a
  // stale Archived toggle reads as "my contacts are gone".
  if (mode === 'contacts') contactsArchived.value = false
  switchList()
}

function changeContactsArchived(archived) {
  contactsArchived.value = archived
  switchList()
}

// Each view returns a different set of rows, so the incoming list is a new
// baseline rather than a delta. Without re-seeding, opening Archived and
// tabbing away fires a desktop notification for every archived lead.
async function loadOlder() {
  loadingOlder.value = true
  try {
    const archived = viewMode.value === 'contacts' ? contactsArchived.value : viewMode.value === 'archived'
    const r = await get(`/api/submissions?archived=${archived}&limit=${PAGE}&offset=${submissions.value.length}&withTotal=1`)
    const page = Array.isArray(r) ? r : r.rows
    if (!Array.isArray(r)) total.value = r.total
    const have = new Set(submissions.value.map((s) => s.id))
    const add = page.filter((s) => !have.has(s.id))
    older.value = [...older.value, ...add]
    submissions.value = [...submissions.value, ...add]
  } catch {
    inboxNotice.value = 'Could not load older leads. Try again.'
  } finally {
    loadingOlder.value = false
  }
}

function switchList() {
  older.value = []
  total.value = null
  seeded = false
  selectedId.value = null
  selectedSubmission.value = null
  fetchSubmissions()
}

async function selectSubmission(id) {
  if (selectedId.value === id && selectedSubmission.value) return
  selectedId.value = id

  let r
  try {
    r = await latestDetail(() => get(`/api/submissions/${id}`))
  } catch {
    // Clear the selection too, so a failed detail-fetch on mobile falls back to
    // the list instead of stranding the admin on a blank pane with no way back.
    if (selectedId.value === id) {
      selectedSubmission.value = null
      selectedId.value = null
      inboxNotice.value = 'Could not open that lead. Try again.'
    }
    return
  }
  // She opened another lead while this one loaded.
  if (!r.current || selectedId.value !== id) return
  selectedSubmission.value = r.value

  const sub = submissions.value.find(s => s.id === id)
  // Read-only accounts look without changing what colleagues see as unread.
  // A failed mark-read leaves the lead open; it just stays unread.
  if (sub && !sub.is_read && can('crm.manage')) {
    try {
      await patch(`/api/submissions/${id}/read`)
      sub.is_read = true
      // Keep the open detail in step with the list so it doesn't keep showing the
      // "Unread" pill (and hide the mark-unread button) on the just-opened message.
      if (selectedSubmission.value && selectedSubmission.value.id === id) {
        selectedSubmission.value.is_read = true
      }
    } catch {
      inboxNotice.value = 'Could not mark it as read. It still shows as unread for everyone.'
    }
  }
}

// Also re-read the open conversation, so a client's chat follow-up shows up
// while it's on screen. The id is unchanged, so ReplyBox (keyed by it) is not
// remounted and a half-typed reply survives.
// Status is owned by the server; update both panes optimistically and roll back
// if the write fails, so the pill never shows a value that didn't stick.
async function updateStatus({ id, status }) {
  const row = submissions.value.find(s => s.id === id)
  const previous = row?.status ?? selectedSubmission.value?.status
  if (row) row.status = status
  if (selectedSubmission.value?.id === id) selectedSubmission.value.status = status

  try {
    await patch(`/api/submissions/${id}/status`, { status })
  } catch (err) {
    if (row) row.status = previous
    if (selectedSubmission.value?.id === id) selectedSubmission.value.status = previous
    inboxNotice.value = `Status not changed: ${err.message}`
  }
}

function closeDetail() {
  selectedId.value = null
  selectedSubmission.value = null
  notesRequestedFor.value = null
  contactOpener?.restore()
  contactOpener = null
}

// Contacts opens a lead over the table as a modal panel: focus moves into it,
// Tab stays inside, Esc closes, and focus returns to the name that opened it.
const contactPanel = ref(null)
let contactOpener = null
watch(selectedId, (id, was) => {
  if (viewMode.value === 'contacts' && id !== null && was === null) contactOpener = rememberFocus()
})
// The lead's controls exist once it has loaded: move focus in then, unless
// she is already working inside the panel.
watch(selectedSubmission, async (sub) => {
  if (viewMode.value !== 'contacts' || !sub) return
  await nextTick()
  const panel = contactPanel.value
  if (panel && !panel.contains(document.activeElement)) panel.querySelector('button:not([tabindex="-1"]), a[href]')?.focus()
})

// The notes button in the list opens the lead with its log already expanded.
function openNotes(id) {
  notesRequestedFor.value = id
  selectSubmission(id)
}

// Sending a reply advances a 'new' lead to 'contacted' server-side — reflect
// that in the list without waiting for the next poll.
async function handleReplied(result) {
  if (result?.status) {
    const row = submissions.value.find(s => s.id === selectedId.value)
    if (row) row.status = result.status
    if (selectedSubmission.value) selectedSubmission.value.status = result.status
  }
  await refreshSelected()
}

async function refreshSelected({ silent = false } = {}) {
  if (!selectedId.value) return
  try {
    const fresh = await get(`/api/submissions/${selectedId.value}`)
    // Guard against a slow response landing after the admin moved on.
    if (fresh && fresh.id === selectedId.value) selectedSubmission.value = fresh
  } catch {
    // Keep existing data on error — a background blip must not clear the pane.
    if (!silent) { /* manual refresh: still keep what's on screen */ }
  }
}

async function handleArchived() {
  selectedId.value = null
  selectedSubmission.value = null
  await fetchSubmissions()
  // The detail (and its focused archive button) just unmounted — move focus to a
  // stable control in the list instead of letting it fall to <body>.
  nextTick(() => listRef.value?.focusTop?.())
}

// Reflect a mark-as-unread in the list (dot + counters) and the open detail (pill),
// without refetching — the row is already loaded.
function handleUnread(id) {
  const sub = submissions.value.find(s => s.id === id)
  if (sub) sub.is_read = false
  if (selectedSubmission.value && selectedSubmission.value.id === id) {
    selectedSubmission.value.is_read = false
  }
}

let exportMsgTimer = null
async function exportCsv() {
  if (exporting.value) return
  exporting.value = true
  exportFailed.value = false
  try {
    const res = await rawFetch('/api/submissions/export/csv')
    if (res.status === 401) { goToLogin(); return }
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    // Revoked a moment later: Safari can abort a download whose URL is
    // revoked in the same task as the click.
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  } catch {
    // Surface the failure on the button instead of silently doing nothing.
    exportFailed.value = true
    if (exportMsgTimer) clearTimeout(exportMsgTimer)
    exportMsgTimer = setTimeout(() => { exportFailed.value = false }, 4000)
  } finally {
    exporting.value = false
  }
}

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
