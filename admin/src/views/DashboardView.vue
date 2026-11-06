<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Same shell as every section. -->
    <header class="nav-chrome h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img :src="LOGO_SRC" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight">Home</h1>
      </div>
      <div class="ml-auto flex items-center gap-1 sm:gap-3">
        <SectionLinks current="home" />
        <button @click="showChangePassword = true" aria-label="Change password" title="Change password"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-key text-xs" aria-hidden="true"></i>
          <span class="hidden lg:inline">Password</span>
        </button>
        <button @click="showNotifications = true" aria-label="Desktop notifications" title="Desktop notifications"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
          <FaIcon name="bell" class="text-xs" />
          <span class="hidden lg:inline">Notifications</span>
        </button>
        <button @click="handleLogout" aria-label="Sign out"
          class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
          <span class="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>

    <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />
    <NotificationsModal :visible="showNotifications" @close="showNotifications = false" />

    <div class="flex-1 overflow-y-auto overflow-x-hidden">
      <div class="min-h-full relative max-w-[1120px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-10 flex flex-col gap-4 sm:gap-5 font-ui">
        <!-- Greeting, top left, no card. The words rise in letter by letter
             (SplitText); the picture and role line settle in around them. -->
        <div class="flex items-start justify-between gap-4 px-1">
          <div class="flex items-center gap-4 min-w-0">
            <RiseIn :duration="0.7" :distance="10">
              <button type="button" @click="showAvatarPicker = true" title="Change your picture" aria-label="Change your picture"
                class="group relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy">
                <UserAvatar :avatar="profile.avatar" :size="avatarSize" label="Your picture" class="ring-4 ring-white shadow-sm" />
                <span class="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white shadow ring-1 ring-black/5 text-gray-700 inline-flex items-center justify-center">
                  <FaIcon name="pen" class="text-[10px]" />
                </span>
              </button>
            </RiseIn>
            <div class="min-w-0">
              <SplitText tag="h2" :text="greetingText" effect="rise" split-type="chars" :delay="35" :duration="1.1"
                trigger="load" text-align="left" hover-effect="lift"
                class-name="text-[28px] sm:text-[38px] font-semibold tracking-tight text-gray-900 leading-tight" />
              <RiseIn :delay="0.55" :distance="8">
                <p class="text-[13px] text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span v-if="profile.roleLabel" class="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white text-gray-800 text-[11px] font-semibold ring-1 ring-gray-200">{{ profile.roleLabel }}</span>
                  <span class="truncate">{{ adminEmail }}</span>
                </p>
              </RiseIn>
            </div>
          </div>
          <div class="flex items-start gap-4 sm:gap-5 flex-shrink-0">
            <span class="hidden sm:block pt-3 text-[15px] font-medium tracking-tight text-gray-500 whitespace-nowrap">{{ today }}</span>
            <ThemeFolder />
          </div>
        </div>

        <AvatarPicker :visible="showAvatarPicker" :current="profile.avatar" @close="showAvatarPicker = false" @saved="updateProfile" />

        <!-- The two figures that need someone today. Asymmetric on purpose. -->
        <RiseIn v-if="summaries.length" :delay="0.15" :stagger="0.12" class="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
          <router-link v-for="s in summaries" :key="s.key" :to="s.to" :class="[s.bg, s.span]" v-glass-light
            class="group relative glass glass-interactive rounded-[24px] p-5 sm:p-6 min-h-[168px] flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy">
            <div class="flex items-start justify-between gap-3">
              <p :class="s.labelTone" class="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
                <FaIcon :name="s.icon" class="text-[13px]" />{{ s.label }}
              </p>
              <span :class="s.arrowTone" class="w-8 h-8 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-transform group-hover:rotate-0 -rotate-45">
                <FaIcon name="arrow-right" class="text-xs" />
              </span>
            </div>
            <div class="mt-4 flex items-end justify-between gap-3">
              <div class="min-w-0">
                <p :class="s.numberTone" class="text-[46px] sm:text-[56px] font-bold tracking-tight leading-none tabular-nums">{{ s.value }}</p>
                <p :class="s.subTone" class="text-[12px] mt-2">{{ s.sub }}</p>
              </div>
              <span v-if="s.pill" :class="s.pillTone" class="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">{{ s.pill }}</span>
            </div>
          </router-link>
        </RiseIn>

        <!-- What is waiting for me: callback reminders and new website messages. -->
        <RiseIn v-if="canAny('calls.view', 'crm.view')" :delay="0.25" :duration="0.45" :distance="10" class="mt-2">
          <MyFollowUps />
        </RiseIn>

        <!-- Sections, side by side. -->
        <p class="mt-2 px-1 text-[17px] font-semibold tracking-tight text-gray-900">Go to</p>
        <!-- The row always fills its width: one or two big cards, three or
             four standard, five or more compact (a short last row stretches). -->
        <RiseIn v-if="cards.length" :delay="0.35" :stagger="0.1" class="flex flex-wrap gap-3 sm:gap-4">
          <TiltedCard v-for="card in cards" :key="card.key" :class="cardBasis" class="grow min-w-0"
            :radius="24" :rotate-amplitude="cardSize === 'lg' ? 6 : 9" :scale-on-hover="1" :glare="0.45" :shadow="0.3" :perspective="cardSize === 'lg' ? 1200 : 900">
          <router-link :to="card.to" :class="SIZE[cardSize].card"
            class="group glass rounded-3xl h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy">
            <div class="flex items-start justify-between">
              <span :class="[card.tile, SIZE[cardSize].tile]" class="flex items-center justify-center">
                <FaIcon :name="card.icon" :class="SIZE[cardSize].icon" />
              </span>
              <span class="w-8 h-8 rounded-full border border-gray-200 text-gray-500 inline-flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 transition-colors">
                <FaIcon name="arrow-right" class="text-xs" />
              </span>
            </div>
            <p :class="SIZE[cardSize].eyebrow" class="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{{ card.eyebrow }}</p>
            <h3 :class="SIZE[cardSize].title" class="font-semibold tracking-tight text-gray-900 mt-0.5">{{ card.title }}</h3>
            <p :class="SIZE[cardSize].text" class="text-gray-500 mt-1.5 leading-relaxed">{{ card.description }}</p>
          </router-link>
          </TiltedCard>
        </RiseIn>
        <p v-else class="text-sm text-gray-600 bg-white rounded-3xl px-5 py-4">Use the links at the top to open the sections your account can use.</p>

        <footer class="mt-4 px-1 flex items-center gap-1.5 text-[13px] tracking-tight">
          <span class="font-semibold text-gray-800">Campos Muños Law</span>
          <span class="text-xs text-gray-400" aria-hidden="true">✦</span>
          <span class="text-gray-500">Staff portal</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { LOGO_SRC } from '../data/brand.js'
