<template>
  <component
    :is="as"
    :type="as === 'button' ? type : undefined"
    class="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold tracking-wide transition-colors duration-200 ease-soft-ease focus-ring"
    :class="variantClasses"
  >
    <slot />
  </component>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  as: {
    type: String,
    default: 'button'
  },
  type: {
    type: String,
    default: 'button'
  },
  variant: {
    type: String,
    default: 'primary' // primary uses red; secondary uses outline; ghost is subtle link
  }
});

const variantClasses = computed(() => {
  if (props.variant === 'primary') {
    return 'bg-brand-red text-white hover:bg-red-700';
  }
  if (props.variant === 'secondary') {
    return 'border border-brand-red text-brand-red bg-white hover:bg-red-50';
  }
  if (props.variant === 'ghost') {
    return 'text-brand-red hover:text-red-700 hover:bg-red-50/40';
  }
  return '';
});
</script>

