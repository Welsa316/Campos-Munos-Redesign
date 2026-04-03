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
          class="inline-flex items-center gap-2 text-gray-400 hover:text-brand-navy text-base font-ui tracking-wider uppercase mb-8 transition-colors group">
          <i class="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
          {{ $t('nav.servicios') }}
        </router-link>

        <div class="flex items-start gap-6">
          <div class="w-20 h-20 rounded-2xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
            <i :class="serviceIcon" class="text-3xl text-brand-navy"></i>
          </div>
          <div>
            <h1 class="font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-brand-navy leading-[0.95]">
              {{ pageH1 }}
            </h1>
            <p v-if="locationData" class="mt-3 text-gray-400 text-lg font-ui tracking-wider">
              <i class="fa-solid fa-location-dot text-brand-navy/40 mr-2"></i>
              {{ locale === 'es' ? locationData.nameEs : locationData.nameEn }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Content -->
    <section class="py-16 bg-white">
      <div ref="contentRef" class="max-w-4xl mx-auto px-6">

        <!-- Location service area note -->
        <p v-if="locationData" class="reveal text-gray-500 text-lg font-ui mb-6 flex items-center gap-2">
          <i class="fa-solid fa-map-marker-alt text-brand-navy/40"></i>
          {{ locale === 'es'
            ? `Atendemos clientes ${locationData.contextEs}.`
            : `Serving clients ${locationData.contextEn}.` }}
        </p>

        <!-- Structured content from .txt files -->
        <template v-if="contentBlocks.length">
          <template v-for="(block, i) in contentBlocks" :key="i">
            <!-- Heading (h2) -->
            <h2 v-if="block.type === 'heading'"
              class="reveal font-heading text-2xl md:text-3xl text-brand-navy mb-4"
              :class="i === 0 ? 'mt-0' : 'mt-10'">
              {{ block.text }}
            </h2>

            <!-- Subheading (h3) -->
            <h3 v-else-if="block.type === 'subheading'"
              class="reveal font-heading text-xl md:text-2xl text-brand-navy/80 mt-8 mb-3">
              {{ block.text }}
            </h3>

            <!-- Paragraph -->
            <p v-else-if="block.type === 'paragraph'"
              class="reveal text-gray-600 text-lg leading-relaxed font-body mb-3">
              {{ block.text }}
            </p>

            <!-- List -->
            <ul v-else-if="block.type === 'list'"
              class="reveal list-disc list-outside pl-6 space-y-1.5 mb-4">
              <li v-for="(item, j) in block.items" :key="j"
                class="text-gray-600 text-lg leading-relaxed font-body">
                {{ item }}
              </li>
            </ul>

            <!-- Video embed marker -->
            <div v-else-if="block.type === 'video' && hasVideo"
              class="reveal rounded-2xl overflow-hidden my-8 shadow-lg">
              <div class="aspect-video relative bg-brand-navy">
                <img v-if="!videoPlaying" :src="thumbnailSrc" :alt="serviceName"
                  class="absolute inset-0 w-full h-full object-cover" />
                <div v-if="!videoPlaying" @click="playVideo"
                  class="absolute inset-0 cursor-pointer group z-10">
                  <div class="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all duration-300 shadow-2xl">
                    <i class="fa-solid fa-play text-brand-navy text-lg ml-0.5"></i>
                  </div>
                </div>
                <video
                  v-if="videoPlaying"
                  :src="videoFile"
                  class="w-full h-full object-contain bg-black"
                  controls
                  autoplay
                  playsinline
                ></video>
              </div>
            </div>
          </template>
        </template>

        <!-- Fallback: no .txt content — just show video if available -->
        <template v-else>
          <div v-if="hasVideo" class="reveal rounded-2xl overflow-hidden mb-8 shadow-lg">
            <div class="aspect-video relative bg-brand-navy">
              <img v-if="!videoPlaying" :src="thumbnailSrc" :alt="serviceName"
                class="absolute inset-0 w-full h-full object-cover" />
              <div v-if="!videoPlaying" @click="playVideo"
                class="absolute inset-0 cursor-pointer group z-10">
                <div class="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all duration-300 shadow-2xl">
                  <i class="fa-solid fa-play text-brand-navy text-lg ml-0.5"></i>
                </div>
              </div>
              <video
                v-if="videoPlaying"
                :src="videoFile"
                class="w-full h-full object-contain bg-black"
                controls
                autoplay
                playsinline
              ></video>
            </div>
          </div>
        </template>

        <!-- FAQ Section -->
        <div v-if="faqs.length" class="reveal mt-12">
          <h2 class="font-heading text-2xl md:text-3xl text-brand-navy mb-6">
            {{ locale === 'es' ? 'Preguntas Frecuentes' : 'Frequently Asked Questions' }}
          </h2>
          <div class="space-y-3">
            <details v-for="(faq, i) in faqs" :key="i"
              class="group rounded-xl border border-gray-200 bg-white overflow-hidden">
              <summary class="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer font-ui text-lg font-semibold text-gray-700 hover:text-brand-navy transition-colors select-none list-none">
                <span>{{ faq.q }}</span>
                <i class="fa-solid fa-chevron-down text-sm text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0"></i>
              </summary>
              <div class="px-6 pb-4 text-gray-600 text-lg leading-relaxed font-body">
                {{ faq.a }}
              </div>
            </details>
          </div>
        </div>

        <!-- Related Services (Internal Linking) -->
        <div v-if="relatedServices.length" class="reveal mt-12">
          <h2 class="font-heading text-2xl md:text-3xl text-brand-navy mb-4">
            {{ locale === 'es' ? 'Servicios Relacionados' : 'Related Services' }}
          </h2>
          <p class="text-gray-500 text-lg font-body mb-4">
            {{ locale === 'es' ? 'También ofrecemos asistencia con los siguientes servicios:' : 'We also offer assistance with the following services:' }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <router-link v-for="related in relatedServices" :key="related.slug"
              :to="`/servicios/${related.slug}`"
              class="group flex items-center gap-3 p-5 rounded-xl border border-gray-200 bg-white hover:border-brand-navy/30 hover:shadow-md transition-all">
              <i :class="related.icon" class="text-xl text-brand-navy/40 group-hover:text-brand-navy transition-colors"></i>
              <span class="font-ui text-base font-semibold text-gray-600 group-hover:text-brand-navy transition-colors">
                {{ related.name }}
              </span>
            </router-link>
          </div>
        </div>

        <!-- CTA -->
        <div class="reveal mt-12 p-10 rounded-2xl bg-brand-surface border border-gray-200 text-center">
          <p class="text-gray-500 text-2xl mb-8 font-body">{{ $t('home.popupTitle') }}</p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <router-link to="/consulta"
              class="inline-flex items-center gap-3 bg-brand-navy text-white font-ui font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
              {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-sm"></i>
            </router-link>
            <a href="tel:+15049106508"
              class="inline-flex items-center gap-3 border border-gray-300 text-gray-500 hover:text-brand-navy hover:border-brand-navy/30 font-ui font-medium tracking-wider text-base px-10 py-5 rounded-xl transition-all">
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
import { computed, ref, nextTick, watch, watchEffect, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  resolveServiceSlug,
  generateSeoMeta,
  serviceFaqs,
  baseServices,
} from '../data/seoServices.js'
import { serviceContent } from '../data/serviceContent.js'

const props = defineProps({ slug: String, service: String, location: String })
const { t, locale } = useI18n()

// --- Scroll reveal (local, re-observes on content change) ---
const contentRef = ref(null)
let revealObserver = null

function observeRevealElements() {
  if (revealObserver) revealObserver.disconnect()
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
        }
      })
    },
    { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
  )
  if (contentRef.value) {
    contentRef.value.querySelectorAll('.reveal').forEach((el) => {
      revealObserver.observe(el)
    })
  }
}

