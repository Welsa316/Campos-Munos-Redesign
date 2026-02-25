<template>
  <footer class="border-t border-slate-200 bg-brand-blue text-slate-100">
    <Container class="py-8 text-sm">
      <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 rounded-full bg-white/10 text-white flex items-center justify-center text-xs font-bold">
              CM
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-semibold">{{ t('brand.name') }}</span>
              <span class="text-xs text-slate-200/80">Abogados de inmigración</span>
            </div>
          </div>
          <p class="mt-4 max-w-sm text-xs text-slate-200/80">
            {{ t('layout.address') }} · {{ t('layout.mailing') }}
          </p>
        </div>
        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-200/80">
            {{ t('layout.phoneLabel') }}
          </p>
          <a
            class="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-red-200 focus-ring rounded-full"
            href="tel:+15049106508"
          >
            <span>{{ t('layout.phoneNumber') }}</span>
          </a>
        </div>
      </div>
      <div class="mt-6 border-t border-slate-500/40 pt-4 text-xs text-slate-300/80">
        <p>© {{ new Date().getFullYear() }} {{ t('brand.name') }}. Todos los derechos reservados.</p>
      </div>
    </Container>
  </footer>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import Container from '../ui/Container.vue';

const { t } = useI18n();
</script>

