<template>
  <!-- The portal's other sections, as the same quiet header links each
       section has always used; only the ones this account may open. -->
  <router-link v-for="s in visible" :key="s.key" :to="s.to"
    class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors"
    :aria-label="s.label" :title="s.label">
    <FaIcon :name="s.icon" class="text-xs" />
    <!-- Labelled only where this header has room for every action. -->
    <span :class="LABEL_AT[labelAt]">{{ s.label }}</span>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { canAny } from '../../composables/useAuth.js'
import FaIcon from '../FaIcon.vue'

const props = defineProps({
  // The section this header belongs to; it is not linked to itself.
  current: { type: String, required: true },
  // From which width the links carry a text label (icon and tooltip below).
  labelAt: { type: String, default: 'lg' },
})

// Whole class names, so Tailwind sees them.
const LABEL_AT = { sm: 'hidden sm:inline', lg: 'hidden lg:inline', xl: 'hidden xl:inline', '2xl': 'hidden 2xl:inline' }

const SECTIONS = [
  { key: 'messages', label: 'Messages', icon: 'inbox', to: { name: 'Inbox' }, any: ['crm.view'] },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'comments', to: { name: 'WhatsApp' }, any: ['whatsapp.view'] },
  // The router moves an account without billing.view to the first billing
  // tab it may open.
  { key: 'billing', label: 'Billing', icon: 'file-invoice-dollar', to: { name: 'BillingOverview' }, any: ['billing.view', 'billing.status', 'whatsapp.contacts'] },
]

const visible = computed(() => SECTIONS.filter((s) => s.key !== props.current && canAny(...s.any)))
</script>
