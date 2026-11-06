<template>
  <!-- A load that failed, said as a failure (never as "nothing here"), with a way to try again. -->
  <div role="alert" class="p-6 text-center text-sm font-ui">
    <p class="text-gray-700">{{ message }}</p>
    <button type="button" @click="$emit('retry')" class="mt-2 font-semibold text-brand-navy underline">Try again</button>
  </div>
</template>

<script setup>
defineProps({ message: { type: String, default: 'Could not load this. Check the connection and try again.' } })
defineEmits(['retry'])
</script>
