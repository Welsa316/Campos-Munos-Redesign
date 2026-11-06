<template>
  <!-- A count whose digits roll to a new value (a port of React Bits'
       Counter). Screen readers get the plain number; the rolling columns are
       decoration. No entrance: the first value simply appears, and only a
       change moves. -->
  <span class="rolling-number">
    <span class="sr-only">{{ value }}</span>
    <span class="rn-digits" aria-hidden="true">
      <span v-for="d in digits" :key="d.place" class="rn-col">
        <span class="rn-strip" :style="{ transform: `translateY(${-d.digit * 10}%)` }">
          <span v-for="n in 10" :key="n" class="rn-cell">{{ n - 1 }}</span>
        </span>
      </span>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
})

// Keyed by place value (ones, tens, …) so 9 → 10 adds a tens column instead
// of rolling every column.
const digits = computed(() => {
  const s = String(Math.max(0, Math.trunc(Number(props.value) || 0)))
  return [...s].map((ch, i) => ({ place: s.length - 1 - i, digit: Number(ch) }))
})
</script>

<style scoped>
.rolling-number { display: inline-flex; font-variant-numeric: tabular-nums; }
.rn-digits { display: inline-flex; }
.rn-col { display: inline-block; height: 1em; line-height: 1; overflow: hidden; }
.rn-strip {
  display: flex;
  flex-direction: column;
  transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
.rn-cell { display: block; height: 1em; line-height: 1; text-align: center; }
@media (prefers-reduced-motion: reduce) {
  .rn-strip { transition: none; }
}
</style>
