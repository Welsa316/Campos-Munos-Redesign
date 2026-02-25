<template>
  <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
    <Container class="flex items-center justify-between gap-4 py-3">
      <RouterLink to="/home" class="flex items-center gap-3 focus-ring rounded-full">
        <div class="h-9 w-9 rounded-full bg-brand-blue text-white flex items-center justify-center text-sm font-bold">
          CM
        </div>
        <div class="flex flex-col">
          <span class="text-sm font-semibold tracking-wide text-slate-900">
            {{ t('brand.name') }}
          </span>
          <span class="text-xs text-slate-500">
            Abogados de inmigración
          </span>
        </div>
      </RouterLink>

      <nav class="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex">
        <RouterLink to="/home" class="hover:text-brand-blue focus-ring rounded-full px-2 py-1">
          {{ t('nav.home') }}
        </RouterLink>

        <div class="relative" @mouseenter="openServicios = true" @mouseleave="openServicios = false">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-brand-blue focus-ring"
            @click="toggleServicios"
            aria-haspopup="true"
            :aria-expanded="openServicios"
          >
            <span>{{ t('nav.services') }}</span>
            <span class="text-xs">▾</span>
          </button>
          <div
            v-if="openServicios"
            class="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft-card"
          >
            <RouterLink
              v-for="service in orderedServices"
              :key="service.path"
              :to="service.path"
              class="block rounded-xl px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-brand-blue focus-ring"
            >
              {{ t(service.titleKey) }}
            </RouterLink>
          </div>
        </div>

        <RouterLink
          :to="greenCardRoute"
          class="rounded-full px-3 py-1 text-sm font-semibold text-brand-red hover:text-white hover:bg-brand-red focus-ring border border-brand-red"
        >
          {{ t('services.greenCard') }}
        </RouterLink>

        <RouterLink to="/el-equipo" class="hover:text-brand-blue focus-ring rounded-full px-2 py-1">
          {{ t('nav.team') }}
        </RouterLink>

        <RouterLink to="/acerca-de" class="hover:text-brand-blue focus-ring rounded-full px-2 py-1">
          {{ t('nav.about') }}
        </RouterLink>

        <RouterLink
          to="/consulta"
          class="rounded-full bg-brand-red px-3 py-1 text-sm font-semibold text-white hover:bg-red-700 focus-ring"
        >
          {{ t('nav.consultation') }}
        </RouterLink>

        <RouterLink
          to="/pago"
          class="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-ring"
        >
          {{ t('nav.payment') }}
        </RouterLink>

        <LanguageToggle />
      </nav>

      <div class="flex items-center gap-3 md:hidden">
        <LanguageToggle />
        <button
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white focus-ring"
          @click="mobileOpen = !mobileOpen"
          aria-label="Abrir menú"
        >
          <span v-if="!mobileOpen">☰</span>
          <span v-else>✕</span>
        </button>
      </div>
    </Container>

    <transition name="fade">
      <div
        v-if="mobileOpen"
        class="border-t border-slate-200 bg-white md:hidden"
      >
        <Container class="space-y-3 py-4 text-sm font-medium text-slate-800">
          <RouterLink
            to="/home"
            class="block rounded-xl px-3 py-2 hover:bg-slate-50 focus-ring"
            @click="mobileOpen = false"
          >
            {{ t('nav.home') }}
          </RouterLink>

          <details class="group rounded-xl px-3 py-2 hover:bg-slate-50">
            <summary class="flex cursor-pointer items-center justify-between">
              <span>{{ t('nav.services') }}</span>
              <span class="text-xs group-open:hidden">▾</span>
              <span class="hidden text-xs group-open:inline">▴</span>
            </summary>
            <div class="mt-2 space-y-1 pl-2">
              <RouterLink
                v-for="service in orderedServices"
                :key="service.path"
                :to="service.path"
                class="block rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 focus-ring"
                @click="mobileOpen = false"
              >
                {{ t(service.titleKey) }}
              </RouterLink>
            </div>
          </details>

          <RouterLink
            :to="greenCardRoute"
            class="block rounded-xl border border-brand-red px-3 py-2 text-sm font-semibold text-brand-red hover:bg-red-50 focus-ring"
            @click="mobileOpen = false"
          >
            {{ t('services.greenCard') }}
          </RouterLink>

          <RouterLink
            to="/el-equipo"
            class="block rounded-xl px-3 py-2 hover:bg-slate-50 focus-ring"
            @click="mobileOpen = false"
          >
            {{ t('nav.team') }}
          </RouterLink>

          <RouterLink
            to="/acerca-de"
            class="block rounded-xl px-3 py-2 hover:bg-slate-50 focus-ring"
            @click="mobileOpen = false"
          >
            {{ t('nav.about') }}
          </RouterLink>

          <RouterLink
            to="/consulta"
            class="block rounded-full bg-brand-red px-3 py-2 text-center text-sm font-semibold text-white hover:bg-red-700 focus-ring"
            @click="mobileOpen = false"
          >
            {{ t('nav.consultation') }}
          </RouterLink>

          <RouterLink
            to="/pago"
            class="block rounded-full border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-ring"
            @click="mobileOpen = false"
          >
            {{ t('nav.payment') }}
          </RouterLink>
        </Container>
      </div>
    </transition>
  </header>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import Container from '../ui/Container.vue';
import LanguageToggle from '../ui/LanguageToggle.vue';
import { services } from '../../content/services';
import { servicesRoutesInOrder, greenCardRoute } from '../../content/routes';

const { t } = useI18n();

const mobileOpen = ref(false);
const openServicios = ref(false);

const orderedServices = computed(() => {
  const byPath = Object.fromEntries(services.map((s) => [s.path, s]));
  return servicesRoutesInOrder.map((path) => byPath[path]).filter(Boolean);
});

const toggleServicios = () => {
  openServicios.value = !openServicios.value;
};
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

