<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader :title="t('header.title')" current="home" label-at="xl" actions-label-at="lg" />

    <div class="flex-1 overflow-y-auto overflow-x-hidden">
      <!-- lang: Home's own words follow the EN | ES switch; the header and
           its sections stay English. -->
      <div :lang="lang" class="min-h-full relative max-w-[1120px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-10 flex flex-col gap-4 sm:gap-5 font-ui">
        <!-- Greeting, top left, no card. The words rise in letter by letter
             (SplitText); the picture and role line settle in around them. -->
        <div class="flex items-start justify-between gap-4 px-1">
          <div class="flex items-center gap-4 min-w-0">
            <RiseIn :duration="0.7" :distance="10">
              <button type="button" @click="showAvatarPicker = true" :title="t('avatar.change')" :aria-label="t('avatar.change')"
                class="group relative flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy">
                <UserAvatar :avatar="profile.avatar" :size="avatarSize" :label="t('avatar.label')" class="ring-4 ring-white shadow-sm" />
                <span class="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white shadow ring-1 ring-black/5 text-gray-700 inline-flex items-center justify-center">
                  <FaIcon name="pen" class="text-[10px]" />
                </span>
              </button>
            </RiseIn>
            <div class="min-w-0">
              <!-- Keyed by language so a switch re-splits the new words. -->
              <SplitText :key="lang" tag="h2" :text="greetingText" effect="rise" split-type="chars" :delay="35" :duration="1.1"
                trigger="load" text-align="left" hover-effect="lift"
                class-name="text-[28px] sm:text-[38px] font-semibold tracking-tight text-gray-900 leading-tight" />
              <RiseIn :delay="0.55" :distance="8">
                <p class="text-[13px] text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span v-if="roleText" class="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white text-gray-800 text-[11px] font-semibold ring-1 ring-gray-200">{{ roleText }}</span>
                  <span class="truncate">{{ adminEmail }}</span>
                </p>
              </RiseIn>
            </div>
          </div>
          <!-- On a phone the switch stands upright under Themes, no wider than it,
               so the greeting keeps its width. -->
          <div class="flex flex-col-reverse items-end gap-2 sm:flex-row sm:items-start sm:gap-5 flex-shrink-0">
            <span class="hidden sm:block pt-3 text-[15px] font-medium tracking-tight text-gray-500 whitespace-nowrap">{{ today }}</span>
            <!-- EN | ES: the language of Home, kept in this browser. -->
            <div role="group" :aria-label="t('lang.group')" class="glass flex flex-col sm:flex-row items-center gap-0.5 rounded-full p-1 sm:mt-1.5 sm:pointer-coarse:mt-0">
              <button v-for="l in LANGS" :key="l" type="button" :lang="l" :title="LANG_NAMES[l]"
                :aria-pressed="lang === l" @click="setLang(l)"
                :class="lang === l ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-900/5'"
                class="h-8 min-w-9 pointer-coarse:h-11 pointer-coarse:min-w-11 px-2.5 rounded-full text-[12px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy">{{ l.toUpperCase() }}</button>
            </div>
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
        <p class="mt-2 px-1 text-[17px] font-semibold tracking-tight text-gray-900">{{ t('goto') }}</p>
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
        <p v-else class="text-sm text-gray-600 bg-white rounded-3xl px-5 py-4">{{ t('cards.empty') }}</p>

        <footer class="mt-4 px-1 flex items-center gap-1.5 text-[13px] tracking-tight">
          <span class="font-semibold text-gray-800">Campos Muños Law</span>
          <span class="text-xs text-gray-400" aria-hidden="true">✦</span>
          <span class="text-gray-500">{{ t('footer.portal') }}</span>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { zoneMidnightDaysAgo } from '../utils/firmTime.js'
import { daysAgo, toDate } from '../utils/text.js'
import { useAuth } from '../composables/useAuth.js'
import { useApi } from '../composables/useApi.js'
import PortalHeader from '../components/portal/PortalHeader.vue'
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
import { usePortalLang } from '../composables/usePortalLang.js'
import { LANGS, roleLabel } from '../i18n/dashboard.js'

const { adminEmail, profile, can, canAny, updateProfile } = useAuth()
const { get } = useApi()
const { lang, setLang, t } = usePortalLang()
// Each language named in itself, as language switches do.
const LANG_NAMES = { en: 'English', es: 'Español' }
const locale = computed(() => (lang.value === 'es' ? 'es-US' : 'en-US'))
const showAvatarPicker = ref(false)
const avatarSize = typeof window !== 'undefined' && window.innerWidth >= 640 ? 64 : 56

