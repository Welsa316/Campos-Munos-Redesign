// One way to look up the portal's words in English and Spanish, for every
// section's dictionary (i18n/<section>.js exports { en: {...}, es: {...} }).
// {name} placeholders are filled from vars; an entry with { one, other }
// picks by vars.count. A key missing in Spanish falls back to English, and a
// key missing everywhere comes back as itself, so a gap shows rather than
// blanking the screen. Tested in admin/test/translator.test.js.
import { computed } from 'vue'
import { normalizeLang } from './dashboard.js'
import { usePortalLang } from '../composables/usePortalLang.js'

/** (lang, key, vars) => text, for one dictionary. */
export function makeTranslate(dict) {
  return function translate(lang, key, vars = {}) {
    const table = dict[normalizeLang(lang)] || {}
    let entry = Object.hasOwn(table, key) ? table[key] : dict.en?.[key]
    if (entry == null) return key
    if (typeof entry === 'object') entry = Number(vars.count) === 1 ? entry.one : entry.other
    return String(entry).replace(/\{(\w+)\}/g, (m, name) => (vars[name] == null ? m : String(vars[name])))
  }
}

/**
 * For a component: t(key, vars) in the language chosen on the switch, and
 * that language. t is reactive (it reads the shared language), so a
 * template using it re-renders when the language changes.
 */
export function useT(dict) {
  const translate = makeTranslate(dict)
  const { lang } = usePortalLang()
  const t = (key, vars) => translate(lang.value, key, vars)
  return { t, lang, locale: computed(() => (lang.value === 'es' ? 'es-US' : 'en-US')) }
}

/** Keys present in one language and missing in the other (for tests). */
export function missingKeys(dict) {
  const en = Object.keys(dict.en || {})
  const es = Object.keys(dict.es || {})
  return { inEs: en.filter((k) => !es.includes(k)), inEn: es.filter((k) => !en.includes(k)) }
}
