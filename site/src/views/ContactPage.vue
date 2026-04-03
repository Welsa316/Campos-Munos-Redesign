<template>
  <div>
    <!-- Hero strip -->
    <section class="relative pt-36 pb-24 overflow-hidden">
      <div class="absolute inset-0 bg-brand-surface"></div>
      <div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-navy/[0.03] to-transparent pointer-events-none"></div>
      <div class="relative max-w-7xl mx-auto px-6">
        <div class="reveal">
          <p class="font-ui text-base tracking-[0.2em] text-brand-navy uppercase mb-4">{{ $t('contact.subtitleAlt') }}</p>
          <h1 class="font-heading text-5xl md:text-7xl lg:text-8xl font-bold text-brand-navy leading-[0.95]">
            {{ $t('contact.title') }}
          </h1>
          <p class="text-gray-500 text-2xl mt-4 max-w-lg">{{ $t('contact.subtitle') }}</p>
        </div>
      </div>
    </section>

    <!-- Form + Info split layout -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <!-- Form - takes 7 cols -->
          <div class="lg:col-span-7 reveal-left">
            <form @submit.prevent="submitForm" class="space-y-6">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div class="form-group">
                  <label class="form-label">{{ $t('contact.firstName') }} <span class="text-brand-red">*</span></label>
                  <input v-model="form.firstName" type="text" required maxlength="255" class="form-input" />
                </div>
                <div class="form-group">
                  <label class="form-label">{{ $t('contact.lastName') }} <span class="text-brand-red">*</span></label>
                  <input v-model="form.lastName" type="text" required maxlength="255" class="form-input" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">{{ $t('contact.email') }} <span class="text-brand-red">*</span></label>
                <input v-model="form.email" type="email" required maxlength="255" class="form-input" />
              </div>

              <div class="form-group">
                <label class="form-label">{{ $t('contact.phone') }} <span class="text-brand-red">*</span></label>
                <input v-model="form.phone" type="tel" required maxlength="50" class="form-input" />
              </div>

              <div class="form-group">
                <label class="form-label">{{ $t('contact.message') }} <span class="text-brand-red">*</span></label>
                <textarea v-model="form.message" rows="4" required maxlength="5000" class="form-input resize-none"></textarea>
              </div>

              <button type="submit" :disabled="loading"
                class="w-full bg-brand-navy text-white font-ui font-bold tracking-wider text-base py-5 rounded-xl btn-magnetic disabled:opacity-50 disabled:cursor-not-allowed">
                <span v-if="loading">
                  <i class="fa-solid fa-spinner fa-spin mr-2 text-sm"></i>{{ $t('contact.sending') }}
                </span>
                <span v-else>
                  {{ $t('contact.submit') }}
                  <i class="fa-solid fa-paper-plane ml-2 text-sm"></i>
                </span>
              </button>

              <transition name="fade">
                <div v-if="submitted" class="p-4 rounded-xl bg-green-50 border border-green-200 text-center">
                  <p class="text-green-600 text-base font-ui">
                    <i class="fa-solid fa-check-circle mr-2"></i>{{ $t('contact.successMessage') }}
                  </p>
                </div>
              </transition>

              <transition name="fade">
                <div v-if="error" class="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
                  <p class="text-red-600 text-base font-ui">
                    <i class="fa-solid fa-exclamation-circle mr-2"></i>{{ $t('contact.errorMessage') }}
                  </p>
                </div>
              </transition>
            </form>

            <div class="mt-8">
              <router-link to="/pago"
                class="inline-flex items-center gap-2 text-gray-400 hover:text-brand-navy text-base font-ui transition-colors">
                <i class="fa-solid fa-credit-card text-sm"></i>
                {{ $t('contact.paymentBtn') }}
              </router-link>
            </div>
          </div>

          <!-- Info sidebar - takes 5 cols -->
          <div class="lg:col-span-5 reveal-right">
            <div class="sticky top-32 space-y-8">
              <!-- Contact cards -->
              <div v-for="item in contactCards" :key="item.titleKey"
                class="group p-6 rounded-2xl bg-brand-light border border-gray-200 hover:border-brand-navy/20 transition-all duration-300">
                <div class="flex items-start gap-4">
                  <div class="w-14 h-14 rounded-xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-navy/20 transition-colors">
                    <i :class="item.icon" class="text-brand-navy text-lg"></i>
                  </div>
                  <div>
                    <h3 class="font-heading text-xl text-gray-900 mb-1">{{ $t(`contact.${item.titleKey}`) }}</h3>
                    <div class="text-gray-500 text-lg space-y-0.5" v-html="item.content"></div>
                  </div>
                </div>
              </div>

              <!-- Social strip -->
              <div class="p-6 rounded-2xl bg-brand-light border border-gray-200">
                <h3 class="font-heading text-xl text-gray-900 mb-4">{{ $t('contact.conectese') }}</h3>
                <div class="flex gap-3">
                  <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
                    :aria-label="social.label"
                    class="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:scale-110 hover:border-gray-300 transition-all text-lg"
                    :style="{ color: social.color }">
                    <i :class="social.icon"></i>
                  </a>
                </div>
              </div>

              <!-- Hours -->
              <div class="p-6 rounded-2xl bg-brand-light border border-gray-200">
                <div class="flex items-start gap-4">
                  <div class="w-14 h-14 rounded-xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-clock text-brand-navy text-lg"></i>
                  </div>
                  <div>
                    <h3 class="font-heading text-xl text-gray-900 mb-2">{{ $t('contact.horario') }}</h3>
                    <div class="text-gray-500 text-lg space-y-1">
                      <div class="flex justify-between gap-6">
                        <span>{{ $t('contact.lunesViernes') }}</span>
                        <span class="text-gray-700">{{ $t('contact.horarioSemana') }}</span>
                      </div>
                      <div class="flex justify-between gap-6">
                        <span>{{ $t('contact.sabadoDomingo') }}</span>
                        <span class="text-gray-700">{{ $t('contact.conCita') }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Google Reviews Carousel -->
    <section class="py-20 bg-brand-light">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-10 reveal">
          <div class="flex items-center justify-center gap-2 mb-3">
            <i v-for="n in 5" :key="n" class="fa-solid fa-star text-yellow-400 text-xl"></i>
          </div>
          <h2 class="font-heading text-4xl md:text-5xl text-brand-navy">{{ $t('home.reviewsTitle') }}</h2>
        </div>
        <div class="reveal elfsight-reviews-wrapper rounded-2xl overflow-hidden">
          <div class="elfsight-app-924b81dc-21bf-470e-b66f-9137cae00590" data-elfsight-app-lazy></div>
        </div>
      </div>
    </section>

    <!-- Map - edge to edge -->
    <section class="h-[450px] relative">
      <div class="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-brand-light to-transparent z-10 pointer-events-none"></div>
      <iframe
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3457.0!2d-90.0715!3d29.9511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8620a67b1f0b7d2f%3A0x4b7a8c8b3b8b8b8b!2s812%20Gravier%20St%2C%20New%20Orleans%2C%20LA%2070112!5e0!3m2!1ses!2sus!4v1700000000000"
        class="w-full h-full border-0" allowfullscreen loading="lazy"
        referrerpolicy="no-referrer-when-downgrade" title="Campos Munos Law Office Location">
      </iframe>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'
import { rawFetch } from '../composables/useApi.js'

useScrollReveal()
const { t } = useI18n()

const form = ref({ firstName: '', lastName: '', email: '', phone: '', message: '' })
const submitted = ref(false)
const loading = ref(false)
const error = ref(false)

const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp', color: '#25D366' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram', color: '#E4405F' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook', color: '#1877F2' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube', color: '#FF0000' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok', color: '#69C9D0' },
]

