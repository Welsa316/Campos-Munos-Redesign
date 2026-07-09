<template>
  <header class="fixed top-0 left-0 right-0 z-[100] transition-all duration-500"
    :class="scrolled ? 'py-2' : 'py-5'">
    <!-- Background: transparent on home at top, white otherwise -->
    <div class="absolute inset-0 transition-all duration-500"
      :class="navSolid ? 'bg-white shadow-lg opacity-100' : 'opacity-0'"></div>

    <nav class="relative max-w-screen-2xl mx-auto px-6 flex items-center justify-between gap-4">
      <!-- Logo - visible on scroll or non-home pages. h-12 on xl gives the
           500×100 logo enough room to coexist with the 6 English nav items
           + call CTA; expands to h-16 on 2xl when there's space to spare. -->
      <router-link to="/home" class="flex-shrink-0 relative group transition-all duration-500"
        :class="navSolid ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'">
        <img src="/logo.png" alt="Campos Muños Law"
          class="h-12 2xl:h-16 transition-all duration-500" />
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
                    ? 'text-gray-600 hover:text-brand-navy hover:bg-brand-navy/8'
                    : 'text-white/70 hover:text-white hover:bg-white/10'"
                  @click="showServices = false">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                    :class="navSolid ? 'bg-brand-navy/8' : 'bg-white/8'">
                    <i :class="[service.icon, 'text-lg transition-colors', navSolid
                        ? 'text-brand-navy/50 group-hover/item:text-brand-navy'
                        : 'text-white/40 group-hover/item:text-white']"></i>
                  </div>
                  <span class="font-ui text-base font-semibold">{{ $t(`services.${service.key}`) }}</span>
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
        <router-link to="/pago" class="nav-item" :class="navSolid ? 'nav-scrolled' : 'nav-top'">
          <span>{{ $t('nav.pago') }}</span>
        </router-link>
      </div>

      <!-- Right side: phone + social. Social icons only fit comfortably on
           true wide screens; from xl→2xl they'd push the call CTA off the
           edge, so they're hidden until 2xl. The footer keeps them visible. -->
      <div class="hidden xl:flex items-center gap-4 flex-shrink-0">
        <div class="hidden 2xl:flex items-center gap-3">
          <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
            :aria-label="social.label"
            class="w-11 h-11 rounded-full flex items-center justify-center transition-all text-lg hover:scale-110 hover:opacity-80"
            :style="{ color: navSolid ? social.color : (social.colorAlt || social.color) }">
            <i :class="social.icon" aria-hidden="true"></i>
          </a>
        </div>
        <a href="tel:+15049106508"
          class="flex items-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-full bg-brand-red hover:bg-brand-red-light text-white text-sm font-ui font-semibold tracking-wider transition-all btn-magnetic">
          <i class="fa-solid fa-phone text-xs" aria-hidden="true"></i>
          (504) 910-6508
        </a>
      </div>

      <!-- Mobile hamburger — hidden while the drawer is open so its X doesn't
           stack on top of the drawer's own close button (only one X visible). -->
      <button
        @click="mobileOpen = !mobileOpen"
        :aria-expanded="mobileOpen"
        aria-controls="mobile-nav"
        class="xl:hidden relative z-[110] w-12 h-12 flex items-center justify-center mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40 rounded-lg transition-opacity"
        :class="{ 'opacity-0 pointer-events-none': mobileOpen }"
        :aria-label="$t('a11y.menu')">
        <span class="sr-only">{{ $t('a11y.menu') }}</span>
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

    <!-- Mobile drawer + backdrop. Always rendered; visibility is driven by
         class toggles (not v-show + <transition>) so closing never waits on a
         transitionend that may not fire. The full-viewport wrapper clips the
         off-screen panel so translate-x-full can't cause horizontal scroll,
         and goes pointer-events-none when closed so the transparent backdrop
         can't swallow taps. -->
    <div class="xl:hidden fixed inset-0 z-[104] overflow-hidden"
      :class="mobileOpen ? '' : 'pointer-events-none'">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-brand-navy/40 backdrop-blur-sm transition-opacity duration-300"
        :class="mobileOpen ? 'opacity-100' : 'opacity-0'"
        @click="mobileOpen = false" aria-hidden="true"></div>

      <!-- Panel -->
      <div id="mobile-nav" ref="drawerPanel" role="dialog" aria-modal="true" :aria-label="$t('a11y.menu')"
        :inert="!mobileOpen"
        class="absolute top-0 right-0 bottom-0 z-[106] w-[85%] max-w-sm bg-white shadow-2xl flex flex-col overflow-y-auto transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        :class="mobileOpen ? 'translate-x-0' : 'translate-x-full'">
        <!-- Drawer header: social bar + close (logo removed per client) -->
        <div class="flex items-center justify-between px-6 h-20 border-b border-gray-100 flex-shrink-0">
          <div class="flex items-center gap-5">
            <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
              :aria-label="social.label" class="text-xl transition-opacity hover:opacity-70"
              :style="{ color: social.color }">
              <i :class="social.icon" aria-hidden="true"></i>
            </a>
          </div>
          <button ref="closeBtn" @click="mobileOpen = false" :aria-label="$t('a11y.closeMenu')"
            class="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-navy/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40">
            <i class="fa-solid fa-xmark text-2xl" aria-hidden="true"></i>
          </button>
        </div>

        <!-- Nav links -->
        <nav class="flex flex-col px-4 py-4 gap-0.5">
          <router-link to="/home" class="drawer-link" @click="mobileOpen = false">
            {{ $t('nav.home') }}
          </router-link>

          <!-- Services accordion -->
          <div>
            <div class="flex items-stretch">
              <router-link to="/servicios" class="drawer-link flex-1"
                :class="route.path.startsWith('/servicios') ? 'drawer-link-active' : ''"
                @click="mobileOpen = false">
                {{ $t('nav.servicios') }}
              </router-link>
              <button type="button" @click="servicesOpen = !servicesOpen"
                :aria-expanded="servicesOpen" aria-controls="drawer-services"
                :aria-label="$t('a11y.toggleServices')"
                class="w-12 flex items-center justify-center text-gray-400 hover:text-brand-navy rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40">
                <svg class="w-5 h-5 transition-transform duration-300" :class="servicesOpen ? 'rotate-180' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div id="drawer-services" :inert="!servicesOpen"
              class="overflow-hidden transition-[max-height] duration-300 ease-out"
              :class="servicesOpen ? 'max-h-[56rem]' : 'max-h-0'">
              <div class="pl-3 pr-1 py-1 flex flex-col gap-0.5 border-l border-brand-navy/10 ml-4">
                  <router-link v-for="service in serviceLinks" :key="service.slug"
                    :to="`/servicios/${service.slug}`"
                    class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:text-brand-navy hover:bg-brand-navy/5 transition-colors"
                    :class="route.path === `/servicios/${service.slug}` ? 'text-brand-navy bg-brand-navy/5 font-semibold' : ''"
                    @click="mobileOpen = false">
                    <i :class="[service.icon, 'text-brand-navy/50 w-5 text-center text-sm']" aria-hidden="true"></i>
                    <span class="font-ui text-[0.95rem]">{{ $t(`services.${service.key}`) }}</span>
                  </router-link>
                  <router-link to="/servicios"
                    class="px-3 py-2.5 rounded-lg text-brand-red font-ui text-sm font-semibold tracking-wide hover:bg-brand-red/5 transition-colors"
                    @click="mobileOpen = false">
                    {{ $t('nav.verTodosServicios') }} &rarr;
                  </router-link>
                </div>
              </div>
          </div>

          <router-link to="/servicios/green-card" class="drawer-link" @click="mobileOpen = false">
            {{ $t('nav.greenCards') }}
          </router-link>
          <router-link to="/consulta" class="drawer-link" @click="mobileOpen = false">
            {{ $t('nav.consulta') }}
          </router-link>
          <router-link to="/acerca-de" class="drawer-link" @click="mobileOpen = false">
            {{ $t('nav.acercaDe') }}
          </router-link>
          <router-link to="/pago" class="drawer-link" @click="mobileOpen = false">
            {{ $t('nav.pago') }}
          </router-link>
        </nav>

        <!-- Footer: language + phone (socials moved to the top of the drawer) -->
        <div class="mt-auto px-6 py-6 border-t border-gray-100 flex flex-col gap-5">
          <button @click="toggleLang"
            class="flex items-center justify-center gap-3 w-full px-5 py-3.5 rounded-full border border-brand-navy/25 text-brand-navy font-ui text-base font-bold tracking-wider hover:bg-brand-navy/5 transition-colors">
            <FlagIcon :country="currentLang === 'es' ? 'us' : 'mx'" class="w-6 h-4" />
            {{ currentLang === 'es' ? 'ENGLISH' : 'ESPAÑOL' }}
          </button>
          <a href="tel:+15049106508"
            class="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-brand-red hover:bg-brand-red-light text-white font-ui text-base font-semibold tracking-wider transition-colors">
            <i class="fa-solid fa-phone text-sm" aria-hidden="true"></i>
            (504) 910-6508
          </a>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useLocaleToggle } from '../composables/useLocaleToggle.js'
