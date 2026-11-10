<template>
  <!-- An unknown slug is a dead URL, not a fall-back article. -->
  <NotFoundPage v-if="!post" />
  <div v-else>
    <!-- Header: compact, like the service pages, so the video stays high. -->
    <section class="relative pt-28 pb-10 md:pb-14 bg-brand-surface overflow-hidden">
      <div class="relative max-w-6xl mx-auto px-6">
        <router-link to="/blog"
          class="inline-flex items-center gap-2 text-gray-500 hover:text-brand-navy text-base font-ui tracking-wider uppercase mb-6 transition-colors group">
          <i class="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform" aria-hidden="true"></i>
          {{ $t('blog.eyebrow') }}
        </router-link>

        <p class="font-ui text-sm tracking-[0.2em] uppercase text-brand-navy mb-4">
          <router-link v-if="service" :to="`/servicios/${post.service}`" class="hover:underline underline-offset-4">{{ topic }}</router-link>
          <span v-else>{{ topic }}</span>
        </p>
        <h1 class="font-heading text-[2.15rem] sm:text-5xl lg:text-[3.4rem] font-bold text-brand-navy leading-[1.08] max-w-4xl text-balance">
          {{ title }}
        </h1>
        <p class="mt-5 text-gray-600 text-xl md:text-2xl font-body leading-relaxed max-w-3xl">
          {{ description }}
        </p>

        <!-- Byline: the video's presenter, linked to his bio -->
        <div class="mt-8 flex items-center gap-4">
          <img src="/JuanHeadshot.jpg" alt="" width="48" height="48"
            class="w-12 h-12 rounded-full object-cover object-top ring-2 ring-white flex-shrink-0" />
          <div class="font-ui text-[0.95rem] leading-snug">
            <p class="text-gray-600">
              {{ $t('blog.basedOnVideo') }}
              <router-link to="/el-equipo/juan" class="font-semibold text-brand-navy hover:underline underline-offset-4">Juan Campos-Gutierrez, Esq.</router-link>
            </p>
            <p class="text-gray-500 mt-0.5">
              <time :datetime="post.date">{{ formatDate(post.date, locale) }}</time>
              <template v-if="content"> · {{ $t('blog.minRead', { n: minutes }) }}</template>
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-white pt-10 md:pt-14 pb-16 md:pb-24">
      <div class="max-w-6xl mx-auto px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16 xl:gap-20">
        <article class="min-w-0 max-w-[44rem]">
          <!-- The video the article is written from -->
          <figure v-if="video" class="mb-10">
            <ClickToPlayVideo :key="video.src" :src="video.src" :poster="video.poster" :alt="topic"
              :label="$t('blog.videoLabel', { topic })" />
            <figcaption class="mt-3 font-ui text-sm text-gray-500 flex items-center gap-2">
              <i class="fa-solid fa-circle-play text-brand-navy/50" aria-hidden="true"></i>
              {{ $t('blog.videoTitle') }}: Juan Campos-Gutierrez — {{ topic }}
            </figcaption>
          </figure>

          <!-- Body. Nothing renders until the article chunk loads; it's small. -->
          <template v-if="content">
            <template v-for="(block, i) in content.blocks" :key="`${post.slug}-${locale}-${i}`">
              <p v-if="block.type === 'lead'" class="text-gray-800 text-[1.45rem] md:text-[1.6rem] leading-relaxed font-body mb-8">
                <RichText :text="block.text" />
              </p>

              <h2 v-else-if="block.type === 'heading'" :id="headingIds[i]"
                class="font-heading text-[1.7rem] md:text-3xl text-brand-navy leading-tight mt-12 mb-4 scroll-mt-28">
                {{ block.text }}
              </h2>

              <h3 v-else-if="block.type === 'subheading'"
                class="font-heading text-xl md:text-2xl text-brand-navy mt-8 mb-3 leading-snug">
                {{ block.text }}
              </h3>

              <p v-else-if="block.type === 'paragraph'" class="text-gray-700 text-xl leading-relaxed font-body mb-5">
                <RichText :text="block.text" />
              </p>

              <ul v-else-if="block.type === 'list'" class="list-disc marker:text-brand-navy/60 pl-6 space-y-2 mb-6">
                <li v-for="(item, j) in block.items" :key="j" class="text-gray-700 text-xl leading-relaxed font-body pl-1">
                  <RichText :text="item" />
                </li>
              </ul>

              <aside v-else-if="block.type === 'callout'"
                class="my-8 border-l-4 border-brand-navy bg-brand-light rounded-r-xl px-6 py-5">
                <p class="font-ui text-sm font-semibold tracking-[0.12em] uppercase text-brand-navy mb-1.5">{{ block.title }}</p>
                <p class="text-gray-800 text-xl leading-relaxed font-body"><RichText :text="block.text" /></p>
              </aside>

              <figure v-else-if="block.type === 'quote'" class="my-10 pl-6 border-l-2 border-brand-navy/20">
                <blockquote class="font-heading text-[1.4rem] md:text-[1.7rem] text-brand-navy leading-snug">
                  “{{ block.text }}”
                </blockquote>
                <figcaption class="mt-3 font-ui text-sm tracking-wide text-gray-500">— Juan Campos-Gutierrez, Esq.</figcaption>
              </figure>

              <div v-else-if="block.type === 'table'" class="my-8">
                <!-- Wide screens: a real table -->
                <div class="hidden sm:block rounded-xl border border-gray-200 overflow-hidden">
                  <table class="w-full text-left font-ui text-[0.95rem] leading-snug">
                    <thead class="bg-brand-navy text-white">
                      <tr>
                        <th v-for="(cell, c) in block.head" :key="c" scope="col" class="px-4 py-3 font-semibold align-bottom">
                          <span v-if="cell">{{ cell }}</span><span v-else class="sr-only">—</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, r) in block.rows" :key="r" class="border-t border-gray-200 even:bg-brand-light">
                        <template v-for="(cell, c) in row" :key="c">
                          <th v-if="c === 0" scope="row" class="px-4 py-3 font-semibold text-gray-800 align-top">{{ cell }}</th>
                          <td v-else class="px-4 py-3 text-gray-700 align-top">{{ cell }}</td>
                        </template>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <!-- Phones: one card per row, so nothing scrolls sideways -->
                <div class="sm:hidden space-y-3">
                  <div v-for="(row, r) in block.rows" :key="r" class="rounded-xl border border-gray-200 px-5 py-4">
                    <p class="font-ui font-semibold text-gray-800 mb-2">{{ row[0] }}</p>
                    <dl class="space-y-1.5 font-ui text-[0.95rem]">
                      <div v-for="(cell, c) in row.slice(1)" :key="c" class="flex gap-3">
                        <dt class="text-brand-navy font-semibold w-28 flex-shrink-0">{{ block.head[c + 1] }}</dt>
                        <dd class="text-gray-700 min-w-0">{{ cell }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </template>

            <!-- FAQ -->
            <div v-if="content.faqs?.length" class="mt-14">
              <h2 :id="faqId" class="font-heading text-[1.7rem] md:text-3xl text-brand-navy mb-5 scroll-mt-28">{{ $t('blog.faqTitle') }}</h2>
              <div class="space-y-3">
                <details v-for="(faq, i) in content.faqs" :key="i"
                  class="group rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <summary class="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer font-ui text-lg font-semibold text-gray-700 hover:text-brand-navy transition-colors select-none list-none">
                    <span>{{ faq.q }}</span>
                    <i class="fa-solid fa-chevron-down text-sm text-gray-500 group-open:rotate-180 transition-transform flex-shrink-0" aria-hidden="true"></i>
                  </summary>
                  <div class="px-6 pb-5 text-gray-700 text-xl leading-relaxed font-body">{{ faq.a }}</div>
                </details>
              </div>
            </div>

            <p class="mt-10 pt-6 border-t border-gray-200 font-ui text-sm text-gray-500 leading-relaxed">
              {{ $t('blog.disclaimer') }}
            </p>
          </template>

          <!-- Phones and tablets: the aside's call to action, at the end -->
          <div class="on-dark lg:hidden mt-10 p-8 rounded-2xl bg-brand-navy text-white">
            <p class="font-heading text-2xl leading-snug">{{ $t('blog.asideTitle') }}</p>
            <p class="mt-2 font-body text-xl text-white/80">{{ $t('blog.asideText') }}</p>
            <div class="mt-6 flex flex-col sm:flex-row gap-3">
              <router-link to="/consulta"
                class="inline-flex items-center justify-center gap-3 bg-white text-brand-navy font-ui font-bold tracking-wider text-base px-8 py-4 rounded-xl btn-magnetic">
                {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-sm" aria-hidden="true"></i>
              </router-link>
              <a href="tel:+15049106508"
                class="inline-flex items-center justify-center gap-3 border border-white/40 hover:border-white text-white font-ui font-medium tracking-wider text-base px-8 py-4 rounded-xl transition-colors">
                <i class="fa-solid fa-phone text-sm" aria-hidden="true"></i> (504) 910-6508
              </a>
            </div>
          </div>
        </article>

        <!-- Desktop: contents + contact, pinned beside the article -->
        <aside class="hidden lg:block">
          <div class="sticky top-28 space-y-8">
            <nav v-if="toc.length" :aria-label="$t('blog.inThisArticle')">
              <p class="font-ui text-xs font-semibold tracking-[0.2em] uppercase text-gray-500 mb-3">{{ $t('blog.inThisArticle') }}</p>
              <ol class="border-l border-gray-200">
                <li v-for="item in toc" :key="item.id">
                  <a :href="`#${item.id}`" @click.prevent="jumpTo(item.id)"
                    class="block -ml-px border-l-2 pl-4 py-1.5 font-ui text-[0.9rem] leading-snug transition-colors"
                    :class="activeId === item.id ? 'border-brand-navy text-brand-navy font-semibold' : 'border-transparent text-gray-600 hover:text-brand-navy'"
                    :aria-current="activeId === item.id ? 'location' : undefined">
                    {{ item.text }}
                  </a>
                </li>
              </ol>
            </nav>

            <div class="on-dark rounded-2xl bg-brand-navy text-white p-6">
              <p class="font-heading text-xl leading-snug">{{ $t('blog.asideTitle') }}</p>
              <p class="mt-2 font-body text-lg text-white/80 leading-snug">{{ $t('blog.asideText') }}</p>
              <router-link to="/consulta"
                class="mt-5 flex items-center justify-center gap-2 bg-white text-brand-navy font-ui font-bold tracking-wider text-sm px-5 py-3.5 rounded-xl btn-magnetic">
                {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
              </router-link>
              <a href="tel:+15049106508"
                class="mt-3 flex items-center justify-center gap-2 font-ui text-sm text-white/80 hover:text-white transition-colors py-1">
                <i class="fa-solid fa-phone text-xs" aria-hidden="true"></i> (504) 910-6508
              </a>
            </div>

            <router-link v-if="service" :to="`/servicios/${post.service}`"
              class="group block rounded-2xl border border-gray-200 p-5 hover:border-brand-navy/40 transition-colors">
              <p class="font-ui text-xs font-semibold tracking-[0.2em] uppercase text-gray-500">{{ $t('blog.relatedService') }}</p>
              <p class="mt-2 flex items-center justify-between gap-3 font-heading text-lg text-brand-navy">
                {{ topic }}
                <i class="fa-solid fa-arrow-right text-xs text-brand-navy/40 group-hover:text-brand-navy transition-colors" aria-hidden="true"></i>
              </p>
            </router-link>
          </div>
        </aside>
      </div>
    </section>

    <!-- Keep reading -->
    <section class="bg-brand-light py-16 md:py-20">
      <div class="max-w-6xl mx-auto px-6">
        <h2 class="font-heading text-3xl md:text-4xl text-brand-navy mb-8">{{ $t('blog.keepReading') }}</h2>
        <ul class="grid gap-x-10 md:grid-cols-3">
          <li v-for="other in more" :key="other.slug" class="border-t border-gray-300">
            <router-link :to="`/blog/${other.slug}`" class="group block py-6">
              <p class="font-ui text-xs font-semibold tracking-[0.2em] uppercase text-gray-500 mb-2">{{ topicOf(other) }}</p>
              <p class="font-heading text-xl text-gray-800 group-hover:text-brand-navy leading-snug transition-colors">
                {{ other.title[locale] || other.title.es }}
              </p>
              <span class="mt-3 inline-flex items-center gap-2 font-ui text-sm font-semibold text-brand-navy">
                {{ $t('blog.readArticle') }}
                <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
              </span>
            </router-link>
          </li>
        </ul>
      </div>
    </section>

    <component :is="'script'" type="application/ld+json" v-text="schema"></component>
  </div>
</template>

<script setup>
import { computed, ref, shallowRef, watch, watchEffect, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  postBySlug, loadArticle, serviceFor, posterFor, formatDate, readingMinutes, headingId, relatedPosts,
} from '../data/blog/index.js'
import NotFoundPage from './NotFoundPage.vue'
import ClickToPlayVideo from '../components/ClickToPlayVideo.vue'
import RichText from '../components/RichText.js'

const props = defineProps({ slug: String })
const { t, locale } = useI18n()

const post = computed(() => postBySlug[props.slug] || null)
const service = computed(() => serviceFor(post.value))

function topicOf(p) {
  if (p.topic) return p.topic[locale.value] || p.topic.es
  const s = serviceFor(p)
  return s ? t(`services.${s.key}`) : ''
}

const topic = computed(() => (post.value ? topicOf(post.value) : ''))
const title = computed(() => post.value?.title[locale.value] || post.value?.title.es || '')
const description = computed(() => post.value?.description[locale.value] || post.value?.description.es || '')

const video = computed(() => {
  const s = service.value
  if (!s?.video || !s.videoFile) return null
  return { src: s.videoFile, poster: posterFor(post.value) || '/logo.png' }
})

// --- Article body (lazy chunk per slug) ---
const article = shallowRef(null)
watch(() => props.slug, async (slug) => {
  article.value = null
  if (!postBySlug[slug]) return
  const loaded = await loadArticle(slug)
  if (props.slug === slug) article.value = loaded
}, { immediate: true })

// English falls back to Spanish rather than rendering nothing.
const content = computed(() => article.value?.[locale.value] || article.value?.es || null)
const minutes = computed(() => readingMinutes(content.value))

// --- Headings: ids + table of contents ---
const headingIds = computed(() => {
  const seen = {}
  return (content.value?.blocks || []).map((b) => {
    if (b.type !== 'heading') return null
    let id = headingId(b.text)
    seen[id] = (seen[id] || 0) + 1
    if (seen[id] > 1) id = `${id}-${seen[id]}`
    return id
  })
})
const faqId = computed(() => headingId(t('blog.faqTitle')))
const toc = computed(() => {
  const items = (content.value?.blocks || [])
    .map((b, i) => (b.type === 'heading' ? { id: headingIds.value[i], text: b.text } : null))
    .filter(Boolean)
  if (content.value?.faqs?.length) items.push({ id: faqId.value, text: t('blog.faqTitle') })
  return items
})

// Highlight the section being read: the last heading above the 30% line.
// (A band-based IntersectionObserver loses the section once its heading has
// scrolled past, so this measures on scroll instead, once per frame.)
const activeId = ref('')
let frame = 0
function updateActive() {
  frame = 0
  const line = window.innerHeight * 0.3
  let current = ''
  for (const item of toc.value) {
    const el = document.getElementById(item.id)
    if (el && el.getBoundingClientRect().top <= line) current = item.id
  }
  activeId.value = current
}
function onScroll() {
  if (!frame) frame = requestAnimationFrame(updateActive)
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
watch(toc, () => nextTick(updateActive))
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  if (frame) cancelAnimationFrame(frame)
})

function jumpTo(id) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
  activeId.value = id
}

const more = computed(() => (post.value ? relatedPosts(post.value, 3) : []))

// --- Head + structured data ---
const BASE = 'https://camulaw.com'
function setMeta(selector, value) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute('content', value)
}
watchEffect(() => {
  if (typeof document === 'undefined' || !post.value) return
  const fullTitle = `${title.value} | Campos Muños Law`
  document.title = fullTitle
  setMeta('meta[name="description"]', description.value)
  setMeta('meta[property="og:title"]', fullTitle)
  setMeta('meta[property="og:description"]', description.value)
  setMeta('meta[name="twitter:title"]', fullTitle)
  setMeta('meta[name="twitter:description"]', description.value)
})

const schema = computed(() => {
  if (!post.value) return ''
  const url = `${BASE}/blog/${post.value.slug}`
  const poster = posterFor(post.value)
  const graph = [
    {
      '@type': 'BlogPosting',
      headline: title.value,
      description: description.value,
      inLanguage: locale.value === 'en' ? 'en-US' : 'es-US',
      datePublished: post.value.date,
      dateModified: post.value.date,
      mainEntityOfPage: url,
      ...(poster ? { image: `${BASE}${poster.split('?')[0]}` } : {}),
      author: { '@type': 'Person', name: 'Juan Campos-Gutierrez', url: `${BASE}/el-equipo/juan` },
      publisher: { '@type': 'LegalService', name: 'Campos Muños Law', url: BASE, logo: { '@type': 'ImageObject', url: `${BASE}/logo.png` } },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('blog.eyebrow'), item: `${BASE}/blog` },
        { '@type': 'ListItem', position: 2, name: title.value, item: url },
      ],
    },
  ]
  if (content.value?.faqs?.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: content.value.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    })
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
})
</script>
