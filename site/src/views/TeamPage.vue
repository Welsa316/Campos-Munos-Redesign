<template>
  <div>
    <!-- Hero -->
    <section class="relative py-24 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h1 class="font-[var(--font-heading)] text-4xl md:text-5xl font-bold text-white mb-4">
          {{ $t('team.title') }}
        </h1>
        <div class="w-20 h-0.5 bg-brand-gold mx-auto"></div>
      </div>
    </section>

    <!-- Team Grid -->
    <section class="py-16 bg-brand-darker">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <router-link v-for="member in teamMembers" :key="member.slug"
            :to="`/el-equipo/${member.slug}`"
            class="group text-center">
            <div class="aspect-square rounded-xl overflow-hidden mb-4 bg-brand-gray border-2 border-transparent group-hover:border-brand-gold/40 transition-all">
              <img v-if="member.image" :src="member.image" :alt="$t(`team.members.${member.key}.name`)"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <i class="fa-solid fa-user text-5xl text-white/20"></i>
              </div>
            </div>
            <h3 class="font-[var(--font-heading)] text-lg text-white group-hover:text-brand-gold transition-colors mb-1">
              {{ $t(`team.members.${member.key}.name`) }}
            </h3>
            <p class="font-[var(--font-ui)] text-sm text-white/50 tracking-wider uppercase mb-3">
              {{ $t(`team.members.${member.key}.title`) }}
            </p>
            <span class="inline-flex items-center gap-2 text-brand-gold text-sm font-[var(--font-ui)]">
              {{ $t('team.viewBio') }}
              <i class="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
            </span>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
const teamMembers = [
  { key: 'juan', slug: 'juan', image: '/JuanHeadshot.jpg' },
  { key: 'angenette', slug: 'angenette', image: null },
  { key: 'diana', slug: 'diana', image: '/DianaHeadshot.jpg' },
  { key: 'rio', slug: 'rio', image: null },
]
</script>
