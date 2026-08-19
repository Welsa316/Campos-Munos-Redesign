import { createI18n } from 'vue-i18n'
import { watch } from 'vue'
import es from './es.js'
import en from './en.js'

const STORAGE_KEY = 'cm_locale_v1'
const SUPPORTED = ['es', 'en']
// ?lang= is the one we publish; ?hl= is accepted because it's the parameter
// Google's own properties use and it costs nothing to honour.
const LOCALE_PARAMS = ['lang', 'hl']

// An explicit locale in the URL, e.g. /servicios/asilo?lang=es. Paid campaigns
// pin the language this way: the same URL otherwise renders in whatever
// language the visitor's browser is set to, so a Spanish ad could land a
// Spanish speaker on the English page whenever their phone is set to English.
function readLocaleParam() {
  try {
    const params = new URLSearchParams(window.location.search)
    for (const key of LOCALE_PARAMS) {
      // Accept es-MX / en-US as well as bare codes.
      const value = (params.get(key) || '').toLowerCase().split('-')[0]
      if (SUPPORTED.includes(value)) return value
    }
  } catch { /* malformed query string — fall through to the other signals */ }
  return null
}

// Resolution order: explicit URL parameter, then the visitor's saved choice,
// then their browser. This runs while this module is first imported — before
// the app mounts — so the very first paint is already in the right language
// and a crawler never sees an English flash on a Spanish URL.
function detectInitialLocale() {
  // During prerender there's no window/navigator/localStorage — fall back to
  // the firm's primary audience (ES) so prerendered HTML is consistent.
  if (typeof window === 'undefined') return 'es'

  const fromParam = readLocaleParam()
  if (fromParam) {
    // Persist it so the language survives the click through to /consulta.
    try { localStorage.setItem(STORAGE_KEY, fromParam) } catch { /* ignore */ }
    return fromParam
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED.includes(stored)) return stored
  } catch { /* localStorage may be disabled */ }

  const browser = (navigator.language || 'es').toLowerCase().split('-')[0]
  return SUPPORTED.includes(browser) ? browser : 'es'
}

const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'es',
  messages: { es, en },
})

// Persist locale changes so the next visit honours their choice. Skipped
// during SSG since there's no localStorage at build time.
if (typeof window !== 'undefined') {
  // Keep <html lang> in sync with the active locale (index.html ships lang="es").
  const applyLang = (v) => { try { document.documentElement.lang = v } catch { /* ignore */ } }
  applyLang(i18n.global.locale.value)
  watch(i18n.global.locale, (v) => {
    try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
    applyLang(v)
  })
}

export default i18n