const contactCards = computed(() => [
  { titleKey: 'direccion', icon: 'fa-solid fa-location-dot', content: '<p>812 Gravier Street, Office 330</p><p>New Orleans, LA 70112</p><p class="text-gray-400 text-sm mt-1">PO Box 6224, Metairie, LA 70009</p>' },
  { titleKey: 'telefono', icon: 'fa-solid fa-phone', content: '<a href="tel:+15049106508" class="hover:text-[var(--color-brand-navy)] transition-colors">+1 (504) 910-6508</a>' },
  { titleKey: 'correo', icon: 'fa-solid fa-envelope', content: '<a href="mailto:office@camulaw.com" class="hover:text-[var(--color-brand-navy)] transition-colors">office@camulaw.com</a>' },
])

async function submitForm() {
  loading.value = true
  error.value = false

  try {
    const res = await rawFetch('/api/submissions', {
      method: 'POST',
      body: JSON.stringify(form.value),
    })

    if (!res.ok) {
      throw new Error('Submission failed')
    }

    submitted.value = true
    form.value = { firstName: '', lastName: '', email: '', phone: '', message: '' }
    setTimeout(() => { submitted.value = false }, 5000)
  } catch {
    error.value = true
    setTimeout(() => { error.value = false }, 5000)
  } finally {
    loading.value = false
  }
}
</script>
