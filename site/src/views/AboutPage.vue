<template>
  <div>
    <!-- Hero banner (taller; crop sits on the team, not the building above them) -->
    <section class="relative pt-24 flex items-end overflow-hidden h-[64vh] min-h-[520px]">
      <div class="absolute inset-0">
        <img src="/Team.jpg" alt="" decoding="async" class="w-full h-full object-cover object-[center_42%]" />
        <div class="absolute inset-0 bg-gradient-to-t from-brand-darker via-brand-darker/30 to-transparent"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-brand-darker/50 to-transparent"></div>
      </div>
      <div class="relative max-w-7xl mx-auto px-6 pb-16 w-full">
        <div class="max-w-2xl">
          <p class="font-ui text-base tracking-[0.2em] text-white/80 uppercase mb-4 hero-reveal" style="transition-delay: 0.3s">
            {{ $t('about.firmName') }}
          </p>
          <h1 class="font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[0.95] mb-6 hero-reveal" style="transition-delay: 0.5s">
            {{ $t('about.quienesSomos') }}
          </h1>
          <div class="w-20 h-[3px] bg-brand-navy hero-reveal" style="transition-delay: 0.7s"></div>
        </div>
      </div>
    </section>

    <!-- Intro with large pull quote -->
    <section class="py-24 bg-white relative">
      <div class="absolute left-6 top-0 text-[200px] font-heading text-brand-navy/[0.06] leading-none select-none pointer-events-none">"</div>
      <div class="relative max-w-4xl mx-auto px-6 reveal">
        <p class="text-gray-700 text-2xl md:text-3xl leading-relaxed font-body">
          {{ $t('about.introText') }}
        </p>
      </div>
    </section>

    <!-- Why Us -->
    <section class="relative py-32 overflow-hidden">
      <div class="absolute inset-0 bg-cover bg-center bg-fixed" style="background-image: url('/Slideshow3.jpg')"></div>
      <div class="absolute inset-0 bg-brand-darker/85"></div>
      <div class="relative max-w-3xl mx-auto px-6 text-center reveal">
        <h2 class="font-heading text-4xl md:text-6xl text-white mb-8 leading-tight">
          {{ $t('home.porQueNosotros') }}
        </h2>
        <p class="text-white/70 text-xl md:text-3xl leading-relaxed">
          {{ $t('home.porQueNosotrosText') }}
        </p>
      </div>
    </section>

    <!-- Mission & Vision - Alternating layout -->
    <section class="bg-brand-light">
      <!-- Mission -->
      <div class="max-w-7xl mx-auto px-6 py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div class="reveal-left">
            <h2 class="font-heading text-4xl md:text-6xl text-brand-navy mb-4">{{ $t('about.mision') }}</h2>
            <div class="w-16 h-[2px] bg-brand-navy"></div>
          </div>
          <div class="space-y-6 reveal-right">
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed">{{ $t('about.misionText1') }}</p>
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed">{{ $t('about.misionText2') }}</p>
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed">{{ $t('about.misionText3') }}</p>
          </div>
        </div>
      </div>

      <div class="max-w-5xl mx-auto px-6"><div class="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div></div>

      <!-- Vision -->
      <div class="max-w-7xl mx-auto px-6 py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div class="lg:order-2 reveal-right">
            <h2 class="font-heading text-4xl md:text-6xl text-brand-navy mb-4">{{ $t('about.vision') }}</h2>
            <div class="w-16 h-[2px] bg-brand-navy"></div>
          </div>
          <div class="lg:order-1 space-y-6 reveal-left">
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed">{{ $t('about.visionText1') }}</p>
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed">{{ $t('about.visionText2') }}</p>
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed">{{ $t('about.visionText3') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Team grid -->
    <section id="equipo" class="py-24 bg-white scroll-mt-24">
      <div class="max-w-6xl mx-auto px-6">
        <div class="text-center mb-16 reveal">
          <h2 class="font-heading text-4xl md:text-6xl text-brand-navy leading-tight">
            {{ $t('team.title') }}
          </h2>
        </div>
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
            <h3 class="font-heading text-2xl text-gray-900 group-hover:text-brand-navy transition-colors duration-300 mb-1">
              {{ $t(`team.members.${member.key}.name`) }}
            </h3>
            <p class="font-ui text-base tracking-wider text-gray-500 uppercase">
              {{ $t(`team.members.${member.key}.title`) }}
            </p>

            <!-- Arrow indicator -->
            <div class="mt-3 flex items-center gap-2 text-brand-navy/0 group-hover:text-brand-navy transition-all duration-300">
              <span class="text-sm font-ui tracking-wider">{{ $t('team.viewBio') }}</span>
              <i class="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- CTA band -->
    <section class="py-20 bg-brand-darker relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-brand-red/10 via-transparent to-brand-navy/5 pointer-events-none"></div>
      <div class="relative max-w-3xl mx-auto px-6 text-center reveal">
        <h2 class="font-heading text-3xl md:text-5xl text-white mb-8">{{ $t('home.popupTitle') }}</h2>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link to="/consulta"
            class="inline-flex items-center gap-3 bg-brand-navy text-white font-ui font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
            {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-sm"></i>
          </router-link>
          <a href="tel:+15049106508"
            class="inline-flex items-center gap-3 border border-white/20 text-white/80 hover:bg-white hover:text-brand-navy hover:border-white font-ui font-bold tracking-wider text-base px-10 py-5 rounded-xl transition-all">
            <i class="fa-solid fa-phone text-sm"></i> (504) 910-6508
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, nextTick } from 'vue'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()

const teamMembers = [
  { key: 'juan', slug: 'juan', image: '/JuanHeadshot.jpg' },
  { key: 'angenette', slug: 'angenette', image: '/AngenetteHeadshot.jpg' },
  { key: 'diana', slug: 'diana', image: '/DianaHeadshot.jpg' },
  { key: 'rio', slug: 'rio', image: '/RioHeadshot.jpg' },
]

onMounted(() => {
  nextTick(() => {
    document.querySelectorAll('.hero-reveal').forEach(el => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(30px)'
      el.style.transition = `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${el.style.transitionDelay}, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${el.style.transitionDelay}`
      requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)' })
    })
  })
})
</script>
