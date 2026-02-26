<template>
  <header class="fixed top-0 left-0 right-0 z-[100] transition-all duration-500"
    :class="scrolled ? 'py-2' : 'py-4'">
    <!-- Glass background that fades in on scroll -->
    <div class="absolute inset-0 transition-all duration-500"
      :class="scrolled ? 'glass opacity-100 shadow-2xl shadow-black/20' : 'opacity-0'"></div>

    <nav class="relative max-w-7xl mx-auto px-6 flex items-center justify-between">
      <!-- Logo -->
      <router-link to="/home" class="flex-shrink-0 relative group">
        <img src="/logo.png" alt="Campos Munos Law"
          class="h-10 transition-all duration-500" :class="scrolled ? 'h-9' : 'h-10'" />
        <div class="absolute -inset-2 bg-brand-gold/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
      </router-link>

      <!-- Desktop nav - centered -->
      <div class="hidden lg:flex items-center gap-0.5">
        <!-- Services mega-dropdown -->
        <div class="relative" @mouseenter="showServices = true" @mouseleave="showServices = false">
          <router-link to="/servicios" class="nav-item">
            <span>{{ $t('nav.servicios') }}</span>
            <svg class="w-3 h-3 transition-transform duration-300" :class="showServices ? 'rotate-180' : ''"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </router-link>
          <transition name="mega">
            <div v-show="showServices"
              class="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[480px] glass rounded-2xl p-6 shadow-2xl shadow-black/30">
              <!-- Gold accent line at top -->
              <div class="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-brand-gold rounded-full"></div>
              <div class="grid grid-cols-2 gap-1 mt-1">
                <router-link v-for="service in serviceLinks" :key="service.slug"
                  :to="`/servicios/${service.slug}`"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:text-brand-gold hover:bg-white/5 transition-all group/item"
                  @click="showServices = false">
                  <i :class="service.icon" class="text-sm text-brand-gold/50 group-hover/item:text-brand-gold transition-colors w-4 text-center"></i>
                  <span class="font-[var(--font-ui)] text-[13px] font-medium">{{ $t(`services.${service.key}`) }}</span>
                </router-link>
              </div>
            </div>
          </transition>
        </div>

        <router-link to="/servicios/green-card" class="nav-item"><span>{{ $t('nav.greenCards') }}</span></router-link>
        <router-link to="/consulta" class="nav-item"><span>{{ $t('nav.consulta') }}</span></router-link>
        <router-link to="/acerca-de" class="nav-item"><span>{{ $t('nav.acercaDe') }}</span></router-link>
        <router-link to="/el-equipo" class="nav-item"><span>{{ $t('nav.elEquipo') }}</span></router-link>
      </div>

      <!-- Right side: phone + social -->
      <div class="hidden lg:flex items-center gap-4">
        <div class="flex items-center gap-2">
          <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
            :aria-label="social.label"
            class="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-brand-gold hover:bg-white/5 transition-all text-xs">
            <i :class="social.icon"></i>
          </a>
        </div>
        <a href="tel:+15049106508"
          class="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-red hover:bg-brand-red-light text-white text-xs font-[var(--font-ui)] font-semibold tracking-wider transition-all btn-magnetic">
          <i class="fa-solid fa-phone text-[10px]"></i>
          (504) 910-6508
        </a>
      </div>

      <!-- Mobile hamburger -->
      <button @click="mobileOpen = !mobileOpen" class="lg:hidden relative w-10 h-10 flex items-center justify-center" aria-label="Menu">
        <span class="sr-only">Menu</span>
        <div class="flex flex-col items-end gap-1.5 transition-all">
          <span class="block h-[2px] bg-white rounded-full transition-all duration-300"
            :class="mobileOpen ? 'w-6 rotate-45 translate-y-[5px]' : 'w-6'"></span>
          <span class="block h-[2px] bg-white rounded-full transition-all duration-300"
            :class="mobileOpen ? 'opacity-0 w-4' : 'opacity-100 w-4'"></span>
          <span class="block h-[2px] bg-white rounded-full transition-all duration-300"
            :class="mobileOpen ? 'w-6 -rotate-45 -translate-y-[5px]' : 'w-5'"></span>
        </div>
      </button>
    </nav>

    <!-- Mobile full-screen overlay -->
    <transition name="mobile-nav">
      <div v-show="mobileOpen" class="lg:hidden fixed inset-0 top-0 bg-brand-darker/98 backdrop-blur-xl z-[-1]">
        <div class="flex flex-col justify-center items-center h-full gap-6 px-8">
          <router-link v-for="link in mobileLinks" :key="link.to" :to="link.to"
            class="text-3xl font-[var(--font-heading)] text-white/80 hover:text-brand-gold transition-colors"
            @click="mobileOpen = false">
            {{ link.label }}
          </router-link>
          <div class="w-16 h-px bg-brand-gold/30 my-2"></div>
          <a href="tel:+15049106508" class="text-brand-gold font-[var(--font-ui)] text-lg tracking-wider">
            (504) 910-6508
          </a>
          <div class="flex items-center gap-4 mt-4">
            <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
              :aria-label="social.label" class="text-white/40 hover:text-brand-gold text-xl transition-colors">
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

const { t } = useI18n()
const scrolled = ref(false)
const showServices = ref(false)
const mobileOpen = ref(false)

const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok' },
]

const serviceLinks = [
  { key: 'greenCard', slug: 'green-card', icon: 'fa-solid fa-id-card' },
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-certificate' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-hand-holding-heart' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-link' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', icon: 'fa-solid fa-umbrella' },
  { key: 'tramiteConsular', slug: 'tramite-consular', icon: 'fa-solid fa-file-signature' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', icon: 'fa-solid fa-ring' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-passport' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares', icon: 'fa-solid fa-people-roof' },
  { key: 'ead', slug: 'ead', icon: 'fa-solid fa-briefcase' },
  { key: 'defensaDeportacion', slug: 'defensa-contra-la-deportacion', icon: 'fa-solid fa-gavel' },
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
  gap: 4px;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.75);
  padding: 0.5rem 0.875rem;
  border-radius: 9999px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
.nav-item:hover,
.nav-item.router-link-active {
  color: var(--color-brand-gold);
  background: rgba(201, 168, 76, 0.08);
}

.mega-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.mega-leave-active { transition: all 0.15s ease; }
.mega-enter-from, .mega-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.97); }
.mega-enter-to { transform: translateX(-50%) translateY(0) scale(1); }

.mobile-nav-enter-active { transition: opacity 0.4s ease; }
.mobile-nav-leave-active { transition: opacity 0.2s ease; }
.mobile-nav-enter-from, .mobile-nav-leave-to { opacity: 0; }
</style>
