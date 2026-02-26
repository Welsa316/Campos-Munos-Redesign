<template>
  <div>
    <!-- Hero strip -->
    <section class="relative pt-32 pb-20 overflow-hidden">
      <div class="absolute inset-0 bg-brand-muted"></div>
      <div class="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-navy/[0.03] to-transparent pointer-events-none"></div>
      <div class="relative max-w-7xl mx-auto px-6">
        <div class="reveal">
          <p class="font-[var(--font-ui)] text-xs tracking-[0.3em] text-brand-navy uppercase mb-3">{{ $t('contact.subtitleAlt') }}</p>
          <h1 class="font-[var(--font-heading)] text-5xl md:text-7xl font-bold text-white leading-[0.95]">
            {{ $t('contact.title') }}
          </h1>
          <p class="text-white/40 text-lg mt-4 max-w-lg">{{ $t('contact.subtitle') }}</p>
        </div>
      </div>
    </section>

    <!-- Form + Info split layout -->
    <section class="py-20 bg-brand-darker">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <!-- Form - takes 7 cols -->
          <div class="lg:col-span-7 reveal-left">
            <form @submit.prevent="submitForm" class="space-y-6">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div class="form-group">
                  <label class="form-label">{{ $t('contact.firstName') }} <span class="text-brand-red">*</span></label>
                  <input v-model="form.firstName" type="text" required maxlength="100" class="form-input" />
                </div>
                <div class="form-group">
                  <label class="form-label">{{ $t('contact.lastName') }} <span class="text-brand-red">*</span></label>
                  <input v-model="form.lastName" type="text" required maxlength="100" class="form-input" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">{{ $t('contact.email') }} <span class="text-brand-red">*</span></label>
                <input v-model="form.email" type="email" required maxlength="250" class="form-input" />
              </div>

              <div class="form-group">
                <label class="form-label">{{ $t('contact.consultationType') }} <span class="text-brand-red">*</span></label>
                <input v-model="form.consultationType" type="text" required class="form-input" />
              </div>

              <div class="grid grid-cols-4 gap-4">
                <div class="form-group">
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
                <div class="col-span-3 form-group">
                  <label class="form-label">{{ $t('contact.phone') }} <span class="text-brand-red">*</span></label>
                  <input v-model="form.phone" type="tel" required class="form-input" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">{{ $t('contact.message') }}</label>
                <textarea v-model="form.message" rows="4" class="form-input resize-none"></textarea>
              </div>

              <button type="submit"
                class="w-full bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-sm py-4 rounded-xl btn-magnetic">
                {{ $t('contact.submit') }}
                <i class="fa-solid fa-paper-plane ml-2 text-xs"></i>
              </button>

              <transition name="fade">
                <div v-if="submitted" class="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                  <p class="text-green-400 text-sm font-[var(--font-ui)]">
                    <i class="fa-solid fa-check-circle mr-2"></i>{{ $t('contact.successMessage') }}
                  </p>
                </div>
              </transition>
            </form>

            <div class="mt-8">
              <router-link to="/pago"
                class="inline-flex items-center gap-2 text-white/30 hover:text-brand-navy text-sm font-[var(--font-ui)] transition-colors">
                <i class="fa-solid fa-credit-card text-xs"></i>
                {{ $t('contact.paymentBtn') }}
              </router-link>
            </div>
          </div>

          <!-- Info sidebar - takes 5 cols -->
          <div class="lg:col-span-5 reveal-right">
            <div class="sticky top-32 space-y-8">
              <!-- Contact cards -->
              <div v-for="item in contactCards" :key="item.titleKey"
                class="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-brand-navy/15 transition-all duration-300">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-navy/20 transition-colors">
                    <i :class="item.icon" class="text-brand-navy"></i>
                  </div>
                  <div>
                    <h3 class="font-[var(--font-heading)] text-lg text-white mb-1">{{ $t(`contact.${item.titleKey}`) }}</h3>
                    <div class="text-white/50 text-sm space-y-0.5" v-html="item.content"></div>
                  </div>
                </div>
              </div>

              <!-- Social strip -->
              <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <h3 class="font-[var(--font-heading)] text-lg text-white mb-4">{{ $t('contact.conectese') }}</h3>
                <div class="flex gap-3">
                  <a v-for="social in socials" :key="social.label" :href="social.href" target="_blank" rel="noopener"
                    :aria-label="social.label"
                    class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-brand-navy hover:bg-brand-navy/10 transition-all">
                    <i :class="social.icon"></i>
                  </a>
                </div>
              </div>

              <!-- Hours -->
              <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-xl bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-clock text-brand-navy"></i>
                  </div>
                  <div>
                    <h3 class="font-[var(--font-heading)] text-lg text-white mb-2">{{ $t('contact.horario') }}</h3>
                    <div class="text-white/50 text-sm space-y-1">
                      <div class="flex justify-between gap-6">
                        <span>{{ $t('contact.lunesViernes') }}</span>
                        <span class="text-white/70">{{ $t('contact.horarioSemana') }}</span>
                      </div>
                      <div class="flex justify-between gap-6">
                        <span>{{ $t('contact.sabadoDomingo') }}</span>
                        <span class="text-white/70">{{ $t('contact.conCita') }}</span>
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
      <div class="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-brand-darker to-transparent z-10 pointer-events-none"></div>
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

