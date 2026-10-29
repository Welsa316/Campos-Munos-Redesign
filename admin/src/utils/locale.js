// The portal's chrome is English, but consultation and country labels follow
// the staff member's language, as they did when the portal was part of the
// public site: an explicit ES/EN choice saved by the site's toggle first (only
// visible when the portal shares the site's origin, i.e. transitional
// camulaw.com/admin), then the browser language.
const STORAGE_KEY = 'cm_locale_v1'

function savedLocale() {
  for (const store of ['sessionStorage', 'localStorage']) {
    try {
      const v = globalThis[store]?.getItem(STORAGE_KEY)
      if (v === 'es' || v === 'en') return v
    } catch { /* storage blocked */ }
  }
  return null
}

export function adminLocale() {
  const saved = savedLocale()
  if (saved) return saved
  if (typeof navigator === 'undefined') return 'en'
  const lang = (navigator.language || 'en').toLowerCase()
  return lang.startsWith('es') ? 'es' : 'en'
}