import { zoneMidnightDaysAgo } from '../utils/firmTime.js'
import { daysAgo, toDate } from '../utils/text.js'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useApi } from '../composables/useApi.js'
import SectionLinks from '../components/portal/SectionLinks.vue'
import ChangePasswordModal from '../components/messages/ChangePasswordModal.vue'
import NotificationsModal from '../components/portal/NotificationsModal.vue'
import FaIcon from '../components/FaIcon.vue'
import { money } from '../modules/billing/api.js'
import SplitText from '../components/SplitText.vue'
import TiltedCard from '../components/TiltedCard.vue'
import ThemeFolder from '../components/ThemeFolder.vue'
import { vGlassLight } from '../directives/glassLight.js'
import RiseIn from '../components/RiseIn.vue'
import UserAvatar from '../components/UserAvatar.vue'
import AvatarPicker from '../components/AvatarPicker.vue'
import MyFollowUps from '../modules/reminders/MyFollowUps.vue'

const router = useRouter()
const { adminEmail, profile, logout, can, canAny, updateProfile } = useAuth()
const { get } = useApi()
const showChangePassword = ref(false)
const showNotifications = ref(false)
const showAvatarPicker = ref(false)
const avatarSize = typeof window !== 'undefined' && window.innerWidth >= 640 ? 64 : 56

