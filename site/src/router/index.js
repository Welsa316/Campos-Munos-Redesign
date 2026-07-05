import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const BRAND = 'Campos Muños Law'
const CANONICAL_BASE = 'https://camulaw.com'
const DEFAULT_DESCRIPTION = 'Campos Muños Law — abogados de inmigración con más de veinte años de experiencia en Nueva Orleans, Louisiana. Atendemos casos en los 50 estados.'

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'Home', component: () => import('../views/HomePage.vue'),
    meta: { title: 'Abogados de Inmigración en Nueva Orleans',
      description: 'Abogados de inmigración con más de veinte años de experiencia en Nueva Orleans, Louisiana. Atendemos casos en los 50 estados.' } },
  { path: '/servicios', name: 'Services', component: () => import('../views/ServicesPage.vue'),
    meta: { title: 'Servicios de Inmigración',
      description: 'Servicios de inmigración: visas, residencia permanente, ciudadanía, asilo y defensa contra deportación en Nueva Orleans, Louisiana.' } },
  { path: '/servicios/:service/:location', name: 'ServiceDetailLocation', component: () => import('../views/ServiceDetailPage.vue'), props: true },
  { path: '/servicios/:slug', name: 'ServiceDetail', component: () => import('../views/ServiceDetailPage.vue'), props: true },
  { path: '/consulta', name: 'Contact', component: () => import('../views/ContactPage.vue'),
    meta: { title: 'Consulta — Contáctenos',
      description: 'Contáctenos para programar una consulta con nuestros abogados de inmigración en Nueva Orleans, Louisiana.' } },
  { path: '/pago', name: 'Payment', component: () => import('../views/PaymentPage.vue'),
    meta: { title: 'Pago',
      description: 'Realice un pago seguro en línea a Campos Muños Law, abogados de inmigración en Nueva Orleans, Louisiana.' } },
  { path: '/acerca-de', name: 'About', component: () => import('../views/AboutPage.vue'),
    meta: { title: 'Acerca de Nosotros',
      description: 'Conozca a Campos Muños Law: abogados de inmigración con más de veinte años de experiencia sirviendo a la comunidad en Nueva Orleans, Louisiana.' } },
  { path: '/el-equipo', redirect: '/acerca-de#equipo' },
  { path: '/el-equipo/:member', name: 'TeamMember', component: () => import('../views/TeamMemberPage.vue'), props: true },
  { path: '/admin/login', name: 'AdminLogin', component: () => import('../views/AdminLogin.vue'),
    meta: { title: 'Admin Login' } },
  { path: '/admin', name: 'AdminDashboard', component: () => import('../views/AdminDashboard.vue'),
    meta: { requiresAuth: true, title: 'Admin Dashboard' } },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundPage.vue'),
    meta: { description: 'Página no encontrada. Regrese al inicio de Campos Muños Law, abogados de inmigración en Nueva Orleans, Louisiana.' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }
    return { top: 0 }
  },
})

// Upsert a <meta name="..."> element and set its content.
function setMetaByName(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// Upsert a <meta property="..."> (Open Graph) element and set its content.
function setMetaByProperty(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// Upsert <link rel="canonical"> and set its href.
function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

// Per-route metadata. ServiceDetailPage + TeamMemberPage + NotFoundPage
// override title/description dynamically after they mount with the actual
// service / member / 404 values, so this sets the static-route defaults
// (and prevents stale metadata when navigating away from a service page).
//
// The static index.html ships homepage-only canonical/og tags, so on every
// navigation we rewrite canonical + og:url from the resolved path — this is
// correct for service pages too, which is why we always set them here.
router.afterEach((to) => {
  if (typeof document === 'undefined') return

  // Service-detail routes let ServiceDetailPage own title + description
  // (its watchEffect runs a tick after mount and would otherwise be
  // clobbered back to a generic value). We still set canonical + og:* here.
  const isServiceDetail = /^\/servicios\/[^/]+/.test(to.path)

  const title = to.meta?.title ? `${to.meta.title} | ${BRAND}` : document.title
  const description = to.meta?.description || DEFAULT_DESCRIPTION
  const canonicalUrl = `${CANONICAL_BASE}${to.path}`

  if (to.meta?.title && !isServiceDetail) {
    document.title = title
  }
  if (!isServiceDetail) {
    setMetaByName('description', description)
    setMetaByProperty('og:description', description)
  }

  setCanonical(canonicalUrl)
  setMetaByProperty('og:url', canonicalUrl)
  setMetaByProperty('og:title', title)
})

router.beforeEach(async (to) => {
  const { verify, isAuthenticated } = useAuth()

  if (to.meta.requiresAuth) {
    await verify()
    if (!isAuthenticated.value) {
      return { name: 'AdminLogin' }
    }
  }

  if (to.name === 'AdminLogin') {
    await verify()
    if (isAuthenticated.value) {
      return { name: 'AdminDashboard' }
    }
  }
})

export default router
