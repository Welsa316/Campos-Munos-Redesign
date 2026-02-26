<template>
  <div>
    <!-- Hero -->
    <section class="relative pt-32 pb-20 bg-brand-muted overflow-hidden">
      <div class="absolute top-0 right-0 w-96 h-96 rounded-full bg-brand-gold/[0.02] blur-[120px] pointer-events-none"></div>
      <div class="relative max-w-7xl mx-auto px-6">
        <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-gold uppercase mb-3">Campos Munos Law</p>
        <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl font-bold text-white leading-[0.95]">
          {{ $t('nav.servicios') }}
        </h1>
      </div>
    </section>

    <!-- Services masonry-like grid -->
    <section class="py-20 bg-brand-darker relative noise">
      <div class="relative z-10 max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
          <router-link v-for="(service, i) in services" :key="service.slug"
            :to="`/servicios/${service.slug}`"
            :class="['reveal group relative rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1', i === 0 ? 'md:col-span-2 md:row-span-2' : '']">

            <!-- Card inner -->
            <div :class="['relative h-full gradient-border rounded-2xl', i === 0 ? 'min-h-[400px]' : 'min-h-[220px]']">
              <div :class="['absolute inset-0 rounded-2xl transition-all duration-500', i === 0 ? 'bg-gradient-to-br from-brand-red/15 to-brand-dark' : 'bg-brand-gray/40']"
                :style="{ background: `linear-gradient(135deg, ${service.gradient})` }"></div>

              <div class="relative h-full p-7 flex flex-col justify-between">
                <div class="flex items-center justify-between">
                  <i :class="[service.icon, 'text-brand-gold/40 group-hover:text-brand-gold transition-colors duration-300', i === 0 ? 'text-4xl' : 'text-2xl']"></i>
                  <i class="fa-solid fa-arrow-up-right text-white/0 group-hover:text-brand-gold/60 transition-all duration-300 text-xs"></i>
                </div>

                <div class="mt-auto">
                  <h3 :class="['font-[var(--font-heading)] text-white group-hover:text-brand-gold transition-colors duration-300', i === 0 ? 'text-3xl mb-3' : 'text-lg mb-1']">
                    {{ $t(`services.${service.key}`) }}
                  </h3>
                  <p v-if="i < 4" :class="['text-white/40 text-sm leading-relaxed font-[var(--font-ui)]', i === 0 ? 'line-clamp-3' : 'line-clamp-2']">
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
    <section class="py-16 bg-brand-dark">
      <div class="max-w-3xl mx-auto px-6 text-center reveal">
        <p class="text-white/40 text-lg mb-6 font-[var(--font-body)]">{{ $t('home.popupTitle') }}</p>
        <router-link to="/consulta"
          class="inline-flex items-center gap-3 bg-brand-gold text-brand-darker font-[var(--font-ui)] font-bold tracking-wider text-sm px-8 py-4 rounded-xl btn-magnetic">
          {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-xs"></i>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useScrollReveal } from '../composables/useScrollReveal.js'
useScrollReveal()

const services = [
  { key: 'greenCard', slug: 'green-card', icon: 'fa-solid fa-id-card', gradient: 'rgba(139,35,50,0.15), rgba(26,26,26,0.8)' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate', gradient: 'rgba(201,168,76,0.08), rgba(42,42,42,0.5)' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved', gradient: 'rgba(139,35,50,0.08), rgba(42,42,42,0.5)' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
  { key: 'tramiteConsular', slug: 'tramite-consular', icon: 'fa-solid fa-file-signature', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap', gradient: 'rgba(139,35,50,0.06), rgba(42,42,42,0.5)' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', icon: 'fa-solid fa-umbrella', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', icon: 'fa-solid fa-ring', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-passport', gradient: 'rgba(139,35,50,0.06), rgba(42,42,42,0.5)' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares', icon: 'fa-solid fa-people-roof', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
  { key: 'ead', slug: 'ead', icon: 'fa-solid fa-briefcase', gradient: 'rgba(201,168,76,0.05), rgba(42,42,42,0.5)' },
]
</script>
