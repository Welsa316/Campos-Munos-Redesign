import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'
import { routes } from './routes.js'

const BRAND = 'Campos Muños Law'

const router = createRouter({
  // BASE_URL is '/' on admin.camulaw.com and '/admin/' in the transitional
  // single-service deployment, so the same build logic serves both.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const { verify, isAuthenticated, canAny, homeRoute } = useAuth()

  if (to.meta.requiresAuth) {
    await verify()
    if (!isAuthenticated.value) {
      return { name: 'Login', query: to.fullPath !== '/' ? { next: to.fullPath } : undefined }
    }
    // A screen this account may not use sends it to one it may. The API
    // refuses the data either way; this only keeps people off dead ends.
    const allowed = (meta) => !meta?.capability || canAny(...[].concat(meta.capability))
    if (!to.matched.every((r) => allowed(r.meta))) {
      // Within a section, the first tab it may use (front desk asking for
      // Billing gets the invoice list); otherwise its home screen.
      const tab = (to.matched[0].children || []).find((c) => c.name && allowed(c.meta))
      if (allowed(to.matched[0].meta) && tab) return { name: tab.name }
      const home = homeRoute()
      return home.name === to.name ? { name: 'NoAccess' } : home
    }
  }

  if (to.name === 'Login') {
    await verify()
    if (isAuthenticated.value) return homeRoute()
  }
})

router.afterEach((to) => {
  if (typeof document === 'undefined') return
  // Views that own a live title (the inbox's unread count) set their own.
  if (to.meta?.title) document.title = `${to.meta.title} | ${BRAND}`
})

export default router
