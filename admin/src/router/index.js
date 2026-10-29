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
  const { verify, isAuthenticated } = useAuth()

  if (to.meta.requiresAuth) {
    await verify()
    if (!isAuthenticated.value) {
      return { name: 'Login', query: to.fullPath !== '/' ? { next: to.fullPath } : undefined }
    }
  }

  if (to.name === 'Login') {
    await verify()
    if (isAuthenticated.value) return { name: 'Inbox' }
  }
})

router.afterEach((to) => {
  if (typeof document === 'undefined') return
  // Views that own a live title (the inbox's unread count) set their own.
  if (to.meta?.title) document.title = `${to.meta.title} | ${BRAND}`
})

export default router
