<template>
  <div>
    <!-- Hero split -->
    <section class="min-h-[80vh] bg-brand-surface">
      <div class="max-w-7xl mx-auto px-6 pt-32 pb-20">
        <router-link to="/acerca-de#equipo"
          class="inline-flex items-center gap-2 text-gray-500 hover:text-brand-navy text-base font-ui tracking-wider uppercase mb-12 transition-colors group">
          <i class="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
          {{ $t('team.title') }}
        </router-link>

        <div class="grid grid-cols-1 md:grid-cols-5 gap-12 items-start">
          <!-- Photo -->
          <div class="md:col-span-2 relative">
            <div class="aspect-[3/4] rounded-2xl overflow-hidden relative shadow-lg">
              <img v-if="memberData.image" :src="memberData.image" :alt="$t(`team.members.${memberData.key}.name`)"
                class="w-full h-full object-cover" />
              <div v-else class="w-full h-full bg-gray-100 flex items-center justify-center">
                <i class="fa-solid fa-user text-7xl text-gray-300"></i>
              </div>
            </div>
            <!-- Decorative accent -->
            <div class="absolute -bottom-4 -right-4 w-24 h-24 border-2 border-brand-navy/15 rounded-2xl -z-10"></div>
          </div>

          <!-- Bio content -->
          <div class="md:col-span-3">
            <p class="font-ui text-base tracking-[0.2em] text-brand-navy uppercase mb-3">
              {{ $t(`team.members.${memberData.key}.title`) }}
            </p>
            <h1 class="font-heading text-4xl md:text-6xl font-bold text-brand-navy leading-tight mb-6">
              {{ $t(`team.members.${memberData.key}.name`) }}
            </h1>
            <div class="w-16 h-[2px] bg-brand-navy mb-8"></div>
            <!-- Short bio intro -->
            <p class="text-gray-800 text-2xl leading-relaxed font-body font-semibold mb-6">
              {{ $t(`team.members.${memberData.key}.shortBio`) }}
            </p>
            <!-- Full bio with paragraph breaks -->
            <div class="text-gray-600 text-xl leading-relaxed font-body space-y-4">
              <p v-for="(paragraph, i) in $t(`team.members.${memberData.key}.bio`).split('\n\n')" :key="i">
                {{ paragraph }}
              </p>
            </div>

            <!-- CTA -->
            <div class="mt-10 flex flex-wrap gap-4">
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
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ member: String })
const { t, locale } = useI18n()

const members = {
  juan: {
    key: 'juan', image: '/JuanHeadshot.jpg',
  },
  angenette: {
    key: 'angenette', image: '/AngenetteHeadshot.jpg',
  },
  diana: {
    key: 'diana', image: '/DianaHeadshot.jpg',
  },
  rio: {
    key: 'rio', image: '/RioHeadshot.jpg',
  },
}

const memberData = computed(() => members[props.member] || members.juan)

// Attorney bios are what people search after a referral ("Juan Campos immigration
// lawyer"), but this route carries no route-level meta — without this the pages
// inherit the previous page's title/description, so Google saw four bios all
// presenting the homepage's metadata. Set real per-person head tags.
const seo = computed(() => {
  const key = memberData.value.key
  const name = t(`team.members.${key}.name`)
  const role = t(`team.members.${key}.title`)
  const description = locale.value === 'en'
    ? `${name}, ${role} at Campos Muños Law — immigration attorneys in New Orleans, Louisiana.`
    : `${name}, ${role} en Campos Muños Law — abogados de inmigración en Nueva Orleans, Louisiana.`
  return { title: `${name} — ${role} | Campos Muños Law`, description }
})

function setMeta(selector, attr, value) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.title = seo.value.title
  setMeta('meta[name="description"]', 'content', seo.value.description)
  setMeta('meta[property="og:title"]', 'content', seo.value.title)
  setMeta('meta[property="og:description"]', 'content', seo.value.description)
  setMeta('meta[name="twitter:title"]', 'content', seo.value.title)
  setMeta('meta[name="twitter:description"]', 'content', seo.value.description)
})
</script>
