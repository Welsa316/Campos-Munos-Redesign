<template>
  <div>
    <!-- ===================== CINEMATIC HERO ===================== -->
    <section class="relative h-screen min-h-[700px] overflow-hidden">
      <!-- Single hero image with Ken Burns -->
      <div class="absolute inset-0">
        <div class="absolute inset-0 bg-cover bg-center kenburns"
          :style="{ backgroundImage: `url('/AbogadosSlideshowPic.jpg')` }"></div>
        <!-- Layered overlays for depth -->
        <div class="absolute inset-0 bg-gradient-to-b from-brand-darker/60 via-black/40 to-brand-darker"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-brand-darker/80 via-transparent to-transparent"></div>
      </div>

      <!-- Hero content - left-aligned for dramatic asymmetry -->
      <div class="relative h-full max-w-7xl mx-auto px-6 flex flex-col justify-end pb-24 md:pb-32">
        <!-- Accent line -->
        <div class="w-16 h-[2px] bg-brand-navy mb-6 hero-reveal" style="transition-delay: 0.2s"></div>

        <p class="font-[var(--font-ui)] text-brand-navy-light text-xs tracking-[0.4em] uppercase mb-4 hero-reveal" style="transition-delay: 0.4s">
          Campos Munos Law, LLC
        </p>

        <h1 class="font-[var(--font-heading)] text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold text-white leading-[0.9] mb-4 hero-reveal" style="transition-delay: 0.6s">
          {{ $t('home.heroTitle') }}
        </h1>

        <div class="flex items-center gap-4 mb-6 hero-reveal" style="transition-delay: 0.8s">
          <div class="w-12 h-[1px] bg-white/30"></div>
          <p class="font-[var(--font-heading)] text-2xl md:text-3xl text-white/60 italic">
            {{ $t('home.heroSubtitle') }}
          </p>
        </div>

        <p class="font-[var(--font-body)] text-lg md:text-xl text-white/50 max-w-lg mb-10 hero-reveal" style="transition-delay: 1s">
          {{ $t('home.heroTagline') }}
        </p>

        <div class="flex flex-col sm:flex-row items-start gap-4 hero-reveal" style="transition-delay: 1.2s">
          <router-link to="/consulta"
            class="group flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-sm px-8 py-4 rounded-xl btn-magnetic">
            {{ $t('home.consultaBtn') }}
            <i class="fa-solid fa-arrow-right text-xs transition-transform group-hover:translate-x-1"></i>
          </router-link>
          <router-link to="/servicios"
            class="flex items-center gap-3 border border-white/20 text-white/80 hover:text-white hover:border-white/40 font-[var(--font-ui)] font-medium tracking-wider text-sm px-8 py-4 rounded-xl transition-all">
            {{ $t('home.serviciosBtn') }}
          </router-link>
        </div>
      </div>

      <!-- Bottom info strip -->
      <div class="absolute bottom-0 left-0 right-0 py-4 bg-gradient-to-t from-brand-darker to-transparent">
        <div class="max-w-7xl mx-auto px-6 flex flex-wrap items-center gap-8 text-white/40 text-xs font-[var(--font-ui)] tracking-wider">
          <span class="flex items-center gap-2"><i class="fa-solid fa-location-dot text-brand-navy/60"></i> New Orleans, LA</span>
          <a href="tel:+15049106508" class="flex items-center gap-2 hover:text-white transition-colors"><i class="fa-solid fa-phone text-brand-red/60"></i> <span class="text-sm font-semibold">(504) 910-6508</span></a>
          <span class="flex items-center gap-2"><i class="fa-solid fa-video text-brand-navy/60"></i> {{ $t('home.virtualAvailable') }}</span>
        </div>
      </div>
    </section>

    <!-- ===================== RECOGNITION BAR ===================== -->
    <section class="py-12 bg-brand-muted border-y border-white/5">
      <div class="max-w-5xl mx-auto px-6">
        <div class="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
          <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-white/30 uppercase">{{ $t('home.recognizedBy') }}</p>
          <div class="flex items-center gap-10">
            <div v-for="(badge, i) in badges" :key="i" class="flex items-center gap-2 text-white/20">
              <i class="fa-solid fa-award text-brand-navy/40 text-lg"></i>
              <span class="font-[var(--font-ui)] text-xs tracking-wider hidden sm:inline">{{ badge }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== BENTO SERVICES GRID ===================== -->
    <section class="py-24 bg-brand-darker relative noise">
      <div class="relative z-10 max-w-7xl mx-auto px-6">
        <div class="text-center mb-16 reveal">
          <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-navy uppercase mb-3">{{ $t('nav.servicios') }}</p>
          <h2 class="font-[var(--font-heading)] text-4xl md:text-5xl text-white">
            {{ $t('home.queEsperar').replace('?', '') }}
          </h2>
        </div>

        <!-- Bento grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 stagger">
          <!-- Large featured card -->
          <router-link to="/servicios/green-card"
            class="reveal col-span-2 row-span-2 group relative rounded-2xl overflow-hidden min-h-[320px] gradient-border">
            <div class="absolute inset-0 bg-gradient-to-br from-brand-red/20 to-brand-dark group-hover:from-brand-red/30 transition-all duration-500"></div>
            <div class="relative h-full p-8 flex flex-col justify-end">
              <i class="fa-solid fa-id-card text-5xl text-brand-navy/30 mb-auto group-hover:text-brand-navy/50 transition-colors duration-500"></i>
              <h3 class="font-[var(--font-heading)] text-3xl text-white mb-2 group-hover:text-brand-navy transition-colors">
                {{ $t('services.greenCard') }}
              </h3>
              <p class="text-white/40 text-sm font-[var(--font-ui)] leading-relaxed line-clamp-2">
                {{ $t('serviceDescriptions.greenCard') }}
              </p>
              <div class="mt-4 flex items-center gap-2 text-brand-navy text-xs font-[var(--font-ui)] font-semibold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                {{ $t('readMore') }} <i class="fa-solid fa-arrow-right text-[10px]"></i>
              </div>
            </div>
          </router-link>

          <!-- Regular bento cards -->
          <router-link v-for="service in bentoServices" :key="service.slug"
            :to="`/servicios/${service.slug}`"
            class="reveal group relative rounded-2xl overflow-hidden min-h-[160px] gradient-border">
            <div class="absolute inset-0 bg-brand-gray/50 group-hover:bg-brand-gray/80 transition-all duration-500"></div>
            <div class="relative h-full p-5 flex flex-col justify-between">
              <i :class="service.icon" class="text-2xl text-brand-navy/40 group-hover:text-brand-navy transition-colors duration-300"></i>
              <div>
                <h3 class="font-[var(--font-heading)] text-base text-white group-hover:text-brand-navy transition-colors leading-tight">
                  {{ $t(`services.${service.key}`) }}
                </h3>
              </div>
            </div>
          </router-link>
        </div>

        <div class="text-center mt-12 reveal">
          <router-link to="/servicios"
            class="inline-flex items-center gap-3 text-brand-navy hover:text-brand-navy-light font-[var(--font-ui)] font-medium tracking-wider text-sm transition-colors group">
            {{ $t('home.serviciosBtn') }}
            <i class="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ===================== REVIEWS - HORIZONTAL SCROLL ===================== -->
    <section class="py-24 bg-brand-dark relative overflow-hidden">
      <!-- Floating accent -->
      <div class="absolute top-12 right-12 w-40 h-40 rounded-full bg-brand-navy/[0.03] blur-3xl float-slow pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-6">
        <div class="flex items-end justify-between mb-12 reveal">
          <div>
            <div class="flex items-center gap-2 mb-3">
              <i v-for="n in 5" :key="n" class="fa-solid fa-star text-yellow-400 text-sm"></i>
            </div>
            <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white">{{ $t('home.reviewsTitle') }}</h2>
          </div>
        </div>

        <div class="horizontal-scroll gap-6 pb-4 -mx-6 px-6">
          <div v-for="(review, i) in reviews" :key="i"
            class="w-[340px] md:w-[400px] p-8 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-brand-navy/20 transition-all duration-300 flex flex-col">
            <div class="flex items-center gap-1 mb-5">
              <i v-for="n in 5" :key="n" class="fa-solid fa-star text-yellow-400 text-xs"></i>
            </div>
            <p class="text-white/60 text-[15px] leading-relaxed italic flex-1 mb-6">
              "{{ review.text }}"
            </p>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-brand-navy/10 flex items-center justify-center">
                <span class="text-brand-navy font-[var(--font-ui)] font-bold text-sm">{{ review.name.charAt(0) }}</span>
              </div>
              <span class="text-white/80 text-sm font-[var(--font-ui)] font-medium">{{ review.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== ABOUT SPLIT SECTION ===================== -->
    <section class="py-24 bg-brand-darker">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <!-- Left: Image with overlapping accent -->
          <div class="relative reveal-left">
            <div class="rounded-2xl overflow-hidden">
              <img src="/AbogadosSlideshowPic.jpg" alt="Campos Munos Law Team"
                class="w-full aspect-[4/3] object-cover" />
            </div>
            <!-- Overlapping accent block -->
            <div class="absolute -bottom-6 -right-6 w-32 h-32 border-2 border-brand-navy/20 rounded-2xl float-medium"></div>
            <!-- Experience badge -->
            <div class="absolute -top-4 -left-4 glass rounded-2xl p-4 text-center">
              <p class="font-[var(--font-heading)] text-3xl font-bold navy-shimmer">20+</p>
              <p class="font-[var(--font-ui)] text-[10px] tracking-wider text-white/50 uppercase">Years</p>
            </div>
          </div>

          <!-- Right: Text -->
          <div class="reveal-right">
            <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-navy uppercase mb-3">{{ $t('home.quienesSomos') }}</p>
            <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white mb-6 leading-tight">
              {{ $t('home.quienesSomos') }}
            </h2>
            <p class="text-white/60 text-lg leading-relaxed mb-8">
              {{ $t('home.quienesSomosText') }}
            </p>
            <router-link to="/acerca-de"
              class="inline-flex items-center gap-3 text-brand-navy hover:text-brand-navy-light font-[var(--font-ui)] font-medium tracking-wider text-sm transition-colors group">
              {{ $t('home.sobreNosotros') }}
              <i class="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================== WHY US - FULL WIDTH PARALLAX ===================== -->
    <section class="relative py-32 overflow-hidden">
      <div class="absolute inset-0 bg-cover bg-center bg-fixed" style="background-image: url('/AbogadosSlideshowPic.jpg')"></div>
      <div class="absolute inset-0 bg-brand-darker/85"></div>
      <div class="relative max-w-3xl mx-auto px-6 text-center reveal">
        <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-navy uppercase mb-4">{{ $t('home.porQueNosotros') }}</p>
        <h2 class="font-[var(--font-heading)] text-3xl md:text-5xl text-white mb-8 leading-tight">
          {{ $t('home.porQueNosotros') }}
        </h2>
        <p class="text-white/60 text-lg md:text-xl leading-relaxed mb-10">
          {{ $t('home.porQueNosotrosText') }}
        </p>
        <router-link to="/el-equipo"
          class="inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-sm px-8 py-4 rounded-xl btn-magnetic">
          {{ $t('home.perfilesBtn') }}
          <i class="fa-solid fa-arrow-right text-xs"></i>
        </router-link>
      </div>
    </section>

    <!-- ===================== LOCATION ===================== -->
    <section class="py-24 bg-brand-darker">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div class="reveal-left">
            <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-navy uppercase mb-3">{{ $t('home.dondeEstamos') }}</p>
            <h2 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white mb-6 leading-tight">{{ $t('home.dondeEstamos') }}</h2>
            <p class="text-white/60 text-lg leading-relaxed mb-8">
              {{ $t('home.dondeEstamosText') }}
            </p>
            <router-link to="/consulta"
              class="inline-flex items-center gap-3 border border-brand-navy text-brand-navy hover:bg-brand-navy hover:text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3.5 rounded-xl transition-all btn-magnetic">
              {{ $t('home.contactenosBtn') }}
            </router-link>
          </div>

          <div class="reveal-right rounded-2xl overflow-hidden h-[400px]">
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

    <!-- ===================== INSTAGRAM CTA ===================== -->
    <section class="py-20 bg-brand-dark relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-brand-navy/[0.03] to-transparent pointer-events-none"></div>
      <div class="relative max-w-4xl mx-auto px-6 text-center reveal">
        <i class="fa-brands fa-instagram text-5xl text-brand-navy/20 mb-6"></i>
        <h2 class="font-[var(--font-heading)] text-2xl md:text-3xl text-white mb-3">{{ $t('home.instagramTitle') }}</h2>
        <a href="https://www.instagram.com/juancamposlaw/" target="_blank" rel="noopener"
          class="navy-shimmer text-2xl font-[var(--font-heading)] font-bold">
          {{ $t('home.instagramHandle') }}
        </a>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, nextTick } from 'vue'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()

const badges = ['Bar Association', 'Small Business', 'SBM', 'AILA']

const bentoServices = [
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-link' },
]

const reviews = [
  { text: 'Excelente servicio. Me ayudaron con todo mi proceso de inmigración de manera profesional y eficiente.', name: 'Maria G.' },
  { text: 'Los mejores abogados de inmigración en Nueva Orleans. Siempre disponibles para responder preguntas.', name: 'Carlos R.' },
  { text: 'Muy agradecido por su ayuda. Lograron resolver mi caso cuando otros abogados no pudieron.', name: 'Ana L.' },
]

onMounted(() => {
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
</script>
