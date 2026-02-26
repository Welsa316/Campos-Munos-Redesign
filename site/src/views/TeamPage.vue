<template>
  <div>
    <!-- Hero -->
    <section class="relative pt-36 pb-24 bg-brand-surface overflow-hidden">
      <div class="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-brand-red/[0.03] blur-[120px] pointer-events-none"></div>
      <div class="relative max-w-7xl mx-auto px-6">
        <p class="font-[var(--font-ui)] text-base tracking-[0.2em] text-brand-navy uppercase mb-4">Campos Munos Law</p>
        <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl lg:text-8xl font-bold text-brand-navy leading-[0.95]">
          {{ $t('team.title') }}
        </h1>
      </div>
    </section>

    <!-- Team grid -->
    <section class="py-20 bg-white">
      <div class="max-w-6xl mx-auto px-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 stagger">
          <router-link v-for="member in teamMembers" :key="member.slug"
            :to="`/el-equipo/${member.slug}`"
            class="reveal group relative">
            <!-- Photo container -->
            <div class="relative aspect-[3/4] rounded-2xl overflow-hidden mb-5 shadow-sm">
              <img v-if="member.image" :src="member.image" :alt="$t(`team.members.${member.key}.name`)"
                class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div v-else class="w-full h-full bg-brand-surface flex items-center justify-center">
                <i class="fa-solid fa-user text-5xl text-gray-300"></i>
              </div>

              <!-- Overlay on hover -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-40 group-hover:opacity-60 transition-opacity duration-500"></div>

              <!-- Navy accent line -->
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-brand-navy transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
            </div>

            <!-- Info -->
            <h3 class="font-[var(--font-heading)] text-2xl text-gray-900 group-hover:text-brand-navy transition-colors duration-300 mb-1">
              {{ $t(`team.members.${member.key}.name`) }}
            </h3>
            <p class="font-[var(--font-ui)] text-base tracking-wider text-gray-400 uppercase">
              {{ $t(`team.members.${member.key}.title`) }}
            </p>

            <!-- Arrow indicator -->
            <div class="mt-3 flex items-center gap-2 text-brand-navy/0 group-hover:text-brand-navy transition-all duration-300">
              <span class="text-sm font-[var(--font-ui)] tracking-wider">{{ $t('team.viewBio') }}</span>
              <i class="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
            </div>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useScrollReveal } from '../composables/useScrollReveal.js'
useScrollReveal()

const teamMembers = [
  { key: 'juan', slug: 'juan', image: '/JuanHeadshot.jpg' },
  { key: 'angenette', slug: 'angenette', image: '/AngenetteHeadshot.jpg' },
  { key: 'diana', slug: 'diana', image: '/DianaHeadshot.jpg' },
  { key: 'rio', slug: 'rio', image: '/RioHeadshot.jpg' },
]
</script>
