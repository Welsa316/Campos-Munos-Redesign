import { createI18n } from 'vue-i18n';
import es from './es.json';
import en from './en.json';

const getDefaultLocale = () => {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem('cm_locale') : null;
  if (stored === 'es' || stored === 'en') return stored;
  return 'es';
};

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'es',
  messages: {
    es,
    en
  }
});

export default i18n;

