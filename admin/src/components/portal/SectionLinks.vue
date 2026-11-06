<template>
  <!-- The portal's other sections, as the same quiet header links each
       section has always used; only the ones this account may open. -->
  <nav aria-label="Portal sections" class="flex items-center gap-1 lg:gap-2">
  <router-link v-for="s in visible" :key="s.key" :to="s.to"
    :class="[LINK, s.admin && adminLinks.length > 1 ? 'hidden lg:flex' : '']"
    :aria-label="s.label" :title="s.label">
    <span class="relative inline-flex">
      <FaIcon :name="s.icon" class="text-xs" />
      <!-- Updates: something changed in the last 48 hours for this account.
           A dot on the icon where it has no label, so nothing beside it is
           covered; a "New" tag after the label where it has one. -->
      <span v-if="s.key === 'updates' && updatesNew" :class="UNLABELLED_AT[labelAt]"
        class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-navy ring-2 ring-white" aria-hidden="true"></span>
    </span>
    <!-- Labelled only where this header has room for every action. -->
    <span :class="LABEL_AT[labelAt]">{{ s.label }}</span>
    <span v-if="s.key === 'updates' && updatesNew" :class="LABEL_AT[labelAt]"
      class="px-1.5 rounded bg-brand-navy text-white text-[10px] font-bold leading-[16px] uppercase tracking-wide" aria-hidden="true">New</span>
    <span v-if="s.key === 'updates' && updatesNew" class="sr-only">, new</span>
  </router-link>

  <!-- Below lg the administrator's own sections share one menu, so a phone
       header still has room for Sign Out. -->
  <details v-if="adminLinks.length > 1" ref="menu" class="relative lg:hidden">
    <summary :class="LINK" class="list-none [&::-webkit-details-marker]:hidden cursor-pointer" aria-label="Administrator sections" title="Administrator">
      <FaIcon name="lock" class="text-xs" />
    </summary>
    <ul class="absolute right-0 top-full mt-2 w-48 rounded-xl bg-white ring-1 ring-gray-200 shadow-lg py-1 z-30">
      <li v-for="s in adminLinks" :key="s.key">
        <router-link :to="s.to" @click="close"
          class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-ui font-medium text-gray-700 hover:bg-brand-surface hover:text-brand-navy">
          <FaIcon :name="s.icon" class="text-xs w-4" />{{ s.label }}
        </router-link>
      </li>
    </ul>
  </details>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { canAny } from '../../composables/useAuth.js'
import FaIcon from '../FaIcon.vue'
import { UPDATES, hasNew } from '../../data/updates.js'

const props = defineProps({
  // The section this header belongs to; it is not linked to itself.
  current: { type: String, required: true },
  // From which width the links carry a text label (icon and tooltip below).
  labelAt: { type: String, default: 'xl' },
})

// Whole class names, so Tailwind sees them.
const LABEL_AT = { sm: 'hidden sm:inline', lg: 'hidden lg:inline', xl: 'hidden xl:inline', '2xl': 'hidden 2xl:inline' }
const UNLABELLED_AT = { sm: 'sm:hidden', lg: 'lg:hidden', xl: 'xl:hidden', '2xl': '2xl:hidden' }
const LINK = 'flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors'

const SECTIONS = [
  { key: 'home', label: 'Home', icon: 'house', to: { name: 'Home' }, any: [] },
  // What changed, for everyone (each sees the entries for what they can open).
  { key: 'updates', label: 'Updates', icon: 'bullhorn', to: { name: 'Updates' }, any: [] },
  { key: 'messages', label: 'Messages', icon: 'inbox', to: { name: 'Inbox' }, any: ['crm.view'] },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'comments', to: { name: 'WhatsApp' }, any: ['whatsapp.view'] },
  // The router moves an account without billing.view to the first billing
  // tab it may open.
  { key: 'billing', label: 'Billing', icon: 'file-invoice-dollar', to: { name: 'BillingOverview' }, any: ['billing.view', 'billing.status', 'whatsapp.contacts'] },
  { key: 'calls', label: 'Calls', icon: 'phone-volume', to: { name: 'Calls' }, any: ['calls.view'] },
  // Administrators only: connecting RingCentral, accounts, the activity log.
  { key: 'integrations', label: 'Integrations', icon: 'plug', to: { name: 'Integrations' }, any: ['integrations.manage'], admin: true },
  { key: 'team', label: 'Team', icon: 'users', to: { name: 'Team' }, any: ['team.manage'], admin: true },
  { key: 'activity', label: 'Activity', icon: 'clock-rotate-left', to: { name: 'Activity' }, any: ['activity.view'], admin: true },
]

// An empty list means every signed-in account (Home).
const updatesNew = computed(() => hasNew(UPDATES, canAny))
const visible = computed(() => SECTIONS.filter((s) => s.key !== props.current && (!s.any.length || canAny(...s.any))))
const adminLinks = computed(() => visible.value.filter((s) => s.admin))

const menu = ref(null)
const close = () => { if (menu.value) menu.value.open = false }
const onOutside = (e) => { if (menu.value?.open && !menu.value.contains(e.target)) close() }
const onKey = (e) => { if (e.key === 'Escape' && menu.value?.open) { close(); menu.value.querySelector('summary')?.focus() } }
onMounted(() => { document.addEventListener('click', onOutside); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', onOutside); document.removeEventListener('keydown', onKey) })
</script>
