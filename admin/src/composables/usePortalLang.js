// The language Home is shown in (the EN | ES switch on Home): one choice
// shared by every component that asks, kept in this browser. English until
// someone picks Spanish; the browser's own language is not used.
import { ref } from 'vue'
import { normalizeLang, translate } from '../i18n/dashboard.js'

export const STORAGE_KEY = 'cm_portal_lang_v1'

function storage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

/** The saved choice, or 'en' when nothing is saved or storage is blocked. */
export function readLang(store = storage()) {
  try { return normalizeLang(store?.getItem(STORAGE_KEY)) } catch { return 'en' }
}

function saveLang(value, store = storage()) {
  try { store?.setItem(STORAGE_KEY, value) } catch { /* storage blocked: the choice lasts this visit */ }
}

const lang = ref(readLang())

function setLang(value) {
  lang.value = normalizeLang(value)
  saveLang(lang.value)
}

const t = (key, vars) => translate(lang.value, key, vars)

export function usePortalLang() {
  return { lang, setLang, t }
}
