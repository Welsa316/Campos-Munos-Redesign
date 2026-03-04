<template>
  <header class="fixed top-0 left-0 right-0 z-[100] transition-all duration-500"
    :class="scrolled ? 'py-2' : 'py-5'">
    <!-- Background: transparent on home at top, white otherwise -->
    <div class="absolute inset-0 transition-all duration-500"
      :class="navSolid ? 'bg-white shadow-lg opacity-100' : 'opacity-0'"></div>

    <nav class="relative max-w-7xl mx-auto px-6 flex items-center justify-between">
      <!-- Logo - visible on scroll or non-home pages -->
      <router-link to="/home" class="flex-shrink-0 relative group transition-all duration-500 mr-8"
        :class="navSolid ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'">
        <img src="/logo.png" alt="Campos Munos Law"
          class="h-16 transition-all duration-500" />
      </router-link>

      <!-- Desktop nav - centered -->
      <div class="hidden xl:flex items-center gap-1">
        <!-- Services mega-dropdown -->
        <div class="relative" @mouseenter="showServices = true" @mouseleave="showServices = false">
          <router-link to="/servicios" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
            <span>{{ $t('nav.servicios') }}</span>
            <svg class="w-3.5 h-3.5 transition-transform duration-300" :class="showServices ? 'rotate-180' : ''"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </router-link>
          <transition name="mega">
            <div v-show="showServices"
              class="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[700px] rounded-2xl p-8 shadow-2xl"
              :class="navSolid ? 'bg-white shadow-gray-200/50 border border-gray-100' : 'glass-dark shadow-black/30'">
              <!-- Accent line at top -->
              <div class="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-brand-navy rounded-full"></div>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <router-link v-for="service in serviceLinks" :key="service.slug"
                  :to="`/servicios/${service.slug}`"
                  class="flex items-center gap-4 px-5 py-4 rounded-xl transition-all group/item"
                  :class="navSolid
                    ? 'text-gray-600 hover:text-brand-navy hover:bg-brand-navy/5'
                    : 'text-white/70 hover:text-brand-navy hover:bg-white/5'"
                  @click="showServices = false">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                    :class="navSolid ? 'bg-brand-navy/8' : 'bg-white/8'">
                    <i :class="[service.icon, 'text-lg transition-colors', navSolid
                        ? 'text-brand-navy/50 group-hover/item:text-brand-navy'
                        : 'text-brand-navy/60 group-hover/item:text-brand-navy']"></i>
                  </div>
                  <span class="font-[var(--font-ui)] text-base font-semibold">{{ $t(`services.${service.key}`) }}</span>
                </router-link>
              </div>
            </div>
          </transition>
        </div>

        <router-link to="/servicios/green-card" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
          <span>{{ $t('nav.greenCards') }}</span>
        </router-link>
        <router-link to="/consulta" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
          <span>{{ $t('nav.consulta') }}</span>
        </router-link>
        <router-link to="/acerca-de" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
          <span>{{ $t('nav.acercaDe') }}</span>
        </router-link>
        <router-link to="/el-equipo" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
          <span>{{ $t('nav.elEquipo') }}</span>
        </router-link>
        <router-link to="/pago" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
          <span>{{ $t('nav.pago') }}</span>
        </router-link>
      </div>

      <!-- Right side: phone + social -->
      <div class="hidden xl:flex items-center gap-5">
        <div class="flex items-center gap-3">
          <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
            :aria-label="social.label"
            class="w-12 h-12 rounded-full flex items-center justify-center transition-all text-xl hover:scale-110 hover:opacity-80"
            :style="{ color: navSolid ? social.color : (social.colorAlt || social.color) }">
            <i :class="social.icon"></i>
          </a>
        </div>
        <a href="tel:+15049106508"
          class="flex items-center gap-3 whitespace-nowrap px-8 py-3 rounded-full bg-brand-red hover:bg-brand-red-light text-white text-base font-[var(--font-ui)] font-semibold tracking-wider transition-all btn-magnetic">
          <i class="fa-solid fa-phone text-sm"></i>
          (504) 910-6508
        </a>
      </div>

      <!-- Mobile hamburger -->
      <button @click="mobileOpen = !mobileOpen" class="xl:hidden relative z-[110] w-12 h-12 flex items-center justify-center mr-1" aria-label="Menu">
        <span class="sr-only">Menu</span>
        <div class="flex flex-col items-end gap-1.5 transition-all">
          <span class="block h-[2px] rounded-full transition-all duration-300"
            :class="[mobileOpen ? 'bg-gray-800 w-7 rotate-45 translate-y-[5px]' : (navSolid ? 'bg-gray-800' : 'bg-white') + ' w-7']"></span>
          <span class="block h-[2px] rounded-full transition-all duration-300"
            :class="[mobileOpen ? 'opacity-0 w-5 bg-gray-800' : (navSolid ? 'bg-gray-800' : 'bg-white') + ' opacity-100 w-5']"></span>
          <span class="block h-[2px] rounded-full transition-all duration-300"
            :class="[mobileOpen ? 'bg-gray-800 w-7 -rotate-45 -translate-y-[5px]' : (navSolid ? 'bg-gray-800' : 'bg-white') + ' w-6']"></span>
        </div>
      </button>
    </nav>

    <!-- Mobile full-screen overlay -->
    <transition name="mobile-nav">
      <div v-show="mobileOpen" class="xl:hidden fixed inset-0 top-0 bg-white/98 backdrop-blur-xl z-[105] overflow-y-auto">
        <div class="flex flex-col justify-center items-center min-h-full gap-6 px-8 py-24">
          <router-link v-for="link in mobileLinks" :key="link.to" :to="link.to"
            class="text-4xl font-[var(--font-heading)] text-gray-800 hover:text-brand-navy transition-colors"
            @click="mobileOpen = false">
            {{ link.label }}
          </router-link>
          <div class="w-16 h-px bg-brand-navy/30 my-2"></div>
          <a href="tel:+15049106508" class="text-brand-red font-[var(--font-ui)] text-3xl tracking-wider font-bold">
            (504) 910-6508
          </a>
          <div class="flex items-center gap-5 mt-4">
            <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
              :aria-label="social.label" class="text-2xl transition-colors hover:opacity-70"
              :style="{ color: social.color }">
              <i :class="social.icon"></i>
            </a>
          </div>
        </div>
      </div>
    </transition>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const scrolled = ref(false)