// The name set with scripts/staff.js set-name. Accounts without one are
// greeted without a name rather than by their email ("office").
const firstName = computed(() => String(profile.value.displayName || '').trim().split(/\s+/)[0] || '')
const greetingText = computed(() => (firstName.value ? `${timeOfDay}, ${firstName.value}` : timeOfDay))
const timeOfDay = (() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})()
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

// --- the two summary cards ------------------------------------------------------

// Same start as the Calls page's "30 days" view (New Orleans midnight), so
// the card and the list agree.
const monthStart = zoneMidnightDaysAgo(29)
const missed = ref(null) // { connection, configured, missed: {...} }
const unread = ref(null) // { count, oldest }
const billing = ref(null) // /api/billing/overview, for billing accounts

// Which figures an account sees: phones and messages for whoever answers
// them (front desk, receptionist, administrators); billing figures for
// accounts that work billing but not phones or leads (billing paralegal).
const showsBillingFigures = computed(() => can('billing.view') && !can('calls.view') && !can('crm.view'))

function shortDay(d) {
  const s = String(d || '')
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const date = m && s.length <= 10 ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : toDate(s)
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'an unknown date'
}


const summaries = computed(() => {
  const out = []
  if (can('calls.view')) {
    const m = missed.value
    const connected = m?.connection === 'connected'
    const total = m?.missed?.total
    const notReturned = m?.missed?.notReturned || 0
    out.push({
      key: 'missed',
      // Not connected: an administrator fixes it on Integrations.
      to: connected || !can('integrations.manage') ? { name: 'Calls', query: { range: 'month', filter: 'unanswered', hours: 'business' } } : { name: 'Integrations' },
      span: 'md:col-span-7',
      bg: 'glass-rose',
      icon: 'phone-slash',
      label: 'Missed calls in business hours',
      labelTone: 'text-danger-ink',
      arrowTone: 'bg-white/70 text-danger-ink',
      numberTone: 'text-danger-ink-strong',
      subTone: 'text-danger-ink opacity-80',
      value: !m ? '·' : connected ? total : '—',
      sub: m?.error ? COULD_NOT_LOAD : connected
        ? `Last 30 days · Mon–Fri 9–5${m.missed.voicemail ? ` · ${m.missed.voicemail} went to voicemail` : ''}`
        : m ? 'RingCentral is not connected yet' : 'Last 30 days · Mon–Fri 9–5',
      pill: connected ? (notReturned ? `${notReturned} not called back` : 'All called back') : null,
      pillTone: notReturned ? 'bg-brand-red text-white' : 'bg-white/80 text-danger-ink-strong',
    })
  }
  if (can('crm.view')) {
    const u = unread.value
    out.push({
      key: 'unread',
      to: { name: 'Inbox' },
      span: out.length ? 'md:col-span-5' : 'md:col-span-12',
      bg: 'glass-navy',
      icon: 'envelope-open-text',
      label: 'Unread messages',
      labelTone: 'text-glass-navy-ink opacity-85',
      arrowTone: 'bg-glass-navy-chip text-glass-navy-ink',
      numberTone: 'text-glass-navy-ink',
      subTone: 'text-glass-navy-ink opacity-70',
      value: !u ? '·' : u.error ? '—' : u.count,
      sub: u?.error ? COULD_NOT_LOAD : firstName.value ? `Waiting for you, ${firstName.value}` : 'Website and chat inquiries',
      pill: u && !u.error ? (u.count ? (daysAgo(u.oldest) ? `Oldest from ${daysAgo(u.oldest)}` : null) : 'All caught up') : null,
      pillTone: 'bg-glass-navy-chip text-glass-navy-ink',
    })
  }
  if (showsBillingFigures.value) {
    const b = billing.value
    const imported = Boolean(b?.lastImport)
    const overdue = b?.byStatus?.overdue || { count: 0, owedCents: 0 }
    out.push({
      key: 'overdue',
      to: { name: 'BillingInvoices', query: { status: 'overdue' } },
      span: 'md:col-span-7',
      bg: 'glass-rose',
      icon: 'file-invoice-dollar',
      label: 'Overdue invoices',
      labelTone: 'text-danger-ink',
      arrowTone: 'bg-white/70 text-danger-ink',
      numberTone: 'text-danger-ink-strong',
      subTone: 'text-danger-ink opacity-80',
      value: !b ? '·' : imported ? overdue.count : '—',
      sub: b?.error ? COULD_NOT_LOAD : imported
        ? `From the eImmigration report of ${shortDay(b.lastImport.report_date || b.lastImport.applied_at)}`
        : b ? 'No eImmigration report imported yet' : 'From the latest eImmigration report',
      pill: imported && overdue.count ? `${money(overdue.owedCents)} owed` : imported ? 'Nothing overdue' : null,
      pillTone: overdue.count ? 'bg-brand-red text-white' : 'bg-white/80 text-danger-ink-strong',
    })
    const r = b?.remindersAwaitingApproval
    out.push({
      key: 'reminders',
      to: { name: 'BillingReminders' },
      span: 'md:col-span-5',
      bg: 'glass-navy',
      icon: 'bell',
      label: 'Reminders waiting for approval',
      labelTone: 'text-glass-navy-ink opacity-85',
      arrowTone: 'bg-glass-navy-chip text-glass-navy-ink',
      numberTone: 'text-glass-navy-ink',
      subTone: 'text-glass-navy-ink opacity-70',
      value: !b ? '·' : b.error ? '—' : r?.count ?? 0,
      sub: 'Payment reminders drafted by the rules',
      pill: r?.count ? (daysAgo(r.oldest) ? `Oldest from ${daysAgo(r.oldest)}` : null) : b ? 'Nothing to approve' : null,
      pillTone: 'bg-glass-navy-chip text-glass-navy-ink',
    })
  }
  if (out.length === 1) out[0].span = 'md:col-span-12'
  return out
})

