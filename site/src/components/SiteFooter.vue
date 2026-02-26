<template>
  <footer class="bg-brand-dark border-t border-white/10">
    <div class="max-w-7xl mx-auto px-4 py-12">
      <!-- Top section -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <!-- Logo & firm name -->
        <div class="text-center md:text-left">
          <router-link to="/home">
            <img src="/logo.png" alt="Campos Munos Law" class="h-12 mb-3 mx-auto md:mx-0" />
          </router-link>
          <p class="font-[var(--font-ui)] text-xs tracking-widest text-white/60 uppercase">
            Immigration Attorneys
          </p>
        </div>

        <!-- Quick links -->
        <div class="text-center">
          <h4 class="font-[var(--font-ui)] text-sm tracking-wider text-brand-gold mb-4 uppercase">{{ $t('nav.servicios') }}</h4>
          <div class="space-y-2">
            <router-link to="/servicios" class="block text-white/70 hover:text-white text-sm transition-colors">{{ $t('nav.servicios') }}</router-link>
            <router-link to="/consulta" class="block text-white/70 hover:text-white text-sm transition-colors">{{ $t('nav.consulta') }}</router-link>
            <router-link to="/acerca-de" class="block text-white/70 hover:text-white text-sm transition-colors">{{ $t('nav.acercaDe') }}</router-link>
            <router-link to="/el-equipo" class="block text-white/70 hover:text-white text-sm transition-colors">{{ $t('nav.elEquipo') }}</router-link>
          </div>
        </div>

        <!-- Contact info -->
        <div class="text-center md:text-right">
          <h4 class="font-[var(--font-ui)] text-sm tracking-wider text-brand-gold mb-4 uppercase">{{ $t('contact.direccion') }}</h4>
          <div class="space-y-2 text-sm text-white/70">
            <p>812 Gravier Street, Suite 330</p>
            <p>New Orleans, LA 70112</p>
            <p class="text-white/50 text-xs">PO Box 6224, Metairie, LA 70009</p>
            <a href="tel:+15049106508" class="block hover:text-brand-gold transition-colors mt-3">
              <i class="fa-solid fa-phone mr-2"></i>(504) 910-6508
            </a>
            <a href="mailto:office@camulaw.com" class="block hover:text-brand-gold transition-colors">
              <i class="fa-solid fa-envelope mr-2"></i>office@camulaw.com
            </a>
          </div>
        </div>
      </div>

      <!-- Social links -->
      <div class="flex items-center justify-center gap-5 mb-8">
        <a href="https://wa.me/15049106508" target="_blank" rel="noopener" aria-label="WhatsApp" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
          <i class="fa-brands fa-whatsapp"></i>
        </a>
        <a href="https://www.instagram.com/juancamposlaw/" target="_blank" rel="noopener" aria-label="Instagram" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
          <i class="fa-brands fa-instagram"></i>
        </a>
        <a href="https://www.facebook.com/Camposmunoslaw" target="_blank" rel="noopener" aria-label="Facebook" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
          <i class="fa-brands fa-facebook-f"></i>
        </a>
        <a href="https://www.youtube.com/@camposmunoslaw6542" target="_blank" rel="noopener" aria-label="YouTube" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
          <i class="fa-brands fa-youtube"></i>
        </a>
        <a href="https://www.tiktok.com/@elabogadohispano" target="_blank" rel="noopener" aria-label="TikTok" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
          <i class="fa-brands fa-tiktok"></i>
        </a>
      </div>

      <!-- Bottom bar -->
      <div class="border-t border-white/10 pt-6 text-center">
        <p class="font-[var(--font-ui)] text-xs tracking-widest text-white/40 uppercase">
          {{ $t('footer.firmName') }}
        </p>
      </div>
    </div>
  </footer>
</template>