onMounted(() => { nextTick(observeRevealElements) })
onUnmounted(() => { if (revealObserver) revealObserver.disconnect() })

// --- Route resolution ---
const resolved = computed(() => {
  if (props.service && props.location) {
    return resolveServiceSlug(props.service, props.location) || { service: { key: 'greenCard', icon: 'fa-solid fa-id-card', video: false }, location: null, baseSlug: 'green-card' }
  }
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
const thumbnailSrc = computed(() => serviceData.value.thumbnail || '/logo.png')

// Structured content blocks from .txt files
const contentBlocks = computed(() => serviceContent[serviceData.value.key] || [])

// SEO
const seoMeta = computed(() => generateSeoMeta(serviceData.value.key, locationData.value, locale.value, t))
const pageH1 = computed(() => seoMeta.value.h1)

watchEffect(() => {
  document.title = seoMeta.value.title
  const meta = document.querySelector('meta[name="description"]')
  if (meta) meta.setAttribute('content', seoMeta.value.metaDescription)
})

// FAQs
const faqs = computed(() => {
  const faqData = serviceFaqs[serviceData.value.key]
  if (!faqData) return []
  return faqData[locale.value] || faqData.es || []
})

const faqSchema = computed(() => {
  if (!faqs.value.length) return ''
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.value.map(faq => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  })
})

// Related services
const relatedServices = computed(() => {
  const service = baseServices[baseSlug.value]
  if (!service || !service.relatedSlugs) return []
  return service.relatedSlugs.map(slug => {
    const related = baseServices[slug]
    if (!related) return null
    return { slug, name: t(`services.${related.key}`), icon: related.icon }
  }).filter(Boolean)
})

// Video player
const videoPlaying = ref(false)

function playVideo() {
  videoPlaying.value = true
  nextTick(() => {
    const video = document.querySelector('video')
    if (video) {
      video.play().catch(() => {})
    }
  })
}

// Reset video + re-observe reveals when route changes
watch(
  () => [props.slug, props.service, props.location],
  () => {
    videoPlaying.value = false
    nextTick(observeRevealElements)
  }
)
</script>
