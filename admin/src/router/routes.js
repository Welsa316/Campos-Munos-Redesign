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
    meta: { requiresAuth: true, module: 'messages', capability: 'crm.view' } },

  // WhatsApp module: the shared conversation inbox.
  { path: '/whatsapp/:id(\\d+)?', name: 'WhatsApp', component: () => import('../modules/whatsapp/WhatsAppView.vue'),
    meta: { requiresAuth: true, module: 'whatsapp', capability: 'whatsapp.view', title: 'WhatsApp' } },

  // Billing module: eImmigration imports, invoices, matching, monday.com sync.
  { path: '/billing', component: () => import('../modules/billing/BillingLayout.vue'),
    meta: { requiresAuth: true, module: 'billing' },
    // Each tab names the capability it needs (server/auth/capabilities.js).
    children: [
      { path: '', name: 'BillingOverview', meta: { capability: 'billing.view' }, component: () => import('../modules/billing/views/OverviewView.vue') },
      { path: 'invoices', name: 'BillingInvoices', meta: { capability: 'billing.status' }, component: () => import('../modules/billing/views/InvoicesView.vue') },
      { path: 'imports', name: 'BillingImports', meta: { capability: 'billing.view' }, component: () => import('../modules/billing/views/ImportsView.vue') },
      { path: 'imports/:id(\\d+)', name: 'BillingImportDetail', meta: { capability: 'billing.view' }, component: () => import('../modules/billing/views/ImportDetailView.vue') },
      { path: 'matching', name: 'BillingMatching', meta: { capability: 'billing.reconcile' }, component: () => import('../modules/billing/views/MatchingView.vue') },
      { path: 'reminders', name: 'BillingReminders', meta: { capability: 'billing.view' }, component: () => import('../modules/billing/views/RemindersView.vue') },
      { path: 'contacts', name: 'BillingContacts', meta: { capability: 'whatsapp.contacts' }, component: () => import('../modules/billing/views/ContactsView.vue') },
      { path: 'monday', name: 'BillingMonday', meta: { capability: 'billing.view' }, component: () => import('../modules/billing/views/MondayView.vue') },
      { path: 'integrations', name: 'BillingSettings', meta: { capability: 'billing.view' }, component: () => import('../modules/billing/views/IntegrationsView.vue') },
    ] },

  // Sales demo of the operations layer. Fabricated data only, no API calls.
  // Deliberately public within the portal (as it was under /admin) and not
  // linked from anywhere.
  { path: '/demo/operations', name: 'OperationsDemo', component: () => import('../views/OperationsDemo.vue'),
    meta: { title: 'Operations Demo' } },

  // Old in-app links pointed at /admin/login; inside the standalone portal the
  // same intent is /login.
  { path: '/admin', redirect: '/' },
  { path: '/admin/:rest(.*)', redirect: (to) => `/${to.params.rest}` },

  // Signed in, but the account has no section it may open.
  { path: '/no-access', name: 'NoAccess', component: () => import('../views/NoAccessView.vue'),
    meta: { requiresAuth: true, title: 'No access' } },

  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Not found' } },
]
