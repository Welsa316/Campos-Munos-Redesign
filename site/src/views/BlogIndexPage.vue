<template>
  <div>
    <!-- Header -->
    <section class="pt-28 pb-12 md:pb-16 bg-brand-surface">
      <div class="max-w-6xl mx-auto px-6">
        <p class="font-ui text-sm tracking-[0.2em] uppercase text-brand-navy mb-4">{{ $t('blog.eyebrow') }}</p>
        <h1 class="font-heading text-4xl md:text-6xl font-bold text-brand-navy leading-[1.02]">{{ $t('blog.indexTitle') }}</h1>
        <p class="mt-5 max-w-2xl text-gray-600 text-xl md:text-2xl font-body leading-relaxed">{{ $t('blog.indexIntro') }}</p>
      </div>
    </section>

    <section class="bg-white py-12 md:py-16">
      <div class="max-w-6xl mx-auto px-6">
        <!-- Featured: the first article, given the width -->
        <router-link :to="`/blog/${featured.slug}`"
          class="group grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 md:gap-10 items-center pb-12 md:pb-16 border-b border-gray-200">
          <BlogCover :post="featured" class="rounded-2xl" />
          <div>
            <p class="font-ui text-xs font-semibold tracking-[0.2em] uppercase text-gray-500 mb-3">{{ topicOf(featured) }}</p>
            <h2 class="font-heading text-3xl lg:text-[2.6rem] text-brand-navy leading-[1.1] group-hover:underline decoration-2 underline-offset-[6px] decoration-brand-navy/30 text-balance">
              {{ titleOf(featured) }}
            </h2>
            <p class="mt-4 text-gray-600 text-xl font-body leading-relaxed">{{ descriptionOf(featured) }}</p>
            <span class="mt-6 inline-flex items-center gap-2 font-ui text-base font-semibold text-brand-navy">
              {{ $t('blog.readArticle') }}
              <i class="fa-solid fa-arrow-right text-sm group-hover:translate-x-1 transition-transform" aria-hidden="true"></i>
            </span>
          </div>
        </router-link>

        <!-- The rest: an editorial list, two columns from md up -->
        <ul class="grid md:grid-cols-2 md:gap-x-12">
          <li v-for="post in rest" :key="post.slug" class="border-b border-gray-200">
            <router-link :to="`/blog/${post.slug}`" class="group flex gap-5 py-7">
              <BlogCover :post="post" compact class="w-28 sm:w-40 flex-shrink-0 self-start rounded-xl" />
              <div class="min-w-0">
                <p class="font-ui text-xs font-semibold tracking-[0.2em] uppercase text-gray-500 mb-2">{{ topicOf(post) }}</p>
                <h2 class="font-heading text-xl sm:text-[1.4rem] text-gray-800 group-hover:text-brand-navy leading-snug transition-colors">
                  {{ titleOf(post) }}
                </h2>
                <p class="hidden sm:block mt-2 text-gray-600 text-lg font-body leading-snug">{{ descriptionOf(post) }}</p>
              </div>
            </router-link>
          </li>
        </ul>
      </div>
    </section>

    <!-- Closing band: dark, so the page doesn't end on flat white -->
    <section class="on-dark bg-brand-navy text-white py-16 md:py-20">
      <div class="max-w-6xl mx-auto px-6 md:flex md:items-end md:justify-between gap-10">
        <div class="max-w-2xl">
          <h2 class="font-heading text-3xl md:text-4xl leading-tight">{{ $t('blog.ctaTitle') }}</h2>
          <p class="mt-3 font-body text-xl text-white/80 leading-relaxed">{{ $t('blog.ctaText') }}</p>
        </div>
        <div class="mt-8 md:mt-0 flex flex-col sm:flex-row gap-3 flex-shrink-0">
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
    </section>
  </div>
</template>

<script setup>
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { posts, serviceFor } from '../data/blog/index.js'
import BlogCover from '../components/BlogCover.vue'

const { t, locale } = useI18n()

const featured = posts[0]
const rest = posts.slice(1)

function topicOf(p) {
  if (p.topic) return p.topic[locale.value] || p.topic.es
  const s = serviceFor(p)
  return s ? t(`services.${s.key}`) : ''
}
const titleOf = p => p.title[locale.value] || p.title.es
const descriptionOf = p => p.description[locale.value] || p.description.es

// Route meta carries the Spanish head; follow the visitor's language once mounted.
const head = computed(() => ({ title: `${t('blog.metaTitle')} | Campos Muños Law`, description: t('blog.metaDescription') }))
function setMeta(selector, value) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute('content', value)
}
watchEffect(() => {
  if (typeof document === 'undefined') return
  document.title = head.value.title
  setMeta('meta[name="description"]', head.value.description)
  setMeta('meta[property="og:title"]', head.value.title)
  setMeta('meta[property="og:description"]', head.value.description)
  setMeta('meta[name="twitter:title"]', head.value.title)
  setMeta('meta[name="twitter:description"]', head.value.description)
})
</script>
