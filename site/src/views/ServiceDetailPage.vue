<template>
  <div>
    <!-- Hero with large icon -->
    <section class="relative pt-36 pb-24 bg-brand-surface overflow-hidden">
      <!-- Decorative -->
      <div class="absolute top-1/2 right-0 -translate-y-1/2 text-[300px] text-brand-navy/[0.04] pointer-events-none select-none">
        <i :class="serviceIcon"></i>
      </div>

      <div class="relative max-w-7xl mx-auto px-6">
        <router-link to="/servicios"
          class="inline-flex items-center gap-2 text-gray-400 hover:text-brand-navy text-base font-[var(--font-ui)] tracking-wider uppercase mb-8 transition-colors group">
          <i class="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
          {{ $t('nav.servicios') }}
        </router-link>

        <div class="flex items-start gap-6">
          <div class="w-20 h-20 rounded-2xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
            <i :class="serviceIcon" class="text-3xl text-brand-navy"></i>
          </div>
          <div>
            <h1 class="font-[var(--font-heading)] text-4xl md:text-6xl lg:text-7xl font-bold text-brand-navy leading-[0.95]">
              {{ serviceTitle }}
            </h1>
          </div>
        </div>
      </div>
    </section>

    <!-- Content -->
    <section class="py-20 bg-white">
      <div class="max-w-4xl mx-auto px-6">
        <div class="reveal">
          <p class="text-gray-600 text-2xl md:text-3xl leading-relaxed font-[var(--font-body)] mb-12">
            {{ serviceDescription }}
          </p>

          <!-- Video placeholder -->
          <div v-if="hasVideo" class="rounded-2xl overflow-hidden mb-12 border border-gray-200 shadow-sm">
            <div class="aspect-video bg-brand-surface flex items-center justify-center group cursor-pointer">
              <div class="text-center">
                <div class="w-24 h-24 rounded-full bg-brand-navy/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-navy/20 transition-colors">
                  <i class="fa-solid fa-play text-brand-navy text-2xl ml-1"></i>
                </div>
                <p class="text-gray-400 text-base font-[var(--font-ui)] tracking-wider">Video</p>
              </div>
            </div>
          </div>
        </div>

        <!-- CTA -->
        <div class="reveal mt-8 p-10 rounded-2xl bg-brand-surface border border-gray-200 text-center">
          <p class="text-gray-500 text-2xl mb-8 font-[var(--font-body)]">{{ $t('home.popupTitle') }}</p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <router-link to="/consulta"
              class="inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
              {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-sm"></i>
            </router-link>
            <a href="tel:+15049106508"
              class="inline-flex items-center gap-3 border border-gray-300 text-gray-500 hover:text-brand-navy hover:border-brand-navy/30 font-[var(--font-ui)] font-medium tracking-wider text-base px-10 py-5 rounded-xl transition-all">
              <i class="fa-solid fa-phone text-sm"></i> (504) 910-6508
            </a>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()
const props = defineProps({ slug: String })
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
