<template>
  <div>
    <!-- Hero -->
    <section class="relative py-28 bg-cover bg-center" style="background-image: url('/AbogadosSlideshowPic.jpg')">
      <div class="absolute inset-0 bg-black/60"></div>
      <div class="relative max-w-4xl mx-auto px-4 text-center">
        <p class="font-[var(--font-ui)] text-brand-gold text-sm tracking-[0.3em] uppercase mb-4">
          {{ $t('about.firmName') }}
        </p>
        <h1 class="font-[var(--font-heading)] text-4xl md:text-6xl font-bold text-white">
          {{ $t('about.quienesSomos') }}
        </h1>
      </div>
    </section>

    <!-- Intro -->
    <section class="py-20 bg-brand-darker">
      <div class="max-w-3xl mx-auto px-4 text-center">
        <p class="text-white/80 text-lg md:text-xl leading-relaxed">
          {{ $t('about.introText') }}
        </p>
      </div>
    </section>

    <!-- Team Photo -->
    <section class="bg-brand-dark">
      <div class="max-w-5xl mx-auto">
        <div class="aspect-[16/8] bg-brand-gray rounded-lg overflow-hidden mx-4">
          <img src="/AbogadosSlideshowPic.jpg" alt="Campos Munos Law Team"
            class="w-full h-full object-cover" />
        </div>
      </div>
    </section>

    <!-- Mission & Vision -->
    <section class="py-20 bg-brand-dark">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
          <!-- Mission -->
          <div class="text-center">
            <h2 class="font-[var(--font-heading)] text-3xl text-white mb-4">{{ $t('about.mision') }}</h2>
            <div class="w-16 h-0.5 bg-brand-gold mx-auto mb-8"></div>
            <div class="space-y-5 text-white/75 text-lg leading-relaxed">
              <p>{{ $t('about.misionText1') }}</p>
              <p>{{ $t('about.misionText2') }}</p>
              <p>{{ $t('about.misionText3') }}</p>
            </div>
          </div>

          <!-- Vision -->
          <div class="text-center">
            <h2 class="font-[var(--font-heading)] text-3xl text-white mb-4">{{ $t('about.vision') }}</h2>
            <div class="w-16 h-0.5 bg-brand-gold mx-auto mb-8"></div>
            <div class="space-y-5 text-white/75 text-lg leading-relaxed">
              <p>{{ $t('about.visionText1') }}</p>
              <p>{{ $t('about.visionText2') }}</p>
              <p>{{ $t('about.visionText3') }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 bg-brand-darker text-center">
      <div class="max-w-2xl mx-auto px-4">
        <h2 class="font-[var(--font-heading)] text-2xl md:text-3xl text-white mb-6">
          {{ $t('home.popupTitle') }}
        </h2>
        <router-link to="/consulta"
          class="inline-block bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3.5 rounded-lg transition-colors">
          {{ $t('home.consultaBtn') }}
        </router-link>
      </div>
    </section>
  </div>
</template>