useScrollReveal()
const { t } = useI18n()

const form = ref({ firstName: '', lastName: '', email: '', consultationType: '', countryCode: '+1', phone: '', message: '' })
const submitted = ref(false)

const socials = [
  { icon: 'fa-brands fa-whatsapp', href: 'https://wa.me/15049106508', label: 'WhatsApp' },
  { icon: 'fa-brands fa-instagram', href: 'https://www.instagram.com/juancamposlaw/', label: 'Instagram' },
  { icon: 'fa-brands fa-facebook-f', href: 'https://www.facebook.com/Camposmunoslaw', label: 'Facebook' },
  { icon: 'fa-brands fa-youtube', href: 'https://www.youtube.com/@camposmunoslaw6542', label: 'YouTube' },
  { icon: 'fa-brands fa-tiktok', href: 'https://www.tiktok.com/@elabogadohispano', label: 'TikTok' },
]

const contactCards = computed(() => [
  { titleKey: 'direccion', icon: 'fa-solid fa-location-dot', content: '<p>812 Gravier Street, Office 330</p><p>New Orleans, LA 70112</p><p class="text-white/30 text-xs mt-1">PO Box 6224, Metairie, LA 70009</p>' },
  { titleKey: 'telefono', icon: 'fa-solid fa-phone', content: '<a href="tel:+15049106508" class="hover:text-[var(--color-brand-navy)] transition-colors">+1 (504) 910-6508</a>' },
  { titleKey: 'correo', icon: 'fa-solid fa-envelope', content: '<a href="mailto:office@camulaw.com" class="hover:text-[var(--color-brand-navy)] transition-colors">office@camulaw.com</a>' },
])

function submitForm() {
  submitted.value = true
  form.value = { firstName: '', lastName: '', email: '', consultationType: '', countryCode: '+1', phone: '', message: '' }
  setTimeout(() => { submitted.value = false }, 5000)
}
</script>

<style scoped>
.form-group { display: flex; flex-direction: column; }
.form-label {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.4);
  margin-bottom: 0.5rem;
}
.form-input {
  width: 100%;
  padding: 0.875rem 1.25rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.75rem;
  color: white;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  transition: all 0.3s;
}
.form-input:focus {
  outline: none;
  border-color: var(--color-brand-navy);
  box-shadow: 0 0 0 3px rgba(0, 63, 141, 0.1);
  background: rgba(255,255,255,0.05);
}
.form-input::placeholder { color: rgba(255,255,255,0.2); }
.fade-enter-active { transition: all 0.4s ease; }
.fade-leave-active { transition: all 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(8px); }
</style>
