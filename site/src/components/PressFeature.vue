<template>
  <!-- ===================== FEATURED ON TV (press) ===================== -->
  <!-- Dark newsroom band: the three news-interview stills sit side by side in
       liquid-glass frames, each tagged with a frosted ribbon carrying the
       station's colored mark. Pure reputation signal — nothing to click. -->
  <section class="press-band relative py-20 sm:py-24 overflow-hidden" :aria-label="$t('home.pressAria')">
    <!-- soft glow blobs so the glass frames have light to refract -->
    <div class="pointer-events-none absolute -top-24 left-1/4 w-[420px] h-[420px] rounded-full bg-brand-navy-light/25 blur-3xl" aria-hidden="true"></div>
    <div class="pointer-events-none absolute -bottom-32 right-1/5 w-[380px] h-[380px] rounded-full bg-brand-red/10 blur-3xl" aria-hidden="true"></div>

    <div class="relative max-w-7xl mx-auto px-6">
      <div class="text-center mb-10 sm:mb-14 reveal">
        <h2 class="font-heading text-4xl md:text-5xl text-white">
          {{ $t('home.pressHeading') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 stagger">
        <div v-for="st in stations" :key="st.id" class="glass-card reveal">
          <div class="relative rounded-xl overflow-hidden">
            <img
              :src="st.still"
              :alt="$t(st.altKey)"
              loading="lazy"
              decoding="async"
              width="1280" height="720"
              class="w-full aspect-video object-cover"
            />
            <!-- frosted station ribbon -->
            <div class="ribbon absolute bottom-0 left-0 flex items-center gap-2 pl-3 pr-6 py-2">
              <img :src="st.logo" :alt="''" aria-hidden="true" class="h-4 sm:h-5 w-auto" width="20" height="20" />
              <span class="text-brand-navy-dark font-ui font-bold text-[10px] sm:text-xs tracking-[0.18em] uppercase">{{ st.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const stations = [
  { id: 'telemundo', name: 'Telemundo', still: '/press/telemundo.jpg', logo: '/press/telemundo.svg', altKey: 'home.pressAltTelemundo' },
  { id: 'univision', name: 'Univision', still: '/press/univision.jpg', logo: '/press/univision.svg', altKey: 'home.pressAltUnivision' },
  { id: 'tvv', name: 'TVV', still: '/press/tvv.jpg', logo: '/press/tvv-logo-navy.png', altKey: 'home.pressAltTvv' },
]
</script>

<style scoped>
.press-band {
  background:
    radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255, 255, 255, 0.06), transparent 60%),
    linear-gradient(180deg, #041f3d 0%, #062a52 55%, #041f3d 100%);
}

/* Liquid-glass frame: translucent fill, backdrop blur, a specular top edge and
   a soft drop for depth. The padding is the visible "glass" mat around the still. */
.glass-card {
  padding: 10px;
  border-radius: 18px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05) 55%);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 20px 50px -16px rgba(0, 0, 0, 0.5);
}

/* Frosted ribbon with the Stitch-style angled right edge. backdrop-filter blurs
   the still beneath it, so it reads as glass laid over the broadcast frame. */
.ribbon {
  background: rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  backdrop-filter: blur(10px) saturate(140%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.85);
}
</style>
