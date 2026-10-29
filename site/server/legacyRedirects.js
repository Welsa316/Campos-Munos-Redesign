// 301 redirect map for the Wix → new-site migration.
//
// The old Wix site's URLs are still indexed by Google (a Spanish tree plus a full
// English mirror under /en/*). None exist on the new site, so without these
// redirects every old search result 404s and the pages' ranking equity is lost.
//
// English is now a client-side toggle (no /en/ routes), so /en/<slug> maps to the
// SAME target as /<slug> — the visitor lands on the right page and can switch to
// English there.

// Old Wix bare slug → new path. Keys are lowercased, no leading/trailing slash.
export const LEGACY_MAP = {
  // Core pages
  'home': '/',
  'about': '/acerca-de',
  'about-1': '/acerca-de',
  'attorneys': '/acerca-de',
  'attorney-profiles': '/acerca-de',
  // /theteam + /attorney-profiles point at /acerca-de deliberately — the firm does
  // not want a team index page, so these must NOT go to /el-equipo.
  'theteam': '/acerca-de',
  'general-4': '/acerca-de',
  'acerca-de': '/acerca-de', // bare no-ops (already a real route); /en/acerca-de redirects
  'contact': '/consulta',
  'contact-10': '/consulta',
  // The consulta page already carries the client testimonials.
  'reviews': '/consulta',
  'consulta': '/consulta', // for /en/consulta
  'make-a-payment': '/pago',
  'services': '/servicios',
  'services-9': '/servicios',
  'immigration-law-videos': '/servicios',

  // Service pages
  'asylum': '/servicios/asilo',
  'daca': '/servicios/daca',
  'green-cards': '/servicios/green-card',
  'greencards': '/servicios/green-card',
  'adjustment-of-status': '/servicios/green-card',
  'naturalization-citizenship': '/servicios/ciudadania',
  'consular-processing': '/servicios/tramite-consular',
  'employment-authorization-document': '/servicios/ead',
  'fiance-visas': '/servicios/visas-de-prometido',
  'peticiones-familiares': '/servicios/peticiones-familiares',
  'tps': '/servicios/estatus-de-proteccion-temporal',
  'tiempos-adjudicacion-aplicaciones-tps': '/servicios/estatus-de-proteccion-temporal',
  'visa-t': '/servicios/visa-t',
  'visa-u': '/servicios/visa-u',
  'visas-especial-para-jovenes': '/servicios/visas-especial-para-jovenes',
  'visas-violence-trafficking': '/servicios/vawa',
  'defensa-contra-la-deportac': '/servicios/defensa-contra-la-deportacion',

  // Team member pages
  'juan': '/el-equipo/juan',
  'angenette': '/el-equipo/angenette',
  // A Wix duplicate that actually held Angenette's bio — maps to her, not Juan.
  'copy-of-juan': '/el-equipo/angenette',
  'diana': '/el-equipo/diana',
  'rio': '/el-equipo/rio',
}

// Top-level segments of routes that exist on the NEW site. Used so an /en/ URL
// pointing at a current route (e.g. /en/servicios/asilo) lands on that page
// instead of being dumped on the homepage.
const CURRENT_ROUTE_ROOTS = new Set(['servicios', 'consulta', 'pago', 'acerca-de', 'el-equipo'])

// Resolve a request path to its new location, or null if it should be served as-is.
// Handles the /en/* English tree and avoids redirecting a bare path that is already
// a valid new route.
export function legacyTarget(pathname) {
  let slug = String(pathname || '')
    .replace(/\/{2,}/g, '/') // collapse doubled slashes (//en//asylum)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .toLowerCase()

  if (slug === 'en') return '/' // old English home

  let isEn = false
  if (slug.startsWith('en/')) {
    isEn = true
    slug = slug.slice(3)
  }

  const target = LEGACY_MAP[slug]
  if (!target) {
    if (!isEn) return null
    // The /en/ tree is gone. If it points at a route that still exists, send them
    // to that page; otherwise fall back to home rather than 404.
    const root = slug.split('/')[0]
    return CURRENT_ROUTE_ROOTS.has(root) ? '/' + slug : '/'
  }

  // A bare path that already equals a real route (e.g. /acerca-de) is served, not
  // redirected — only its /en/ form needs to move.
  if (!isEn && '/' + slug === target) return null

  return target
}
