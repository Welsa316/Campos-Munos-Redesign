<template>
  <div>
    <!-- ===================== CINEMATIC HERO ===================== -->
    <section class="relative h-screen min-h-[700px] overflow-hidden">
      <!-- Slideshow with Ken Burns -->
      <div class="absolute inset-0">
        <div v-for="(slide, i) in slides" :key="i"
          class="absolute inset-0 transition-opacity duration-[3500ms] ease-in-out"
          :class="currentSlide === i ? 'opacity-100' : 'opacity-0'">
          <div class="absolute inset-0 bg-cover bg-center kenburns"
            :style="{ backgroundImage: `url('${slide.img}')`, animationDelay: `${i * -4}s` }"></div>
        </div>
        <!-- Layered overlays for depth -->
        <div class="absolute inset-0 bg-gradient-to-b from-brand-darker/60 via-black/40 to-brand-darker"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-brand-darker/80 via-transparent to-transparent"></div>
      </div>

      <!-- Hero content - left-aligned for dramatic asymmetry -->
      <div class="relative h-full max-w-7xl mx-auto px-6 flex flex-col justify-center pt-20">
        <!-- Accent line -->
        <div class="w-20 h-[3px] bg-brand-navy mb-6 hero-reveal" style="transition-delay: 0.2s"></div>

        <p class="font-[var(--font-ui)] text-white/80 text-base md:text-lg tracking-[0.3em] uppercase mb-4 hero-reveal" style="transition-delay: 0.4s">
          Campos Munos Law, LLC
        </p>

        <h1 class="font-[var(--font-heading)] text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white leading-[0.95] mb-4 hero-reveal" style="transition-delay: 0.6s">
          {{ $t('home.heroTitle') }}
        </h1>

        <div class="flex items-center gap-4 mb-6 hero-reveal" style="transition-delay: 0.8s">
          <div class="w-12 h-[1px] bg-white/30"></div>
          <transition name="subtitle-fade" mode="out-in">
            <p :key="currentSlide" class="font-[var(--font-heading)] text-2xl md:text-3xl lg:text-4xl text-white/70 italic">
              {{ $t(slides[currentSlide].subtitleKey) }}
            </p>
          </transition>
        </div>

        <div class="hero-reveal" style="transition-delay: 1.2s">
          <router-link to="/consulta"
            class="group inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-body)] font-bold tracking-wider text-xl px-10 py-5 rounded-xl btn-magnetic">
            {{ $t('home.consultaBtn') }}
            <i class="fa-solid fa-arrow-right text-sm transition-transform group-hover:translate-x-1"></i>
          </router-link>
        </div>
      </div>

      <!-- Slide progress dots - vertical on right -->
      <div class="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-10">
        <button v-for="(_, i) in slides" :key="i" @click="goToSlide(i)"
          class="group relative w-3 h-3 flex items-center justify-center"
          :aria-label="`Slide ${i + 1}`">
          <span class="block rounded-full transition-all duration-500"
            :class="currentSlide === i ? 'w-3 h-3 bg-white' : 'w-1.5 h-1.5 bg-white/30 group-hover:bg-white/60'"></span>
        </button>
      </div>

      <!-- Bottom info strip -->
      <div class="absolute bottom-0 left-0 right-0 py-4 bg-gradient-to-t from-brand-darker to-transparent">
        <div class="max-w-7xl mx-auto px-6 flex flex-wrap items-center gap-8 text-white/60 text-base font-[var(--font-ui)] tracking-wider">
          <span class="flex items-center gap-2"><i class="fa-solid fa-location-dot text-brand-navy/80"></i> New Orleans, LA</span>
          <a href="tel:+15049106508" class="flex items-center gap-2 hover:text-white transition-colors"><i class="fa-solid fa-phone text-brand-red/80"></i> <span class="text-lg font-semibold">(504) 910-6508</span></a>
          <span class="flex items-center gap-2"><i class="fa-solid fa-video text-brand-navy/80"></i> {{ $t('home.virtualAvailable') }}</span>
        </div>
      </div>
    </section>

    <!-- ===================== RECOGNITION BAR ===================== -->
    <section class="py-14 bg-brand-surface border-y border-gray-200">
      <div class="max-w-6xl mx-auto px-6">
        <div class="flex flex-col items-center gap-10">
          <p class="font-[var(--font-ui)] text-base tracking-[0.2em] text-gray-400 uppercase">{{ $t('home.recognizedBy') }}</p>
          <div class="flex flex-wrap items-center justify-center gap-12 md:gap-20">
            <img v-for="(badge, i) in badges" :key="i"
              :src="badge.src" :alt="badge.alt"
              class="h-24 md:h-32 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== STATISTICS ===================== -->
    <section class="py-20 bg-white">
      <div class="max-w-5xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12 text-center reveal">
          <div class="p-8">
            <p class="font-[var(--font-heading)] text-7xl md:text-8xl font-bold text-brand-navy mb-3">3,000+</p>
            <p class="font-[var(--font-ui)] text-xl md:text-2xl text-gray-500 tracking-wide">{{ $t('home.casosResueltos') }}</p>
          </div>
          <div class="p-8">
            <p class="font-[var(--font-heading)] text-7xl md:text-8xl font-bold text-brand-navy mb-3">25+</p>
            <p class="font-[var(--font-ui)] text-xl md:text-2xl text-gray-500 tracking-wide">{{ $t('home.anosExperiencia') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== BENTO SERVICES GRID ===================== -->
    <section class="py-24 bg-brand-light relative">
      <div class="relative z-10 max-w-7xl mx-auto px-6">
        <div class="text-center mb-16 reveal">
          <h2 class="font-[var(--font-heading)] text-4xl md:text-6xl text-brand-navy">
            {{ $t('nav.servicios') }}
          </h2>
        </div>

        <!-- Bento grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-5 stagger">
          <!-- Large featured card -->
          <router-link to="/servicios/green-card"
            class="reveal col-span-2 row-span-2 group relative rounded-2xl overflow-hidden min-h-[380px] border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-500">
            <div class="absolute inset-0 bg-gradient-to-br from-brand-navy/5 to-white group-hover:from-brand-navy/10 transition-all duration-500"></div>
            <div class="relative h-full p-10 flex flex-col justify-end">
              <i class="fa-solid fa-id-card text-6xl text-brand-navy/20 mb-auto group-hover:text-brand-navy/40 transition-colors duration-500"></i>
              <h3 class="font-[var(--font-heading)] text-3xl md:text-4xl text-gray-900 mb-3 group-hover:text-brand-navy transition-colors">
                {{ $t('services.greenCard') }}
              </h3>
              <p class="text-gray-500 text-lg md:text-xl font-[var(--font-ui)] leading-relaxed line-clamp-3">
                {{ $t('serviceDescriptions.greenCard') }}
              </p>
              <div class="mt-5 flex items-center gap-2 text-brand-navy text-base font-[var(--font-ui)] font-semibold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                {{ $t('readMore') }} <i class="fa-solid fa-arrow-right text-sm"></i>
              </div>
            </div>
          </router-link>

          <!-- Regular bento cards -->
          <router-link v-for="service in bentoServices" :key="service.slug"
            :to="`/servicios/${service.slug}`"
            class="reveal group relative rounded-2xl overflow-hidden min-h-[180px] border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-500">
            <div class="relative h-full p-6 flex flex-col justify-between">
              <i :class="service.icon" class="text-3xl text-brand-navy/30 group-hover:text-brand-navy transition-colors duration-300"></i>
              <div>
                <h3 class="font-[var(--font-heading)] text-xl md:text-2xl text-gray-900 group-hover:text-brand-navy transition-colors leading-tight">
                  {{ $t(`services.${service.key}`) }}
                </h3>
              </div>
            </div>
          </router-link>
        </div>

        <div class="text-center mt-14 reveal">
          <router-link to="/servicios"
            class="inline-flex items-center gap-3 text-brand-navy hover:text-brand-navy-light font-[var(--font-ui)] font-semibold tracking-wider text-lg transition-colors group">
            {{ $t('home.serviciosBtn') }}
            <i class="fa-solid fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ===================== GOOGLE REVIEWS ===================== -->
    <section class="py-24 bg-white relative overflow-hidden">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-12 reveal">
          <div class="flex items-center justify-center gap-2 mb-3">
            <i v-for="n in 5" :key="n" class="fa-solid fa-star text-yellow-400 text-lg"></i>
          </div>
          <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-brand-navy">{{ $t('home.reviewsTitle') }}</h2>
        </div>
        <div class="reveal elfsight-reviews-wrapper rounded-2xl overflow-hidden">
          <div class="elfsight-app-02c0cb8e-d132-4834-ae18-93002f5a819a" data-elfsight-app-lazy></div>
        </div>
      </div>
    </section>

    <!-- ===================== ABOUT SECTION ===================== -->
    <section class="py-24 bg-brand-light">
      <div class="max-w-3xl mx-auto px-6 text-center reveal">
        <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-brand-navy mb-6 leading-tight">
          {{ $t('home.quienesSomos') }}
        </h2>
        <p class="text-gray-600 text-xl md:text-2xl leading-relaxed mb-8">
          {{ $t('home.quienesSomosText') }}
        </p>
        <router-link to="/acerca-de"
          class="inline-flex items-center gap-3 text-brand-navy hover:text-brand-navy-light font-[var(--font-ui)] font-semibold tracking-wider text-lg transition-colors group">
          {{ $t('home.sobreNosotros') }}
          <i class="fa-solid fa-arrow-right text-sm group-hover:translate-x-1 transition-transform"></i>
        </router-link>
      </div>
    </section>

    <!-- ===================== WHY US - FULL WIDTH PARALLAX ===================== -->
    <section class="relative py-32 overflow-hidden">
      <div class="absolute inset-0 bg-cover bg-center bg-fixed" style="background-image: url('/Slideshow3.jpg')"></div>
      <div class="absolute inset-0 bg-brand-darker/85"></div>
      <div class="relative max-w-3xl mx-auto px-6 text-center reveal">
        <h2 class="font-[var(--font-heading)] text-4xl md:text-6xl text-white mb-8 leading-tight">
          {{ $t('home.porQueNosotros') }}
        </h2>
        <p class="text-white/70 text-xl md:text-3xl leading-relaxed mb-12">
          {{ $t('home.porQueNosotrosText') }}
        </p>
        <router-link to="/el-equipo"
          class="inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
          {{ $t('home.perfilesBtn') }}
          <i class="fa-solid fa-arrow-right text-sm"></i>
        </router-link>
      </div>
    </section>

    <!-- ===================== LOCATION ===================== -->
    <section class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div class="reveal-left">
            <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-brand-navy mb-6 leading-tight">{{ $t('home.dondeEstamos') }}</h2>
            <p class="text-gray-600 text-xl md:text-2xl leading-relaxed mb-8">
              {{ $t('home.dondeEstamosText') }}
            </p>
            <router-link to="/consulta"
              class="inline-flex items-center gap-3 border-2 border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-white font-[var(--font-ui)] font-semibold tracking-wider text-base px-10 py-4 rounded-xl transition-all btn-magnetic">
              {{ $t('home.contactenosBtn') }}
            </router-link>
          </div>

          <div class="reveal-right rounded-2xl overflow-hidden h-[400px] shadow-lg">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3457.0!2d-90.0715!3d29.9511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8620a67b1f0b7d2f%3A0x4b7a8c8b3b8b8b8b!2s812%20Gravier%20St%2C%20New%20Orleans%2C%20LA%2070112!5e0!3m2!1ses!2sus!4v1700000000000"
              class="w-full h-full border-0 rounded-2xl"
              allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"
              title="Campos Munos Law Office Location">
            </iframe>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== INSTAGRAM FEED ===================== -->
    <section class="py-20 bg-brand-light relative overflow-hidden">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-10 reveal">
          <p class="font-[var(--font-ui)] text-base tracking-[0.2em] text-brand-navy uppercase mb-3">{{ $t('home.instagramTitle') }}</p>
          <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-gray-900 mb-2">
            <a href="https://www.instagram.com/juancamposlaw/" target="_blank" rel="noopener" class="navy-shimmer">
              {{ $t('home.instagramHandle') }}
            </a>
          </h2>
        </div>
        <div class="reveal">
          <div class="elfsight-app-0e227880-d4a2-4817-98ac-2a5ed69f20a7" data-elfsight-app-lazy></div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()
const { t } = useI18n()

const slides = [
  { img: '/Slideshow1.jpg', subtitleKey: 'home.slideSubtitle1' },
  { img: '/Slideshow2.jpg', subtitleKey: 'home.slideSubtitle2' },
  { img: '/Slideshow3.jpg', subtitleKey: 'home.slideSubtitle3' },
  { img: '/Slideshow4.jpg', subtitleKey: 'home.slideSubtitle4' },
  { img: '/Slideshow5.png', subtitleKey: 'home.slideSubtitle5' },
]
const currentSlide = ref(0)
let slideTimer = null

function goToSlide(i) { currentSlide.value = i }
function nextSlide() { currentSlide.value = (currentSlide.value + 1) % slides.length }

const badges = [
  { src: '/LSBA113502.png', alt: 'Louisiana State Bar Association' },
  { src: '/SBM.png', alt: 'State Bar of Michigan' },
  { src: '/Goldman-Sachs-Small-Business-Alumni.png', alt: 'Goldman Sachs 10,000 Small Businesses Alumni' },
  { src: '/American_Immigration_Lawyers_Association_Logo.png', alt: 'American Immigration Lawyers Association' },
]

const bentoServices = [
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-link' },
]

onMounted(() => {
  slideTimer = setInterval(nextSlide, 8000)
  nextTick(() => {
    document.querySelectorAll('.hero-reveal').forEach((el, i) => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(30px)'
      el.style.transition = `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${el.style.transitionDelay}, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${el.style.transitionDelay}`
      requestAnimationFrame(() => {
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      })
    })
  })
})
onUnmounted(() => clearInterval(slideTimer))
</script>

<style scoped>
.subtitle-fade-enter-active { transition: opacity 1.2s ease; }
.subtitle-fade-leave-active { transition: opacity 0.8s ease; }
.subtitle-fade-enter-from,
.subtitle-fade-leave-to { opacity: 0; }
</style>
