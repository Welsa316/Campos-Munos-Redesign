<template>
  <!-- Start an automation test from the portal, and choose how tests run.
       The right-hand column is the test's whole plan before it starts: what
       happens when, and for each step whether anything really leaves. -->
  <section class="bg-white rounded-xl ring-1 ring-gray-200 overflow-hidden" aria-labelledby="ta-start">
    <header class="px-4 sm:px-5 py-4 border-b border-gray-100">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="ta-start" class="text-sm font-semibold text-gray-900">Automation test</h3>
        <TestModeBadge />
      </div>
      <p class="text-xs text-gray-500 mt-1 max-w-3xl">
        Rehearse what the portal would do for a new website lead: the acknowledgment, the follow-ups, the escalation and the status changes.
        It runs on a test form only. No lead is made or changed, nobody at the firm is notified, and the automations themselves stay switched off.
        Anything real goes only to the email and phone you type here.
      </p>
    </header>

    <p v-if="!overview.on" role="status" class="m-4 text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-4 py-3">
      Test automation is switched off on this server, so a test cannot be started here.
    </p>

    <div v-else class="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form class="px-4 sm:px-5 py-4 space-y-4" novalidate @submit.prevent="submit()">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-xs font-semibold text-gray-700">First name
            <input v-model.trim="form.firstName" type="text" autocomplete="off" maxlength="80" class="fld mt-1 w-full font-normal" />
          </label>
          <label class="block text-xs font-semibold text-gray-700">Email for the test
            <input v-model.trim="form.email" type="email" autocomplete="off" inputmode="email" spellcheck="false" class="fld mt-1 w-full font-normal" :aria-describedby="uid + '-email'" />
          </label>
          <label class="block text-xs font-semibold text-gray-700">Phone <span class="font-normal text-gray-500">(optional)</span>
            <input v-model.trim="form.phone" type="tel" autocomplete="off" maxlength="30" class="fld mt-1 w-full font-normal tabular-nums" />
          </label>
          <label class="block text-xs font-semibold text-gray-700">Website language of the form
            <select v-model="form.language" class="fld mt-1 w-full font-normal">
              <option value="es">Spanish</option>
              <option value="en">English</option>
              <option value="">Not known (bilingual messages)</option>
            </select>
          </label>
        </div>
        <p :id="uid + '-email'" class="text-[11px] text-gray-500 -mt-2">
          Use an address and a phone of your own. They are the only places a real email or text from this test can go.
        </p>

        <fieldset class="space-y-2">
          <legend class="text-xs font-semibold text-gray-700">Timing</legend>
          <label v-for="t in timings" :key="t.value" class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.timing" type="radio" name="ta-timing" :value="t.value" class="mt-0.5 border-gray-300" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">{{ t.label }}</span><span class="block text-gray-500">{{ t.hint }}</span></span>
          </label>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-xs font-semibold text-gray-700">In this test</legend>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.sendEmail" type="checkbox" class="mt-0.5 rounded border-gray-300" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">Really email the acknowledgment</span>
              <span class="block text-gray-500">{{ emailHint }}</span></span>
          </label>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.smsConsent" type="checkbox" class="mt-0.5 rounded border-gray-300" />
            <span><span class="font-semibold text-gray-900">The person agreed to text messages on the form</span>
              <span class="block text-gray-500">Without it the texts are skipped, as they would be for a lead.</span></span>
          </label>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0" :class="{ 'opacity-60': !canText }">
            <input v-model="form.sendSms" type="checkbox" class="mt-0.5 rounded border-gray-300" :disabled="!canText" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">Really text the messages</span>
              <span class="block text-gray-500">{{ smsHint }}</span></span>
          </label>
          <label class="flex items-start gap-2.5 text-xs text-gray-700 min-h-11 sm:min-h-0">
            <input v-model="form.notifyMe" type="checkbox" class="mt-0.5 rounded border-gray-300" @change="savePrefs" />
            <span><span class="font-semibold text-gray-900">Show me the escalation notice</span>
              <span class="block text-gray-500">A notification to your account only, marked TEST. Nobody else is ever notified.</span></span>
          </label>
        </fieldset>

        <p v-if="error" role="alert" class="text-sm text-brand-red bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
        <ConfirmInline v-if="askKnown" tone="navy" :title="askKnown" body="Only continue if it is your own. Every message is marked as a test."
          confirm-label="It is mine, send the test" :busy="starting" @confirm="submit(true)" @cancel="askKnown = ''" />

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" :disabled="starting"
            class="inline-flex items-center gap-2 px-4 py-2 min-h-11 sm:min-h-0 rounded-lg bg-brand-navy hover:bg-brand-navy-dark text-white text-sm font-semibold transition-colors disabled:opacity-50">
            <FaIcon :name="starting ? 'spinner' : 'play'" :spin="starting" class="text-xs" />Start the test
          </button>
          <p class="text-[11px] text-gray-500">It opens below, where you can watch each step and press what the “client” does.</p>
        </div>

        <label class="flex items-start gap-2.5 text-xs text-gray-700 pt-3 border-t border-gray-100 min-h-11 sm:min-h-0">
          <input v-model="form.autoStart" type="checkbox" class="mt-0.5 rounded border-gray-300" @change="savePrefs" />
          <span><span class="font-semibold text-gray-900">Also start one for each test form I send from the website</span>
            <span class="block text-gray-500">With the timing and choices above, the moment the form arrives. {{ prefsNote }}</span></span>
        </label>
      </form>

      <!-- The plan -->
      <aside class="px-4 sm:px-5 py-4 bg-brand-surface border-t border-gray-100 lg:border-t-0 lg:border-l" aria-labelledby="ta-plan">
        <h4 id="ta-plan" class="text-xs font-semibold text-gray-900">What this test will do</h4>
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
          The wording is the firm’s own, from Automation settings. A reply, a booking or a changed status stops what is left, exactly as it would for a lead.
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

