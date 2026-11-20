<template>
  <!-- What an administrator can change about the automation without a deploy
       (GET/PUT /api/automation/settings): the words, the timing, the vendor
       rules, the booking link. One part open at a time; each saves on its
       own and says so beside its button. -->
  <section class="bg-white rounded-xl ring-1 ring-gray-200" aria-labelledby="set-h">
    <header class="px-5 py-4 border-b border-gray-100">
      <h2 id="set-h" class="text-sm font-ui font-semibold text-gray-900">{{ t('set.title') }}</h2>
      <p class="text-[11px] text-gray-500 mt-0.5">{{ t('set.about') }}</p>
    </header>

    <p v-if="loadError" role="alert" class="px-5 py-4 text-[13px] text-brand-red">{{ loadError }}</p>
    <div v-else-if="!s" class="px-5 py-6 text-[13px] text-gray-500" aria-busy="true">{{ t('loading') }}</div>

    <div v-else class="divide-y divide-gray-100">
      <div v-for="p in PARTS" :key="p.key">
        <h3 class="font-ui">
          <button type="button" @click="open = open === p.key ? '' : p.key" :aria-expanded="open === p.key" :aria-controls="`set-${p.key}`"
            class="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-brand-surface transition-colors">
            <span class="min-w-0">
              <span class="block text-[13px] font-semibold text-gray-900">{{ t(`set.part.${p.key}`) }}</span>
              <span class="block text-xs text-gray-600 mt-0.5">{{ t(`set.part.${p.key}.about`) }}</span>
            </span>
            <FaIcon :name="open === p.key ? 'chevron-up' : 'chevron-down'" class="text-[10px] text-gray-400 flex-shrink-0" />
          </button>
        </h3>

        <div v-if="open === p.key" :id="`set-${p.key}`" class="px-5 pb-5 pt-1 space-y-4 text-[13px]">
          <!-- The words -->
          <template v-if="p.key === 'templates'">
            <p class="text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
              {{ t('tpl.drafts') }}
            </p>
            <div class="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-end">
              <div>
                <label for="tpl-key" class="lbl">{{ t('tpl.message') }}</label>
                <select id="tpl-key" v-model="tplKey" class="fld w-full">
                  <option v-for="(tp, key) in s.templates" :key="key" :value="key">{{ tp.label }}</option>
                </select>
              </div>
              <div role="tablist" :aria-label="t('tpl.language')" class="flex flex-wrap gap-1.5">
                <button v-for="l in LANGS" :key="l.key" type="button" role="tab" :aria-selected="tplLang === l.key" @click="tplLang = l.key"
                  :class="tplLang === l.key ? 'bg-brand-navy text-white' : 'text-gray-700 ring-1 ring-gray-300 hover:bg-brand-surface'"
                  class="min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">{{ t(`set.lang.${l.key}`) }}</button>
              </div>
            </div>
            <div v-if="tpl.channel === 'email'">
              <label for="tpl-subject" class="lbl">{{ t('tpl.subject') }}</label>
              <input id="tpl-subject" v-model="tpl.languages[tplLang].subject" type="text" maxlength="120" class="fld w-full" />
            </div>
            <div>
              <label for="tpl-body" class="lbl">{{ t(tpl.channel === 'sms' ? 'tpl.text' : 'tpl.email') }}</label>
              <textarea id="tpl-body" v-model="tpl.languages[tplLang].body" :rows="tpl.channel === 'sms' ? 5 : 12" class="fld w-full"></textarea>
              <p class="mt-1 text-xs text-gray-600">
                <template v-if="tpl.channel === 'sms'"><span :class="{ 'text-brand-red font-semibold': tpl.languages[tplLang].body.length > smsMax }" class="tabular-nums">{{ t('tpl.chars', { count: tpl.languages[tplLang].body.length, max: smsMax }) }}</span> {{ t('tpl.stop') }} </template>
                {{ t('tpl.can_use') }} <code v-for="v in variables" :key="v" class="mx-0.5 px-1 rounded bg-gray-100 text-gray-800">{{ braces(v) }}</code>{{ t('tpl.link_note') }}
              </p>
            </div>
            <SaveRow :state="state.templates" :busy="busy" @save="save('templates', s.templates)" />
          </template>

          <!-- When -->
          <template v-else-if="p.key === 'timing'">
            <fieldset class="space-y-2">
              <legend class="lbl">{{ t('fu.legend') }}</legend>
              <p v-for="(st, i) in s.followup.steps" :key="st.key" class="flex flex-wrap items-center gap-2">
                <label :for="`fu-${st.key}`">{{ t('fu.step', { n: i + 1 }) }}</label>
                <input :id="`fu-${st.key}`" v-model.number="st.afterBusinessDays" type="number" min="1" max="30" class="num" />
                <span>{{ t('fu.business_days', { count: st.afterBusinessDays }) }}</span>
              </p>
              <p class="flex flex-wrap items-center gap-2">
                <label for="fu-nr">{{ t('fu.no_response') }}</label>
                <input id="fu-nr" v-model.number="s.followup.noResponseAfterBusinessDays" type="number" min="1" max="60" class="num" />
                <span>{{ t('fu.no_response_after') }}</span>
              </p>
              <p class="text-xs text-gray-600">{{ t('fu.text_only') }}</p>
              <SaveRow :state="state.followup" :busy="busy" @save="save('followup', s.followup)" />
            </fieldset>

            <fieldset class="space-y-2 pt-3 border-t border-gray-100">
              <legend class="lbl pt-3">{{ t('sla.legend') }}</legend>
              <div class="grid gap-x-6 gap-y-2 md:grid-cols-2">
                <p class="flex flex-wrap items-center gap-2"><label for="sla-1">{{ t('sla.lead_first') }}</label><input id="sla-1" v-model.number="s.sla.newLeadMinutes" type="number" min="15" class="num" /><span>{{ t('sla.min') }}</span></p>
                <p class="flex flex-wrap items-center gap-2"><label for="sla-2">{{ t('sla.again') }}</label><input id="sla-2" v-model.number="s.sla.newLeadSecondMinutes" type="number" min="15" class="num" /><span>{{ t('sla.min') }}</span></p>
                <p class="flex flex-wrap items-center gap-2"><label for="sla-3">{{ t('sla.call_first') }}</label><input id="sla-3" v-model.number="s.sla.missedCallMinutes" type="number" min="15" class="num" /><span>{{ t('sla.min') }}</span></p>
                <p class="flex flex-wrap items-center gap-2"><label for="sla-4">{{ t('sla.again') }}</label><input id="sla-4" v-model.number="s.sla.missedCallSecondMinutes" type="number" min="15" class="num" /><span>{{ t('sla.min') }}</span></p>
              </div>
              <div class="max-w-md">
                <label for="sla-email" class="lbl">{{ t('sla.email') }}</label>
                <input id="sla-email" v-model.trim="s.sla.secondLevelEmail" type="email" class="fld w-full" :placeholder="t('sla.email_placeholder')" />
              </div>
              <SaveRow :state="state.sla" :busy="busy" @save="save('sla', s.sla)" />
            </fieldset>

            <fieldset class="space-y-2 pt-3 border-t border-gray-100">
              <legend class="lbl pt-3">{{ t('tx.legend') }}</legend>
              <p class="flex flex-wrap items-center gap-2">
                <label for="tx-start">{{ t('tx.from') }}</label><input id="tx-start" v-model="s.texting.start" type="time" class="fld w-32" />
                <label for="tx-end">{{ t('tx.to') }}</label><input id="tx-end" v-model="s.texting.end" type="time" class="fld w-32" />
                <label for="tx-rate">{{ t('tx.at_most') }}</label><input id="tx-rate" v-model.number="s.texting.perMinute" type="number" min="1" max="30" class="num" /><span>{{ t('tx.per_minute') }}</span>
              </p>
              <DayPicker v-model="s.texting.days" name="tx" />
              <SaveRow :state="state.texting" :busy="busy" @save="save('texting', s.texting)" />
            </fieldset>

            <fieldset class="space-y-2 pt-3 border-t border-gray-100">
              <legend class="lbl pt-3">{{ t('ack.legend') }}</legend>
              <label class="flex items-start gap-2"><input v-model="s.ack.smsRequiresFormConsent" type="checkbox" class="mt-0.5 rounded border-gray-300" /><span>{{ t('ack.consent') }}</span></label>
              <label class="flex items-start gap-2"><input v-model="s.ack.smsOutsideHours" type="checkbox" class="mt-0.5 rounded border-gray-300" /><span>{{ t('ack.any_hour') }}</span></label>
              <p class="flex flex-wrap items-center gap-2"><label for="ack-age">{{ t('ack.max_age') }}</label><input id="ack-age" v-model.number="s.ack.maxAgeHours" type="number" min="1" max="72" class="num" /><span>{{ t('ack.hours') }}</span></p>
              <SaveRow :state="state.ack" :busy="busy" @save="save('ack', s.ack)" />
              <p class="flex flex-wrap items-center gap-2 pt-2">
                <label for="mc-settle">{{ t('mc.text_after') }}</label><input id="mc-settle" v-model.number="s.missedCall.settleMinutes" type="number" min="1" max="30" class="num" /><span>{{ t('mc.minutes_after') }}</span>
                <label for="mc-cool">{{ t('mc.once_every') }}</label><input id="mc-cool" v-model.number="s.missedCall.cooldownDays" type="number" min="1" max="90" class="num" /><span>{{ t('mc.days') }}</span>
              </p>
              <SaveRow :state="state.missedCall" :busy="busy" @save="save('missedCall', s.missedCall)" />
            </fieldset>
          </template>

          <!-- Booking -->
          <template v-else-if="p.key === 'scheduling'">
            <div>
              <label for="sch-url" class="lbl">{{ t('sch.url') }}</label>
              <input id="sch-url" v-model.trim="s.scheduling.bookingUrl" type="url" class="fld w-full" placeholder="https://calendar.app.google/…" />
              <p class="mt-1 text-xs text-gray-600">{{ t('sch.url_note') }}</p>
            </div>
            <div>
              <label for="sch-cal" class="lbl">{{ t('sch.calendar') }}</label>
              <input id="sch-cal" v-model.trim="s.scheduling.calendarId" type="text" class="fld w-full" placeholder="office@camulaw.com" />
              <p class="mt-1 text-xs text-gray-600">{{ t('sch.calendar_note') }}</p>
            </div>
            <SaveRow :state="state.scheduling" :busy="busy" @save="save('scheduling', s.scheduling)" />
          </template>

          <!-- Vendors -->
          <template v-else-if="p.key === 'spam'">
            <p class="text-xs text-gray-600 leading-relaxed">{{ t('spam.about') }}</p>
            <div class="grid gap-4 md:grid-cols-3">
              <div><label for="sp-senders" class="lbl">{{ t('spam.senders') }}</label><textarea id="sp-senders" v-model="lists.senders" rows="6" class="fld w-full" placeholder="sales@vendor.com"></textarea></div>
              <div><label for="sp-domains" class="lbl">{{ t('spam.domains') }}</label><textarea id="sp-domains" v-model="lists.domains" rows="6" class="fld w-full" placeholder="seo-agency.com"></textarea></div>
              <div><label for="sp-phrases" class="lbl">{{ t('spam.phrases') }}</label><textarea id="sp-phrases" v-model="lists.phrases" rows="6" class="fld w-full" placeholder="boost your google ranking"></textarea></div>
            </div>
            <SaveRow :state="state.spam" :busy="busy" @save="saveSpam">
              <button type="button" @click="applySpam" :disabled="busy" class="min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-brand-surface transition-colors disabled:opacity-50">{{ t('spam.apply') }}</button>
            </SaveRow>
          </template>

          <!-- People and the firm -->
          <template v-else-if="p.key === 'firm'">
            <div class="grid gap-4 md:grid-cols-2">
              <div><label for="fm-name" class="lbl">{{ t('firm.name') }}</label><input id="fm-name" v-model.trim="s.firm.name" type="text" maxlength="80" class="fld w-full" /></div>
              <div><label for="fm-phone" class="lbl">{{ t('firm.phone') }}</label><input id="fm-phone" v-model.trim="s.firm.phone" type="text" maxlength="25" class="fld w-full" /></div>
            </div>
            <SaveRow :state="state.firm" :busy="busy" @save="save('firm', s.firm)" />
            <fieldset class="space-y-2 pt-3 border-t border-gray-100">
              <legend class="lbl pt-3">{{ t('hours.legend') }}</legend>
              <p class="flex flex-wrap items-center gap-2">
                <label for="oh-start">{{ t('hours.open') }}</label><input id="oh-start" v-model="s.hours.start" type="time" class="fld w-32" />
                <label for="oh-end">{{ t('hours.to') }}</label><input id="oh-end" v-model="s.hours.end" type="time" class="fld w-32" />
              </p>
              <DayPicker v-model="s.hours.days" name="oh" />
              <SaveRow :state="state.hours" :busy="busy" @save="save('hours', s.hours)" />
            </fieldset>
            <fieldset class="space-y-2 pt-3 border-t border-gray-100">
              <legend class="lbl pt-3">{{ t('own.legend') }}</legend>
              <div class="max-w-md">
                <label for="ow-owner" class="lbl">{{ t('own.label') }}</label>
                <select id="ow-owner" v-model="s.ownership.defaultLeadOwnerId" class="fld w-full">
                  <option :value="null">{{ t('own.front_desk') }}</option>
                  <option v-for="a in people" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </div>
              <SaveRow :state="state.ownership" :busy="busy" @save="save('ownership', s.ownership)" />
              <label class="flex items-start gap-2 pt-2"><input v-model="s.status.contactedOnClientReply" type="checkbox" class="mt-0.5 rounded border-gray-300" /><span>{{ t('st.contacted_on_reply') }}</span></label>
              <p class="flex flex-wrap items-center gap-2">
                <label for="st-secs">{{ t('st.call_secs') }}</label>
                <input id="st-secs" v-model.number="s.status.connectedCallSeconds" type="number" min="0" max="600" class="num" /><span>{{ t('st.call_secs_after') }}</span>
              </p>
              <SaveRow :state="state.status" :busy="busy" @save="save('status', s.status)" />
            </fieldset>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue'
