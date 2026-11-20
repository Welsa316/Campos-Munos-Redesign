// The Calls page in Spanish. What matters: every word exists in both
// languages with the same blanks to fill, the text helpers speak Spanish
// when asked (dates included, in New Orleans time), and English is exactly
// what it was when no language is given.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingKeys } from '../src/i18n/translator.js'
import { CALLS, tc } from '../src/i18n/calls.js'
import { followUpLine, followUpDetail, episodeSummary, episodeLine, episodeSections, handledSections, when, reminderDue } from '../src/modules/calls/callsInbox.js'
import { statusLine, factText, gapLines } from '../src/modules/calls/callEvidenceText.js'
import { look } from '../src/modules/calls/callLook.js'
import { exclusionLabel, exclusionReasons } from '../src/modules/calls/exclusionReasons.js'
import { rangeLabel, rangeOptions } from '../src/modules/calls/callRanges.js'

// 11:48 AM in New Orleans on Thu Nov 5 2026.
const NOW = Date.parse('2026-11-05T17:48:00Z')
const TODAY = '2026-11-05T16:00:00Z' // 10:00 AM
const YESTERDAY = '2026-11-04T22:42:00Z' // 4:42 PM
const MONDAY = '2026-11-02T15:00:00Z' // 9:00 AM
const call = (over) => ({ id: 1, direction: 'inbound', classification: 'not_answered', number: '+15045550101', startedAt: TODAY, needsAttention: true, attentionGroup: 'new', ...over })

test('every Calls word exists in both languages', () => {
  assert.deepEqual(missingKeys(CALLS), { inEs: [], inEn: [] })
})

test('each Spanish entry has the blanks its English one has, and plurals have both forms', () => {
  const blanks = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) || [])].map((b) => b.toLowerCase()).sort()
  for (const [key, en] of Object.entries(CALLS.en)) {
    const es = CALLS.es[key]
    assert.deepEqual(blanks(es), blanks(en), key)
    assert.equal(typeof es, typeof en, `${key}: plural in one language only`)
    if (typeof en === 'object') for (const v of [en, es]) assert.ok(v.one && v.other, `${key}: one and other`)
  }
})

test('a missed call, in Spanish', () => {
  assert.deepEqual(followUpLine(call(), NOW, 'es'), { tone: 'open', text: 'Hay que devolver la llamada' })
  assert.deepEqual(followUpLine(call({ attentionGroup: 'waiting', startedAt: YESTERDAY }), NOW, 'es'), { tone: 'open', text: 'Esperando desde ayer' })
  assert.equal(followUpLine(call({ attemptAt: YESTERDAY }), NOW, 'es').text, 'Se intentó ayer, 4:42 p.m. · aún hay que devolver la llamada')
  const offered = { classification: 'not_answered', offeredTo: [{ name: 'Yoletty', extension: '101', reason: 'No Answer' }, { name: 'Ana', live: true }] }
  assert.equal(statusLine(offered, 'es'), 'No contestada · ofrecida a Yoletty, ext. 101 · sin respuesta; Ana · el teléfono sonó')
  assert.equal(look(call(), 'es').label, 'No contestada')
})

test('every person in a list is worded in the language asked for', () => {
  // Lists of people are built with map: the index must never reach the language.
  const hungUp = { classification: 'caller_hung_up', offeredTo: [{ kind: 'external', numberEnd: '0101' }, { kind: 'external', numberEnd: '0202' }] }
  assert.equal(statusLine(hungUp, 'es'), 'La persona colgó antes de que contestaran · ofrecida a un teléfono desviado que termina en 0101, un teléfono desviado que termina en 0202')
  assert.deepEqual(gapLines(['no_legs', 'unknown_code', 'no_reason'], 'es'), ['RingCentral no envió el detalle paso a paso de esta llamada.', 'RingCentral no indicó cómo terminó esta llamada.'])
})

test('a voicemail, in Spanish', () => {
  const vm = { classification: 'voicemail', notAnsweredBy: [{ name: 'Yoletty', extension: '101' }, { name: 'Ana', extension: '102' }] }
  assert.equal(statusLine(vm, 'es'), 'Dejó un mensaje de voz · no la contestó Yoletty, ext. 101, Ana, ext. 102')
  assert.equal(look({ direction: 'inbound', classification: 'voicemail' }, 'es').label, 'Buzón de voz')
  assert.equal(factText({ code: 'voicemail_message', to: { kind: 'extension', name: 'Yoletty', number: '101' } }, 'es'), 'Hay un mensaje de voz adjunto (buzón de voz de Yoletty, ext. 101).')
})

