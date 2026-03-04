<template>
  <div>
    <!-- Hero -->
    <section class="relative pt-36 pb-24 bg-brand-surface overflow-hidden">
      <div class="absolute top-0 right-0 w-96 h-96 rounded-full bg-brand-navy/[0.03] blur-[120px] pointer-events-none"></div>
      <div class="relative max-w-7xl mx-auto px-6">
        <p class="font-[var(--font-ui)] text-base tracking-[0.2em] text-brand-navy uppercase mb-4">Campos Munos Law</p>
        <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl lg:text-8xl font-bold text-brand-navy leading-[0.95]">
          {{ $t('nav.servicios') }}
        </h1>
      </div>
    </section>

    <!-- Services masonry-like grid -->
    <section class="py-20 bg-white relative">
      <div class="relative z-10 max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
          <router-link v-for="(service, i) in services" :key="service.slug"
            :to="`/servicios/${service.slug}`"
            :class="['reveal group relative rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1', i === 0 ? 'md:col-span-2 md:row-span-2' : '']">

            <!-- Card inner -->
            <div :class="['relative h-full rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow', i === 0 ? 'min-h-[400px]' : 'min-h-[220px]']">
              <div :class="['absolute inset-0 rounded-2xl transition-all duration-500']"
                :style="{ background: `linear-gradient(135deg, ${service.gradient})` }"></div>

              <div class="relative h-full p-8 flex flex-col justify-between">
                <div class="flex items-center justify-between">
                  <i :class="[service.icon, 'text-brand-navy/30 group-hover:text-brand-navy transition-colors duration-300', i === 0 ? 'text-5xl' : 'text-3xl']"></i>
                  <i class="fa-solid fa-arrow-up-right text-gray-300/0 group-hover:text-brand-navy/60 transition-all duration-300 text-sm"></i>
                </div>

                <div class="mt-auto">
                  <h3 :class="['font-[var(--font-heading)] text-gray-900 group-hover:text-brand-navy transition-colors duration-300', i === 0 ? 'text-3xl md:text-4xl mb-3' : 'text-xl md:text-2xl mb-2']">
                    {{ $t(`services.${service.key}`) }}
                  </h3>
                  <p v-if="i < 4" :class="['text-gray-500 leading-relaxed font-[var(--font-ui)]', i === 0 ? 'text-lg line-clamp-3' : 'text-base line-clamp-2']">
                    {{ $t(`serviceDescriptions.${service.key}`) }}
                  </p>
                </div>
              </div>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- Bottom CTA -->
    <section class="py-20 bg-brand-surface">
      <div class="max-w-3xl mx-auto px-6 text-center reveal">
        <p class="text-gray-500 text-2xl mb-8 font-[var(--font-body)]">{{ $t('home.popupTitle') }}</p>
        <router-link to="/consulta"
          class="inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
          {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-sm"></i>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useScrollReveal } from '../composables/useScrollReveal.js'
useScrollReveal()

const services = [
  { key: 'greenCard', slug: 'green-card', icon: 'fa-solid fa-id-card', gradient: 'rgba(0,63,141,0.06), rgba(255,255,255,0.8)' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares', icon: 'fa-solid fa-people-roof', gradient: 'rgba(0,63,141,0.03), rgba(255,255,255,0.5)' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate', gradient: 'rgba(0,63,141,0.03), rgba(255,255,255,0.5)' },
  { key: 'defensaDeportacion', slug: 'defensa-contra-la-deportacion', icon: 'fa-solid fa-gavel', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-passport', gradient: 'rgba(206,29,29,0.02), rgba(255,255,255,0.5)' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', icon: 'fa-solid fa-ring', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved', gradient: 'rgba(206,29,29,0.03), rgba(255,255,255,0.5)' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap', gradient: 'rgba(206,29,29,0.02), rgba(255,255,255,0.5)' },
  { key: 'tramiteConsular', slug: 'tramite-consular', icon: 'fa-solid fa-file-signature', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'ead', slug: 'ead', icon: 'fa-solid fa-briefcase', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', icon: 'fa-solid fa-umbrella', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-link', gradient: 'rgba(0,63,141,0.02), rgba(255,255,255,0.5)' },
]
</script>
