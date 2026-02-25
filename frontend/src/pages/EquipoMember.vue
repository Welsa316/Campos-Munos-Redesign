<template>
  <div class="bg-white">
    <Container class="py-10 sm:py-14">
      <RouterLink
        to="/el-equipo"
        class="inline-flex items-center text-xs font-semibold text-brand-blue hover:text-brand-red focus-ring rounded-full px-2 py-1"
      >
        ← Volver al equipo
      </RouterLink>

      <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:items-start">
        <div class="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div class="h-40 w-40 overflow-hidden rounded-full bg-slate-100">
            <img
              :src="`/assets/team-${member?.slug}.jpg`"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <h1 class="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
            {{ memberName }}
          </h1>
          <p class="mt-1 text-sm text-slate-600">
            {{ memberRole }}
          </p>
        </div>
        <section class="space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            MISSING_SOURCE_CONTENT_TEAM_MEMBER_BIO
          </p>
        </section>
      </div>
    </Container>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Container from '../components/ui/Container.vue';
import { teamMembersBySlug } from '../content/team';

const route = useRoute();
const { t } = useI18n();

const member = computed(() => teamMembersBySlug[route.params.member]);
const memberName = computed(() =>
  member.value ? t(member.value.nameKey) : 'MISSING_TEAM_MEMBER_NAME'
);
const memberRole = computed(() =>
  member.value ? t(member.value.roleKey) : 'MISSING_TEAM_MEMBER_ROLE'
);
</script>

