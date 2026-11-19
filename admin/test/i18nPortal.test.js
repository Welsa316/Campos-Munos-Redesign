// The portal's shared words (i18n/portal.js) and the language switch: both
// languages carry the same keys and placeholders; the switch shows ES then
// EN, says which is chosen, keeps the choice and sets <html lang>; and the
// header links, tab titles and notification help read in Spanish when it is
// chosen while staying English by default.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderVue, textOf } from './support/renderVue.js'
import { PORTAL } from '../src/i18n/portal.js'
import { missingKeys, makeTranslate } from '../src/i18n/translator.js'
import { usePortalLang, applyDocumentLang, STORAGE_KEY } from '../src/composables/usePortalLang.js'
import { SECTIONS, linkName, sectionLabel } from '../src/components/portal/sectionLinks.js'
import { routeTitle } from '../src/router/title.js'
import { blockedHelp, testSentHelp } from '../src/utils/push.js'

const holes = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort()

test('every portal word exists in English and Spanish, with the same placeholders', () => {
  assert.deepEqual(missingKeys(PORTAL), { inEs: [], inEn: [] })
  for (const k of Object.keys(PORTAL.en)) {
    assert.deepEqual(holes(PORTAL.es[k]), holes(PORTAL.en[k]), `${k}: placeholders differ`)
    assert.ok(String(PORTAL.es[k]).trim(), `${k}: empty Spanish text`)
  }
  // Every header section and every Updates section has a name in both.
  for (const s of SECTIONS) assert.ok(Object.hasOwn(PORTAL.es, `section.${s.key}`), s.key)
})

function memoryStorage() {
  const data = {}
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v) } }
}

test('the switch: ES then EN, the chosen one pressed, Spanish group label', async (t) => {
  const store = memoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true })
  t.after(() => { delete globalThis.localStorage })
  const { setLang } = usePortalLang()

  setLang('en')
  let html = await renderVue('components/LanguageSwitch.vue')
  const order = [...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*aria-pressed="(true|false)"/g)].map((m) => [m[1], m[2]])
  assert.deepEqual(order, [['Español', 'false'], ['English', 'true']])
  assert.match(html, /role="group" aria-label="Language"/)
  assert.deepEqual(textOf(html).split(' '), ['ES', 'EN'])

  setLang('es')
  assert.equal(store.data[STORAGE_KEY], 'es', 'the choice is kept in this browser')
  html = await renderVue('components/LanguageSwitch.vue')
  assert.match(html, /role="group" aria-label="Idioma"/)
  assert.match(html, /aria-label="Español" aria-pressed="true"/)
  assert.match(html, /aria-label="English" aria-pressed="false"/)

  // Not on the sales demo.
  html = await renderVue('components/LanguageSwitch.vue', { route: 'OperationsDemo' })
  assert.doesNotMatch(html, /aria-pressed/)
  setLang('en')
})

test('choosing a language sets <html lang>', () => {
  const doc = { documentElement: { lang: 'en' } }
  applyDocumentLang('es', doc)
  assert.equal(doc.documentElement.lang, 'es')
  applyDocumentLang('klingon', doc)
  assert.equal(doc.documentElement.lang, 'en')
  // No document (tests, a worker): nothing to do, no error.
  applyDocumentLang('es', undefined)

  const real = { documentElement: { lang: 'en' } }
  Object.defineProperty(globalThis, 'document', { value: real, configurable: true, writable: true })
  try {
    const { setLang } = usePortalLang()
    setLang('es')
    assert.equal(real.documentElement.lang, 'es')
    setLang('en')
    assert.equal(real.documentElement.lang, 'en')
  } finally {
    delete globalThis.document
  }
})

test('pages read in Spanish when it is chosen', async () => {
  const { setLang } = usePortalLang()
  setLang('es')
  try {
    const notFound = textOf(await renderVue('views/NotFoundView.vue', { route: 'NotFound' }))
    assert.match(notFound, /Página no encontrada/)
    assert.match(notFound, /Ir a Inicio/)
    assert.doesNotMatch(notFound, /Page not found/)

    const header = await renderVue('components/portal/PortalHeader.vue', { props: { title: 'Mensajes', current: 'messages', notifications: false } })
    assert.match(textOf(header), /Cerrar sesión/)
    assert.match(header, /aria-label="Cambiar contraseña"/)
    assert.match(header, /aria-label="Secciones del portal"/)
  } finally {
    setLang('en')
  }
  const english = textOf(await renderVue('views/NotFoundView.vue', { route: 'NotFound' }))
  assert.match(english, /Page not found/)
})

test('header links, tab titles and notification help: Spanish on request, English by default', () => {
  const updates = SECTIONS.find((s) => s.key === 'updates')
  const billing = SECTIONS.find((s) => s.key === 'billing')
  assert.equal(linkName(updates, true), 'Updates, new')
  assert.equal(linkName(updates, true, 'es'), 'Novedades, nuevo')
  assert.equal(linkName(billing, true, 'es'), 'Facturación')
  assert.equal(sectionLabel(billing), 'Billing')

  assert.equal(routeTitle({ name: 'Updates', meta: { title: 'Updates' } }), 'Updates | Campos Muños Law')
  assert.equal(routeTitle({ name: 'Updates', meta: { title: 'Updates' } }, 'es'), 'Novedades | Campos Muños Law')
  // A route the dictionary does not know keeps its own title.
  assert.equal(routeTitle({ name: 'OperationsDemo', meta: { title: 'Operations Demo' } }, 'es'), 'Operations Demo | Campos Muños Law')
  assert.equal(routeTitle({ name: 'Inbox', meta: {} }, 'es'), null)

  const MAC_CHROME = { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36', platform: 'MacIntel' }
  assert.match(blockedHelp('admin.camulaw.com', MAC_CHROME), /^Notifications are blocked for admin\.camulaw\.com/)
  assert.match(blockedHelp('admin.camulaw.com', MAC_CHROME, 'es'), /^Las notificaciones están bloqueadas para admin\.camulaw\.com/)
  assert.match(testSentHelp(MAC_CHROME, 'es'), /^Prueba enviada\..*Google Chrome/)
  assert.match(testSentHelp({ userAgent: 'curl' }, 'es'), /de su navegador\.$/)
  assert.match(testSentHelp({ userAgent: 'curl' }), /from your browser\.$/)

  const tr = makeTranslate(PORTAL)
  assert.equal(tr('es', 'noaccess.body', { email: 'ana@x.com' }).startsWith('Inició sesión como ana@x.com'), true)
})
