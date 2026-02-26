<template>
  <div>
    <!-- Hero -->
    <section class="relative py-24 bg-cover bg-center" style="background-image: url('/AbogadosSlideshowPic.jpg')">
      <div class="absolute inset-0 bg-black/60"></div>
      <div class="relative max-w-4xl mx-auto px-4 text-center">
        <h1 class="font-[var(--font-heading)] text-4xl md:text-6xl font-bold text-white mb-4">
          {{ $t('contact.title') }}
        </h1>
        <p class="text-white/70 text-xl">{{ $t('contact.subtitle') }} &middot; {{ $t('contact.subtitleAlt') }}</p>
      </div>
    </section>

    <!-- Contact Form + Info -->
    <section class="py-16 bg-brand-darker">
      <div class="max-w-6xl mx-auto px-4">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-12">
          <!-- Form -->
          <div class="lg:col-span-3">
            <form @submit.prevent="submitForm" class="space-y-5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label class="form-label">{{ $t('contact.firstName') }} *</label>
                  <input v-model="form.firstName" type="text" required maxlength="100"
                    class="form-input" />
                </div>
                <div>
                  <label class="form-label">{{ $t('contact.lastName') }} *</label>
                  <input v-model="form.lastName" type="text" required maxlength="100"
                    class="form-input" />
                </div>
              </div>

              <div>
                <label class="form-label">{{ $t('contact.email') }} *</label>
                <input v-model="form.email" type="email" required maxlength="250"
                  class="form-input" />
              </div>

              <div>
                <label class="form-label">{{ $t('contact.consultationType') }} *</label>
                <input v-model="form.consultationType" type="text" required
                  class="form-input" />
              </div>

              <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                <div>
                  <label class="form-label">{{ $t('contact.countryCode') }}</label>
                  <select v-model="form.countryCode" class="form-input">
                    <option value="+1">US +1</option>
                    <option value="+52">MX +52</option>
                    <option value="+502">GT +502</option>
                    <option value="+503">SV +503</option>
                    <option value="+504">HN +504</option>
                    <option value="+505">NI +505</option>
                    <option value="+506">CR +506</option>
                    <option value="+507">PA +507</option>
                    <option value="+57">CO +57</option>
                    <option value="+58">VE +58</option>
                    <option value="+51">PE +51</option>
                    <option value="+55">BR +55</option>
                  </select>
                </div>
                <div class="col-span-2 sm:col-span-3">
                  <label class="form-label">{{ $t('contact.phone') }} *</label>
                  <input v-model="form.phone" type="tel" required
                    class="form-input" />
                </div>
              </div>

              <div>
                <label class="form-label">{{ $t('contact.message') }}</label>
                <textarea v-model="form.message" rows="4"
                  class="form-input resize-none"></textarea>
              </div>

              <button type="submit"
                class="w-full bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm py-3.5 rounded-lg transition-colors">
                {{ $t('contact.submit') }}
              </button>

              <transition name="fade">
                <p v-if="submitted" class="text-green-400 text-center text-sm">
                  {{ $t('contact.successMessage') }}
                </p>
              </transition>
            </form>

            <div class="mt-6 text-center">
              <router-link to="/pago"
                class="inline-flex items-center gap-2 text-brand-gold hover:text-brand-gold-light font-[var(--font-ui)] text-sm transition-colors">
                <i class="fa-solid fa-credit-card"></i>
                {{ $t('contact.paymentBtn') }}
              </router-link>
            </div>
          </div>

          <!-- Contact Info -->
          <div class="lg:col-span-2 space-y-8">
            <div v-for="item in contactItems" :key="item.title" class="text-center lg:text-left">
              <div class="flex items-center gap-3 mb-2 justify-center lg:justify-start">
                <div class="w-10 h-10 rounded-full bg-brand-red/20 flex items-center justify-center">
                  <i :class="item.icon" class="text-brand-gold"></i>
                </div>
                <h3 class="font-[var(--font-heading)] text-lg text-white">{{ item.title }}</h3>
              </div>
              <div class="text-white/70 text-sm space-y-1 ml-0 lg:ml-[52px]" v-html="item.content"></div>
            </div>

            <!-- Social -->
            <div class="text-center lg:text-left">
              <div class="flex items-center gap-3 mb-3 justify-center lg:justify-start">
                <div class="w-10 h-10 rounded-full bg-brand-red/20 flex items-center justify-center">
                  <i class="fa-solid fa-thumbs-up text-brand-gold"></i>
                </div>
                <h3 class="font-[var(--font-heading)] text-lg text-white">{{ $t('contact.conectese') }}</h3>
              </div>
              <div class="flex gap-4 ml-0 lg:ml-[52px]">
                <a href="https://wa.me/15049106508" target="_blank" rel="noopener" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
                  <i class="fa-brands fa-whatsapp"></i>
                </a>
                <a href="https://www.instagram.com/juancamposlaw/" target="_blank" rel="noopener" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
                  <i class="fa-brands fa-instagram"></i>
                </a>
                <a href="https://www.facebook.com/Camposmunoslaw" target="_blank" rel="noopener" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
                  <i class="fa-brands fa-facebook-f"></i>
                </a>
                <a href="https://www.youtube.com/@camposmunoslaw6542" target="_blank" rel="noopener" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
                  <i class="fa-brands fa-youtube"></i>
                </a>
                <a href="https://www.tiktok.com/@elabogadohispano" target="_blank" rel="noopener" class="text-white/50 hover:text-brand-gold transition-colors text-xl">
                  <i class="fa-brands fa-tiktok"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Map -->
    <section class="h-[400px] bg-brand-gray">
      <iframe
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3457.0!2d-90.0715!3d29.9511!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8620a67b1f0b7d2f%3A0x4b7a8c8b3b8b8b8b!2s812%20Gravier%20St%2C%20New%20Orleans%2C%20LA%2070112!5e0!3m2!1ses!2sus!4v1700000000000"
        class="w-full h-full border-0"
        allowfullscreen
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        title="Campos Munos Law Office Location">
      </iframe>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  consultationType: '',
  countryCode: '+1',
  phone: '',
  message: '',
})
const submitted = ref(false)

