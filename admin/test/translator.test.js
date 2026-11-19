import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeTranslate, missingKeys } from '../src/i18n/translator.js'

const DICT = {
  en: { hi: 'Hello, {name}', calls: { one: '{count} call', other: '{count} calls' }, only_en: 'English only' },
  es: { hi: 'Hola, {name}', calls: { one: '{count} llamada', other: '{count} llamadas' } },
}
const t = makeTranslate(DICT)

test('picks the language, fills placeholders and plurals', () => {
  assert.equal(t('es', 'hi', { name: 'Yoli' }), 'Hola, Yoli')
  assert.equal(t('en', 'hi', { name: 'Yoli' }), 'Hello, Yoli')
  assert.equal(t('es', 'calls', { count: 1 }), '1 llamada')
  assert.equal(t('es', 'calls', { count: 3 }), '3 llamadas')
})

test('falls back to English, then to the key; unknown languages read as English', () => {
  assert.equal(t('es', 'only_en'), 'English only')
  assert.equal(t('es', 'nope'), 'nope')
  assert.equal(t('fr', 'hi', { name: 'A' }), 'Hello, A')
  assert.equal(t('es', 'hi'), 'Hola, {name}', 'a missing var stays visible')
})

test('missingKeys finds gaps both ways', () => {
  assert.deepEqual(missingKeys(DICT), { inEs: ['only_en'], inEn: [] })
})
