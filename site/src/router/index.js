import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const BRAND = 'Campos Muños Law'

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'Home', component: () => import('../views/HomePage.vue'),
    meta: { title: 'Abogados de Inmigración en Nueva Orleans' } },
  { path: '/servicios', name: 'Services', component: () => import('../views/ServicesPage.vue'),
    meta: { title: 'Servicios de Inmigración' } },
  { path: '/servicios/:service/:location', name: 'ServiceDetailLocation', component: () => import('../views/ServiceDetailPage.vue'), props: true },
  { path: '/servicios/:slug', name: 'ServiceDetail', component: () => import('../views/ServiceDetailPage.vue'), props: true },
  { path: '/consulta', name: 'Contact', component: () => import('../views/ContactPage.vue'),
    meta: { title: 'Consulta — Contáctenos' } },
  { path: '/pago', name: 'Payment', component: () => import('../views/PaymentPage.vue'),
    meta: { title: 'Pago' } },
  { path: '/acerca-de', name: 'About', component: () => import('../views/AboutPage.vue'),
    meta: { title: 'Acerca de Nosotros' } },
  { path: '/el-equipo', redirect: '/acerca-de#equipo' },
  { path: '/el-equipo/:member', name: 'TeamMember', component: () => import('../views/TeamMemberPage.vue'), props: true },
  { path: '/admin/login', name: 'AdminLogin', component: () => import('../views/AdminLogin.vue'),
    meta: { title: 'Admin Login' } },
  { path: '/admin', name: 'AdminDashboard', component: () => import('../views/AdminDashboard.vue'),
    meta: { requiresAuth: true, title: 'Admin Dashboard' } },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundPage.vue') },
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

// Default per-route title from meta. ServiceDetailPage + TeamMemberPage +
// NotFoundPage override this dynamically after they mount with the actual
// service / member / 404 title, so this only fires for the static routes
// (and prevents stale titles when navigating away from a service page).
router.afterEach((to) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} | ${BRAND}`
  }
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
