<template>
  <!-- The label test mode carries everywhere it appears. -->
  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 ring-1 ring-amber-300 text-amber-900 text-[10px] font-semibold tracking-[0.06em] whitespace-nowrap">
    <FaIcon name="flask" class="text-[9px]" />{{ TEST_BANNER }}
  </span>
</template>

<script setup>
import FaIcon from '../../components/FaIcon.vue'
import { TEST_BANNER } from './testAutomationText.js'
</script>
