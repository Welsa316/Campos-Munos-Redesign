<template>
  <div>
    <!-- Immersive hero -->
    <section class="relative min-h-[70vh] flex items-end overflow-hidden">
      <div class="absolute inset-0">
        <img src="/AbogadosSlideshowPic.jpg" alt="" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-brand-darker via-brand-darker/60 to-brand-darker/30"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-brand-darker/80 to-transparent"></div>
      </div>
      <div class="relative max-w-7xl mx-auto px-6 pb-20 w-full">
        <div class="max-w-2xl">
          <p class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-brand-navy uppercase mb-4 hero-reveal" style="transition-delay: 0.3s">
            {{ $t('about.firmName') }}
          </p>
          <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl font-bold text-white leading-[0.95] mb-6 hero-reveal" style="transition-delay: 0.5s">
            {{ $t('about.quienesSomos') }}
          </h1>
          <div class="w-16 h-[2px] bg-brand-navy hero-reveal" style="transition-delay: 0.7s"></div>
        </div>
      </div>
    </section>

    <!-- Intro with large pull quote -->
    <section class="py-24 bg-white relative">
      <div class="absolute left-6 top-0 text-[200px] font-[var(--font-heading)] text-brand-navy/[0.06] leading-none select-none pointer-events-none">"</div>
      <div class="relative max-w-4xl mx-auto px-6 reveal">
        <p class="text-gray-700 text-2xl md:text-3xl leading-relaxed font-[var(--font-body)]">
          {{ $t('about.introText') }}
        </p>
      </div>
    </section>

    <!-- Mission & Vision - Alternating layout -->
    <section class="bg-brand-light">
      <!-- Mission -->
      <div class="max-w-7xl mx-auto px-6 py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div class="reveal-left">
            <div class="inline-flex items-center gap-3 mb-6">
              <div class="w-12 h-12 rounded-xl bg-brand-navy/10 flex items-center justify-center">
                <i class="fa-solid fa-compass text-brand-navy text-lg"></i>
              </div>
              <p class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-brand-navy uppercase">01</p>
            </div>
            <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-gray-900 mb-4">{{ $t('about.mision') }}</h2>
            <div class="w-16 h-[2px] bg-brand-navy"></div>
          </div>
          <div class="space-y-6 reveal-right">
            <p class="text-gray-600 text-xl leading-relaxed">{{ $t('about.misionText1') }}</p>
            <p class="text-gray-600 text-xl leading-relaxed">{{ $t('about.misionText2') }}</p>
            <p class="text-gray-600 text-xl leading-relaxed">{{ $t('about.misionText3') }}</p>
          </div>
        </div>
      </div>

      <div class="max-w-5xl mx-auto px-6"><div class="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div></div>

      <!-- Vision -->
      <div class="max-w-7xl mx-auto px-6 py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div class="lg:order-2 reveal-right">
            <div class="inline-flex items-center gap-3 mb-6">
              <div class="w-12 h-12 rounded-xl bg-brand-navy/10 flex items-center justify-center">
                <i class="fa-solid fa-eye text-brand-navy text-lg"></i>
              </div>
              <p class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-brand-navy uppercase">02</p>
            </div>
            <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-gray-900 mb-4">{{ $t('about.vision') }}</h2>
            <div class="w-16 h-[2px] bg-brand-navy"></div>
          </div>
          <div class="lg:order-1 space-y-6 reveal-left">
            <p class="text-gray-600 text-xl leading-relaxed">{{ $t('about.visionText1') }}</p>
            <p class="text-gray-600 text-xl leading-relaxed">{{ $t('about.visionText2') }}</p>
            <p class="text-gray-600 text-xl leading-relaxed">{{ $t('about.visionText3') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA band -->
    <section class="py-20 bg-brand-darker relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-brand-red/10 via-transparent to-brand-navy/5 pointer-events-none"></div>
      <div class="relative max-w-3xl mx-auto px-6 text-center reveal">
        <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white mb-8">{{ $t('home.popupTitle') }}</h2>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link to="/consulta"
            class="inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-sm px-8 py-4 rounded-xl btn-magnetic">
            {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-xs"></i>
          </router-link>
          <router-link to="/el-equipo"
            class="inline-flex items-center gap-3 border border-white/15 text-white/70 hover:text-white hover:border-white/30 font-[var(--font-ui)] font-medium tracking-wider text-sm px-8 py-4 rounded-xl transition-all">
            {{ $t('home.perfilesBtn') }}
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, nextTick } from 'vue'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()

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
