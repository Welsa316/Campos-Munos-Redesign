import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Shared ES <-> EN locale toggle so every button that flips language has
// identical behaviour. The locale itself is persisted in localStorage by
// i18n/index.js, so nothing extra is needed here.
export function useLocaleToggle() {
  const { locale } = useI18n()
  const currentLang = computed(() => locale.value)

  function toggleLang() {
    locale.value = locale.value === 'es' ? 'en' : 'es'
  }

  return { locale, currentLang, toggleLang }
}
