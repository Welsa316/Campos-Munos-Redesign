<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Same shell as every section. -->
    <header class="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 gap-3 z-10">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img src="/logo.png" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
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
        <button @click="handleLogout" aria-label="Sign out"
          class="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs" aria-hidden="true"></i>
          <span class="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>

    <ChangePasswordModal :visible="showChangePassword" @close="showChangePassword = false" />

    <div class="flex-1 overflow-y-auto">
      <main class="max-w-[1120px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-10 flex flex-col gap-4 sm:gap-5 font-ui">
        <!-- Top line, as in the design: practice on the left, date on the right -->
        <div class="flex items-center justify-between px-1 text-[15px] font-semibold tracking-tight text-gray-900">
          <span>@camulaw</span>
          <span class="text-gray-500 font-medium">{{ today }}</span>
        </div>

        <!-- Who is signed in: drifts in through mist. -->
        <FadeContent effect="mist" trigger="mount" :duration="1.8" ease="power2.out">
          <section class="bg-white rounded-3xl shadow-[0_2px_12px_0_rgba(0,0,0,0.03)] px-5 sm:px-7 py-5 sm:py-6 flex items-center gap-4 sm:gap-5" aria-label="Your account">
            <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-brand-navy to-brand-navy-light text-white flex items-center justify-center text-xl sm:text-2xl font-semibold flex-shrink-0 ring-4 ring-brand-navy/10" aria-hidden="true">
              {{ initials }}
            </div>
            <div class="min-w-0">
              <h2 class="text-[26px] sm:text-[34px] font-semibold tracking-tight text-gray-900 leading-tight">{{ greeting }}</h2>
              <p class="text-[13px] text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span v-if="profile.roleLabel" class="inline-flex items-center px-2.5 py-0.5 rounded-full bg-brand-surface text-gray-800 text-[11px] font-semibold">{{ profile.roleLabel }}</span>
                <span class="truncate">{{ adminEmail }}</span>
              </p>
            </div>
          </section>
        </FadeContent>

        <!-- The two figures that need someone today. Asymmetric on purpose. -->
        <FadeContent v-if="summaries.length" effect="focus" trigger="mount" :duration="1" :delay="0.25" :stagger="0.12" ease="power3.out"
          class="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
          <router-link v-for="s in summaries" :key="s.key" :to="s.to" :class="[s.bg, s.span]"
            class="group relative rounded-[24px] p-5 sm:p-6 min-h-[168px] flex flex-col justify-between shadow-sm hover:shadow-lg transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy">
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
        </FadeContent>

        <!-- Sections, side by side. -->
        <p class="mt-2 px-1 text-[17px] font-semibold tracking-tight text-gray-900">Go to</p>
        <FadeContent v-if="cards.length" effect="focus" trigger="mount" :duration="1" :delay="0.5" :stagger="0.1" ease="power3.out"
          class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <router-link v-for="card in cards" :key="card.key" :to="card.to"
            class="group bg-white rounded-3xl shadow-[0_2px_12px_0_rgba(0,0,0,0.03)] hover:shadow-[0_8px_28px_-6px_rgba(22,28,45,0.18)] p-5 sm:p-6 flex flex-col min-h-[210px] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
            <div class="flex items-start justify-between">
              <span :class="card.tile" class="w-[60px] h-[60px] rounded-[18px] flex items-center justify-center transition-transform group-hover:scale-105">
                <FaIcon :name="card.icon" class="text-[26px]" />
              </span>
              <span class="w-8 h-8 rounded-full border border-gray-200 text-gray-500 inline-flex items-center justify-center group-hover:bg-gray-900 group-hover:text-white group-hover:border-gray-900 transition-colors">
                <FaIcon name="arrow-right" class="text-xs" />
              </span>
            </div>
            <p class="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{{ card.eyebrow }}</p>
            <h3 class="text-[22px] font-semibold tracking-tight text-gray-900 mt-0.5">{{ card.title }}</h3>
            <p class="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{{ card.description }}</p>
          </router-link>
        </FadeContent>
        <p v-else class="text-sm text-gray-600 bg-white rounded-3xl px-5 py-4">Use the links at the top to open the sections your account can use.</p>

        <footer class="mt-4 px-1 flex items-center gap-1.5 text-[13px] tracking-tight">
          <span class="font-semibold text-gray-800">Campos Muños Law</span>
          <span class="text-xs text-gray-400" aria-hidden="true">✦</span>
          <span class="text-gray-500">Staff portal</span>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { useApi } from '../composables/useApi.js'
import SectionLinks from '../components/portal/SectionLinks.vue'
import ChangePasswordModal from '../components/messages/ChangePasswordModal.vue'
import FaIcon from '../components/FaIcon.vue'
import FadeContent from '../components/FadeContent.vue'

