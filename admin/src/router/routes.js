// Route table for the staff portal, grouped by module.
//
// Each module owns a path prefix and a lazy chunk (meta.module names it), so a
// new section — the billing importer, monday.com sync and WhatsApp reminder
// queue in docs/billing-automation-plan.md — is a block of routes under its own
// prefix (e.g. /billing/*) plus a folder under src/modules/, without touching
// the inbox. See docs/architecture-split.md, "Adding a portal module".
//
// Paths are relative to the router base: '/' here is admin.camulaw.com/ in the
// standalone deployment and camulaw.com/admin/ in the transitional one, which
// keeps every URL staff have bookmarked (/admin, /admin/login,
// /admin/demo/operations) working through the cutover.
export const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue'),
    meta: { title: 'Sign in' } },

  // Messages module: lead inbox + contacts pipeline.
  { path: '/', name: 'Inbox', component: () => import('../views/InboxView.vue'),
    meta: { requiresAuth: true, module: 'messages' } },

  // Sales demo of the operations layer. Fabricated data only, no API calls.
  // Deliberately public within the portal (as it was under /admin) and not
  // linked from anywhere.
  { path: '/demo/operations', name: 'OperationsDemo', component: () => import('../views/OperationsDemo.vue'),
    meta: { title: 'Operations Demo' } },

  // Old in-app links pointed at /admin/login; inside the standalone portal the
  // same intent is /login.
  { path: '/admin', redirect: '/' },
  { path: '/admin/:rest(.*)', redirect: (to) => `/${to.params.rest}` },

  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Not found' } },
]