// --- the section cards ------------------------------------------------------------

const cards = computed(() => [
  can('calls.view') && {
    key: 'calls', to: { name: 'Calls' }, icon: 'phone-volume',
    tile: 'bg-[color-mix(in_srgb,var(--color-brand-red)_14%,var(--color-white))] text-brand-red',
    eyebrow: 'RingCentral', title: 'Call log',
    description: 'Who called, who answered, and who still needs a call back.',
  },
  can('crm.view') && {
    key: 'inbox', to: { name: 'Inbox' }, icon: 'envelope-open-text',
    tile: 'bg-brand-navy text-white',
    eyebrow: 'Website leads', title: 'Inbox',
    description: 'Contact-form and chat inquiries, with replies and notes.',
  },
  can('whatsapp.view') && {
    key: 'whatsapp', to: { name: 'WhatsApp' }, icon: 'comments',
    tile: 'bg-emerald-100 text-emerald-700',
    eyebrow: 'Client conversations', title: 'WhatsApp',
    description: 'Shared WhatsApp inbox: replies, assignments and notes.',
  },
  canAny('billing.view', 'billing.status', 'whatsapp.contacts') && {
    key: 'billing', to: { name: 'BillingOverview' }, icon: 'file-invoice-dollar',
    tile: 'bg-[color-mix(in_srgb,var(--color-brand-navy)_14%,var(--color-white))] text-brand-navy',
    eyebrow: 'Invoices & payments', title: 'Billing',
    description: 'Payment status, balances and reminders.',
  },
  can('team.manage') && {
    key: 'team', to: { name: 'Team' }, icon: 'users',
    tile: 'bg-gray-100 text-gray-700',
    eyebrow: 'Administrator', title: 'Team',
    description: 'Who has access, their roles, and revoking or restoring it.',
  },
  can('activity.view') && {
    key: 'activity', to: { name: 'Activity' }, icon: 'clock-rotate-left',
    tile: 'bg-gray-100 text-gray-700',
    eyebrow: 'Administrator', title: 'Activity',
    description: 'Every change made in the portal, by whom and when.',
  },
  can('forms.test') && {
    key: 'test-channel', to: { name: 'TestChannel' }, icon: 'flask',
    tile: 'bg-gray-100 text-gray-700',
    eyebrow: 'Administrator', title: 'Test channel',
    description: 'Send test forms through the website without touching the inbox.',
  },
].filter(Boolean))

