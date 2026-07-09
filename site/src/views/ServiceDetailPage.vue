<template>
  <div>
    <!-- Hero: service title only. Kept compact (tight padding, capped heading) so
         the video — which lives in the body content below — stays high on the
         page and is visible with little or no scrolling. -->
    <section class="relative pt-24 pb-8 bg-brand-surface overflow-hidden">
      <!-- Decorative -->
      <div class="absolute top-1/2 right-0 -translate-y-1/2 text-[300px] text-brand-navy/[0.04] pointer-events-none select-none">
        <!-- Keyed <span> wrapper: FontAwesome's dom.watch() detaches the <i> it
             converts, so Vue must swap an element FA never touches. -->
        <span :key="serviceIcon"><i :class="serviceIcon"></i></span>
      </div>

      <div class="relative max-w-7xl mx-auto px-6">
        <router-link to="/servicios"
          class="inline-flex items-center gap-2 text-gray-500 hover:text-brand-navy text-base font-ui tracking-wider uppercase mb-6 transition-colors group">
          <i class="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
          {{ $t('nav.servicios') }}
        </router-link>

        <div class="flex items-start gap-5">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
            <span :key="serviceIcon" class="contents"><i :class="serviceIcon" class="text-3xl text-brand-navy"></i></span>
          </div>
          <div>
            <h1 class="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-brand-navy leading-[0.98]">
              {{ serviceName }}
            </h1>
            <p v-if="locationData" class="mt-3 text-gray-500 text-lg font-ui tracking-wider">
              <i class="fa-solid fa-location-dot text-brand-navy/40 mr-2"></i>
              {{ locale === 'es' ? locationData.nameEs : locationData.nameEn }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Content -->
    <section class="pt-8 pb-16 bg-white">
      <div ref="contentRef" class="max-w-4xl mx-auto px-6">

        <!-- Video is the first piece of body content, so it sits near the top of
             the page (per §1.4.1) without living in the header. -->
        <div v-if="hasVideo" class="reveal mb-10">
          <p class="font-heading text-xl text-brand-navy mb-3">
            <i class="fa-solid fa-circle-play text-brand-navy/60 mr-2" aria-hidden="true"></i>{{ $t('serviceDetail.watchVideo', { service: serviceName }) }}
          </p>
          <div class="rounded-2xl overflow-hidden shadow-lg">
            <div class="aspect-video relative bg-brand-navy">
              <!-- Graceful fallback when the video source fails to load -->
              <div v-if="videoError"
                class="absolute inset-0 flex items-center justify-center text-center px-6 text-white/70 font-ui text-base">
                {{ $t('serviceDetail.videoUnavailable') }}
              </div>

              <!-- Click-to-play everywhere (no autoplay, per client decision) -->
              <template v-else>
                <img v-if="!videoPlaying" :src="thumbnailSrc" :alt="serviceName"
                  class="absolute inset-0 w-full h-full object-cover" />
                <button v-if="!videoPlaying" type="button" @click="playVideo"
                  :aria-label="$t('serviceDetail.watchVideo', { service: serviceName })"
                  class="absolute inset-0 cursor-pointer group z-10 bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80 focus-visible:ring-inset rounded-2xl">
                  <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24">
                    <span class="absolute inset-0 rounded-full border-2 border-white/70 play-pulse-ring" aria-hidden="true"></span>
                    <span class="relative w-full h-full rounded-full bg-white/90 flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-transform duration-300 shadow-2xl">
                      <i class="fa-solid fa-play text-brand-navy text-2xl sm:text-3xl ml-1"></i>
                    </span>
                  </span>
                </button>
                <video
                  v-if="videoPlaying"
                  ref="detailVideoRef"
                  :src="videoFile"
                  :aria-label="$t('serviceDetail.watchVideo', { service: serviceName })"
                  class="w-full h-full object-contain bg-black"
                  controls
                  autoplay
                  playsinline
                  @error="videoError = true"
                ></video>
              </template>
            </div>
          </div>
        </div>

        <!-- Location service area note -->
        <p v-if="locationData" class="reveal text-gray-500 text-lg font-ui mb-6 flex items-center gap-2">
          <i class="fa-solid fa-map-marker-alt text-brand-navy/40" aria-hidden="true"></i>
          {{ $t('serviceDetail.servingPrefix') }} {{ locale === 'es' ? locationData.contextEs : locationData.contextEn }}.
        </p>

        <!-- SEO-friendly long headline sits above the body content -->
        <h2 class="reveal font-heading text-3xl md:text-4xl text-brand-navy leading-tight mb-8">
          {{ pageH1 }}
        </h2>

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

            <!-- Video is hoisted to the top of the content area (see above);
                 the inline marker renders nothing to avoid a duplicate player. -->
          </template>
        </template>

        <!-- FAQ Section -->
        <div v-if="faqs.length" class="reveal mt-12">
          <h2 class="font-heading text-2xl md:text-3xl text-brand-navy mb-6">
            {{ $t('serviceDetail.faqTitle') }}
          </h2>
          <div class="space-y-3">
            <details v-for="(faq, i) in faqs" :key="i"
              class="group rounded-xl border border-gray-200 bg-white overflow-hidden">
              <summary class="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer font-ui text-lg font-semibold text-gray-700 hover:text-brand-navy transition-colors select-none list-none">
                <span>{{ faq.q }}</span>
                <i class="fa-solid fa-chevron-down text-sm text-gray-500 group-open:rotate-180 transition-transform flex-shrink-0"></i>
              </summary>
              <div class="px-6 pb-4 text-gray-600 text-lg leading-relaxed font-body">
                {{ faq.a }}
              </div>
            </details>
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

        <!-- Related Services (Internal Linking) -->
        <div v-if="relatedServices.length" class="reveal mt-12">
          <h2 class="font-heading text-2xl md:text-3xl text-brand-navy mb-4">
            {{ $t('serviceDetail.relatedTitle') }}
          </h2>
          <p class="text-gray-500 text-lg font-body mb-4">
            {{ $t('serviceDetail.relatedSubtitle') }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <router-link v-for="related in relatedServices" :key="related.slug"
              :to="`/servicios/${related.slug}`"
              class="group flex items-center gap-3 p-5 rounded-xl border border-gray-200 bg-white hover:border-brand-navy/30 hover:shadow-md transition-all">
              <span :key="related.icon" class="contents"><i :class="related.icon" class="text-xl text-brand-navy/40 group-hover:text-brand-navy transition-colors"></i></span>
              <span class="font-ui text-base font-semibold text-gray-600 group-hover:text-brand-navy transition-colors">
                {{ related.name }}
              </span>
            </router-link>
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
import { getServiceContent } from '../data/serviceContent.js'

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
const thumbnailSrc = computed(() => serviceData.value.thumbnail ? `${serviceData.value.thumbnail}?v=2` : '/logo.png')

// Structured content blocks (bilingual; falls back to ES when EN missing)
const contentBlocks = computed(() => getServiceContent(serviceData.value.key, locale.value))

// SEO
const seoMeta = computed(() => generateSeoMeta(serviceData.value.key, locationData.value, locale.value, t, serviceData.value))
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

// Video player (click-to-play with sound; no autoplay per client decision)
const videoPlaying = ref(false)
const detailVideoRef = ref(null)
// Set true when a <video> emits an error (missing/unreachable source);
// hides the broken player and shows a graceful notice.
const videoError = ref(false)

function playVideo() {
  videoPlaying.value = true
  nextTick(() => {
    const video = detailVideoRef.value
    if (video) {
      video.play().catch(() => {})
      // Move keyboard focus onto the player: the play <button> just unmounted,
      // so without this focus would fall back to <body>.
      video.focus()
    }
  })
}

// Reset video + re-observe reveals when route changes
watch(
  () => [props.slug, props.service, props.location],
  () => {
    videoPlaying.value = false
    videoError.value = false
    nextTick(observeRevealElements)
  }
)
</script>

<style scoped>
/* Subtle expanding ring behind the play button (same easing as .btn-magnetic) */
@keyframes play-pulse {
  0% { transform: scale(1); opacity: 0.7; }
  70%, 100% { transform: scale(1.35); opacity: 0; }
}
.play-pulse-ring {
  animation: play-pulse 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .play-pulse-ring { animation: none; }
}
</style>
