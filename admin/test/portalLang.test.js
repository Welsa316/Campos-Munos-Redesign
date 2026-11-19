// Home in English or Spanish (the EN | ES switch): both languages carry the
// same words, a missing Spanish word falls back to English rather than
// showing a key, counts read right in each language, the choice is kept in
// this browser, and the shared helpers stay English unless asked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DASHBOARD, translate, normalizeLang, roleLabel } from '../src/i18n/dashboard.js'
import { daysAgo } from '../src/utils/text.js'
import { workItemText } from '../src/modules/reminders/workQueueText.js'

const keys = (lang) => Object.keys(DASHBOARD[lang]).sort()

test('every English key has a Spanish one and the other way round, with the same shape', () => {
  assert.deepEqual(keys('es'), keys('en'))
  for (const k of keys('en')) {
    const en = DASHBOARD.en[k]
    const es = DASHBOARD.es[k]
    assert.equal(typeof es, typeof en, `${k}: one language is a plural, the other is not`)
    if (typeof en === 'object') {
      assert.deepEqual(Object.keys(es).sort(), ['one', 'other'], k)
      assert.deepEqual(Object.keys(en).sort(), ['one', 'other'], k)
    }
    // The same placeholders, so a filled-in name or count never goes missing.
    const holes = (v) => JSON.stringify(v).match(/\{\w+\}/g)?.sort() ?? []
    assert.deepEqual([...new Set(holes(es))], [...new Set(holes(en))], `${k}: placeholders differ`)
    assert.ok(String(es.other ?? es).trim(), `${k}: empty Spanish text`)
  }
})

test('t fills placeholders and falls back to English, then to the key', () => {
  assert.equal(translate('en', 'unread.waiting_for', { name: 'Ana' }), 'Waiting for you, Ana')
  assert.equal(translate('es', 'unread.waiting_for', { name: 'Ana' }), 'Pendientes para usted, Ana')
  assert.equal(translate('es', 'goto'), 'Ir a')
  // A placeholder with no value stays visible rather than reading "undefined".
  assert.equal(translate('en', 'unread.waiting_for'), 'Waiting for you, {name}')

  const saved = DASHBOARD.es.goto
  delete DASHBOARD.es.goto
  try {
    assert.equal(translate('es', 'goto'), 'Go to')
  } finally {
    DASHBOARD.es.goto = saved
  }
  assert.equal(translate('es', 'no.such.key'), 'no.such.key')
  // An unknown language reads as English.
  assert.equal(translate('fr', 'goto'), 'Go to')
  assert.equal(normalizeLang(null), 'en')
  assert.equal(normalizeLang('es'), 'es')
})

test('counts read right in each language', () => {
  assert.equal(translate('es', 'missed.voicemail', { count: 1 }), '1 fue al buzón de voz')
  assert.equal(translate('es', 'missed.voicemail', { count: 3 }), '3 fueron al buzón de voz')
  assert.equal(translate('es', 'missed.not_returned', { count: 1 }), '1 no devuelta')
  assert.equal(translate('es', 'missed.not_returned', { count: 2 }), '2 no devueltas')
  assert.equal(translate('en', 'missed.voicemail', { count: 1 }), '1 went to voicemail')
  assert.equal(translate('en', 'missed.not_returned', { count: 4 }), '4 not called back')
  assert.equal(translate('es', 'days.ago', { count: 5 }), 'hace 5 días')
})

test('daysAgo and the follow-up rows stay English unless Spanish is asked for', () => {
  const now = Date.parse('2026-11-19T18:00:00Z')
  assert.equal(daysAgo('2026-11-14T18:00:00Z', now), '5 days ago')
  assert.equal(daysAgo('2026-11-14T18:00:00Z', now, 'es'), 'hace 5 días')
  assert.equal(daysAgo('2026-11-18T18:00:00Z', now, 'es'), 'ayer')
  assert.equal(daysAgo('2026-11-19T15:00:00Z', now, 'es'), 'hoy')

  const row = { kind: 'callback', group: 'due', name: 'Ana Prueba', at: '2026-11-19T17:59:00Z' }
  assert.deepEqual(workItemText(row, now), { title: 'Call back Ana Prueba', when: 'Due now', icon: 'phone', tone: 'due' })
  assert.deepEqual(workItemText(row, now, 'es'), { title: 'Devolver la llamada a Ana Prueba', when: 'Vence ahora', icon: 'phone', tone: 'due' })
  const lead = workItemText({ kind: 'new_lead', group: 'lead', source: 'chat', name: 'Ana', at: '2026-11-19T15:12:00Z' }, now, 'es')
  assert.equal(lead.title, 'Nuevo chat del sitio web de Ana')
  assert.match(lead.when, /^Recibido 9:12/)
  const attn = workItemText({ kind: 'lead_attention', reason: 'overdue', name: null, at: '2026-11-19T15:00:00Z' }, now, 'es')
  assert.equal(attn.title, 'Nadie ha contactado a un cliente potencial del sitio web todavía')
  assert.match(attn.when, /^Vencido desde 9:00/)
  assert.equal(attn.tone, 'overdue')
})

test('the role pill: Spanish for known roles, the server label otherwise and in English', () => {
  assert.equal(roleLabel('es', 'receptionist', 'Receptionist'), 'Recepcionista')
  assert.equal(roleLabel('es', 'office_manager', 'Office Manager'), 'Gerente de oficina')
  assert.equal(roleLabel('en', 'receptionist', 'Receptionist'), 'Receptionist')
  assert.equal(roleLabel('es', 'paralegal_2', 'Paralegal II'), 'Paralegal II')
  assert.equal(roleLabel('es', '', ''), '')
})

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
  }
}

// A fresh copy of the composable, so it reads storage as on a new page load.
let loads = 0
const freshComposable = () => import(`../src/composables/usePortalLang.js?load=${++loads}`)

test('the choice is saved and read back on the next load; English by default', async (t) => {
  const store = memoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true })
  t.after(() => { delete globalThis.localStorage })

  const first = await freshComposable()
  const a = first.usePortalLang()
  assert.equal(a.lang.value, 'en')
  a.setLang('es')
  assert.equal(a.lang.value, 'es')
  assert.equal(a.t('goto'), 'Ir a')
  assert.equal(store.data[first.STORAGE_KEY], 'es')

  const second = await freshComposable()
  assert.equal(second.usePortalLang().lang.value, 'es')

  // Garbage in storage reads as English; blocked storage does not throw.
  store.data[first.STORAGE_KEY] = 'klingon'
  assert.equal(first.readLang(store), 'en')
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(first.readLang(blocked), 'en')
  globalThis.localStorage = blocked
  const third = await freshComposable()
  const c = third.usePortalLang()
  assert.equal(c.lang.value, 'en')
  assert.doesNotThrow(() => c.setLang('es'))
  assert.equal(c.lang.value, 'es')
})
