<template>
  <!-- An unrecognised service or location slug is a dead URL, not a silent
       fall-back to Green Card — that produced duplicate pages under bogus
       canonicals and read as a soft 404 to search engines. -->
  <NotFoundPage v-if="notFound" />
  <div v-else>
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
          <!-- Keyed on the source so a service-to-service navigation resets the
               player to its poster. -->
          <ClickToPlayVideo :key="videoFile" :src="videoFile" :poster="thumbnailSrc" :alt="serviceName"
            :label="$t('serviceDetail.watchVideo', { service: serviceName })" />
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

        <!-- Blog articles written from this service's video -->
        <div v-if="serviceArticles.length" class="reveal mt-12">
          <h2 class="font-heading text-2xl md:text-3xl text-brand-navy mb-4">
            {{ $t('blog.serviceArticlesTitle') }}
          </h2>
          <ul class="divide-y divide-gray-200 border-y border-gray-200">
            <li v-for="post in serviceArticles" :key="post.slug">
              <router-link :to="`/blog/${post.slug}`"
                class="group flex items-center justify-between gap-6 py-5 text-gray-700 hover:text-brand-navy transition-colors">
                <span class="font-heading text-xl leading-snug">{{ post.title[locale] || post.title.es }}</span>
                <i class="fa-solid fa-arrow-right text-sm text-brand-navy/40 group-hover:text-brand-navy transition-colors flex-shrink-0" aria-hidden="true"></i>
              </router-link>
            </li>
          </ul>
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
import { posts } from '../data/blog/posts.js'
import NotFoundPage from './NotFoundPage.vue'
import ClickToPlayVideo from '../components/ClickToPlayVideo.vue'

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
// A slug that doesn't resolve means the URL is dead. Report it instead of
// falling back to Green Card, which used to serve real content under a bogus
// canonical (duplicate content + soft 404). A location page whose service is
// valid but whose location isn't also counts as dead.
const resolved = computed(() => {
  if (props.service && props.location) {
    const match = resolveServiceSlug(props.service, props.location)
    return match && match.location ? match : null
  }
  return resolveServiceSlug(props.slug) || null
})

const notFound = computed(() => resolved.value === null)

const FALLBACK = { service: { key: 'greenCard', icon: 'fa-solid fa-id-card', video: false }, location: null, baseSlug: 'green-card' }
const serviceData = computed(() => (resolved.value || FALLBACK).service)
const locationData = computed(() => (resolved.value || FALLBACK).location)
const baseSlug = computed(() => (resolved.value || FALLBACK).baseSlug)

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
  // Leave the head alone on a dead slug — NotFoundPage owns it there.
  if (notFound.value) return
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

// Blog articles written from this service's video (internal links both ways)
const serviceArticles = computed(() => posts.filter(p => p.service === baseSlug.value))

// Re-observe reveals when the route changes (the player resets via its :key)
watch(
  () => [props.slug, props.service, props.location],
  () => { nextTick(observeRevealElements) }
)
</script>
