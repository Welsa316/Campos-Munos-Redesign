<template>
  <div>
    <!-- Hero -->
    <section class="relative py-24 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h1 class="font-[var(--font-heading)] text-4xl md:text-6xl font-bold text-white mb-4">
          Servicios de Migración
        </h1>
        <div class="w-20 h-0.5 bg-brand-gold mx-auto"></div>
      </div>
    </section>

    <!-- Service Cards -->
    <section class="py-16 bg-brand-darker">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <router-link v-for="service in services" :key="service.slug"
            :to="`/servicios/${service.slug}`"
            class="group bg-brand-gray/50 rounded-xl border border-white/5 overflow-hidden hover:border-brand-gold/30 transition-all hover:-translate-y-1">
            <div class="h-48 bg-brand-dark/50 flex items-center justify-center">
              <i :class="service.icon" class="text-5xl text-brand-gold/60 group-hover:text-brand-gold transition-colors"></i>
            </div>
            <div class="p-6">
              <h3 class="font-[var(--font-heading)] text-xl text-white group-hover:text-brand-gold transition-colors mb-3">
                {{ $t(`services.${service.key}`) }}
              </h3>
              <p class="text-white/60 text-sm leading-relaxed mb-4">
                {{ $t(`serviceDescriptions.${service.key}`) }}
              </p>
              <span class="inline-flex items-center gap-2 text-brand-gold text-sm font-[var(--font-ui)] font-medium">
                {{ $t('readMore') }}
                <i class="fa-solid fa-chevron-right text-xs group-hover:translate-x-1 transition-transform"></i>
              </span>
            </div>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
const services = [
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate' },
  { key: 'greenCard', slug: 'green-card', icon: 'fa-solid fa-id-card' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart' },
  { key: 'tramiteConsular', slug: 'tramite-consular', icon: 'fa-solid fa-file-signature' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', icon: 'fa-solid fa-umbrella' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', icon: 'fa-solid fa-ring' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-passport' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares', icon: 'fa-solid fa-people-roof' },
  { key: 'ead', slug: 'ead', icon: 'fa-solid fa-briefcase' },
]
</script>
