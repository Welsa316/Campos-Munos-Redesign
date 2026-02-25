<template>
  <Modal :open="open" label-id="inactivity-modal-title" @close="handleDismiss">
    <div class="flex flex-col gap-4 sm:flex-row">
      <div class="hidden w-32 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block">
        <img
          src="/assets/popup-group.jpg"
          alt=""
          class="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div class="flex-1 space-y-3">
        <h2 id="inactivity-modal-title" class="text-lg font-semibold text-slate-900">
          {{ t('popup.title') }}
        </h2>
        <p class="text-sm text-slate-600">
          {{ t('popup.body') }}
        </p>
        <div class="flex flex-wrap gap-3 pt-1">
          <Button as="router-link" :to="'/consulta'" variant="primary" @click="handleDismiss">
            {{ t('popup.primary') }}
          </Button>
          <Button type="button" variant="secondary" @click="handleDismiss">
            {{ t('popup.secondary') }}
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Modal from '../ui/Modal.vue';
import Button from '../ui/Button.vue';

const { t } = useI18n();
const router = useRouter();

const open = ref(false);
let inactivityTimer = null;
const INACTIVITY_MS = 20000;
const SESSION_KEY = 'cm_inactivity_dismissed';

const resetTimer = () => {
  if (typeof window === 'undefined') return;
  if (window.sessionStorage.getItem(SESSION_KEY) === '1') return;
  if (inactivityTimer) window.clearTimeout(inactivityTimer);
  inactivityTimer = window.setTimeout(() => {
    open.value = true;
  }, INACTIVITY_MS);
};

const handleDismiss = () => {
  open.value = false;
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  }
};

onMounted(() => {
  if (typeof window === 'undefined') return;
  if (window.sessionStorage.getItem(SESSION_KEY) === '1') return;
  const events = ['mousemove', 'keydown', 'scroll', 'touchstart'];
  events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
  resetTimer();
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  const events = ['mousemove', 'keydown', 'scroll', 'touchstart'];
  events.forEach((event) => window.removeEventListener(event, resetTimer));
  if (inactivityTimer) window.clearTimeout(inactivityTimer);
});
</script>

