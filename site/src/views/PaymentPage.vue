<template>
  <div>
    <!-- Hero -->
    <section class="relative pt-32 pb-20 bg-brand-muted overflow-hidden">
      <div class="relative max-w-7xl mx-auto px-6">
        <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-navy uppercase mb-3">Campos Munos Law</p>
        <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl font-bold text-white leading-[0.95]">
          {{ $t('nav.pago') }}
        </h1>
        <p class="text-white/40 text-lg mt-4">
          {{ currentLang === 'es' ? 'Realice su pago de forma segura' : 'Make your payment securely' }}
        </p>
      </div>
    </section>

    <!-- Payment section -->
    <section class="py-20 bg-brand-darker">
      <div class="max-w-lg mx-auto px-6">
        <div class="reveal rounded-2xl overflow-hidden gradient-border">
          <div class="bg-brand-dark p-10 text-center">
            <div class="w-20 h-20 rounded-2xl bg-brand-navy/10 flex items-center justify-center mx-auto mb-8">
              <i class="fa-solid fa-credit-card text-3xl text-brand-navy"></i>
            </div>

            <h2 class="font-[var(--font-heading)] text-2xl text-white mb-3">
              {{ currentLang === 'es' ? 'Portal de Pagos' : 'Payment Portal' }}
            </h2>
            <p class="text-white/40 text-sm font-[var(--font-ui)] mb-10 max-w-sm mx-auto leading-relaxed">
              {{ currentLang === 'es'
                ? 'Para realizar un pago, por favor comuníquese con nuestra oficina para obtener las instrucciones de pago.'
                : 'To make a payment, please contact our office for payment instructions.' }}
            </p>

            <div class="space-y-4">
              <a href="tel:+15049106508"
                class="flex items-center justify-center gap-3 w-full py-4 rounded-xl bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-sm btn-magnetic">
                <i class="fa-solid fa-phone text-xs"></i>
                (504) 910-6508
              </a>
              <a href="mailto:office@camulaw.com"
                class="flex items-center justify-center gap-3 w-full py-4 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-brand-navy/30 font-[var(--font-ui)] font-medium tracking-wider text-sm transition-all">
                <i class="fa-solid fa-envelope text-xs"></i>
                office@camulaw.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'

useScrollReveal()
const { locale } = useI18n()
const currentLang = computed(() => locale.value)
</script>
