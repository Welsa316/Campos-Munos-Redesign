// The browser tab's title for a route, in the portal's language: the route's
// meta.title, translated by route name where the portal dictionary has it,
// then the firm's name. null for a route without one (a view that owns a
// live title, like the inbox's unread count, sets its own).
import { makeTranslate } from '../i18n/translator.js'
import { PORTAL } from '../i18n/portal.js'

export const BRAND = 'Campos Muños Law'
const translate = makeTranslate(PORTAL)

export function routeTitle(route, lang = 'en') {
  const fallback = route?.meta?.title
  if (!fallback) return null
  const key = `title.${String(route.name)}`
  const text = translate(lang, key)
  return `${text === key ? fallback : text} | ${BRAND}`
}
