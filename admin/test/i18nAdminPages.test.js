// The administrator pages in Spanish: Activity, Automation (and a lead's
// automatic follow-up), Integrations, Team, the Test channel and the small
// shared components. Every word has both languages with the same
// placeholders and plural shape, every code an English table names has its
// Spanish, the text helpers read in Spanish when asked, and the pages format
// dates with the chosen language instead of a fixed 'en-US'.
// The English of the helpers is pinned in automation.test.js and
// testAutomation.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { missingKeys } from '../src/i18n/translator.js'
import { ACTIVITY } from '../src/i18n/activity.js'
import { AUTOMATION, MESSAGE_REASONS_ES, STOP_REASONS_ES, STATUS_REASONS_ES, JOB_LABELS_ES } from '../src/i18n/automation.js'
import { INTEGRATIONS } from '../src/i18n/integrations.js'
import { TEAM } from '../src/i18n/team.js'
import { TEST_CHANNEL, STATUS_LABELS_ES, ACTION_LABELS_ES, NOTIFIED_ES, TEST_REASONS_ES } from '../src/i18n/testChannel.js'
import { COMPONENTS } from '../src/i18n/components.js'
import {
  leadAutomationLines, statusWhy, flagChip, flagWhy, systemEventBits, reasonText, jobLabel,
  MESSAGE_REASONS, STOP_REASONS, STATUS_REASONS, JOB_LABELS,
} from '../src/modules/automation/automationText.js'
import {
  stepLabel, stepPlan, stepState, dueText, offsetText, eventLine, listNote, actionLabel, statusLabel,
  STATUS_LABELS, ACTION_LABELS, NOTIFIED, TEST_REASONS,
} from '../src/modules/testChannel/testAutomationText.js'
import { ACTIONS } from '../../server/testChannel/automation.js'
import { renderVue, textOf } from './support/renderVue.js'
import { usePortalLang } from '../src/composables/usePortalLang.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const DICTS = { ACTIVITY, AUTOMATION, INTEGRATIONS, TEAM, TEST_CHANNEL, COMPONENTS }
const holes = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort()

for (const [name, dict] of Object.entries(DICTS)) {
  test(`${name}: every key in both languages, same shape and placeholders`, () => {
    assert.deepEqual(missingKeys(dict), { inEs: [], inEn: [] })
    for (const k of Object.keys(dict.en)) {
      const en = dict.en[k]
      const es = dict.es[k]
      assert.equal(typeof es, typeof en, `${k}: plural in one language only`)
      if (typeof en === 'object') assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort(), `${k}: plural forms differ`)
      assert.deepEqual(holes(es), holes(en), `${k}: placeholders differ`)
      assert.ok(String(es.other ?? es).trim(), `${k}: empty Spanish`)
    }
  })
}

test('every code an English table names has its Spanish, and no Spanish for a code nobody uses', () => {
  const same = (es, en, name) => assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort(), name)
  same(MESSAGE_REASONS_ES, MESSAGE_REASONS, 'MESSAGE_REASONS')
  same(STOP_REASONS_ES, STOP_REASONS, 'STOP_REASONS')
  same(STATUS_REASONS_ES, STATUS_REASONS, 'STATUS_REASONS')
  same(JOB_LABELS_ES, JOB_LABELS, 'JOB_LABELS')
  same(STATUS_LABELS_ES, STATUS_LABELS, 'STATUS_LABELS')
  same(ACTION_LABELS_ES, ACTION_LABELS, 'ACTION_LABELS')
  same(NOTIFIED_ES, NOTIFIED, 'NOTIFIED')
  // The test's reasons are the automation's plus its own.
  same({ ...MESSAGE_REASONS_ES, ...TEST_REASONS_ES }, TEST_REASONS, 'TEST_REASONS')
  for (const a of ACTIONS) assert.notEqual(actionLabel(a, 'es'), actionLabel(a), `${a} has no Spanish`)
})