import FaIcon from '../../components/FaIcon.vue'
import { useApi } from '../../composables/useApi.js'
import { loadAssignees } from '../reminders/assignees.js'
import { useT } from '../../i18n/translator.js'
import { AUTOMATION } from '../../i18n/automation.js'

defineProps({ health: { type: Object, default: null } })
// 'saved': something was saved or applied; the page reloads its numbers.
const emit = defineEmits(['saved'])

const { get, put, post } = useApi()
const { t } = useT(AUTOMATION)
const s = ref(null)
const loadError = ref('')
const open = ref('')
const busy = ref(false)
const state = reactive({})
const variables = ref([])
const smsMax = ref(480)
const people = ref([])
const tplKey = ref('lead_ack_email')
const tplLang = ref('es')
const lists = reactive({ senders: '', domains: '', phrases: '' })

// Each part's title and line are set.part.<key> and set.part.<key>.about (i18n/automation.js).
const PARTS = [{ key: 'templates' }, { key: 'timing' }, { key: 'scheduling' }, { key: 'spam' }, { key: 'firm' }]
const LANGS = [{ key: 'es' }, { key: 'en' }, { key: 'bi' }]
const braces = (v) => `{{${v}}}`
const tpl = computed(() => s.value.templates[tplKey.value])
const lines = (text) => String(text || '').split('\n').map((x) => x.trim()).filter(Boolean)

