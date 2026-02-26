<template>
  <section class="relative">
    <div
      class="group relative overflow-hidden rounded-2xl bg-slate-900 text-white shadow-soft-card"
    >
      <img
        :src="thumbnail"
        alt=""
        class="h-56 w-full object-cover opacity-80 transition group-hover:opacity-90"
      />
      <button
        type="button"
        class="absolute inset-0 flex items-center justify-center focus-ring"
        @click="open = true"
        :aria-label="t('video.comingSoonTitle')"
      >
        <span
          class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition group-hover:scale-105"
        >
          ▶
        </span>
      </button>
    </div>

    <Modal :open="open" label-id="video-modal-title" @close="open = false">
      <div class="space-y-3">
        <h2 id="video-modal-title" class="text-lg font-semibold text-slate-900">
          {{ t('video.comingSoonTitle') }}
        </h2>
        <p class="text-sm text-slate-600">
          {{ t('video.comingSoonBody') }}
        </p>
        <div class="pt-1">
          <Button type="button" variant="primary" @click="open = false">
            {{ t('video.close') }}
          </Button>
        </div>
      </div>
    </Modal>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Modal from '../ui/Modal.vue';
import Button from '../ui/Button.vue';

const props = defineProps({
  thumbnail: {
    type: String,
    default: '/assets/video-placeholder.jpg'
  }
});

const { t } = useI18n();
const open = ref(false);
</script>

