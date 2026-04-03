<template>
  <div>
    <!-- Hero -->
    <section class="relative pt-36 pb-20 bg-brand-surface overflow-hidden">
      <div class="relative max-w-7xl mx-auto px-6">
        <div class="reveal">
          <p class="font-ui text-base tracking-[0.2em] text-brand-navy uppercase mb-4">Campos Muños Law</p>
          <h1 class="font-heading text-5xl md:text-7xl lg:text-8xl font-bold text-brand-navy leading-[0.95]">
            {{ $t('nav.servicios') }}
          </h1>
          <p class="text-gray-500 text-xl mt-4 max-w-lg font-ui">{{ $t('home.popupSubtitle') }}</p>
        </div>
      </div>
    </section>

    <!-- Services image grid -->
    <section class="bg-white">
      <div class="max-w-7xl mx-auto px-6 py-16">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
          <router-link
            v-for="service in services"
            :key="service.slug"
            :to="`/servicios/${service.slug}`"
            class="reveal group relative h-[500px] md:h-[600px] lg:h-[700px] overflow-hidden cursor-pointer"
          >
            <!-- Background image -->
            <img
              :src="service.image"
              :alt="$t(`services.${service.key}`)"
              class="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 group-hover:scale-[1.03] transition-all duration-700 ease-out"
              loading="lazy"
            />

            <!-- Gradient overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-brand-navy via-brand-navy/40 to-transparent"></div>

            <!-- Text content -->
            <div class="relative h-full p-8 md:p-10 lg:p-12 flex flex-col justify-end">
              <h3 class="font-heading text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 md:mb-3 group-hover:translate-y-[-2px] transition-transform duration-300">
                {{ $t(`services.${service.key}`) }}
              </h3>
              <p class="text-white/60 text-base md:text-lg font-ui line-clamp-2 group-hover:text-white/80 transition-colors duration-300 max-w-md">
                {{ $t(`serviceDescriptions.${service.key}`) }}
              </p>
            </div>
          </router-link>
        </div>
      </div>
    </section>

    <!-- Bottom CTA -->
    <section class="py-20 bg-brand-surface">
      <div class="max-w-3xl mx-auto px-6 text-center reveal">
        <p class="text-gray-500 text-2xl mb-8 font-body">{{ $t('home.popupTitle') }}</p>
        <router-link to="/consulta"
          class="inline-flex items-center gap-3 bg-brand-navy text-white font-ui font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
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
  { key: 'greenCard', slug: 'green-card', image: '/services/green-card.jpg' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares', image: '/services/peticiones-familiares.jpg' },
  { key: 'ciudadania', slug: 'ciudadania', image: '/services/ciudadania.jpg' },
  { key: 'defensaDeportacion', slug: 'defensa-contra-la-deportacion', image: '/services/defensa-deportacion.jpg' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', image: '/services/visas-jovenes.jpg' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', image: '/services/visas-prometido.jpg' },
  { key: 'asilo', slug: 'asilo', image: '/services/asilo.jpg' },
  { key: 'vawa', slug: 'vawa', image: '/services/vawa.jpg' },
  { key: 'daca', slug: 'daca', image: '/services/daca.jpg' },
  { key: 'tramiteConsular', slug: 'tramite-consular', image: '/services/tramite-consular.jpg' },
  { key: 'ead', slug: 'ead', image: '/services/ead.jpg' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', image: '/services/tps.jpg' },
  { key: 'visaU', slug: 'visa-u', image: '/services/visa-u.jpg' },
  { key: 'visaT', slug: 'visa-t', image: '/services/visa-t.jpg' },
]
</script>
