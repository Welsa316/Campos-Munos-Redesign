<template>
  <div>
    <!-- Hero Slideshow -->
    <section class="relative h-[90vh] min-h-[600px] overflow-hidden">
      <div class="absolute inset-0">
        <transition-group name="slide-fade">
          <div v-for="(slide, i) in slides" :key="i" v-show="currentSlide === i"
            class="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
            :style="{ backgroundImage: `url('${slide}')` }">
          </div>
        </transition-group>
        <div class="absolute inset-0 bg-black/55"></div>
      </div>

      <div class="relative h-full flex flex-col items-center justify-center text-center px-4">
        <p class="font-[var(--font-ui)] text-brand-gold text-sm tracking-[0.3em] uppercase mb-4">
          Campos Munos Law, LLC
        </p>
        <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-tight mb-2">
          {{ $t('home.heroTitle') }}
        </h1>
        <h2 class="font-[var(--font-heading)] text-3xl md:text-5xl lg:text-6xl text-white/90 mb-4">
          {{ $t('home.heroSubtitle') }}
        </h2>
        <div class="w-24 h-0.5 bg-brand-gold mb-4"></div>
        <p class="font-[var(--font-heading)] text-xl md:text-2xl text-white/80 italic mb-8">
          {{ $t('home.heroTagline') }}
        </p>

        <div class="flex flex-col sm:flex-row items-center gap-4 mb-8">
          <router-link to="/consulta"
            class="bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3.5 rounded-lg transition-colors">
            {{ $t('home.consultaBtn') }}
          </router-link>
        </div>

        <!-- Info badges -->
        <div class="flex flex-wrap items-center justify-center gap-6 text-white/70 text-sm font-[var(--font-ui)]">
          <span class="flex items-center gap-2">
            <i class="fa-solid fa-location-dot text-brand-gold"></i> New Orleans, LA
          </span>
          <span class="flex items-center gap-2">
            <i class="fa-solid fa-phone text-brand-gold"></i> (504) 910-6508
          </span>
          <span class="flex items-center gap-2">
            <i class="fa-solid fa-video text-brand-gold"></i> {{ $t('home.virtualAvailable') }}
          </span>
        </div>
      </div>

      <!-- Slide indicators -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        <button v-for="(_, i) in slides" :key="i"
          @click="currentSlide = i"
          class="w-2.5 h-2.5 rounded-full transition-all duration-300"
          :class="currentSlide === i ? 'bg-brand-gold w-8' : 'bg-white/40 hover:bg-white/60'"
          :aria-label="`Slide ${i + 1}`">
        </button>
      </div>
    </section>

    <!-- Recognized By -->
    <section class="py-16 bg-brand-dark">
      <div class="max-w-5xl mx-auto px-4 text-center">
        <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white mb-10">
          {{ $t('home.recognizedBy') }}
        </h2>
        <div class="flex flex-wrap items-center justify-center gap-12">
          <div v-for="badge in badges" :key="badge" class="w-24 h-24 bg-white/10 rounded-xl flex items-center justify-center">
            <i class="fa-solid fa-award text-3xl text-brand-gold"></i>
          </div>
        </div>
      </div>
    </section>

    <!-- Services Grid -->
    <section class="py-20 bg-brand-darker">
      <div class="max-w-6xl mx-auto px-4">
        <div class="w-20 h-0.5 bg-brand-gold mx-auto mb-12"></div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-6">
          <router-link v-for="service in featuredServices" :key="service.slug"
            :to="`/servicios/${service.slug}`"
            class="group p-6 bg-brand-gray/50 rounded-xl border border-white/5 hover:border-brand-gold/30 transition-all hover:-translate-y-1">
            <div class="w-14 h-14 rounded-lg bg-brand-red/20 flex items-center justify-center mb-4 group-hover:bg-brand-red/30 transition-colors">
              <i :class="service.icon" class="text-2xl text-brand-gold"></i>
            </div>
            <h3 class="font-[var(--font-heading)] text-lg text-white group-hover:text-brand-gold transition-colors">
              {{ $t(`services.${service.key}`) }}
            </h3>
          </router-link>
        </div>
      </div>
    </section>

    <!-- Reviews -->
    <section class="py-16 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h2 class="font-[var(--font-heading)] text-2xl md:text-3xl text-white mb-2">
          {{ $t('home.reviewsTitle') }}
        </h2>
        <div class="flex items-center justify-center gap-1 mb-8">
          <i v-for="n in 5" :key="n" class="fa-solid fa-star text-brand-gold text-xl"></i>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div v-for="(review, i) in reviews" :key="i"
            class="bg-brand-gray/50 rounded-xl p-6 border border-white/5">
            <div class="flex items-center gap-1 mb-3">
              <i v-for="n in 5" :key="n" class="fa-solid fa-star text-brand-gold text-sm"></i>
            </div>
            <p class="text-white/70 text-sm italic mb-4">"{{ review.text }}"</p>
            <p class="text-brand-gold text-sm font-medium">— {{ review.name }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Info Sections -->
    <section v-for="section in infoSections" :key="section.titleKey"
      class="py-20" :class="section.bg">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white mb-6">
          {{ $t(`home.${section.titleKey}`) }}
        </h2>
        <div class="w-16 h-0.5 bg-brand-gold mx-auto mb-6"></div>
        <p class="text-white/75 text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
          {{ $t(`home.${section.textKey}`) }}
        </p>
        <router-link :to="section.link"
          class="inline-block border-2 border-brand-gold text-brand-gold hover:bg-brand-gold hover:text-brand-dark font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3 rounded-lg transition-all">
          {{ $t(`home.${section.btnKey}`) }}
        </router-link>
      </div>
    </section>

    <!-- Instagram -->
    <section class="py-16 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h2 class="font-[var(--font-heading)] text-2xl md:text-3xl text-white mb-2">
          {{ $t('home.instagramTitle') }}
        </h2>
        <a href="https://www.instagram.com/juancamposlaw/" target="_blank" rel="noopener"
          class="text-brand-gold hover:text-brand-gold-light text-xl transition-colors">
          {{ $t('home.instagramHandle') }}
        </a>
        <div class="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="n in 4" :key="n" class="aspect-square bg-brand-gray/50 rounded-lg overflow-hidden">
            <div class="w-full h-full flex items-center justify-center text-white/20">
              <i class="fa-brands fa-instagram text-4xl"></i>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const slides = [
  '/Slideshow1.jpg',
  '/Slideshow2.jpg',
  '/Slideshow3.jpg',
  '/Slideshow4.jpg',
  '/Slideshow5.jpg',
]
const currentSlide = ref(0)
let slideTimer = null

const badges = ['Bar Association', 'Small Business', 'SBM', 'American Immigration']

const featuredServices = [
  { key: 'greenCard', slug: 'green-card', icon: 'fa-solid fa-id-card' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-link' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-passport' },
]

const reviews = [
  { text: 'Excelente servicio. Me ayudaron con todo mi proceso de inmigración de manera profesional y eficiente.', name: 'Maria G.' },
  { text: 'Los mejores abogados de inmigración en Nueva Orleans. Siempre disponibles para responder preguntas.', name: 'Carlos R.' },
  { text: 'Muy agradecido por su ayuda. Lograron resolver mi caso cuando otros abogados no pudieron.', name: 'Ana L.' },
]

const infoSections = [
  { titleKey: 'quienesSomos', textKey: 'quienesSomosText', btnKey: 'sobreNosotros', link: '/acerca-de', bg: 'bg-brand-darker' },
  { titleKey: 'queEsperar', textKey: 'queEsperarText', btnKey: 'serviciosBtn', link: '/servicios', bg: 'bg-brand-dark' },
  { titleKey: 'porQueNosotros', textKey: 'porQueNosotrosText', btnKey: 'perfilesBtn', link: '/el-equipo', bg: 'bg-brand-darker' },
  { titleKey: 'dondeEstamos', textKey: 'dondeEstamosText', btnKey: 'contactenosBtn', link: '/consulta', bg: 'bg-brand-dark' },
]

function nextSlide() {
  currentSlide.value = (currentSlide.value + 1) % slides.length
}

onMounted(() => {
  slideTimer = setInterval(nextSlide, 5000)
})

onUnmounted(() => {
  clearInterval(slideTimer)
})
</script>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 1s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
}
</style>
