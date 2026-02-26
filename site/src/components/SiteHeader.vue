<template>
  <header class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
    :class="scrolled ? 'bg-brand-darker/95 backdrop-blur-md shadow-lg' : 'bg-transparent'">
    <!-- Top bar with social + phone -->
    <div class="bg-brand-red text-white text-sm">
      <div class="max-w-7xl mx-auto px-4 flex items-center justify-between py-1.5">
        <div class="flex items-center gap-3">
          <a href="https://wa.me/15049106508" target="_blank" rel="noopener" aria-label="WhatsApp" class="hover:text-brand-gold transition-colors">
            <i class="fa-brands fa-whatsapp text-lg"></i>
          </a>
          <a href="https://www.instagram.com/juancamposlaw/" target="_blank" rel="noopener" aria-label="Instagram" class="hover:text-brand-gold transition-colors">
            <i class="fa-brands fa-instagram text-lg"></i>
          </a>
          <a href="https://www.facebook.com/Camposmunoslaw" target="_blank" rel="noopener" aria-label="Facebook" class="hover:text-brand-gold transition-colors">
            <i class="fa-brands fa-facebook-f text-lg"></i>
          </a>
          <a href="https://www.youtube.com/@camposmunoslaw6542" target="_blank" rel="noopener" aria-label="YouTube" class="hover:text-brand-gold transition-colors">
            <i class="fa-brands fa-youtube text-lg"></i>
          </a>
          <a href="https://www.tiktok.com/@elabogadohispano" target="_blank" rel="noopener" aria-label="TikTok" class="hover:text-brand-gold transition-colors">
            <i class="fa-brands fa-tiktok text-lg"></i>
          </a>
        </div>
        <a href="tel:+15049106508" class="flex items-center gap-2 font-[var(--font-ui)] font-medium hover:text-brand-gold transition-colors">
          <i class="fa-solid fa-phone text-sm"></i>
          <span class="hidden sm:inline">+1 (504) 910-6508</span>
        </a>
      </div>
    </div>

    <!-- Main nav -->
    <nav class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between" aria-label="Sitio">
      <router-link to="/home" class="flex-shrink-0">
        <img src="/logo.png" alt="Campos Munos Law" class="h-10 md:h-12" />
      </router-link>

      <!-- Desktop nav -->
      <div class="hidden lg:flex items-center gap-1">
        <!-- Services dropdown -->
        <div class="relative group" @mouseenter="showServices = true" @mouseleave="showServices = false">
          <router-link to="/servicios"
            class="nav-link flex items-center gap-1">
            {{ $t('nav.servicios') }}
            <i class="fa-solid fa-chevron-down text-[10px] transition-transform" :class="showServices ? 'rotate-180' : ''"></i>
          </router-link>
          <transition name="dropdown">
            <div v-show="showServices"
              class="absolute top-full left-0 mt-1 w-72 bg-brand-dark/95 backdrop-blur-md rounded-lg shadow-xl border border-white/10 py-2 z-50">
              <router-link v-for="service in serviceLinks" :key="service.slug"
                :to="`/servicios/${service.slug}`"
                class="block px-4 py-2 text-sm text-white/80 hover:text-brand-gold hover:bg-white/5 transition-colors font-[var(--font-ui)]"
                @click="showServices = false">
                {{ $t(`services.${service.key}`) }}
              </router-link>
            </div>
          </transition>
        </div>

        <router-link to="/servicios/green-card" class="nav-link">{{ $t('nav.greenCards') }}</router-link>
        <router-link to="/consulta" class="nav-link">{{ $t('nav.consulta') }}</router-link>
        <router-link to="/pago" class="nav-link">{{ $t('nav.pago') }}</router-link>
        <router-link to="/acerca-de" class="nav-link">{{ $t('nav.acercaDe') }}</router-link>
        <router-link to="/el-equipo" class="nav-link">{{ $t('nav.elEquipo') }}</router-link>
      </div>

      <!-- Mobile menu button -->
      <button @click="mobileOpen = !mobileOpen" class="lg:hidden text-white p-2" aria-label="Menu">
        <i class="fa-solid text-xl" :class="mobileOpen ? 'fa-xmark' : 'fa-bars'"></i>
      </button>
    </nav>

    <!-- Mobile nav -->
    <transition name="slide">
      <div v-show="mobileOpen" class="lg:hidden bg-brand-dark/95 backdrop-blur-md border-t border-white/10">
        <div class="px-4 py-4 space-y-1">
          <button @click="mobileServicesOpen = !mobileServicesOpen"
            class="w-full flex items-center justify-between text-white/90 py-2 px-3 rounded hover:bg-white/5 font-[var(--font-ui)] text-sm font-medium tracking-wider">
            {{ $t('nav.servicios') }}
            <i class="fa-solid fa-chevron-down text-xs transition-transform" :class="mobileServicesOpen ? 'rotate-180' : ''"></i>
          </button>
          <div v-show="mobileServicesOpen" class="pl-4 space-y-1">
            <router-link v-for="service in serviceLinks" :key="service.slug"
              :to="`/servicios/${service.slug}`"
              class="block py-1.5 px-3 text-sm text-white/70 hover:text-brand-gold transition-colors font-[var(--font-ui)]"
              @click="mobileOpen = false">
              {{ $t(`services.${service.key}`) }}
            </router-link>
          </div>

          <router-link to="/servicios/green-card" class="mobile-link" @click="mobileOpen = false">{{ $t('nav.greenCards') }}</router-link>
          <router-link to="/consulta" class="mobile-link" @click="mobileOpen = false">{{ $t('nav.consulta') }}</router-link>
          <router-link to="/pago" class="mobile-link" @click="mobileOpen = false">{{ $t('nav.pago') }}</router-link>
          <router-link to="/acerca-de" class="mobile-link" @click="mobileOpen = false">{{ $t('nav.acercaDe') }}</router-link>
          <router-link to="/el-equipo" class="mobile-link" @click="mobileOpen = false">{{ $t('nav.elEquipo') }}</router-link>
        </div>
      </div>
    </transition>
  </header>
  <!-- Spacer for fixed header -->
  <div class="h-[88px]"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const scrolled = ref(false)
const showServices = ref(false)
const mobileOpen = ref(false)
const mobileServicesOpen = ref(false)

const serviceLinks = [
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes' },
  { key: 'tramiteConsular', slug: 'tramite-consular' },
  { key: 'asilo', slug: 'asilo' },
  { key: 'daca', slug: 'daca' },
  { key: 'visasPrometido', slug: 'visas-de-prometido' },
  { key: 'ead', slug: 'ead' },
  { key: 'ciudadania', slug: 'ciudadania' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal' },
  { key: 'vawa', slug: 'vawa' },
  { key: 'defensaDeportacion', slug: 'defensa-contra-la-deportacion' },
  { key: 'peticionesFamiliares', slug: 'peticiones-familiares' },
  { key: 'visaU', slug: 'visa-u' },
  { key: 'visaT', slug: 'visa-t' },
  { key: 'greenCard', slug: 'green-card' },
]

function onScroll() {
  scrolled.value = window.scrollY > 20
}

onMounted(() => window.addEventListener('scroll', onScroll))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.nav-link {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.9);
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  transition: color 0.2s, background-color 0.2s;
}
.nav-link:hover,
.nav-link.router-link-active {
  color: var(--color-brand-gold);
  background-color: rgba(255, 255, 255, 0.05);
}

.mobile-link {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.9);
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  transition: color 0.2s;
}
.mobile-link:hover {
  color: var(--color-brand-gold);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.3s ease, opacity 0.3s ease;
  max-height: 100vh;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