// The name set with scripts/staff.js set-name. Accounts without one are
// greeted without a name rather than by their email ("office").
const firstName = computed(() => String(profile.value.displayName || '').trim().split(/\s+/)[0] || '')
const timeOfDayKey = (() => {
  const h = new Date().getHours()
  return h < 12 ? 'greeting.morning' : h < 18 ? 'greeting.afternoon' : 'greeting.evening'
})()
const greetingText = computed(() => {
  const hello = t(timeOfDayKey)
  return firstName.value ? `${hello}, ${firstName.value}` : hello
})
// "Thursday, November 19" / "Jueves, 19 de noviembre" (capitalised: it
// stands alone as a line).
const today = computed(() => {
  const s = new Date().toLocaleDateString(locale.value, { weekday: 'long', month: 'long', day: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
})
const roleText = computed(() => roleLabel(lang.value, profile.value.role, profile.value.roleLabel))

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
  return date ? date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' }) : ''
}
const reportOf = (day) => (day ? t('overdue.report_of', { date: day }) : t('overdue.report_unknown_date'))
const oldestPill = (oldest) => {
  const when = daysAgo(oldest, Date.now(), lang.value)
  return when ? t('oldest_from', { when }) : null
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
      label: t('missed.label'),
      labelTone: 'text-danger-ink',
      arrowTone: 'bg-white/70 text-danger-ink',
      numberTone: 'text-danger-ink-strong',
      subTone: 'text-danger-ink opacity-80',
      value: !m ? '·' : connected ? total : '—',
      sub: m?.error ? t('figures.could_not_load') : connected
        ? `${t('missed.window')}${m.missed.voicemail ? ` · ${t('missed.voicemail', { count: m.missed.voicemail })}` : ''}`
        : m ? t('missed.not_connected') : t('missed.window'),
      pill: connected ? (notReturned ? t('missed.not_returned', { count: notReturned }) : t('missed.all_returned')) : null,
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
      label: t('unread.label'),
      labelTone: 'text-glass-navy-ink opacity-85',
      arrowTone: 'bg-glass-navy-chip text-glass-navy-ink',
      numberTone: 'text-glass-navy-ink',
      subTone: 'text-glass-navy-ink opacity-70',
      value: !u ? '·' : u.error ? '—' : u.count,
      sub: u?.error ? t('figures.could_not_load') : firstName.value ? t('unread.waiting_for', { name: firstName.value }) : t('unread.sources'),
      pill: u && !u.error ? (u.count ? oldestPill(u.oldest) : t('unread.all_caught_up')) : null,
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
      label: t('overdue.label'),
      labelTone: 'text-danger-ink',
      arrowTone: 'bg-white/70 text-danger-ink',
      numberTone: 'text-danger-ink-strong',
      subTone: 'text-danger-ink opacity-80',
      value: !b ? '·' : imported ? overdue.count : '—',
      sub: b?.error ? t('figures.could_not_load') : imported
        ? reportOf(shortDay(b.lastImport.report_date || b.lastImport.applied_at))
        : b ? t('overdue.no_report') : t('overdue.latest_report'),
      pill: imported && overdue.count ? t('overdue.owed', { amount: money(overdue.owedCents) }) : imported ? t('overdue.none') : null,
      pillTone: overdue.count ? 'bg-brand-red text-white' : 'bg-white/80 text-danger-ink-strong',
    })
    const r = b?.remindersAwaitingApproval
    out.push({
      key: 'reminders',
      to: { name: 'BillingReminders' },
      span: 'md:col-span-5',
      bg: 'glass-navy',
      icon: 'bell',
      label: t('approval.label'),
      labelTone: 'text-glass-navy-ink opacity-85',
      arrowTone: 'bg-glass-navy-chip text-glass-navy-ink',
      numberTone: 'text-glass-navy-ink',
      subTone: 'text-glass-navy-ink opacity-70',
      value: !b ? '·' : b.error ? '—' : r?.count ?? 0,
      sub: t('approval.sub'),
      pill: r?.count ? oldestPill(r.oldest) : b ? t('approval.none') : null,
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
    eyebrow: t('card.calls.eyebrow'), title: t('card.calls.title'),
    description: t('card.calls.description'),
  },
  can('crm.view') && {
    key: 'inbox', to: { name: 'Inbox' }, icon: 'envelope-open-text',
    tile: 'bg-brand-navy text-white',
    eyebrow: t('card.inbox.eyebrow'), title: t('card.inbox.title'),
    description: t('card.inbox.description'),
  },
  can('whatsapp.view') && {
    key: 'whatsapp', to: { name: 'WhatsApp' }, icon: 'comments',
    tile: 'bg-emerald-100 text-emerald-700',
    eyebrow: t('card.whatsapp.eyebrow'), title: t('card.whatsapp.title'),
    description: t('card.whatsapp.description'),
  },
  canAny('billing.view', 'billing.status', 'whatsapp.contacts') && {
    key: 'billing', to: { name: 'BillingOverview' }, icon: 'file-invoice-dollar',
    tile: 'bg-[color-mix(in_srgb,var(--color-brand-navy)_14%,var(--color-white))] text-brand-navy',
    eyebrow: t('card.billing.eyebrow'), title: t('card.billing.title'),
    description: t('card.billing.description'),
  },
  can('team.manage') && {
    key: 'team', to: { name: 'Team' }, icon: 'users',
    tile: 'bg-gray-100 text-gray-700',
    eyebrow: t('card.admin.eyebrow'), title: t('card.team.title'),
    description: t('card.team.description'),
  },
  can('activity.view') && {
    key: 'activity', to: { name: 'Activity' }, icon: 'clock-rotate-left',
    tile: 'bg-gray-100 text-gray-700',
    eyebrow: t('card.admin.eyebrow'), title: t('card.activity.title'),
    description: t('card.activity.description'),
  },
  can('forms.test') && {
    key: 'test-channel', to: { name: 'TestChannel' }, icon: 'flask',
    tile: 'bg-gray-100 text-gray-700',
    eyebrow: t('card.admin.eyebrow'), title: t('card.test.title'),
    description: t('card.test.description'),
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

// A card whose figures failed to load says so (figures.could_not_load),
// rather than claiming nothing is connected or imported. Each is tried once
// more after a few seconds.
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

</script>