const props = defineProps({
  // GET /api/test-channel/automation
  overview: { type: Object, required: true },
})
const emit = defineEmits(['started', 'options'])

const { post, put } = useApi()
const uid = useId()

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
  { value: 'accelerated', label: 'Accelerated', hint: `One step about every ${props.overview.acceleratedStepSeconds === 60 ? 'minute' : `${props.overview.acceleratedStepSeconds} seconds`}, so the whole sequence takes a few minutes.` },
  { value: 'production', label: 'Real timing', hint: 'The days and office hours a real lead arriving now would get. Use “Run the next step now” to move it along.' },
])

const emailHint = computed(() => {
  if (!form.sendEmail) return 'Off: the email is shown on this page and nothing leaves the portal.'
  if (!props.overview.email?.configured) return 'Email is not set up on this server, so it will be shown here instead of sent.'
  return 'To the address above only, with [TEST] in the subject and a test notice at the top. A reply comes to you, not to the office.'
})

// A real text needs a phone to send to and the agreement a lead would need.
const canText = computed(() => Boolean(form.phone) && (form.smsConsent || !props.overview.textConsentRequired))
const smsHint = computed(() => {
  if (!form.phone) return 'Add a phone number above first.'
  if (!canText.value) return 'Tick the agreement to texts above first: without it no text goes out, here or for a lead.'
  if (!form.sendSms) return 'Off: each text is shown on this page and nothing is sent.'
  if (!props.overview.sms?.configured) return 'RingCentral is not set up on this server, so the texts will be shown here instead of sent.'
  return 'To the phone above only, from the firm’s RingCentral number, each starting [TEST]. They also show in RingCentral’s own message history.'
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
      type: s.type, icon: stepIcon(s.type), label: stepLabel(s.type), when: offsetText(s.dueAt, from, form.timing), real,
      what: skippedText ? 'skipped: no agreement to texts'
        : noTexts && s.type === 'no_response' ? 'skipped: it needs every follow-up to have gone'
          : stepPlan(s.type, { sendEmail: real, sendSms: realText, notifyMe: form.notifyMe }),
    }
  })
})

async function savePrefs() {
  prefsNote.value = ''
  try {
    await put('/api/test-channel/automation/prefs', { autoStart: form.autoStart, timing: form.timing, sendEmail: form.sendEmail, sendSms: form.sendSms, notifyMe: form.notifyMe })
    prefsNote.value = 'Saved.'
  } catch (err) {
    prefsNote.value = `Could not save this: ${err.message}`
  }
}

async function submit(confirmKnown = false) {
  error.value = ''
  if (!confirmKnown) askKnown.value = ''
  if (!form.firstName) { error.value = 'Add a first name: the messages greet the person by it.'; return }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { error.value = 'Add the email address the test should use.'; return }
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
    else error.value = `Could not start the test: ${err.message}`
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