const contactItems = computed(() => [
  {
    icon: 'fa-solid fa-location-dot',
    title: t('contact.direccion'),
    content: '<p>812 Gravier Street, Office 330</p><p>New Orleans, LA 70112</p><p class="text-white/40 text-xs mt-1">PO Box 6224, Metairie, LA 70009</p>',
  },
  {
    icon: 'fa-solid fa-phone',
    title: t('contact.telefono'),
    content: '<a href="tel:+15049106508" class="hover:text-[var(--color-brand-gold)] transition-colors">+1 (504) 910-6508</a>',
  },
  {
    icon: 'fa-solid fa-envelope',
    title: t('contact.correo'),
    content: '<a href="mailto:office@camulaw.com" class="hover:text-[var(--color-brand-gold)] transition-colors">office@camulaw.com</a>',
  },
  {
    icon: 'fa-solid fa-clock',
    title: t('contact.horario'),
    content: `<p>${t('contact.lunesViernes')}: ${t('contact.horarioSemana')}</p><p>${t('contact.sabadoDomingo')}: ${t('contact.conCita')}</p>`,
  },
])

function submitForm() {
  submitted.value = true
  form.value = { firstName: '', lastName: '', email: '', consultationType: '', countryCode: '+1', phone: '', message: '' }
  setTimeout(() => { submitted.value = false }, 5000)
}
</script>

<style scoped>
.form-label {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.375rem;
  text-transform: uppercase;
}
.form-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.5rem;
  color: white;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  transition: border-color 0.2s;
}
.form-input:focus {
  outline: none;
  border-color: var(--color-brand-gold);
}
.form-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}
</style>
