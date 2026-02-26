<template>
  <footer class="relative bg-brand-muted overflow-hidden">
    <!-- Decorative top border gradient -->
    <div class="h-px bg-gradient-to-r from-transparent via-brand-gold/40 to-transparent"></div>

    <!-- Main footer content -->
    <div class="max-w-7xl mx-auto px-6 pt-20 pb-12">
      <div class="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
        <!-- Brand column -->
        <div class="md:col-span-4">
          <router-link to="/home" class="inline-block mb-6">
            <img src="/logo.png" alt="Campos Munos Law" class="h-14" />
          </router-link>
          <p class="text-white/50 text-sm font-[var(--font-ui)] leading-relaxed max-w-xs">
            {{ $t('about.introText').substring(0, 150) }}...
          </p>
          <!-- Social icons -->
          <div class="flex items-center gap-3 mt-6">
            <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
              :aria-label="social.label"
              class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-brand-gold hover:bg-brand-gold/10 transition-all duration-300">
              <i :class="social.icon"></i>
            </a>
          </div>
        </div>

        <!-- Navigation -->
        <div class="md:col-span-2">
          <h4 class="font-[var(--font-ui)] text-xs tracking-[0.2em] text-brand-gold uppercase mb-5">
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
          <h4 class="font-[var(--font-ui)] text-xs tracking-[0.2em] text-brand-gold uppercase mb-5">
            {{ $t('nav.acercaDe') }}
          </h4>
          <div class="space-y-3">
            <router-link to="/acerca-de" class="footer-link">{{ $t('nav.acercaDe') }}</router-link>
            <router-link to="/el-equipo" class="footer-link">{{ $t('nav.elEquipo') }}</router-link>
          </div>
        </div>

        <!-- Contact info -->
        <div class="md:col-span-4">
          <h4 class="font-[var(--font-ui)] text-xs tracking-[0.2em] text-brand-gold uppercase mb-5">
            {{ $t('contact.direccion') }}
          </h4>
          <div class="space-y-4 text-white/50 text-sm font-[var(--font-ui)]">
            <div class="flex items-start gap-3">
              <i class="fa-solid fa-location-dot text-brand-gold/50 mt-1"></i>
              <div>
                <p>812 Gravier Street, Suite 330</p>
                <p>New Orleans, LA 70112</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <i class="fa-solid fa-envelope text-brand-gold/50 mt-1"></i>
              <div>
                <p class="text-white/30 text-xs mb-0.5">PO Box 6224, Metairie, LA 70009</p>
              </div>
            </div>
            <a href="tel:+15049106508" class="flex items-center gap-3 hover:text-brand-gold transition-colors">
              <i class="fa-solid fa-phone text-brand-gold/50"></i>
              (504) 910-6508
            </a>
            <a href="mailto:office@camulaw.com" class="flex items-center gap-3 hover:text-brand-gold transition-colors">
              <i class="fa-solid fa-at text-brand-gold/50"></i>
              office@camulaw.com
            </a>
          </div>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="font-[var(--font-ui)] text-[11px] tracking-[0.2em] text-white/25 uppercase">
          {{ $t('footer.firmName') }}
        </p>
        <p class="font-[var(--font-ui)] text-[11px] text-white/20">
          &copy; {{ new Date().getFullYear() }} Campos Munos Law, LLC
        </p>
      </div>
    </div>

    <!-- Decorative floating gold circle -->
    <div class="absolute -bottom-32 -right-32 w-64 h-64 rounded-full bg-brand-gold/[0.02] blur-3xl pointer-events-none"></div>
  </footer>
</template>

<script setup>
const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok' },
]
</script>

<style scoped>
.footer-link {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.45);
  transition: color 0.3s, transform 0.3s;
}
.footer-link:hover {
  color: rgba(255,255,255,0.9);
  transform: translateX(4px);
}
</style>
