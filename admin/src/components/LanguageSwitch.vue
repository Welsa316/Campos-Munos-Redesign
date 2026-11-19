<template>
  <!-- The portal's language: ES (Mexican flag) then EN (US flag), as on the
       public site (site/src/components/LanguageToggle.vue), at the bottom
       left of every page and of sign-in.

       It sits in a strip of its own instead of floating over the page: while
       it shows, <html> carries .lang-docked and style.css shortens every
       page by the strip's height (--lang-dock), so no list row, reply box,
       composer or bottom button can ever be underneath it, at any width,
       including sections that know nothing about it. The strip takes the
       page's own background, with a hairline above it so a page plainly ends
       there rather than being cut off. Dialogs, slide-over panels and toasts
       sit above it. -->
  <div v-if="shown" class="lang-dock fixed inset-x-0 bottom-0 z-20 flex items-center bg-brand-surface border-t border-gray-200 pointer-events-none" data-lang-dock>
    <div role="group" :aria-label="t('lang.group')"
      class="pointer-events-auto ml-4 sm:ml-6 h-12 sm:h-[52px] p-1 sm:p-1.5 rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm flex items-center gap-1 font-ui">
      <button v-for="l in ORDER" :key="l.code" type="button" :lang="l.code" :aria-label="t(`lang.${l.code}`)"
        :aria-pressed="lang === l.code" @click="setLang(l.code)"
        :class="lang === l.code ? 'bg-brand-navy text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-brand-surface'"
        class="h-full min-w-[64px] px-3 sm:px-3.5 rounded-[11px] inline-flex items-center justify-center gap-2 text-[14px] font-bold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-brand-navy">
        <FlagIcon :country="l.flag" class="w-5 h-3.5" />
        {{ l.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import FlagIcon from './FlagIcon.vue'
import { useT } from '../i18n/translator.js'
import { PORTAL } from '../i18n/portal.js'
import { usePortalLang } from '../composables/usePortalLang.js'

const ORDER = [
  { code: 'es', flag: 'mx', label: 'ES' },
  { code: 'en', flag: 'us', label: 'EN' },
]

// The sales demo is fabricated English data, not part of anyone's work.
const HIDDEN_ON = new Set(['OperationsDemo'])

const route = useRoute()
const { t } = useT(PORTAL)
const { lang, setLang } = usePortalLang()

// Hidden until the first route has resolved, so it never flashes on a page
// it does not belong to.
const shown = computed(() => Boolean(route.name) && !HIDDEN_ON.has(route.name))

const dock = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('lang-docked', on) }
watch(shown, dock, { immediate: true })
onBeforeUnmount(() => dock(false))
</script>
