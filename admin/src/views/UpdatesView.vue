<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader title="Updates" current="updates" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[760px] mx-auto px-4 sm:px-6 py-6 sm:py-8 font-ui">
        <p class="text-[13px] text-gray-600">What changed in the portal for the parts you use, newest first.</p>

        <p v-if="!list.length" class="mt-6 bg-white rounded-2xl ring-1 ring-gray-200 px-6 py-10 text-center text-[13px] text-gray-600">Nothing has changed for you yet.</p>

        <ol v-else class="mt-5 space-y-3">
          <li v-for="u in list" :key="u.id">
            <article class="bg-white rounded-2xl ring-1 ring-gray-200 px-5 sm:px-6 py-5" :aria-labelledby="`update-${u.id}`">
              <p class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-gray-600">
                <span class="inline-flex items-center gap-1.5 font-semibold text-gray-700"><FaIcon :name="SECTIONS[u.section].icon" class="text-[11px] text-gray-500" />{{ SECTIONS[u.section].label }}</span>
                <span aria-hidden="true">·</span>
                <time :datetime="u.at" class="tabular-nums">{{ day(u.at) }}</time>
                <span v-if="isNew(u, now)" class="px-1.5 rounded bg-brand-navy text-white text-[10px] font-bold uppercase tracking-wide leading-[18px]">New</span>
              </p>
              <h2 :id="`update-${u.id}`" class="mt-2 font-ui text-[16px] font-semibold tracking-tight text-gray-900">{{ u.title }}</h2>
              <p class="mt-1 text-[13.5px] text-gray-700 leading-relaxed">{{ u.summary }}</p>
              <ul v-if="u.points.length" class="mt-2.5 space-y-1.5 text-[13px] text-gray-700 leading-relaxed list-disc pl-5 marker:text-gray-400">
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

const now = Date.now()
const list = computed(() => visibleUpdates(UPDATES, canAny))
const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const day = (at) => DAY.format(new Date(at))
</script>
