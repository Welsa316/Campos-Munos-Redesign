// WhatsApp, reminders and contact notes/history in Spanish: every word has
// both languages with the same placeholders, and the text helpers read in
// Spanish when asked while their English (what Calls uses) is unchanged.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingKeys, makeTranslate } from '../src/i18n/translator.js'
import { WHATSAPP } from '../src/i18n/whatsapp.js'
import { REMINDERS } from '../src/i18n/reminders.js'
import { CONTACTS } from '../src/i18n/contacts.js'
import { dueChoices, dueProblem, dueLine } from '../src/modules/reminders/dueChoices.js'
import { deliveryNote } from '../src/modules/reminders/reminderText.js'
import { historyLine, historyWhen, sourceName } from '../src/modules/contacts/historyText.js'

const DICTS = { WHATSAPP, REMINDERS, CONTACTS }
const holes = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort()

for (const [name, dict] of Object.entries(DICTS)) {
  test(`${name}: every key in both languages, same shape and placeholders`, () => {
    assert.deepEqual(missingKeys(dict), { inEs: [], inEn: [] })
    for (const k of Object.keys(dict.en)) {
      const en = dict.en[k]
      const es = dict.es[k]
      assert.equal(typeof es, typeof en, `${k}: plural in one language only`)
      assert.deepEqual(holes(es), holes(en), `${k}: placeholders differ`)
      assert.ok(String(es.other ?? es).trim(), `${k}: empty Spanish`)
    }
  })
}

const at = (iso) => Date.parse(iso)

test('the quick reminder times read in Spanish, and stay English by default', () => {
  // A Friday: the next business morning is Monday.
  const fri = at('2026-11-06T18:00:00Z')
  assert.deepEqual(dueChoices(fri, 'es').map((c) => c.label), ['En 30 minutos', 'En 1 hora', 'El lunes por la mañana'])
  assert.deepEqual(dueChoices(fri).map((c) => c.label), ['In 30 minutes', 'In 1 hour', 'Monday morning'])
  assert.equal(dueChoices(at('2026-11-04T18:00:00Z'), 'es')[2].label, 'Mañana por la mañana')
  assert.equal(dueProblem(null, fri, 'es'), 'Elija una fecha y una hora.')
  assert.match(dueProblem(new Date(fri - 5 * 60e3), fri, 'es'), /ya pasó/)
  assert.equal(dueProblem(null, fri), 'Choose a date and time.')
})

test('a reminder line in Spanish: due now, overdue since a Spanish time', () => {
  const now = at('2026-11-06T16:00:00Z')
  assert.equal(dueLine({ status: 'due', dueAt: '2026-11-06T15:58:00Z' }, now, 'es'), 'Vence ahora')
  assert.match(dueLine({ status: 'due', dueAt: '2026-11-06T15:00:00Z' }, now, 'es'), /^Vencido desde 9:00\sa\.\s?m\.$/)
  assert.equal(dueLine({ status: 'due', dueAt: '2026-11-06T15:00:00Z' }, now), 'Overdue since 9:00 AM')
})

test('what happened to a reminder email, in Spanish and unchanged in English', () => {
  const t = () => '9:01'
  const r = (email, push) => ({ delivery: { email, push } })
  assert.equal(deliveryNote(r({ status: 'sent', at: 'x' }, { status: 'sent' }), t, 'es'), 'Enviado por correo a las 9:01 y como notificación.')
  assert.equal(deliveryNote(r({ status: 'sent' }), t, 'es'), 'Enviado por correo.')
  assert.equal(deliveryNote(r({ status: 'failed' }, { status: 'sent' }), t, 'es'), 'No se pudo enviar el correo. Se envió una notificación.')
  assert.equal(deliveryNote(r({ status: 'sent', at: 'x' }, { status: 'sent' }), t), 'Emailed 9:01 and sent as a notification.')
  assert.equal(deliveryNote(r({ status: 'sent' }), t), 'Emailed.')
})

test('history lines in Spanish; English (and the Calls labels) unchanged', () => {
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'answered', employee: 'Ciro' }, undefined, 'es'), 'Llamada entrante, contestada por Ciro')
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'voicemail' }, undefined, 'es'), 'Llamada entrante, buzón de voz')
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'something_new' }, undefined, 'es'), 'Llamada entrante, sin confirmar')
  assert.equal(historyLine({ type: 'submission', channel: 'form', consultationType: 'DACA' }, undefined, 'es'), 'Consulta del sitio web · DACA')
  assert.equal(historyLine({ type: 'reply', employee: 'Yoletty' }, undefined, 'es'), 'Respuesta enviada por correo por Yoletty')
  assert.equal(historyLine({ type: 'call', direction: 'inbound', classification: 'voicemail' }), 'Incoming call, voicemail')
  assert.equal(historyLine({ type: 'call_note', employee: 'Yoletty' }), 'Call note by Yoletty')
  assert.equal(sourceName('Website', 'es'), 'Sitio web')
  assert.equal(sourceName('Website'), 'Website')
  assert.equal(sourceName('Fax', 'es'), 'Fax', 'an unknown source shows as sent')
})

test('when an event happened, in Spanish', () => {
  const now = at('2026-11-06T18:00:00Z')
  assert.match(historyWhen('2026-11-05T15:00:00Z', now, 'es'), /^Ayer 9:00\sa\.\s?m\.$/)
  assert.equal(historyWhen('2026-11-05T15:00:00Z', now), 'Yesterday 9:00 AM')
})

test('the due-reminder toast counts in Spanish', () => {
  const t = makeTranslate(REMINDERS)
  assert.equal(t('es', 'alert.due', { count: 1 }), 'Vence un recordatorio para devolver una llamada')
  assert.equal(t('es', 'alert.due', { count: 3 }), 'Vencen 3 recordatorios para devolver llamadas')
  assert.equal(t('en', 'alert.due', { count: 3 }), '3 callback reminders are due')
})
