<template>
  <!-- Start an automation test from the portal, and choose how tests run.
       The right-hand column is the test's whole plan before it starts: what
       happens when, and for each step whether anything really leaves. -->
  <section class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" aria-labelledby="ta-start">
    <header class="px-4 sm:px-5 py-4 border-b border-gray-100">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="ta-start" class="text-sm font-semibold text-gray-900">{{ t('start.title') }}</h3>
        <TestModeBadge />
      </div>
      <p class="text-xs text-gray-500 mt-1 max-w-3xl">
        {{ t('start.about1') }}
        {{ t('start.about2') }}
        {{ t('start.about3') }}
      </p>
    </header>

    <p v-if="!overview.on" role="status" class="m-4 text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-4 py-3">
      {{ t('start.off') }}
    </p>

    <div v-else class="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form class="px-4 sm:px-5 py-4 space-y-4" novalidate @submit.prevent="submit()">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-xs font-semibold text-gray-700">{{ t('start.first_name') }}
            <input v-model.trim="form.firstName" type="text" autocomplete="off" maxlength="80" class="fld mt-1 w-full font-normal" />
          </label>
          <label class="block text-xs font-semibold text-gray-700">{{ t('start.email') }}
            <input v-model.trim="form.email" type="email" autocomplete="off" inputmode="email" spellcheck="false" class="fld mt-1 w-full font-normal" :aria-describedby="uid + '-email'" />
          </label>
          <label class="block text-xs font-semibold text-gray-700">{{ t('start.phone') }} <span class="font-normal text-gray-500">{{ t('start.optional') }}</span>
            <input v-model.trim="form.phone" type="tel" autocomplete="off" maxlength="30" class="fld mt-1 w-full font-normal tabular-nums" />
          </label>
          <label class="block text-xs font-semibold text-gray-700">{{ t('start.language') }}
            <select v-model="form.language" class="fld mt-1 w-full font-normal">
              <option value="es">{{ t('start.lang.es') }}</option>
              <option value="en">{{ t('start.lang.en') }}</option>
              <option value="">{{ t('start.lang.none') }}</option>
            </select>
          </label>
        </div>
        <p :id="uid + '-email'" class="text-[11px] text-gray-500 -mt-2">
          {{ t('start.own_note') }}
        </p>

        <fieldset class="space-y-2">
          <legend class="text-xs font-semibold text-gray-700">{{ t('start.timing') }}</legend>
          <label v-for="t in timings" :key="t.value" class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.timing" type="radio" name="ta-timing" :value="t.value" class="mt-0.5 border-gray-300" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">{{ t.label }}</span><span class="block text-gray-500">{{ t.hint }}</span></span>
          </label>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-xs font-semibold text-gray-700">{{ t('start.in_test') }}</legend>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.sendEmail" type="checkbox" class="mt-0.5 rounded border-gray-300" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">{{ t('start.send_email') }}</span>
              <span class="block text-gray-500">{{ emailHint }}</span></span>
          </label>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.smsConsent" type="checkbox" class="mt-0.5 rounded border-gray-300" />
            <span><span class="font-semibold text-gray-900">{{ t('start.consent') }}</span>
              <span class="block text-gray-500">{{ t('start.consent_hint') }}</span></span>
          </label>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0" :class="{ 'opacity-60': !canText }">
            <input v-model="form.sendSms" type="checkbox" class="mt-0.5 rounded border-gray-300" :disabled="!canText" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">{{ t('start.send_sms') }}</span>
              <span class="block text-gray-500">{{ smsHint }}</span></span>
          </label>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.notifyMe" type="checkbox" class="mt-0.5 rounded border-gray-300" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">{{ t('start.notify') }}</span>
              <span class="block text-gray-500">{{ t('start.notify_hint') }}</span></span>
          </label>
        </fieldset>

        <p v-if="error" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
        <ConfirmInline v-if="askKnown" tone="navy" :title="askKnown" :body="t('start.confirm_body')"
          :confirm-label="t('start.confirm')" :busy="starting" @confirm="submit(true)" @cancel="askKnown = ''" />

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" :disabled="starting"
            class="inline-flex items-center gap-2 px-4 py-2 min-h-11 sm:min-h-0 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
            <FaIcon :name="starting ? 'spinner' : 'play'" :spin="starting" class="text-xs" />{{ t('start.start') }}
          </button>
          <p class="text-[11px] text-gray-500">{{ t('start.opens_below') }}</p>
        </div>

        <label class="flex items-start gap-2.5 text-xs text-gray-700 pt-3 border-t border-gray-100 min-h-11 sm:min-h-0">
          <input v-model="form.autoStart" type="checkbox" class="mt-0.5 rounded border-gray-300" @change="savePrefs" />
          <span><span class="font-semibold text-gray-900">{{ t('start.auto') }}</span>
            <span class="block text-gray-500">{{ t('start.auto_hint') }} {{ prefsNote }}</span></span>
        </label>
      </form>

      <!-- The plan -->
      <aside class="px-4 sm:px-5 py-4 bg-brand-surface border-t border-gray-100 lg:border-t-0 lg:border-l" aria-labelledby="ta-plan">
        <h4 id="ta-plan" class="text-xs font-semibold text-gray-900">{{ t('start.plan') }}</h4>
        <ol class="mt-3 space-y-2.5">
          <li v-for="s in plan" :key="s.type" class="flex gap-2.5 text-xs">
            <FaIcon :name="s.icon" class="mt-0.5 w-3.5 shrink-0 text-gray-500 text-[11px]" />
            <span class="min-w-0">
              <span class="font-semibold text-gray-900">{{ s.label }}</span>
              <span class="text-gray-600 tabular-nums"> · {{ s.when }}</span>
              <span class="block" :class="s.real ? 'text-green-700 font-semibold' : 'text-gray-500'">{{ s.what }}</span>
            </span>
          </li>
        </ol>
        <p class="mt-4 text-[11px] text-gray-500">
          {{ t('start.plan_note') }}
        </p>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed, watch, useId } from 'vue'
