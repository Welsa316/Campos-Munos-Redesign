import { createI18n } from 'vue-i18n'
import es from './es.js'
import en from './en.js'

const i18n = createI18n({
  legacy: false,
  locale: 'es',
  fallbackLocale: 'es',
  messages: { es, en },
})

export default i18n
