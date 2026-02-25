<template>
  <div class="bg-white">
    <Container class="py-10 sm:py-14">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {{ title }}
        </h1>
      </header>

      <div class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div class="space-y-6">
          <template v-if="mode === 'video-only'">
            <VideoBlock />
          </template>

          <template v-else-if="mode === 'text-only'">
            <p class="text-sm leading-relaxed text-slate-700">
              MISSING_SOURCE_CONTENT_SERVICE_TEXT
            </p>
          </template>

          <template v-else-if="mode === 'video-text'">
            <VideoBlock />
            <p class="text-sm leading-relaxed text-slate-700">
              MISSING_SOURCE_CONTENT_SERVICE_TEXT
            </p>
          </template>

          <template v-else>
            <p class="text-sm leading-relaxed text-slate-700">
              MISSING_SOURCE_CONTENT_UNDEFINED_LAYOUT
            </p>
          </template>

          <section class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <h2 class="mb-1 font-semibold text-slate-700">TODO</h2>
            <p>
              Replace MISSING_SOURCE_CONTENT_* placeholders with text extracted from the Wix
              snapshots for this specific servicio page.
            </p>
          </section>
        </div>

        <aside class="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <h2 class="text-sm font-semibold text-slate-900">
            {{ t('cta.consultation') }}
          </h2>
          <p>
            {{ t('consulta.intro') }}
          </p>
          <div class="mt-2 flex flex-wrap gap-3">
            <Button as="router-link" :to="'/consulta'">
              {{ t('cta.consultation') }}
            </Button>
            <Button as="a" variant="secondary" href="tel:+15049106508">
              {{ t('cta.callNow') }}
            </Button>
          </div>
        </aside>
      </div>
    </Container>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Container from '../components/ui/Container.vue';
import Button from '../components/ui/Button.vue';
import VideoBlock from '../components/sections/VideoBlock.vue';
import { servicesBySlug } from '../content/services';

const route = useRoute();
const { t } = useI18n();

const service = computed(() => servicesBySlug[route.params.slug]);
const title = computed(() => (service.value ? t(service.value.titleKey) : 'MISSING_SERVICE_TITLE'));

const mode = computed(() => {
  if (!service.value) return 'unknown';
  if (service.value.hasVideo && !service.value.hasText) return 'video-only';
  if (!service.value.hasVideo && service.value.hasText) return 'text-only';
  if (service.value.hasVideo && service.value.hasText) return 'video-text';
  return 'unknown';
});
</script>

