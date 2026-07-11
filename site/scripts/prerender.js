// Post-build head prerender.
//
// This is a client-rendered SPA: without this step, every route ships the SAME
// static <head> (the homepage's), so crawlers that don't run JS — social link
// previews (Facebook/WhatsApp/LinkedIn/iMessage) and AI crawlers — see the
// homepage's title/description/OG on every page. Google renders JS so it copes,
// but the rest don't.
//
// So after `vite build`, we clone dist/index.html for each known route and swap
// ONLY the <head> SEO tags (title, description, canonical, Open Graph, Twitter)
// to that route's real values. The <body> is untouched — the SPA still boots and
// renders normally. Per-route metadata is now in the static HTML for every bot.
//
// Meta comes from the SAME source the app uses (generateSeoMeta + the ES
// messages), so it can never drift from what the running app sets.
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { baseServices, generateSeoMeta } from '../src/data/seoServices.js'
import es from '../src/i18n/es.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const BASE = 'https://camulaw.com'
const BRAND = 'Campos Muños Law'

// Minimal i18n translate over the ES messages, matching how the app resolves
// services.<key> inside generateSeoMeta.
const t = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), es) ?? path

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Core static routes — titles get the brand suffix exactly like router.afterEach.
// Kept in sync with the route meta in src/router/index.js.
const CORE = [
  { path: '/', title: 'Abogados de Inmigración en Nueva Orleans', description: 'Abogados de inmigración con más de veinte años de experiencia en Nueva Orleans, Louisiana. Atendemos casos en los 50 estados.' },
  { path: '/servicios', title: 'Servicios de Inmigración', description: 'Servicios de inmigración: visas, residencia permanente, ciudadanía, asilo y defensa contra deportación en Nueva Orleans, Louisiana.' },
  { path: '/consulta', title: 'Consulta — Contáctenos', description: 'Contáctenos para programar una consulta con nuestros abogados de inmigración en Nueva Orleans, Louisiana.' },
  { path: '/pago', title: 'Pago', description: 'Realice un pago seguro en línea a Campos Muños Law, abogados de inmigración en Nueva Orleans, Louisiana.' },
  { path: '/acerca-de', title: 'Acerca de Nosotros', description: 'Conozca a Campos Muños Law: abogados de inmigración con más de veinte años de experiencia sirviendo a la comunidad en Nueva Orleans, Louisiana.' },
].map(r => ({ path: r.path, title: `${r.title} | ${BRAND}`, description: r.description, canonical: `${BASE}${r.path}` }))

// Service base pages — meta from the app's own generateSeoMeta (ES).
const SERVICES = Object.entries(baseServices).map(([slug, service]) => {
  const meta = generateSeoMeta(service.key, null, 'es', t, service)
  return { path: `/servicios/${slug}`, title: meta.title, description: meta.metaDescription, canonical: `${BASE}/servicios/${slug}` }
})

const ROUTES = [...CORE, ...SERVICES]

function replaceMeta(html, selector, value) {
  return html.replace(new RegExp(`(<meta ${selector} content=")[^"]*(")`), `$1${escapeAttr(value)}$2`)
}

function applyHead(html, { title, description, canonical }) {
  let out = html
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeText(title)}</title>`)
  out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonical}$2`)
  out = replaceMeta(out, 'name="description"', description)
  out = replaceMeta(out, 'property="og:title"', title)
  out = replaceMeta(out, 'property="og:description"', description)
  out = replaceMeta(out, 'property="og:url"', canonical)
  out = replaceMeta(out, 'name="twitter:title"', title)
  out = replaceMeta(out, 'name="twitter:description"', description)
  return out
}

const shell = readFileSync(join(DIST, 'index.html'), 'utf8')

let written = 0
for (const route of ROUTES) {
  const html = applyHead(shell, route)
  // '/' overwrites the root index.html; every other route → dist/<path>/index.html
  const outDir = route.path === '/' ? DIST : join(DIST, route.path)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
  written++
}

console.log(`Prerendered ${written} route heads (${CORE.length} core + ${SERVICES.length} services).`)
