// The Messages section in English and Spanish: both languages carry the same
// words and placeholders, the pipeline statuses are all named, counts read
// right, and the inbox's times come out in the chosen language while staying
// English by default.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGES } from '../src/i18n/messages.js'
import { makeTranslate, missingKeys } from '../src/i18n/translator.js'
import { LEAD_STATUSES } from '../src/data/leadStatuses.js'
import { relativeTime, threadDate } from '../src/components/messages/messagesText.js'

const translate = makeTranslate(MESSAGES)

test('every Messages key exists in both languages, with the same placeholders', () => {
  assert.deepEqual(missingKeys(MESSAGES), { inEs: [], inEn: [] })
  const holes = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort()
  for (const key of Object.keys(MESSAGES.en)) {
    const en = MESSAGES.en[key]
    const es = MESSAGES.es[key]
    assert.equal(typeof es, typeof en, `${key}: one language is a plural, the other is not`)
    assert.deepEqual(holes(es), holes(en), `${key}: placeholders differ`)
    assert.ok(String(es.other ?? es).trim(), `${key}: empty Spanish text`)
  }
})

test('every lead status has a name and a hint in both languages', () => {
  for (const { key } of LEAD_STATUSES) {
    for (const lang of ['en', 'es']) {
      assert.ok(Object.hasOwn(MESSAGES[lang], `status.${key}`), `${lang}: status.${key}`)
      assert.ok(Object.hasOwn(MESSAGES[lang], `status.${key}.hint`), `${lang}: status.${key}.hint`)
    }
  }
  // English matches the labels the pipeline has always shown.
  for (const s of LEAD_STATUSES) assert.equal(translate('en', `status.${s.key}`), s.label)
  assert.equal(translate('es', 'status.scheduled'), 'Agendado')
})

test('counts and names read right in Spanish', () => {
  assert.equal(translate('es', 'notes.count', { count: 1 }), '1 nota')
  assert.equal(translate('es', 'notes.count', { count: 3 }), '3 notas')
  assert.equal(translate('en', 'notes.count', { count: 1 }), '1 note')
  assert.equal(translate('es', 'older.showing', { shown: 100, total: 240 }), 'Se muestran los 100 más recientes de 240.')
  assert.equal(translate('es', 'status.change_for', { name: 'Ana Prueba', status: 'Nuevo' }), 'Cambiar el estado de Ana Prueba, ahora: Nuevo')
})

test('how long ago a lead came in: English by default, Spanish when asked', () => {
  const now = Date.parse('2026-11-19T18:00:00Z')
  const ago = (ms) => new Date(now - ms).toISOString()
  assert.equal(relativeTime(ago(20_000), now), 'Just now')
  assert.equal(relativeTime(ago(5 * 60_000), now), '5m ago')
  assert.equal(relativeTime(ago(3 * 3_600_000), now), '3h ago')
  assert.equal(relativeTime(ago(30 * 3_600_000), now), 'Yesterday')
  assert.equal(relativeTime(ago(4 * 86_400_000), now), '4d ago')

  assert.equal(relativeTime(ago(20_000), now, 'es'), 'Ahora mismo')
  assert.equal(relativeTime(ago(5 * 60_000), now, 'es'), 'hace 5 min')
  assert.equal(relativeTime(ago(3 * 3_600_000), now, 'es'), 'hace 3 h')
  assert.equal(relativeTime(ago(30 * 3_600_000), now, 'es'), 'Ayer')
  assert.equal(relativeTime(ago(4 * 86_400_000), now, 'es'), 'hace 4 d')
  // Older than a week: the date, with the month in the chosen language.
  assert.match(relativeTime('2026-01-15T18:00:00Z', now, 'es'), /ene/)
  assert.match(relativeTime('2026-01-15T18:00:00Z', now), /Jan/)
})

test('when a message was sent: "Today at", "Yesterday at", or the date', () => {
  const now = new Date(2026, 10, 19, 15, 0)
  const at = (d, h, m) => new Date(2026, 10, d, h, m).toISOString()
  assert.match(threadDate(at(19, 9, 5), now), /^Today at 9:05/)
  assert.match(threadDate(at(19, 9, 5), now, 'es'), /^Hoy a las 9:05/)
  assert.match(threadDate(at(18, 9, 5), now, 'es'), /^Ayer a las 9:05/)
  assert.match(threadDate(at(2, 9, 5), now), /^Nov 2 at 9:05/)
  assert.match(threadDate(at(2, 9, 5), now, 'es'), /^2 nov\.? a las 9:05/)
  assert.equal(threadDate('garbage', now, 'es'), '')
  // One o'clock reads "a la", every other hour "a las"; English is the same either way.
  assert.match(threadDate(at(19, 13, 5), now, 'es'), /^Hoy a la 1:05/)
  assert.match(threadDate(at(18, 1, 5), now, 'es'), /^Ayer a la 1:05/)
  assert.match(threadDate(at(19, 12, 5), now, 'es'), /^Hoy a las 12:05/)
  assert.match(threadDate(at(19, 13, 5), now), /^Today at 1:05/)
})
