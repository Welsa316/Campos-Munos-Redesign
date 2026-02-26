<template>
  <div>
    <!-- Hero -->
    <section class="relative py-24 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h1 class="font-[var(--font-heading)] text-4xl md:text-5xl font-bold text-white mb-4">
          {{ $t('nav.pago') }}
        </h1>
        <div class="w-20 h-0.5 bg-brand-gold mx-auto mb-6"></div>
        <p class="text-white/70 text-lg">
          {{ currentLang === 'es' ? 'Realice su pago de forma segura' : 'Make your payment securely' }}
        </p>
      </div>
    </section>

    <!-- Payment Section -->
    <section class="py-16 bg-brand-darker">
      <div class="max-w-2xl mx-auto px-4">
        <div class="bg-brand-gray/30 rounded-xl p-8 md:p-12 border border-white/5 text-center">
          <div class="w-20 h-20 rounded-2xl bg-brand-red/20 flex items-center justify-center mx-auto mb-6">
            <i class="fa-solid fa-credit-card text-4xl text-brand-gold"></i>
          </div>

          <h2 class="font-[var(--font-heading)] text-2xl text-white mb-4">
            {{ currentLang === 'es' ? 'Portal de Pagos' : 'Payment Portal' }}
          </h2>

          <p class="text-white/60 text-sm mb-8 max-w-md mx-auto">
            {{ currentLang === 'es'
              ? 'Para realizar un pago, por favor comuníquese con nuestra oficina para obtener las instrucciones de pago.'
              : 'To make a payment, please contact our office for payment instructions.' }}
          </p>

          <div class="space-y-4">
            <a href="tel:+15049106508"
              class="flex items-center justify-center gap-3 w-full bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm py-3.5 rounded-lg transition-colors">
              <i class="fa-solid fa-phone"></i>
              (504) 910-6508
            </a>
            <a href="mailto:office@camulaw.com"
              class="flex items-center justify-center gap-3 w-full border-2 border-brand-gold text-brand-gold hover:bg-brand-gold hover:text-brand-dark font-[var(--font-ui)] font-semibold tracking-wider text-sm py-3.5 rounded-lg transition-all">
              <i class="fa-solid fa-envelope"></i>
              office@camulaw.com
            </a>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const currentLang = computed(() => locale.value)
</script>
