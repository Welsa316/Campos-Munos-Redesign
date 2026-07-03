<template>
  <div>
    <!-- Hero -->
    <section class="relative pt-36 pb-24 bg-brand-surface overflow-hidden">
      <div class="relative max-w-7xl mx-auto px-6">
        <p class="font-ui text-base tracking-[0.3em] text-brand-navy uppercase mb-4">Campos Muños Law</p>
        <h1 class="font-heading text-5xl md:text-7xl lg:text-8xl font-bold text-brand-navy leading-[0.95]">
          {{ $t('nav.pago') }}
        </h1>
        <p class="text-gray-500 text-xl md:text-2xl mt-4">
          {{ $t('payment.subtitle') }}
        </p>
      </div>
    </section>

    <!-- Payment section -->
    <section class="py-20 bg-white">
      <div class="max-w-lg mx-auto px-6">
        <div class="reveal text-center">
          <div class="w-24 h-24 rounded-2xl bg-brand-navy/10 flex items-center justify-center mx-auto mb-8">
            <i class="fa-solid fa-phone text-4xl text-brand-navy" aria-hidden="true"></i>
          </div>

          <p class="text-gray-500 text-lg font-ui mb-10 max-w-sm mx-auto leading-relaxed">
            {{ $t('payment.contactMessage') }}
          </p>

          <a href="tel:+15049106508"
            class="flex items-center justify-center gap-3 w-full py-5 rounded-xl bg-brand-navy text-white font-ui font-bold tracking-wider text-base btn-magnetic">
            <i class="fa-solid fa-phone text-sm" aria-hidden="true"></i>
            (504) 910-6508
          </a>
          <a href="mailto:office@camulaw.com"
            class="inline-flex items-center gap-2 mt-6 text-gray-500 hover:text-brand-navy text-base font-ui transition-colors">
            <i class="fa-solid fa-envelope text-sm" aria-hidden="true"></i>
            office@camulaw.com
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useScrollReveal } from '../composables/useScrollReveal.js'
useScrollReveal()
</script>
