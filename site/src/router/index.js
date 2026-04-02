import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'Home', component: () => import('../views/HomePage.vue') },
  { path: '/servicios', name: 'Services', component: () => import('../views/ServicesPage.vue') },
  { path: '/servicios/:service/:location', name: 'ServiceDetailLocation', component: () => import('../views/ServiceDetailPage.vue'), props: true },
  { path: '/servicios/:slug', name: 'ServiceDetail', component: () => import('../views/ServiceDetailPage.vue'), props: true },
  { path: '/consulta', name: 'Contact', component: () => import('../views/ContactPage.vue') },
  { path: '/pago', name: 'Payment', component: () => import('../views/PaymentPage.vue') },
  { path: '/acerca-de', name: 'About', component: () => import('../views/AboutPage.vue') },
  { path: '/el-equipo', name: 'Team', component: () => import('../views/TeamPage.vue') },
  { path: '/el-equipo/:member', name: 'TeamMember', component: () => import('../views/TeamMemberPage.vue'), props: true },
  { path: '/admin/login', name: 'AdminLogin', component: () => import('../views/AdminLogin.vue') },
  { path: '/admin', name: 'AdminDashboard', component: () => import('../views/AdminDashboard.vue'), meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
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