// "Go to" cards size themselves to how many there are (whole class names,
// so Tailwind sees them).
const cardSize = computed(() => (cards.value.length <= 2 ? 'lg' : cards.value.length <= 4 ? 'md' : 'sm'))
const cardBasis = computed(() => {
  const n = cards.value.length
  if (n === 1) return 'basis-full'
  if (n === 2) return 'basis-full sm:basis-[calc(50%-0.5rem)]'
  if (n === 3) return 'basis-full sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(33.333%-0.67rem)]'
  return 'basis-full sm:basis-[calc(50%-0.5rem)] lg:basis-[calc(25%-0.75rem)]'
})
const SIZE = {
  lg: { card: 'p-6 sm:p-8 min-h-[240px]', tile: 'w-[72px] h-[72px] rounded-[20px]', icon: 'text-[32px]', eyebrow: 'mt-6', title: 'text-[26px] sm:text-[28px]', text: 'text-[14px] max-w-md' },
  md: { card: 'p-5 sm:p-6 min-h-[210px]', tile: 'w-[60px] h-[60px] rounded-[18px]', icon: 'text-[26px]', eyebrow: 'mt-5', title: 'text-[22px]', text: 'text-[13px]' },
  sm: { card: 'p-4 sm:p-5 min-h-[180px]', tile: 'w-[48px] h-[48px] rounded-[14px]', icon: 'text-[21px]', eyebrow: 'mt-4', title: 'text-[19px]', text: 'text-[12.5px]' },
}

// A card whose figures failed to load says so, rather than claiming nothing
// is connected or imported. Each is tried once more after a few seconds.
const COULD_NOT_LOAD = 'Could not load these figures. Open the page, or reload to try again.'
const withRetry = (fn) => fn().catch(() => new Promise((r) => setTimeout(r, 4000)).then(fn))

// Kept alive between sections (App.vue): coming back shows the figures at
// once and refreshes them in the background. A failed background refresh
// keeps the figures already shown.
function loadFigures({ quiet = false } = {}) {
  const failed = (current) => (quiet && current && !current.error ? current : { error: true })
  if (showsBillingFigures.value) {
    withRetry(() => get('/api/billing/overview')).then((d) => { billing.value = d }).catch(() => { billing.value = failed(billing.value) })
  }
  if (can('calls.view')) {
    withRetry(() => get(`/api/calls/summary?from=${encodeURIComponent(monthStart.toISOString())}`))
      .then((d) => { missed.value = d })
      .catch(() => { missed.value = failed(missed.value) })
  }
  if (can('crm.view')) {
    withRetry(() => get('/api/submissions/unread-count'))
      .then((d) => { unread.value = { count: Number(d?.count) || 0, oldest: d?.oldest || null } })
      .catch(() => { unread.value = failed(unread.value) })
  }
}
let activations = 0
onMounted(() => loadFigures())
onActivated(() => { if (activations++) loadFigures({ quiet: true }) })

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