async function load() {
  try {
    const r = await get('/api/automation/settings')
    s.value = r.settings
    variables.value = r.templateVariables || []
    smsMax.value = r.smsMax || 480
    for (const k of ['senders', 'domains', 'phrases']) lists[k] = (r.settings.spam[k] || []).join('\n')
  } catch (e) {
    loadError.value = e.message
  }
  try { people.value = (await loadAssignees('submission')).accounts } catch { /* the select still offers the front desk */ }
}

async function save(section, value, after) {
  busy.value = true
  state[section] = { ok: true, text: t('set.saving') }
  try {
    const r = await put(`/api/automation/settings/${section}`, value)
    s.value[section] = r.value
    state[section] = { ok: true, text: t('set.saved') }
    await after?.()
    emit('saved', '')
  } catch (e) {
    state[section] = { ok: false, text: t('set.not_saved', { error: e.message }) }
  } finally {
    busy.value = false
  }
}
const saveSpam = () => save('spam', { senders: lines(lists.senders), domains: lines(lists.domains), phrases: lines(lists.phrases) })
async function applySpam() {
  busy.value = true
  try {
    const r = await post('/api/automation/spam/apply', {})
    state.spam = { ok: true, text: t('set.spam_done', { spam: r.spam, possible: r.possible }) }
    emit('saved', '')
  } catch (e) {
    state.spam = { ok: false, text: t('set.spam_failed', { error: e.message }) }
  } finally {
    busy.value = false
  }
}

