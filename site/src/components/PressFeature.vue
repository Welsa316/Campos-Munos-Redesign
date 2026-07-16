<template>
  <!-- ===================== FEATURED ON TV (press) ===================== -->
  <!-- Dark newsroom band: the three news-interview stills sit side by side in
       liquid-glass frames, each tagged with a frosted ribbon carrying the
       station's colored mark. Pure reputation signal — nothing to click. -->
  <section class="press-band relative py-20 sm:py-24 overflow-hidden" :aria-label="$t('home.pressAria')">
    <!-- soft glow blobs so the glass frames have light to refract -->
    <div class="pointer-events-none absolute -top-24 left-1/4 w-[420px] h-[420px] rounded-full bg-brand-navy-light/25 blur-3xl" aria-hidden="true"></div>
    <div class="pointer-events-none absolute -bottom-32 right-1/5 w-[380px] h-[380px] rounded-full bg-brand-red/10 blur-3xl" aria-hidden="true"></div>

    <div class="relative max-w-[1720px] mx-auto px-5 sm:px-8">
      <div class="text-center mb-10 sm:mb-14 reveal">
        <h2 class="font-heading text-4xl md:text-5xl text-white">
          {{ $t('home.pressHeading') }}
        </h2>
      </div>

      <!-- One row of three on md+ — the row tracks the viewport width so the
           stills render as large as possible without breaking the 3-up structure. -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-5 xl:gap-7 stagger">
        <div v-for="st in stations" :key="st.id" class="glass-card reveal">
          <div class="relative">
            <div class="rounded-xl overflow-hidden">
              <img
                :src="st.still"
                :alt="$t(st.altKey)"
                loading="lazy"
                decoding="async"
                width="1280" height="720"
                class="w-full aspect-video object-cover"
              />
            </div>
            <!-- Frosted station tag straddling the frame's top edge — half on the
                 still, half above it, so it reads as our label, not broadcast UI. -->
            <div class="ribbon absolute top-0 left-3 sm:left-4 -translate-y-1/2 flex items-center gap-3 pl-5 pr-9 sm:pr-10 py-3 sm:py-3.5">
              <img :src="st.logo" :alt="''" aria-hidden="true" class="h-7 sm:h-8 w-auto" width="32" height="32" />
              <span class="text-brand-navy-dark font-ui font-bold text-sm sm:text-base tracking-[0.18em] uppercase">{{ st.name }}</span>
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

/* Frosted tag with the Stitch-style angled right edge. It straddles the frame's
   top edge, so its backdrop-filter blurs the still below the midline and the
   navy band above it — clearly a label we laid on top, not broadcast UI. */
.ribbon {
  /* Light-blue glass (brand-adjacent, ~primary-100 range) — keeps the navy
     text well above AA contrast while tinting the tag into the site palette. */
  background: linear-gradient(165deg, rgba(205, 223, 255, 0.88), rgba(184, 209, 250, 0.76));
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  backdrop-filter: blur(10px) saturate(140%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%);
  box-shadow:
    inset 0 1px 0 rgba(235, 244, 255, 0.95),
    0 8px 24px -8px rgba(0, 0, 0, 0.45);
}
</style>
