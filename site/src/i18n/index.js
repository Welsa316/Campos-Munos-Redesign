import { createI18n } from 'vue-i18n'
import { watch } from 'vue'
import es from './es.js'
import en from './en.js'

const STORAGE_KEY = 'cm_locale_v1'
const SUPPORTED = ['es', 'en']

function detectInitialLocale() {
  // During vite-ssg prerender there's no window/navigator/localStorage — fall
  // back to the firm's primary audience (ES) so prerendered HTML is consistent.
  if (typeof window === 'undefined') return 'es'

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
