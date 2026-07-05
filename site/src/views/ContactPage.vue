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
          <a href="tel:+15049106508"
            class="inline-flex items-center gap-4 mt-8 font-heading text-2xl md:text-3xl text-brand-navy hover:opacity-80 transition-opacity">
            <span class="w-14 h-14 rounded-xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
              <i class="fa-solid fa-phone text-xl" aria-hidden="true"></i>
            </span>
            +1 (504) 910-6508
          </a>
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
          <h2 class="font-heading text-4xl md:text-5xl text-brand-navy inline-flex items-center justify-center gap-4">
            <svg class="w-9 h-9 md:w-11 md:h-11 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
              <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
            </svg>
            {{ $t('home.reviewsTitle') }}
          </h2>
        </div>
        <div class="reveal elfsight-reviews-wrapper rounded-2xl overflow-hidden">
          <div class="elfsight-app-02c0cb8e-d132-4834-ae18-93002f5a819a" data-elfsight-app-lazy></div>
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
                  <label for="contact-firstName" class="form-label">{{ $t('contact.firstName') }} <span class="text-brand-red">*</span></label>
                  <input id="contact-firstName" v-model="form.firstName" type="text" required maxlength="255" class="form-input" />
                </div>
                <div class="form-group">
                  <label for="contact-lastName" class="form-label">{{ $t('contact.lastName') }} <span class="text-brand-red">*</span></label>
                  <input id="contact-lastName" v-model="form.lastName" type="text" required maxlength="255" class="form-input" />
                </div>
              </div>

              <div class="form-group">
                <label for="contact-email" class="form-label">{{ $t('contact.email') }} <span class="text-brand-red">*</span></label>
                <input id="contact-email" v-model="form.email" type="email" required maxlength="255" class="form-input" />
              </div>

              <div class="form-group">
                <label for="contact-phone" class="form-label">{{ $t('contact.phone') }} <span class="text-brand-red">*</span></label>
                <input id="contact-phone" v-model="form.phone" type="tel" required maxlength="50" class="form-input" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div class="form-group">
                  <label for="contact-consultationType" class="form-label">{{ $t('consultationForm.consultationType') }}</label>
                  <select id="contact-consultationType" v-model="form.consultationType" class="form-input">
                    <option value="">{{ $t('consultationForm.selectConsultation') }}</option>
                    <option v-for="key in CONSULTATION_KEYS" :key="key" :value="key">
                      {{ key === 'other' ? $t('consultationForm.notSure') : $t(`services.${key}`) }}
                    </option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="contact-location" class="form-label">{{ $t('consultationForm.country') }}</label>
                  <select id="contact-location" v-model="form.location" class="form-input">
                    <option value="">{{ $t('consultationForm.selectCountry') }}</option>
                    <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">
                      {{ locale === 'en' ? c.nameEn : c.nameEs }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label for="contact-message" class="form-label">{{ $t('contact.message') }}</label>
                <textarea id="contact-message" v-model="form.message" rows="4" maxlength="5000" class="form-input resize-none"></textarea>
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
                <div v-if="submitted" role="status" aria-live="polite" class="p-4 rounded-xl bg-green-50 border border-green-200 text-center">
                  <p class="text-green-600 text-base font-ui">
                    <i class="fa-solid fa-check-circle mr-2" aria-hidden="true"></i>{{ $t('contact.successMessage') }}
                  </p>
                </div>
              </transition>

              <transition name="fade">
                <div v-if="error" role="alert" aria-live="assertive" class="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
                  <p class="text-red-600 text-base font-ui">
                    <i class="fa-solid fa-exclamation-circle mr-2" aria-hidden="true"></i>{{ errorText }}
                  </p>
                </div>
              </transition>
            </form>

            <div class="mt-8">
              <router-link to="/pago"
                class="inline-flex items-center gap-2 text-gray-500 hover:text-brand-navy text-base font-ui transition-colors">
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

    <!-- Map - edge to edge -->
    <section class="h-[450px] relative">
      <div class="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none"></div>
      <iframe
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3457.0!2d-90.0715!3d29.9511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8620a67b1f0b7d2f%3A0x4b7a8c8b3b8b8b8b!2s812%20Gravier%20St%2C%20New%20Orleans%2C%20LA%2070112!5e0!3m2!1ses!2sus!4v1700000000000"
        class="w-full h-full border-0" allowfullscreen loading="lazy"
        referrerpolicy="no-referrer-when-downgrade" title="Campos Muños Law Office Location">
      </iframe>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScrollReveal } from '../composables/useScrollReveal.js'
import { rawFetch } from '../composables/useApi.js'
import { CONSULTATION_KEYS } from '../data/consultationTypes.js'
import { COUNTRIES } from '../data/countries.js'

useScrollReveal()
const { t, locale } = useI18n()

const form = ref({ firstName: '', lastName: '', email: '', phone: '', consultationType: '', location: '', message: '' })
const submitted = ref(false)
const loading = ref(false)
const error = ref(false)
const errorText = ref('')

const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp', color: '#25D366' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram', color: '#E4405F' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook', color: '#1877F2' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube', color: '#FF0000' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok', color: '#69C9D0' },
]

const contactCards = computed(() => [
  { titleKey: 'direccion', icon: 'fa-solid fa-location-dot', content: '<a href="https://www.google.com/maps/dir/?api=1&destination=812+Gravier+St+Suite+330+New+Orleans+LA+70112" target="_blank" rel="noopener" class="block hover:text-[var(--color-brand-navy)] transition-colors"><p>812 Gravier Street, Suite 330</p><p>New Orleans, LA 70112</p></a><p class="text-gray-500 text-sm mt-1">PO Box 6224, Metairie, LA 70009</p>' },
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
      // Read the JSON error body so we can surface a specific message.
      const data = await res.json().catch(() => ({}))
      errorText.value = res.status === 429
        ? t('contact.rateLimitError')
        : t('contact.errorMessage')
      throw new Error(data.error || 'Submission failed')
    }

    submitted.value = true
    form.value = { firstName: '', lastName: '', email: '', phone: '', consultationType: '', location: '', message: '' }
    setTimeout(() => { submitted.value = false }, 5000)
  } catch {
    if (!errorText.value) errorText.value = t('contact.errorMessage')
    error.value = true
    setTimeout(() => { error.value = false; errorText.value = '' }, 5000)
  } finally {
    loading.value = false
  }
}
</script>
