<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      :aria-modal="true"
      :aria-labelledby="labelId"
      @keydown.esc.prevent="handleEsc"
    >
      <div
        ref="panel"
        class="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-soft-card"
        @click.stop
      >
        <button
          type="button"
          class="absolute right-4 top-4 text-slate-400 hover:text-slate-600 focus-ring rounded-full"
          @click="emit('close')"
          aria-label="Cerrar"
        >
          ✕
        </button>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  labelId: {
    type: String,
    default: 'modal-title'
  }
});

const emit = defineEmits(['close']);

const panel = ref(null);
let previousActiveElement = null;

const handleEsc = () => {
  emit('close');
};

const handleFocusTrap = (event) => {
  if (!panel.value || !props.open) return;
  if (!panel.value.contains(event.target)) {
    event.stopPropagation();
    panel.value.focus();
  }
};

watch(
  () => props.open,
  (open) => {
    if (typeof window === 'undefined') return;
    if (open) {
      previousActiveElement = document.activeElement;
      setTimeout(() => {
        panel.value?.focus();
      }, 0);
      document.addEventListener('focusin', handleFocusTrap);
    } else {
      document.removeEventListener('focusin', handleFocusTrap);
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    }
  }
);

onMounted(() => {
  if (props.open && panel.value) {
    panel.value.focus();
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    document.removeEventListener('focusin', handleFocusTrap);
  }
});
</script>

