<template>
  <footer class="relative bg-brand-navy overflow-hidden">
    <!-- Decorative top border gradient -->
    <div class="h-1 bg-gradient-to-r from-brand-navy-dark via-brand-navy-light to-brand-navy-dark"></div>

    <!-- Main footer content -->
    <div class="max-w-7xl mx-auto px-6 pt-20 pb-12">
      <div class="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
        <!-- Brand column -->
        <div class="md:col-span-4">
          <router-link to="/home" class="inline-block mb-6">
            <img src="/logo.png" alt="Campos Munos Law" class="h-20 brightness-0 invert" />
          </router-link>
          <p class="text-white/70 text-base font-[var(--font-ui)] leading-relaxed max-w-xs">
            {{ $t('about.introText').substring(0, 150) }}...
          </p>
          <!-- Social icons -->
          <div class="flex items-center gap-3 mt-6">
            <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
              :aria-label="social.label"
              class="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all duration-300 text-lg"
              :style="{ color: social.color }">
              <i :class="social.icon"></i>
            </a>
          </div>
        </div>

        <!-- Navigation -->
        <div class="md:col-span-2">
          <h4 class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-white/40 uppercase mb-5">
            {{ $t('nav.servicios') }}
          </h4>
          <div class="space-y-3">
            <router-link to="/servicios" class="footer-link">{{ $t('nav.servicios') }}</router-link>
            <router-link to="/servicios/green-card" class="footer-link">{{ $t('nav.greenCards') }}</router-link>
            <router-link to="/consulta" class="footer-link">{{ $t('nav.consulta') }}</router-link>
            <router-link to="/pago" class="footer-link">{{ $t('nav.pago') }}</router-link>
          </div>
        </div>

        <div class="md:col-span-2">
          <h4 class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-white/40 uppercase mb-5">
            {{ $t('nav.acercaDe') }}
          </h4>
          <div class="space-y-3">
            <router-link to="/acerca-de" class="footer-link">{{ $t('nav.acercaDe') }}</router-link>
            <router-link to="/el-equipo" class="footer-link">{{ $t('nav.elEquipo') }}</router-link>
          </div>
        </div>

        <!-- Contact info -->
        <div class="md:col-span-4">
          <h4 class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-white/40 uppercase mb-5">
            {{ $t('contact.direccion') }}
          </h4>
          <div class="space-y-4 text-white/70 text-base font-[var(--font-ui)]">
            <div class="flex items-start gap-3">
              <i class="fa-solid fa-location-dot text-white/40 mt-1"></i>
              <div>
                <p>812 Gravier Street, Suite 330</p>
                <p>New Orleans, LA 70112</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <i class="fa-solid fa-envelope text-white/40 mt-1"></i>
              <div>
                <p class="text-white/50 text-sm mb-0.5">PO Box 6224, Metairie, LA 70009</p>
              </div>
            </div>
            <a href="tel:+15049106508" class="flex items-center gap-3 text-white hover:text-white/80 transition-colors text-xl font-semibold">
              <i class="fa-solid fa-phone text-brand-red-light"></i>
              (504) 910-6508
            </a>
            <a href="mailto:office@camulaw.com" class="flex items-center gap-3 text-white/70 hover:text-white transition-colors text-base">
              <i class="fa-solid fa-at text-white/40"></i>
              office@camulaw.com
            </a>
          </div>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="border-t border-white/15 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="font-[var(--font-ui)] text-sm tracking-[0.2em] text-white/50 uppercase">
          {{ $t('footer.firmName') }}
        </p>
        <p class="font-[var(--font-ui)] text-sm text-white/40">
          &copy; Campos Munos Law, LLC
        </p>
      </div>
    </div>

    <!-- Decorative floating circle -->
    <div class="absolute -bottom-32 -right-32 w-64 h-64 rounded-full bg-white/[0.03] blur-3xl pointer-events-none"></div>
  </footer>
</template>

<script setup>
const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp', color: '#25D366' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram', color: '#E4405F' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook', color: '#4F9EF8' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube', color: '#FF4444' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok', color: '#69C9D0' },
]
</script>

<style scoped>
.footer-link {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.9375rem;
  color: rgba(255,255,255,0.6);
  transition: color 0.3s, transform 0.3s;
}
.footer-link:hover {
  color: rgba(255,255,255,0.95);
  transform: translateX(4px);
}
</style>
