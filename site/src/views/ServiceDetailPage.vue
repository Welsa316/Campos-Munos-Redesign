<template>
  <div>
    <!-- Hero -->
    <section class="relative py-24 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <router-link to="/servicios" class="inline-flex items-center gap-2 text-brand-gold hover:text-brand-gold-light text-sm font-[var(--font-ui)] mb-6 transition-colors">
          <i class="fa-solid fa-arrow-left text-xs"></i>
          {{ $t('nav.servicios') }}
        </router-link>
        <h1 class="font-[var(--font-heading)] text-4xl md:text-5xl font-bold text-white mb-4">
          {{ serviceTitle }}
        </h1>
        <div class="w-20 h-0.5 bg-brand-gold mx-auto"></div>
      </div>
    </section>

    <!-- Content -->
    <section class="py-16 bg-brand-darker">
      <div class="max-w-3xl mx-auto px-4">
        <div class="bg-brand-gray/30 rounded-xl p-8 md:p-12 border border-white/5">
          <div class="flex items-center justify-center mb-8">
            <div class="w-20 h-20 rounded-2xl bg-brand-red/20 flex items-center justify-center">
              <i :class="serviceIcon" class="text-4xl text-brand-gold"></i>
            </div>
          </div>
          <p class="text-white/80 text-lg leading-relaxed text-center mb-8">
            {{ serviceDescription }}
          </p>

          <!-- Video placeholder -->
          <div v-if="hasVideo" class="aspect-video bg-brand-dark rounded-lg flex items-center justify-center mb-8">
            <div class="text-center">
              <i class="fa-solid fa-play-circle text-5xl text-brand-gold/50 mb-3"></i>
              <p class="text-white/40 text-sm font-[var(--font-ui)]">Video</p>
            </div>
          </div>

          <div class="text-center">
            <router-link to="/consulta"
              class="inline-block bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3.5 rounded-lg transition-colors">
              {{ $t('home.consultaBtn') }}
            </router-link>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  slug: String,
})

const { t } = useI18n()

const serviceMap = {
  'visas-especial-para-jovenes': { key: 'visasJovenes', icon: 'fa-solid fa-passport', video: false },
  'tramite-consular': { key: 'tramiteConsular', icon: 'fa-solid fa-file-signature', video: false },
  'asilo': { key: 'asilo', icon: 'fa-solid fa-hand-holding-heart', video: false },
  'daca': { key: 'daca', icon: 'fa-solid fa-graduation-cap', video: false },
  'visas-de-prometido': { key: 'visasPrometido', icon: 'fa-solid fa-ring', video: false },
  'ead': { key: 'ead', icon: 'fa-solid fa-briefcase', video: false },
  'ciudadania': { key: 'ciudadania', icon: 'fa-solid fa-certificate', video: false },
  'estatus-de-proteccion-temporal': { key: 'tps', icon: 'fa-solid fa-umbrella', video: false },
  'vawa': { key: 'vawa', icon: 'fa-solid fa-shield-halved', video: false },
  'defensa-contra-la-deportacion': { key: 'defensaDeportacion', icon: 'fa-solid fa-gavel', video: false },
  'peticiones-familiares': { key: 'peticionesFamiliares', icon: 'fa-solid fa-people-roof', video: false },
  'visa-u': { key: 'visaU', icon: 'fa-solid fa-scale-balanced', video: false },
  'visa-t': { key: 'visaT', icon: 'fa-solid fa-link', video: false },
  'green-card': { key: 'greenCard', icon: 'fa-solid fa-id-card', video: true },
}

const service = computed(() => serviceMap[props.slug] || { key: 'greenCard', icon: 'fa-solid fa-id-card', video: false })
const serviceTitle = computed(() => t(`services.${service.value.key}`))
const serviceDescription = computed(() => t(`serviceDescriptions.${service.value.key}`))
const serviceIcon = computed(() => service.value.icon)
const hasVideo = computed(() => service.value.video)
</script>