const router = useRouter()
const { adminEmail, profile, logout, can, canAny } = useAuth()
const { get } = useApi()
const showChangePassword = ref(false)

// The name colleagues see (admin_users.display_name, set with
// scripts/staff.js set-name). Without one the API falls back to the email's
// first part ("office"), which is no one's name: then no name is used.
const firstName = computed(() => {
  const name = String(profile.value.name || '').trim()
  const local = String(adminEmail.value || '').split('@')[0].toLowerCase()
  if (!name || name.toLowerCase() === local) return ''
  return name.split(/\s+/)[0]
})
const greeting = computed(() => {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return firstName.value ? `${part}, ${firstName.value}` : part
})
const initials = computed(() => {
  const name = firstName.value ? String(profile.value.name).trim() : String(adminEmail.value || '?').split('@')[0]
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
})
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

// --- the two summary cards ------------------------------------------------------

// Same start as the Calls page's "30 days" view, so the card and the list agree.
const monthStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 29); return d })()
const missed = ref(null) // { connection, configured, missed: {...} }
const unread = ref(null) // { count, oldest }

function ago(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days < 1) return 'today'
  return days === 1 ? 'yesterday' : `${days} days ago`
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
      bg: 'bg-[#f8dede] hover:bg-[#f5d4d4]',
      icon: 'phone-slash',
      label: 'Missed calls in business hours',
      labelTone: 'text-[#7c1515]',
      arrowTone: 'bg-white/70 text-[#7c1515]',
      numberTone: 'text-[#5c0f0f]',
      subTone: 'text-[#7c1515]/80',
      value: !m ? '·' : connected ? total : '—',
      sub: connected
        ? `Last 30 days · Mon–Fri 9–5${m.missed.voicemail ? ` · ${m.missed.voicemail} went to voicemail` : ''}`
        : m ? 'RingCentral is not connected yet' : 'Last 30 days · Mon–Fri 9–5',
      pill: connected ? (notReturned ? `${notReturned} not called back` : 'All called back') : null,
      pillTone: notReturned ? 'bg-brand-red text-white' : 'bg-white/80 text-[#5c0f0f]',
    })
  }
  if (can('crm.view')) {
    const u = unread.value
    out.push({
      key: 'unread',
      to: { name: 'Inbox' },
      span: out.length ? 'md:col-span-5' : 'md:col-span-12',
      bg: 'bg-brand-navy hover:bg-brand-navy-dark',
      icon: 'envelope-open-text',
      label: 'Unread messages',
      labelTone: 'text-white/85',
      arrowTone: 'bg-white/15 text-white',
      numberTone: 'text-white',
      subTone: 'text-white/70',
      value: !u ? '·' : u.count >= 200 ? '200+' : u.count,
      sub: firstName.value ? `Waiting for you, ${firstName.value}` : 'Website and chat inquiries',
      pill: u ? (u.count ? `Oldest from ${ago(u.oldest)}` : 'All caught up') : null,
      pillTone: 'bg-white/15 text-white',
    })
  }
  if (out.length === 1) out[0].span = 'md:col-span-12'
  return out
})

// --- the section cards ------------------------------------------------------------

const cards = computed(() => [
  can('calls.view') && {
    key: 'calls', to: { name: 'Calls' }, icon: 'phone-volume',
    tile: 'bg-[#f8dede] text-brand-red',
    eyebrow: 'RingCentral', title: 'Call log',
    description: 'Who called, who answered, and who still needs a call back.',
  },
  can('crm.view') && {
    key: 'inbox', to: { name: 'Inbox' }, icon: 'envelope-open-text',
    tile: 'bg-brand-navy text-white',
    eyebrow: 'Website leads', title: 'Inbox',
    description: 'Contact-form and chat inquiries, with replies and notes.',
  },
  canAny('billing.view', 'billing.status', 'whatsapp.contacts') && {
    key: 'billing', to: { name: 'BillingOverview' }, icon: 'file-invoice-dollar',
    tile: 'bg-[#dbe6f6] text-brand-navy',
    eyebrow: 'Invoices & payments', title: 'Billing',
    description: 'Payment status, balances and reminders.',
  },
].filter(Boolean))

onMounted(() => {
  if (can('calls.view')) {
    get(`/api/calls/summary?from=${encodeURIComponent(monthStart.toISOString())}`)
      .then((d) => { missed.value = d })
      .catch(() => { missed.value = { connection: 'unknown' } })
  }
  if (can('crm.view')) {
    get('/api/submissions?unread=true&limit=200').then((rows) => {
      const list = Array.isArray(rows) ? rows : []
      // Newest first from the API: the oldest waiting is the last one.
      unread.value = { count: list.length, oldest: list.length ? list[list.length - 1].created_at : null }
    }).catch(() => { unread.value = null })
  }
})

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
