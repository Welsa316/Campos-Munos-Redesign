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

function readStored(store) {
  try {
    const value = store.getItem(STORAGE_KEY)
    return SUPPORTED.includes(value) ? value : null
  } catch { return null } // storage can be disabled or blocked in private mode
}

// Resolution order: explicit URL parameter, then a language pinned earlier in
// this visit, then the visitor's own saved choice, then their browser.
//
// The ?lang= pin is deliberately SESSION-scoped. Writing it to localStorage
// meant a single Spanish ad click permanently overrode browser detection: the
// visitor came back weeks later on an English phone and still got Spanish, with
// no obvious cause. Session storage still carries the language across the whole
// visit (including the click through to /consulta), which is what the ads need.
// An explicit toggle is different — that is a deliberate choice, so it is saved
// to localStorage and outlives the session.
//
// This runs while the module is first imported — before the app mounts — so the
// first paint is already in the right language and a crawler never sees a flash
// of the wrong one.
function detectInitialLocale() {
  // During prerender there's no window/navigator/storage — fall back to the
  // firm's primary audience (ES) so prerendered HTML is consistent.
  if (typeof window === 'undefined') return 'es'

  const fromParam = readLocaleParam()
  if (fromParam) {
    // Pin for the rest of this visit so the language survives navigation.
    try { sessionStorage.setItem(STORAGE_KEY, fromParam) } catch { /* ignore */ }
    return fromParam
  }

  const pinned = readStored(sessionStorage)
  if (pinned) return pinned

  const chosen = readStored(localStorage)
  if (chosen) return chosen

  // navigator.languages is ordered by preference; fall back to the single
  // navigator.language. Match on the primary subtag so en-US/en-GB -> en.
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ]
  for (const tag of candidates) {
    const primary = String(tag || '').toLowerCase().split('-')[0]
    if (SUPPORTED.includes(primary)) return primary
  }

  return 'es'
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
  // A locale change after startup is the visitor using the ES/EN toggle. Save it
  // to localStorage so it outlives the session, and mirror it into sessionStorage
  // so it also outranks any ?lang= pin for the rest of this visit.
  watch(i18n.global.locale, (v) => {
    try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
    try { sessionStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
    applyLang(v)
  })
}

export default i18n