import { useMobileMenu } from '../composables/useMobileMenu.js'
import { HEADER_SCROLL_THRESHOLD } from '../data/timing.js'
import FlagIcon from './FlagIcon.vue'

const { currentLang, toggleLang } = useLocaleToggle()
const route = useRoute()
const scrolled = ref(false)
const showServices = ref(false)
const servicesOpen = ref(false)
const { isOpen: mobileOpen } = useMobileMenu()
const drawerPanel = ref(null)
const closeBtn = ref(null)
let lastFocused = null

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
  { key: 'ciudadania', slug: 'ciudadania', icon: 'fa-solid fa-flag-usa' },
  { key: 'defensaDeportacion', slug: 'defensa-contra-la-deportacion', icon: 'fa-solid fa-gavel' },
  { key: 'visasJovenes', slug: 'visas-especial-para-jovenes', icon: 'fa-solid fa-children' },
  { key: 'visasPrometido', slug: 'visas-de-prometido', icon: 'fa-solid fa-church' },
  { key: 'asilo', slug: 'asilo', icon: 'fa-solid fa-earth-americas' },
  { key: 'vawa', slug: 'vawa', icon: 'fa-solid fa-shield-halved' },
  { key: 'daca', slug: 'daca', icon: 'fa-solid fa-graduation-cap' },
  { key: 'tramiteConsular', slug: 'tramite-consular', icon: 'fa-solid fa-file-signature' },
  { key: 'ead', slug: 'ead', icon: 'fa-solid fa-helmet-safety' },
  { key: 'tps', slug: 'estatus-de-proteccion-temporal', icon: 'fa-solid fa-umbrella' },
  { key: 'visaU', slug: 'visa-u', icon: 'fa-solid fa-scale-balanced' },
  { key: 'visaT', slug: 'visa-t', icon: 'fa-solid fa-tractor' },
]

