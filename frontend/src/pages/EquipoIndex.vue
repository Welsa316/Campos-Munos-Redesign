<template>
  <div class="bg-white">
    <Container class="py-10 sm:py-14">
      <header class="max-w-2xl">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {{ t('equipo.title') }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-slate-700">
          {{ t('equipo.intro') }}
        </p>
      </header>

      <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <RouterLink
          v-for="member in teamMembers"
          :key="member.slug"
          :to="member.route"
          class="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-soft-card focus-ring"
        >
          <div class="h-28 w-28 overflow-hidden rounded-full bg-slate-100">
            <img
              :src="`/assets/team-${member.slug}.jpg`"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <h2 class="mt-4 text-sm font-semibold text-slate-900">
            {{ t(member.nameKey) }}
          </h2>
          <p class="mt-1 text-xs text-slate-600">
            {{ t(member.roleKey) }}
          </p>
        </RouterLink>
      </div>
    </Container>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import Container from '../components/ui/Container.vue';
import { teamMembers } from '../content/team';

const { t } = useI18n();
</script>

