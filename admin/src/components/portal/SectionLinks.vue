<template>
  <!-- The portal's other sections, as the same quiet header links each
       section has always used; only the ones this account may open. -->
  <nav aria-label="Portal sections" class="flex items-center gap-1 lg:gap-2">
  <router-link v-for="s in visible" :key="s.key" :to="s.to"
    :class="[LINK, s.admin && adminLinks.length > 1 ? 'hidden lg:flex' : '']"
    :aria-label="linkName(s, updatesNew)" :title="s.label">
    <span class="relative inline-flex">
      <FaIcon :name="s.icon" class="text-xs" />
      <!-- Updates: something changed in the last 48 hours for this account.
           A dot on the icon where it has no label, so nothing beside it is
           covered; a "New" tag after the label where it has one. Both take
           the navigation's own colours (style.css), so they show on the
           header in every theme. -->
      <span v-if="s.key === 'updates' && updatesNew" :class="unlabelledClass(labelAt)"
        class="updates-dot absolute -top-1 -right-1 w-2 h-2 rounded-full" data-updates-dot aria-hidden="true"></span>
    </span>
    <!-- Labelled only where this header has room for every action. -->
    <span :class="labelClass(labelAt)">{{ s.label }}</span>
    <span v-if="s.key === 'updates' && updatesNew" :class="labelClass(labelAt)"
      class="updates-tag px-1.5 rounded text-[10px] font-bold leading-[16px] uppercase tracking-wide" aria-hidden="true">New</span>
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
import { visibleSections, labelClass, unlabelledClass, linkName } from './sectionLinks.js'

const props = defineProps({
  // The section this header belongs to; it is not linked to itself.
  current: { type: String, required: true },
  // From which width the links carry a text label (icon and tooltip below).
  labelAt: { type: String, default: 'xl' },
})

const LINK = 'flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors'

const updatesNew = computed(() => hasNew(UPDATES, canAny))
const visible = computed(() => visibleSections(props.current, canAny))
const adminLinks = computed(() => visible.value.filter((s) => s.admin))

const menu = ref(null)
const close = () => { if (menu.value) menu.value.open = false }
const onOutside = (e) => { if (menu.value?.open && !menu.value.contains(e.target)) close() }
const onKey = (e) => { if (e.key === 'Escape' && menu.value?.open) { close(); menu.value.querySelector('summary')?.focus() } }
onMounted(() => { document.addEventListener('click', onOutside); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', onOutside); document.removeEventListener('keydown', onKey) })
</script>