function onScroll() { scrolled.value = window.scrollY > HEADER_SCROLL_THRESHOLD }

// Drawer keyboard handling: Escape closes; Tab is trapped within the panel so
// focus can't wander into the page behind the modal dialog. Collapsed-accordion
// links live inside an [inert] subtree and are filtered out of the trap.
function onKeydown(e) {
  if (!mobileOpen.value) return
  if (e.key === 'Escape') { mobileOpen.value = false; return }
  if (e.key !== 'Tab' || !drawerPanel.value) return
  const focusables = Array.from(drawerPanel.value.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.closest('[inert]'))
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

// Lock body scroll while the drawer is open; move focus into the drawer on
// open and restore it to the trigger (hamburger) on close.
watch(mobileOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    lastFocused = document.activeElement
    nextTick(() => closeBtn.value?.focus())
  } else if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus()
    lastFocused = null
  }
})

// Close the drawer (and collapse the accordion) whenever the route changes,
// so the MobileContactWidget pills reappear after navigating.
watch(() => route.path, () => {
  mobileOpen.value = false
  servicesOpen.value = false
})

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
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
  background: color-mix(in srgb, var(--color-brand-navy) 6%, transparent);
}

.mega-enter-active { transition: opacity 0.15s ease; }
.mega-leave-active { transition: opacity 0.1s ease; }
.mega-enter-from, .mega-leave-to { opacity: 0; }
.mega-enter-to, .mega-leave-from { opacity: 1; }

/* Mobile drawer rows */
.drawer-link {
  display: block;
  padding: 0.75rem 0.75rem;
  border-radius: 0.5rem;
  font-family: var(--font-ui);
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(31, 41, 55, 1);
  transition: color 0.2s, background-color 0.2s;
}
.drawer-link:hover {
  color: var(--color-brand-navy);
  background: color-mix(in srgb, var(--color-brand-navy) 6%, transparent);
}
/* Active state: exact-active for leaf links, .drawer-link-active for the
   Services row (set manually since it has child routes). */
.drawer-link.router-link-exact-active,
.drawer-link-active {
  color: var(--color-brand-navy);
  background: color-mix(in srgb, var(--color-brand-navy) 8%, transparent);
}

/* Backdrop fade */
/* Drawer + backdrop + accordion now animate via Tailwind class toggles
   (transition-transform / transition-opacity / transition-[max-height]) on
   always-rendered elements, so no Vue <transition> classes are needed here. */
</style>
