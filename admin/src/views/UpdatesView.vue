<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader :title="t('updates.title')" current="updates" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[760px] mx-auto px-4 sm:px-6 py-6 sm:py-8 font-ui">
        <p class="text-[13px] text-gray-600">{{ t('updates.intro') }}<template v-if="lang !== 'en'"> {{ t('updates.entries_note') }}</template></p>

        <p v-if="!list.length" class="mt-6 bg-white rounded-2xl ring-1 ring-gray-200 px-6 py-10 text-center text-[13px] text-gray-600">{{ t('updates.empty') }}</p>

        <ol v-else class="mt-5 space-y-3">
          <li v-for="u in list" :key="u.id">
            <article class="bg-white rounded-2xl ring-1 ring-gray-200 px-5 sm:px-6 py-5" :aria-labelledby="`update-${u.id}`">
              <p class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-gray-600">
                <span class="inline-flex items-center gap-1.5 font-semibold text-gray-700"><FaIcon :name="SECTIONS[u.section].icon" class="text-[11px] text-gray-500" />{{ t(`updates.section.${u.section}`) }}</span>
                <span aria-hidden="true">·</span>
                <time :datetime="u.at" class="tabular-nums">{{ day(u.at) }}</time>
                <span v-if="isNew(u, now)" class="px-1.5 rounded bg-brand-navy text-white text-[10px] font-bold uppercase tracking-wide leading-[18px]">{{ t('updates.new') }}</span>
              </p>
              <!-- The entries themselves are written in English only. -->
              <h2 :id="`update-${u.id}`" lang="en" class="mt-2 font-ui text-[16px] font-semibold tracking-tight text-gray-900">{{ u.title }}</h2>
              <p lang="en" class="mt-1 text-[13.5px] text-gray-700 leading-relaxed">{{ u.summary }}</p>
              <ul v-if="u.points.length" lang="en" class="mt-2.5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed list-disc pl-5 marker:text-gray-400">
                <li v-for="(p, i) in u.points" :key="i">{{ p }}</li>
              </ul>
            </article>
          </li>
        </ol>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { canAny } from '../composables/useAuth.js'
import PortalHeader from '../components/portal/PortalHeader.vue'
import FaIcon from '../components/FaIcon.vue'
import { UPDATES, SECTIONS, visibleUpdates, isNew } from '../data/updates.js'
import { useT } from '../i18n/translator.js'
import { PORTAL } from '../i18n/portal.js'

const { t, lang, locale } = useT(PORTAL)

const now = Date.now()
const list = computed(() => visibleUpdates(UPDATES, canAny))
const DAY = computed(() => new Intl.DateTimeFormat(locale.value, { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))
const day = (at) => DAY.value.format(new Date(at))
</script>