// The Save button with what happened beside it.
const SaveRow = (props, { emit: fire, slots }) => h('div', { class: 'flex flex-wrap items-center gap-3 pt-1' }, [
  h('button', {
    type: 'button', disabled: props.busy, onClick: () => fire('save'),
    class: 'min-h-11 sm:min-h-0 px-4 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-semibold hover:bg-brand-navy-dark transition-colors disabled:opacity-50',
  }, t('set.save')),
  slots.default?.(),
  props.state?.text ? h('p', { role: props.state.ok ? 'status' : 'alert', class: `text-xs ${props.state.ok ? 'text-green-700' : 'text-brand-red'}` }, props.state.text) : null,
])
SaveRow.props = ['state', 'busy']
SaveRow.emits = ['save']

// Monday to Sunday as checkboxes over an array of weekday numbers (0 = Sunday).
const DAYS = [1, 2, 3, 4, 5, 6, 0]
const DayPicker = (props, { emit: fire }) => h('p', { class: 'flex flex-wrap gap-x-4 gap-y-1', role: 'group', 'aria-label': t('set.days') }, DAYS.map((n) =>
  h('label', { class: 'inline-flex items-center gap-1.5 min-h-11 sm:min-h-0', key: n }, [
    h('input', {
      type: 'checkbox', class: 'rounded border-gray-300', checked: props.modelValue.includes(n), name: `${props.name}-day`,
      onChange: (e) => fire('update:modelValue', e.target.checked ? [...props.modelValue, n].sort() : props.modelValue.filter((d) => d !== n)),
    }),
    t(`day.${n}`),
  ])))
DayPicker.props = ['modelValue', 'name']
DayPicker.emits = ['update:modelValue']

onMounted(load)
</script>

<style scoped>
.fld {
  padding: 0.4rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-primary);
  font-family: var(--font-ui); font-size: 13px; line-height: 1.5; min-height: 2.75rem; max-width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
@media (min-width: 640px) { .fld { min-height: 2.125rem; } }
.fld:focus { outline: none; border-color: var(--primary-ring); box-shadow: 0 0 0 2px var(--focus-ring); }
textarea.fld { display: block; }
.lbl { display: block; font-size: 11px; font-weight: 600; color: var(--color-gray-700); margin-bottom: 0.25rem; }
.num { width: 4.5rem; padding: 0.375rem 0.5rem; border-radius: 0.375rem; border: 1px solid var(--color-gray-300); background: var(--input-bg, var(--color-white)); color: inherit; font-variant-numeric: tabular-nums; min-height: 2.75rem; }
@media (min-width: 640px) { .num { min-height: 0; } }
.num:focus { outline: 2px solid var(--primary-ring); outline-offset: 1px; }
</style>