const showServices = ref(false)
const mobileOpen = ref(false)

const isHome = computed(() => route.path === '/home' || route.path === '/')
const navSolid = computed(() => scrolled.value || !isHome.value)

const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp', color: '#25D366' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram', color: '#E4405F' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook', color: '#1877F2' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube', color: '#FF0000' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok', color: '#000000', colorAlt: '#ffffff' },
]

const serviceLinks = [
  { key: 'greenCard', slug: 'green-card', icon: 'fa-solid fa-id-card' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares', icon: 'fa-solid fa-people-roof' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate' },
  { key: 'defensaDeportacion', slug: 'defensa-contra-la-deportacion', icon: 'fa-solid fa-gavel' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-passport' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', icon: 'fa-solid fa-ring' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap' },
  { key: 'tramiteConsular', slug: 'tramite-consular', icon: 'fa-solid fa-file-signature' },
  { key: 'ead', slug: 'ead', icon: 'fa-solid fa-briefcase' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', icon: 'fa-solid fa-umbrella' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-link' },
]

const mobileLinks = computed(() => [
  { to: '/home', label: 'Home' },
  { to: '/servicios', label: t('nav.servicios') },
  { to: '/servicios/green-card', label: t('nav.greenCards') },
  { to: '/consulta', label: t('nav.consulta') },
  { to: '/acerca-de', label: t('nav.acercaDe') },
  { to: '/el-equipo', label: t('nav.elEquipo') },
  { to: '/pago', label: t('nav.pago') },
])

function onScroll() { scrolled.value = window.scrollY > 50 }
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0.625rem 1rem;
  border-radius: 9999px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

/* At top of page - white text on transparent/dark bg */
.nav-top {
  color: rgba(255,255,255,0.8);
}
.nav-top:hover,
.nav-top.router-link-active {
  color: white;
  background: rgba(255,255,255,0.1);
}

/* Scrolled - dark text on white bg */
.nav-scrolled {
  color: rgba(55,65,81,1);
}
.nav-scrolled:hover,
.nav-scrolled.router-link-active {
  color: var(--color-brand-navy);
  background: rgba(0,63,141,0.06);
}

.mega-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.mega-leave-active { transition: all 0.15s ease; }
.mega-enter-from, .mega-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.97); }
.mega-enter-to { transform: translateX(-50%) translateY(0) scale(1); }

.mobile-nav-enter-active { transition: opacity 0.4s ease; }
.mobile-nav-leave-active { transition: opacity 0.2s ease; }
.mobile-nav-enter-from, .mobile-nav-leave-to { opacity: 0; }
</style>