const now = new Date('2026-11-09T18:00:00Z').getTime() // Mon noon in New Orleans
const time = /\d{1,2}:\d{2}\s?[ap]\.\s?m\./

test('a lead’s automation reads in Spanish, with "a la 1:30" and "a las 10:31"', () => {
  const lines = leadAutomationLines({
    messages: [
      { channel: 'email', purpose: 'lead_ack', status: 'sent', language: 'es', at: '2026-11-09T16:31:00Z' },
      { channel: 'sms', purpose: 'lead_followup', status: 'unknown', at: '2026-11-09T16:31:00Z' },
    ],
    pending: [{ type: 'lead_followup', at: '2026-11-10T16:30:00Z' }, { type: 'lead_sla', at: '2026-11-09T19:30:00Z' }],
    bookings: [{ status: 'cancelled', startsAt: '2026-11-11T21:00:00Z' }], slaDueAt: '2026-11-09T19:30:00Z', escalationLevel: 0,
  }, now, 'es').map((l) => l.text)
  assert.match(lines[0], /^Acuse de recibo por correo enviado a las 10:31\sa\.\s?m\., en español$/)
  assert.equal(lines[1], 'Seguimiento por mensaje de texto no se entregó: puede que se haya entregado o no, así que no se volvió a enviar')
  assert.match(lines[2], /^Se canceló en el calendario una consulta para el mié, 11 de nov/)
  assert.match(lines[3], /^Hay un mensaje de seguimiento en cola; sale el mar, 10 de nov/)
  assert.match(lines[4], /^Alguien debería contactarlo antes de la 1:30\sp\.\s?m\. de hoy$/)
  // English is untouched by the language argument's default.
  assert.match(leadAutomationLines({ messages: [], pending: [], bookings: [], stopped: { reason: 'spam' } }, now)[0].text, /^Follow-ups stopped because it was marked as spam$/)
  assert.equal(leadAutomationLines({ messages: [], pending: [], bookings: [], stopped: { reason: 'spam' } }, now, 'es')[0].text, 'Los seguimientos se detuvieron porque se marcó como spam')
})

test('a status, a switch and a log line say why in Spanish', () => {
  assert.equal(statusWhy({ status: { reason: 'connected_callback', auto: true } }, 'es'), 'Asignado automáticamente: se conectó una devolución de llamada a su número')
  assert.equal(statusWhy({ status: { reason: 'set_by_staff', auto: false } }, 'es'), 'lo asignó una persona')
  assert.deepEqual(flagChip({ on: false, why: 'needs:sms_sending' }, 'es'), { label: 'En espera', tone: 'quiet' })
  assert.deepEqual(flagChip({ on: true }, 'es'), { label: 'Activada', tone: 'good' })
  assert.equal(flagWhy({ on: false, why: 'switched_off', env: 'LEAD_ACK_ENABLED' }, [], 'es'), 'Desactivada en el servidor. Configure LEAD_ACK_ENABLED=true en el servicio de la API para activarla.')
  // The switch's own name is the server's and stays as sent.
  assert.equal(flagWhy({ on: false, why: 'needs:sms_sending' }, [{ key: 'sms_sending', label: 'RingCentral text messages (sending)' }], 'es'),
    'Su propio interruptor está activado, pero necesita que “RingCentral text messages (sending)” también lo esté.')
  const bits = (action, details) => systemEventBits({ action, details }, 'es').join(' · ')
  assert.equal(bits('automation.lead_status', { to: 'no_response', reason: 'follow_up_sequence_completed' }), 'pasó a Sin respuesta: se enviaron todos los mensajes de seguimiento y no hubo respuesta')
  assert.equal(bits('automation.message_skipped', { channel: 'sms', reason: 'no_sms_consent' }), 'por mensaje de texto · no aceptó en el formulario recibir mensajes de texto')
  assert.equal(bits('automation.job_failed', { type: 'missed_call_sms', reason: 'gave_up' }), 'Mensaje por llamada perdida: siguió fallando')
  assert.equal(bits('automation.lead_escalated', { level: 1, notified: 1, emailed: true }), 'nivel 1, se avisó a 1 persona, un correo')
  assert.equal(bits('automation.lead_escalated', { level: 2, notified: 3 }), 'nivel 2, se avisó a 3 personas')
  // A code with no words reads as the code; a missing one says so.
  assert.equal(reasonText('some_new_code', MESSAGE_REASONS, 'es'), 'some new code')
  assert.equal(reasonText(null, MESSAGE_REASONS, 'es'), 'sin motivo registrado')
  assert.equal(jobLabel('lead_sla', 'es'), 'Escalamiento de un cliente potencial en espera')
  assert.equal(jobLabel('brand_new_job', 'es'), 'brand new job')
})

