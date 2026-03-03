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

          <!-- Video -->
          <div v-if="hasVideo" class="rounded-2xl overflow-hidden mb-12 shadow-lg">
            <div class="aspect-video relative">
              <!-- Play overlay / Video cover -->
              <div v-if="!videoPlaying" @click="playVideo"
                class="absolute inset-0 flex items-center justify-center cursor-pointer group z-10 bg-brand-navy">
                <!-- Background logo watermark -->
                <img src="/logo.png" alt="" class="absolute inset-0 m-auto w-64 md:w-80 opacity-10 pointer-events-none select-none" />
                <div class="text-center relative z-10">
                  <div class="w-28 h-28 md:w-36 md:h-36 rounded-full bg-white/15 flex items-center justify-center mx-auto mb-6 group-hover:bg-white/25 group-hover:scale-110 transition-all duration-300 ring-2 ring-white/30">
                    <i class="fa-solid fa-play text-white text-4xl md:text-5xl ml-2"></i>
                  </div>
                  <p class="text-white text-xl md:text-2xl font-[var(--font-ui)] font-semibold tracking-wider uppercase">
                    {{ locale === 'es' ? 'Ver Video' : 'Watch Video' }}
                  </p>
                  <p class="text-white/60 text-base md:text-lg font-[var(--font-ui)] mt-2">
                    {{ serviceTitle }}
                  </p>
                </div>
              </div>
              <!-- Video element -->
              <video
                v-if="videoPlaying"
                ref="videoRef"
                :src="videoFile"
                class="w-full h-full object-contain bg-black"
                controls
                playsinline
              ></video>
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
import { computed, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()
const props = defineProps({ slug: String })
const { t, locale } = useI18n()

const serviceMap = {
  'visas-especial-para-jovenes': { key: 'visasJovenes', icon: 'fa-solid fa-passport', video: true, videoFile: '/Jovenes.mp4' },
  'tramite-consular': { key: 'tramiteConsular', icon: 'fa-solid fa-file-signature', video: true, videoFile: '/Listo Proceso consullar fx listo.mp4' },
  'asilo': { key: 'asilo', icon: 'fa-solid fa-hand-holding-heart', video: false },
  'daca': { key: 'daca', icon: 'fa-solid fa-graduation-cap', video: true, videoFile: '/Listo DACA Fx LIsto.mp4' },
  'visas-de-prometido': { key: 'visasPrometido', icon: 'fa-solid fa-ring', video: false },
  'ead': { key: 'ead', icon: 'fa-solid fa-briefcase', video: true, videoFile: '/2 Listo Permiso de Trabajo FX Listo.mp4' },
  'ciudadania': { key: 'ciudadania', icon: 'fa-solid fa-certificate', video: true, videoFile: '/Ciudadania.mp4' },
  'estatus-de-proteccion-temporal': { key: 'tps', icon: 'fa-solid fa-umbrella', video: false },
  'vawa': { key: 'vawa', icon: 'fa-solid fa-shield-halved', video: true, videoFile: '/VAWA.mp4' },
  'defensa-contra-la-deportacion': { key: 'defensaDeportacion', icon: 'fa-solid fa-gavel', video: true, videoFile: '/1 listo defensa en corte FX listo.mp4' },
  'peticiones-familiares': { key: 'peticionesFamiliares', icon: 'fa-solid fa-people-roof', video: true, videoFile: '/Peticiones Familiares.mp4' },
  'visa-u': { key: 'visaU', icon: 'fa-solid fa-scale-balanced', video: true, videoFile: '/Visa U Listo YT.mp4' },
  'visa-t': { key: 'visaT', icon: 'fa-solid fa-link', video: true, videoFile: '/3 Listo Visa T fx Listo.mp4' },
  'green-card': { key: 'greenCard', icon: 'fa-solid fa-id-card', video: true, videoFile: '/Green Card.mp4' },
}

const service = computed(() => serviceMap[props.slug] || { key: 'greenCard', icon: 'fa-solid fa-id-card', video: false })
const serviceTitle = computed(() => t(`services.${service.value.key}`))
const serviceDescription = computed(() => t(`serviceDescriptions.${service.value.key}`))
const serviceIcon = computed(() => service.value.icon)
const hasVideo = computed(() => service.value.video)
const videoFile = computed(() => service.value.videoFile || '')

const videoPlaying = ref(false)
const videoRef = ref(null)

function playVideo() {
  videoPlaying.value = true
  nextTick(() => {
    if (videoRef.value) {
      videoRef.value.play()
    }
  })
}
</script>
