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
      <div class="max-w-[1120px] mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-12">
        <!-- Who is signed in: drifts in through mist. -->
        <FadeContent effect="mist" trigger="mount" :duration="1.8" ease="power2.out">
          <section class="flex items-center gap-4 sm:gap-6" aria-label="Your account">
            <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand-navy text-white flex items-center justify-center font-heading text-2xl sm:text-3xl flex-shrink-0 shadow-md" aria-hidden="true">
              {{ initials }}
            </div>
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-ui font-medium uppercase tracking-[0.18em] text-gray-500">{{ today }}</p>
              <h2 class="font-heading text-3xl sm:text-5xl text-brand-navy tracking-tight leading-tight mt-1">{{ greeting }}</h2>
              <p class="text-sm font-ui text-gray-600 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span v-if="profile.roleLabel" class="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-navy/10 text-brand-navy text-xs font-semibold">{{ profile.roleLabel }}</span>
                <span class="truncate">{{ adminEmail }}</span>
              </p>
            </div>
          </section>
        </FadeContent>

        <p class="mt-10 sm:mt-14 mb-4 text-sm font-ui text-gray-600">Where would you like to start?</p>

        <!-- One big card per section, focusing in one after another. -->
        <FadeContent v-if="cards.length" effect="focus" trigger="mount" :duration="1" :delay="0.35" :stagger="0.12" ease="power3.out"
          class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <router-link v-for="card in cards" :key="card.key" :to="card.to"
            class="group relative bg-white rounded-2xl ring-1 ring-gray-200 hover:ring-brand-navy/30 hover:shadow-xl p-6 sm:p-7 flex flex-col min-h-[240px] sm:min-h-[280px] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">
            <span :class="card.tile" class="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-105">
              <FaIcon :name="card.icon" class="text-[28px] sm:text-[32px]" />
            </span>
            <p class="mt-6 text-[11px] font-ui font-semibold uppercase tracking-[0.16em] text-gray-500">{{ card.eyebrow }}</p>
            <h3 class="font-heading text-2xl sm:text-[28px] text-gray-900 tracking-tight mt-1">{{ card.title }}</h3>
            <p class="text-sm font-ui text-gray-600 mt-2 leading-relaxed">{{ card.description }}</p>
            <div class="mt-auto pt-6 flex items-center gap-3">
              <span v-if="card.stat" :class="card.stat.tone" class="inline-flex items-center gap-1.5 text-xs font-ui font-semibold px-2.5 py-1 rounded-full">
                <span :class="card.stat.dot" class="w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>{{ card.stat.text }}
              </span>
              <span class="ml-auto inline-flex items-center gap-2 text-sm font-ui font-semibold text-brand-navy">
                Open <FaIcon name="arrow-right" class="text-xs transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </router-link>
        </FadeContent>
        <p v-else class="text-sm font-ui text-gray-600 bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4">Use the links at the top to open the sections your account can use.</p>
      </div>
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

// Live figures on the cards; each one only for an account allowed to see it.
const stats = ref({})
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const cards = computed(() => [
  can('calls.view') && {
    key: 'calls', to: { name: 'Calls' }, icon: 'phone-volume',
    tile: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white',
    eyebrow: 'RingCentral', title: 'Call log',
    description: 'Who called, who answered, and who still needs a call back.',
    stat: stats.value.calls,
  },
  can('crm.view') && {
    key: 'inbox', to: { name: 'Inbox' }, icon: 'envelope-open-text',
    tile: 'bg-gradient-to-br from-brand-navy-light to-brand-navy text-white',
    eyebrow: 'Website leads', title: 'Inbox',
    description: 'Contact-form and chat inquiries, with replies and notes.',
    stat: stats.value.inbox,
  },
  canAny('billing.view', 'billing.status', 'whatsapp.contacts') && {
    key: 'billing', to: { name: 'BillingOverview' }, icon: 'file-invoice-dollar',
    tile: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white',
    eyebrow: 'Invoices & payments', title: 'Billing',
    description: 'Payment status, balances and reminders.',
    stat: stats.value.billing,
  },
].filter(Boolean))

const ALERT = { tone: 'bg-red-50 text-brand-red', dot: 'bg-brand-red' }
const CALM = { tone: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }

onMounted(() => {
  if (can('calls.view')) {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const params = new URLSearchParams({ from: start.toISOString(), to: new Date(Date.now() + 60000).toISOString() })
    get(`/api/calls?${params}`).then((d) => {
      if (d.connection !== 'connected') return
      const c = d.counts || {}
      stats.value = { ...stats.value, calls: c.not_returned ? { ...ALERT, text: `${plural(c.not_returned, 'call', 'calls')} to return today` } : { ...CALM, text: `${plural((c.incoming || 0) + (c.outgoing || 0), 'call', 'calls')} today` } }
    }).catch(() => {})
  }
  if (can('crm.view')) {
    get('/api/submissions?unread=true&limit=200').then((rows) => {
      const n = Array.isArray(rows) ? rows.length : 0
      stats.value = { ...stats.value, inbox: n ? { ...ALERT, text: `${n >= 200 ? '200+' : n} unread` } : { ...CALM, text: 'All read' } }
    }).catch(() => {})
  }
  if (can('billing.view')) {
    get('/api/billing/overview').then((d) => {
      const n = d?.byStatus?.overdue?.count || 0
      if (d?.lastImport) stats.value = { ...stats.value, billing: n ? { ...ALERT, text: `${plural(n, 'invoice', 'invoices')} overdue` } : { ...CALM, text: 'Nothing overdue' } }
    }).catch(() => {})
  }
})

async function handleLogout() {
  await logout()
  router.push({ name: 'Login' })
}
</script>