const NOW = Date.parse('2026-11-12T16:00:00Z') // Thursday 10:00 in New Orleans

test('a test’s steps, timing and plan read in Spanish', () => {
  assert.equal(stepLabel('followup:followup_2', 'es'), 'Seguimiento 2 (mensaje de texto)')
  assert.equal(stepLabel('no_response', 'es'), 'El estado cambia a Sin respuesta')
  assert.equal(stepPlan('ack_email', { sendEmail: true }, 'es'), 'se envía de verdad, solo a la dirección de la prueba')
  assert.equal(stepPlan('ack_sms', { sendEmail: true }, 'es'), 'solo se muestra, no se envía')
  assert.equal(dueText(new Date(NOW + 42_000), NOW, 'es'), 'en 0:42')
  assert.equal(dueText(new Date(NOW + 25 * 60_000), NOW, 'es'), 'en 25 min')
  assert.match(dueText(new Date(NOW + 3 * 3600_000), NOW, 'es'), /^hoy a la 1:00\sp\.\s?m\.$/)
  assert.match(dueText(new Date(NOW + 24 * 3600_000), NOW, 'es'), /^el vie, 13 de nov/)
  assert.equal(offsetText(new Date(NOW + 60_000), new Date(NOW), 'accelerated', 'es'), 'después de aproximadamente 1 minuto')
  assert.equal(offsetText(new Date(NOW + 180_000), new Date(NOW), 'accelerated', 'es'), 'después de aproximadamente 3 minutos')
  const step = (state, outcome, extra = {}) => stepState({ state, outcome, ...extra }, { test: { email: 'me@example.test' }, now: NOW, lang: 'es' })
  assert.deepEqual(step('pending', null, { dueAt: new Date(NOW + 42_000) }), { tone: 'wait', text: 'Vence en 0:42' })
  assert.deepEqual(step('done', 'sent'), { tone: 'good', text: 'Enviado de verdad a me@example.test' })
  assert.equal(step('cancelled', 'consultation_booked').text, 'Se detuvo porque agendó una consulta')
  assert.equal(step('failed', 'interrupted').text, 'Falló: el servidor se reinició a mitad del proceso, y un paso de prueba nunca se intenta dos veces')
  assert.equal(statusLabel('closed', 'es'), 'Cerrado (Spam)')
  assert.equal(statusLabel('something_new', 'es'), 'something_new')
  assert.equal(listNote({ automation_status: 'scheduled', automation_pending: 0 }, 'es'), 'Prueba de automatización terminada · Agendado')
  assert.equal(listNote({ automation_status: 'new', automation_pending: 3 }, 'es'), 'Prueba de automatización en curso · 3 en espera')
})