import { useApi } from '../../composables/useApi.js'
import FaIcon from '../../components/FaIcon.vue'
import ConfirmInline from '../../components/ConfirmInline.vue'
import TestModeBadge from './TestModeBadge.vue'
import { stepLabel, stepIcon, stepPlan, offsetText, isText } from './testAutomationText.js'
import { useT } from '../../i18n/translator.js'
import { TEST_CHANNEL } from '../../i18n/testChannel.js'

const props = defineProps({
  // GET /api/test-channel/automation
  overview: { type: Object, required: true },
})
const emit = defineEmits(['started', 'options'])

const { post, put } = useApi()
const uid = useId()
const { t, lang } = useT(TEST_CHANNEL)

const form = reactive({ firstName: '', email: '', phone: '', language: 'es', smsConsent: true, timing: 'accelerated', sendEmail: true, sendSms: false, notifyMe: false, autoStart: false })
const starting = ref(false)
const error = ref('')
const askKnown = ref('')
const prefsNote = ref('')

// The saved choices, once; after that the form is the truth.
let seeded = false
watch(() => props.overview.prefs, (p) => {
  if (!p || seeded) return
  seeded = true
  Object.assign(form, { timing: p.timing, sendEmail: p.sendEmail, sendSms: Boolean(p.sendSms), notifyMe: p.notifyMe, autoStart: p.autoStart })
}, { immediate: true })

// What a test started from a received form uses too.
watch(() => [form.timing, form.sendEmail, form.sendSms, form.notifyMe], () => emit('options', { timing: form.timing, sendEmail: form.sendEmail, sendSms: form.sendSms, notifyMe: form.notifyMe }), { immediate: true })

const timings = computed(() => [
  { value: 'accelerated', label: t('start.accelerated'), hint: t('start.accelerated_hint', { every: props.overview.acceleratedStepSeconds === 60 ? t('start.minute') : t('start.seconds', { count: props.overview.acceleratedStepSeconds }) }) },
  { value: 'production', label: t('start.real'), hint: t('start.real_hint') },
])

const emailHint = computed(() => {
  if (!form.sendEmail) return t('email.off')
  if (!props.overview.email?.configured) return t('email.not_configured')
  return t('email.on')
})

// A real text needs a phone to send to and the agreement a lead would need.
const canText = computed(() => Boolean(form.phone) && (form.smsConsent || !props.overview.textConsentRequired))
const smsHint = computed(() => {
  if (!form.phone) return t('sms.no_phone')
  if (!canText.value) return t('sms.no_consent')
  if (!form.sendSms) return t('sms.off')
  if (!props.overview.sms?.configured) return t('sms.not_configured')
  return t('sms.on')
})

const plan = computed(() => {
  const steps = props.overview.schedules?.[form.timing] || []
  const from = props.overview.schedules?.now
  const noTexts = props.overview.textConsentRequired && !form.smsConsent
  return steps.map((s) => {
    const skippedText = noTexts && isText(s.type)
    const realText = isText(s.type) && form.sendSms && canText.value && Boolean(props.overview.sms?.configured)
    const real = realText || (s.type === 'ack_email' && form.sendEmail && Boolean(props.overview.email?.configured))
    return {
      type: s.type, icon: stepIcon(s.type), label: stepLabel(s.type, lang.value), when: offsetText(s.dueAt, from, form.timing, lang.value), real,
      what: skippedText ? t('plan.skipped_text')
        : noTexts && s.type === 'no_response' ? t('plan.skipped_no_response')
          : stepPlan(s.type, { sendEmail: real, sendSms: realText, notifyMe: form.notifyMe }, lang.value),
    }
  })
})

async function savePrefs() {
  prefsNote.value = ''
  try {
    await put('/api/test-channel/automation/prefs', { autoStart: form.autoStart, timing: form.timing, sendEmail: form.sendEmail, sendSms: form.sendSms, notifyMe: form.notifyMe })
    prefsNote.value = t('prefs.saved')
  } catch (err) {
    prefsNote.value = t('prefs.failed', { error: err.message })
  }
}

async function submit(confirmKnown = false) {
  error.value = ''
  if (!confirmKnown) askKnown.value = ''
  if (!form.firstName) { error.value = t('need.first_name'); return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { error.value = t('need.email'); return }
  starting.value = true
  try {
    const r = await post('/api/test-channel/automation/tests', {
      firstName: form.firstName, email: form.email, phone: form.phone, language: form.language || null, smsConsent: form.smsConsent,
      timing: form.timing, sendEmail: form.sendEmail, sendSms: form.sendSms && canText.value, notifyMe: form.notifyMe, confirmKnown,
    })
    askKnown.value = ''
    emit('started', r.id)
  } catch (err) {
    if (err.code === 'address_on_a_lead') askKnown.value = err.message
    else error.value = t('error.start', { error: err.message })
  } finally {
    starting.value = false
  }
}
</script>

<style scoped>
.fld {
  padding: 0.4rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary);
  font-family: var(--font-ui); font-size: 13px; line-height: 1.5; min-height: 2.75rem; max-width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
@media (min-width: 640px) { .fld { min-height: 2.25rem; } }
.fld:focus { outline: none; border-color: var(--primary-ring); box-shadow: 0 0 0 2px var(--focus-ring); }
</style>
