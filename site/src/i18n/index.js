import { createI18n } from 'vue-i18n'
import { watch } from 'vue'
import es from './es.js'
import en from './en.js'

const STORAGE_KEY = 'cm_locale_v1'
const SUPPORTED = ['es', 'en']

function detectInitialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED.includes(stored)) return stored
  } catch { /* localStorage may be disabled */ }

  // Browser preference, falling back to the firm's primary audience (ES).
  const browser = (navigator.language || 'es').toLowerCase().split('-')[0]
  return SUPPORTED.includes(browser) ? browser : 'es'
}

const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'es',
  messages: { es, en },
})

// Persist locale changes so the next visit honours their choice.
watch(i18n.global.locale, (v) => {
  try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
})

export default i18n