test('the test history reads in Spanish, every step of a list included', () => {
  const cancelled = eventLine({ kind: 'cancelled', detail: { reason: 'client_replied_by_text', steps: ['followup:followup_1', 'no_response'] } }, 'es')
  assert.equal(cancelled.title, 'Se detuvo porque respondió por mensaje de texto')
  // Each step named in Spanish: the list is not built with .map(stepLabel), which would pass the index as the language.
  assert.equal(cancelled.note, 'Seguimiento 1 (mensaje de texto), El estado cambia a Sin respuesta')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendEmail: true } }, 'es').note,
    'Pidió que el correo de acuse de recibo se enviara de verdad, solo a la dirección de la propia prueba.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendEmail: true, sendSms: true } }, 'es').note,
    'Pidió que el correo de acuse de recibo y los mensajes de texto se enviaran de verdad, solo a la dirección y al teléfono de la propia prueba.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'accelerated', sendSms: true } }, 'es').note,
    'Pidió que los mensajes de texto se enviaran de verdad, solo al teléfono de la propia prueba.')
  assert.equal(eventLine({ kind: 'started', detail: { timing: 'production' } }, 'es').title, 'Prueba iniciada, tiempos reales')
  assert.equal(eventLine({ kind: 'simulated', step: 'ack_sms', channel: 'sms', body: 'x', detail: { reason: 'sms_unavailable', why: 'no_sms_number' } }, 'es').note,
    'No se envió: RingCentral no puede enviar mensajes de texto desde esta conexión en este momento (no sms number).')
  assert.equal(eventLine({ kind: 'simulated', step: 'escalation_2', detail: { notified: 'starter_only' } }, 'es').title, 'Escalamiento, nivel 2: solo se le avisó a usted')
  assert.equal(eventLine({ kind: 'status', by: 'Walid', detail: { from: 'new', to: 'closed', auto: false } }, 'es').title, 'Estado de la prueba: Nuevo → Cerrado (Spam)')
  assert.equal(eventLine({ kind: 'status', detail: { from: 'new', to: 'no_response', reason: 'follow_up_sequence_completed', auto: true } }, 'es').note,
    'Asignado automáticamente: se enviaron todos los mensajes de seguimiento y no hubo respuesta.')
  assert.equal(eventLine({ kind: 'action', detail: { action: 'client_replied' } }, 'es').title, 'Un administrador presionó “El cliente respondió”')
  assert.equal(eventLine({ kind: 'skipped', step: 'ack_sms', detail: { reason: 'no_phone' } }, 'es').note, 'La prueba no tiene número de teléfono.')
  assert.equal(eventLine({ kind: 'reset', detail: { all: true, removed: 1 } }, 'es').note,
    'Se quitó 1 formulario de prueba, con sus pruebas de automatización y el historial anterior a esta línea.')
})

