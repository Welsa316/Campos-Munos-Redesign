<template>
  <!-- Only on a tab opened from the portal's Test channel link
       (utils/testMode.js); nobody else ever sees it. Under the header and
       beneath the chat, the menu and every dialog, so it never covers the
       forms being tested. -->
  <div v-if="testToken" role="status"
    class="fixed left-1/2 -translate-x-1/2 top-[5.25rem] z-[95] w-[calc(100%-2rem)] max-w-max flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-amber-100 text-amber-950 ring-1 ring-amber-300 shadow-lg font-ui text-[13px]">
    <i class="fa-solid fa-flask shrink-0 text-amber-700" aria-hidden="true"></i>
    <span class="min-w-0"><strong class="font-semibold">{{ t('testMode.label') }}</strong> {{ t('testMode.note') }}</span>
    <button type="button" @click="endTestMode"
      class="shrink-0 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white text-amber-950 font-semibold ring-1 ring-amber-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">
      {{ t('testMode.exit') }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { testToken, endTestMode } from '../utils/testMode.js'

const { t } = useI18n()
</script>