test('one caller with several calls, in Spanish', () => {
  const ep = { id: 7, attempts: 3, firstAt: MONDAY, lastAt: TODAY, attentionGroup: 'waiting', callbackAttempts: 2, lastCallbackAttemptAt: YESTERDAY }
  assert.equal(episodeSummary(ep, NOW, 'es'), '3 llamadas sin contestar · primera lun, 2 de nov, 9:00 a.m. · última 10:00 a.m.')
  assert.equal(episodeLine(ep, NOW, 'es').text, 'Se intentó 2 veces · la última ayer, 4:42 p.m. · aún hay que devolver la llamada')
  assert.deepEqual(episodeSections([ep], 'es').map((s) => [s.label, s.hint]), [['De días anteriores', 'atender primero']])
  assert.equal(tc('es', 'ep.heading', { count: 1 }), '1 llamada sin contestar')
  assert.equal(tc('es', 'ep.heading', { count: 3 }), '3 llamadas sin contestar')
})

test('a handled call, in Spanish', () => {
  const handled = call({ needsAttention: false, handled: { at: YESTERDAY, by: 'Yoletty', note: 'Habló en persona' } })
  assert.deepEqual(followUpLine(handled, NOW, 'es'), { tone: 'done', text: 'Atendida por Yoletty · ayer, 4:42 p.m.' })
  assert.equal(followUpDetail(handled, NOW, 'es'), 'Marcada como atendida por Yoletty (ayer, 4:42 p.m.). “Habló en persona” No cambia cómo se clasificó la llamada ni a quién se atribuye.')
  assert.deepEqual(handledSections([handled], NOW, 'es').map((d) => [d.label, d.date]), [['Ayer', 'mié, 4 de nov']])
  assert.equal(tc('es', 'toast.cleared', { count: 1 }), '1 llamada quitada de Requiere atención.')
  assert.equal(tc('es', 'toast.cleared', { count: 4 }), '4 llamadas quitadas de Requiere atención.')
  assert.equal(exclusionLabel('spam', 'es'), 'Spam')
  assert.equal(exclusionReasons('es').find((r) => r.key === 'staff_test').label, 'Alguien de la oficina')
})

test('ranges and dates, in Spanish', () => {
  assert.equal(rangeLabel('month', {}, NOW, 'es'), 'últimos 30 días')
  assert.equal(rangeLabel('today', {}, NOW, 'es'), 'hoy')
  assert.equal(rangeLabel('custom', { from: '2026-08-01', to: '2026-09-30' }, NOW, 'es'), '1 ago – 30 sept')
  assert.deepEqual(rangeOptions('es').map((r) => r.label), ['Hoy', 'Ayer', '7 días', '30 días', '90 días', '6 meses', '12 meses', 'Fechas…'])
  assert.equal(when(YESTERDAY, NOW, 'es'), 'Ayer, 4:42 p.m.')
  assert.equal(reminderDue({ dueAt: '2026-11-05T17:00:00Z' }, NOW, 'es'), 'Vencido desde 11:00 a.m.')
})

test('English is unchanged, with or without a language', () => {
  const ep = { id: 7, attempts: 3, firstAt: MONDAY, lastAt: TODAY, attentionGroup: 'waiting', callbackAttempts: 2, lastCallbackAttemptAt: YESTERDAY }
  for (const lang of [undefined, 'en']) {
    assert.equal(episodeSummary(ep, NOW, lang), '3 unanswered calls · first Mon, Nov 2 9:00 AM · last 10:00 AM')
    assert.equal(episodeLine(ep, NOW, lang).text, 'Tried 2× · last yesterday 4:42 PM · still needs a callback')
    assert.equal(followUpLine(call({ attemptAt: YESTERDAY }), NOW, lang).text, 'Tried Yesterday 4:42 PM · still needs a callback')
    assert.equal(statusLine({ classification: 'voicemail', notAnsweredBy: [{ name: 'Yoletty', extension: '101' }] }, lang), 'Left a voicemail · not answered by Yoletty, ext. 101')
    assert.equal(rangeLabel('month', {}, NOW, lang), 'last 30 days')
    assert.equal(rangeLabel('custom', { from: '2026-08-01', to: '2026-09-30' }, NOW, lang), 'Aug 1 – Sep 30')
    assert.equal(look({ direction: 'outbound', outcome: 'no_answer' }, lang).label, 'Outgoing, no answer')
    assert.equal(exclusionLabel('verification', lang), 'Verification code')
    assert.equal(reminderDue({ dueAt: '2026-11-05T17:00:00Z' }, NOW, lang), 'Overdue since 11:00 AM')
  }
})