test('the administrator pages format dates in the chosen language, never a fixed en-US', () => {
  const files = [
    'modules/activity/ActivityView.vue', 'modules/integrations/IntegrationsView.vue', 'modules/team/TeamView.vue',
    'modules/automation/AutomationView.vue', 'modules/testChannel/TestChannelView.vue', 'modules/testChannel/TestEventList.vue',
  ]
  for (const f of files) {
    const src = fs.readFileSync(join(SRC, f), 'utf8')
    assert.doesNotMatch(src, /toLocale\w*String\('en-US'/, f)
    assert.match(src, /toLocale\w*String\(locale\.value/, `${f} formats with useT's locale`)
  }
})

// What a person sees: the pages and components rendered with Spanish chosen,
// then with English, which must read as before.
const at = (ms) => new Date(NOW + ms).toISOString()
const RUN = {
  leadStatus: 'new', timing: 'accelerated', endedAt: null, repliedAt: null, bookedAt: null,
  steps: [{ id: 1, type: 'ack_email', state: 'done', outcome: 'simulated' }, { id: 2, type: 'followup:followup_1', state: 'pending', dueAt: at(42_000) }],
  events: [{ id: 9, at: at(0), kind: 'simulated', step: 'ack_email', channel: 'email', body: 'Hola', recipient: 'me@example.test', detail: { reason: 'email_not_requested' } }],
}
const PANEL = { test: { email: 'me@example.test', phone: '5045550100', automation: RUN }, options: { timing: 'accelerated', sendEmail: true, sendSms: false }, now: NOW }
const LEAD = {
  id: 5, status: 'scheduled', is_archived: false,
  automation: {
    messages: [], pending: [], bookings: [{ status: 'cancelled', startsAt: at(0) }], textReplies: { waiting: 2 }, spam: { state: 'possible' },
    failed: [{ id: 1, type: 'lead_ack_sms', reason: 'no_sms_consent' }], status: { reason: 'connected_callback', auto: true },
  },
}

test('the administrator pages read in Spanish when it is chosen, and as before in English', async () => {
  const { setLang } = usePortalLang()
  const seen = async (path, opts) => textOf(await renderVue(path, opts))
  setLang('es')
  try {
    const panel = await seen('modules/testChannel/TestAutomationPanel.vue', { props: PANEL })
    assert.match(panel, /Estado de la prueba: Nuevo Tiempos acelerados · en curso/)
    assert.match(panel, /Suponga que… El cliente respondió Consulta agendada/)
    assert.match(panel, /Seguimiento 1 \(mensaje de texto\) Vence en 0:42/)
    assert.match(panel, /No se envió: usted eligió no enviarlo de verdad\. Lo que diría Para me@example\.test/)
    // The safety stamp stays the server's own words.
    assert.match(panel, /TEST MODE — NO PRODUCTION ACTIONS/)
    assert.doesNotMatch(panel, /Pretend that|Steps|waiting|What it would say/)

    const alerts = await seen('modules/automation/LeadAutomation.vue', { props: { submission: LEAD, canManage: true, show: 'alerts' } })
    assert.match(alerts, /Envió 2 respuestas por mensaje de texto\./)
    assert.match(alerts, /Mensaje de texto de acuse de recibo no se envió: no aceptó en el formulario recibir mensajes de texto\. Contáctelo usted\./)
    assert.match(alerts, /No es spam/)
    assert.doesNotMatch(alerts, /Contact them|Not spam|was cancelled/)

    // A shared confirmation and a failed load default to Spanish; a caller's own words win.
    assert.match(await seen('components/ConfirmInline.vue', { props: { title: '¿Seguro?', confirmLabel: 'Sí' } }), /Sí Cancelar$/)
    assert.match(await seen('components/ConfirmInline.vue', { props: { title: '¿Seguro?', confirmLabel: 'Sí', cancelLabel: 'Volver' } }), /Sí Volver$/)
    assert.equal(await seen('components/LoadError.vue'), 'No se pudo cargar. Revise la conexión e intente de nuevo. Intentar de nuevo')

    assert.match(await seen('modules/activity/ActivityView.vue', { route: 'Activity' }), /Registro de actividad .* Persona Todos .* Nada coincide con estos filtros\./)
    assert.match(await seen('modules/team/TeamView.vue', { route: 'Team' }), /Personas con acceso .* Agregar persona/)
    assert.match(await seen('modules/testChannel/TestChannelView.vue', { route: 'TestChannel' }), /Canal de prueba .* Enviar una prueba .* Recibidos \(0\)/)
    assert.match(await seen('modules/automation/AutomationSettings.vue'), /^Configuración Un cambio se aplica/)
  } finally {
    setLang('en')
  }
  const panel = await seen('modules/testChannel/TestAutomationPanel.vue', { props: PANEL })
  assert.match(panel, /Test status: New Accelerated timing · running Pretend that… Client replied Consultation booked/)
  assert.match(panel, /Follow-up 1 \(text\) Due in 0:42/)
  const alerts = await seen('modules/automation/LeadAutomation.vue', { props: { submission: LEAD, canManage: true, show: 'alerts' } })
  assert.match(alerts, /^They sent 2 text replies\. Read and answer it in RingCentral; the automatic follow-ups have stopped\. Seen to/)
  assert.match(alerts, /Acknowledgment text was not sent: they did not agree on the form to be texted\. Contact them yourself\./)
  assert.match(await seen('components/ConfirmInline.vue', { props: { title: 'Sure?', confirmLabel: 'Yes' } }), /Yes Cancel$/)
  assert.equal(await seen('components/LoadError.vue'), 'Could not load this. Check the connection and try again. Try again')
})
