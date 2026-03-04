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
              {{ pageH1 }}
            </h1>
            <p v-if="locationData" class="mt-3 text-gray-400 text-lg font-[var(--font-ui)] tracking-wider">
              <i class="fa-solid fa-location-dot text-brand-navy/40 mr-2"></i>
              {{ locale === 'es' ? locationData.nameEs : locationData.nameEn }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Content -->
    <section class="py-20 bg-white">
      <div class="max-w-4xl mx-auto px-6">
        <div class="reveal">
          <p class="text-gray-600 text-2xl md:text-3xl leading-relaxed font-[var(--font-body)] mb-12">
            {{ pageDescription }}
          </p>

          <!-- Video -->
          <div v-if="hasVideo" class="rounded-2xl overflow-hidden mb-12 shadow-lg">
            <div class="aspect-video relative bg-black">
              <!-- Thumbnail: actual video frame via preload -->
              <video
                v-if="!videoPlaying"
                :src="videoFile"
                class="absolute inset-0 w-full h-full object-contain"
                preload="metadata"
                muted
                playsinline
              ></video>
              <!-- Play overlay on top of thumbnail -->
              <div v-if="!videoPlaying" @click="playVideo"
                class="absolute inset-0 flex items-center justify-center cursor-pointer group z-10 bg-black/40">
                <div class="text-center">
                  <div class="w-24 h-24 md:w-32 md:h-32 rounded-full bg-brand-navy/80 flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-navy group-hover:scale-110 transition-all duration-300 ring-2 ring-white/30 shadow-xl">
                    <i class="fa-solid fa-play text-white text-3xl md:text-4xl ml-1.5"></i>
                  </div>
                  <p class="text-white text-lg md:text-xl font-[var(--font-ui)] font-semibold tracking-wider uppercase drop-shadow-lg">
                    {{ locale === 'es' ? 'Ver Video' : 'Watch Video' }}
                  </p>
                </div>
              </div>
              <!-- Active video player -->
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

        <!-- FAQ Section -->
        <div v-if="faqs.length" class="reveal mt-16">
          <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-brand-navy mb-8">
            {{ locale === 'es' ? 'Preguntas Frecuentes' : 'Frequently Asked Questions' }}
          </h2>
          <div class="space-y-4">
            <details v-for="(faq, i) in faqs" :key="i"
              class="group rounded-xl border border-gray-200 bg-white overflow-hidden">
              <summary class="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer font-[var(--font-ui)] text-lg font-semibold text-gray-700 hover:text-brand-navy transition-colors select-none list-none">
                <span>{{ faq.q }}</span>
                <i class="fa-solid fa-chevron-down text-sm text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0"></i>
              </summary>
              <div class="px-6 pb-5 text-gray-600 text-lg leading-relaxed font-[var(--font-body)]">
                {{ faq.a }}
              </div>
            </details>
          </div>
        </div>

        <!-- Related Services (Internal Linking) -->
        <div v-if="relatedServices.length" class="reveal mt-16">
          <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-brand-navy mb-6">
            {{ locale === 'es' ? 'Servicios Relacionados' : 'Related Services' }}
          </h2>
          <p class="text-gray-500 text-xl font-[var(--font-body)] mb-6">
            {{ locale === 'es' ? 'También ofrecemos asistencia con los siguientes servicios:' : 'We also offer assistance with the following services:' }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <router-link v-for="related in relatedServices" :key="related.slug"
              :to="`/servicios/${related.slug}`"
              class="group flex items-center gap-3 p-5 rounded-xl border border-gray-200 bg-white hover:border-brand-navy/30 hover:shadow-md transition-all">
              <i :class="related.icon" class="text-xl text-brand-navy/40 group-hover:text-brand-navy transition-colors"></i>
              <span class="font-[var(--font-ui)] text-base font-semibold text-gray-600 group-hover:text-brand-navy transition-colors">
                {{ related.name }}
              </span>
            </router-link>
          </div>
        </div>

        <!-- CTA -->
        <div class="reveal mt-12 p-10 rounded-2xl bg-brand-surface border border-gray-200 text-center">
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

    <!-- FAQ Schema (JSON-LD) -->
    <component :is="'script'" v-if="faqs.length" type="application/ld+json" v-text="faqSchema"></component>
  </div>
</template>

<script setup>
import { computed, ref, nextTick, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'
import {
  resolveServiceSlug,
  generateSeoMeta,
  getLocationDescription,
  serviceFaqs,
  baseServices,
} from '../data/seoServices.js'

useScrollReveal()
const props = defineProps({ slug: String })
const { t, locale } = useI18n()

// Resolve slug to service + optional location
const resolved = computed(() => {
  return resolveServiceSlug(props.slug) || { service: { key: 'greenCard', icon: 'fa-solid fa-id-card', video: false }, location: null, baseSlug: 'green-card' }
})

const serviceData = computed(() => resolved.value.service)
const locationData = computed(() => resolved.value.location)
const baseSlug = computed(() => resolved.value.baseSlug)

// Core service properties
const serviceName = computed(() => t(`services.${serviceData.value.key}`))
const serviceIcon = computed(() => serviceData.value.icon)
const hasVideo = computed(() => serviceData.value.video)
const videoFile = computed(() => serviceData.value.videoFile || '')

// SEO-aware title and description
const seoMeta = computed(() => generateSeoMeta(serviceData.value.key, locationData.value, locale.value, t))
const pageH1 = computed(() => seoMeta.value.h1)
const pageDescription = computed(() => getLocationDescription(serviceData.value.key, locationData.value, locale.value, t))

// Dynamic head meta (native DOM)
watchEffect(() => {
  document.title = seoMeta.value.title
  const meta = document.querySelector('meta[name="description"]')
  if (meta) meta.setAttribute('content', seoMeta.value.metaDescription)
})

// FAQs for the current service
const faqs = computed(() => {
  const faqData = serviceFaqs[serviceData.value.key]
  if (!faqData) return []
  return faqData[locale.value] || faqData.es || []
})

// FAQ Schema.org JSON-LD
const faqSchema = computed(() => {
  if (!faqs.value.length) return ''
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.value.map(faq => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  })
})

// Related services for internal linking
const relatedServices = computed(() => {
  const service = baseServices[baseSlug.value]
  if (!service || !service.relatedSlugs) return []
  return service.relatedSlugs.map(slug => {
    const related = baseServices[slug]
    if (!related) return null
    return {
      slug,
      name: t(`services.${related.key}`),
      icon: related.icon,
    }
  }).filter(Boolean)
})

// Video player
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

// Reset video when slug changes
watch(() => props.slug, () => {
  videoPlaying.value = false
})
</script>
