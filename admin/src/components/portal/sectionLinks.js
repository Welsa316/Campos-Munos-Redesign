// The rules behind SectionLinks.vue (every section's header links), apart
// from the component so they are tested: which sections an account sees,
// from which width each link carries its text label, and what a screen
// reader hears for it. Tested in admin/test/sectionLinks.test.js.

export const SECTIONS = [
  { key: 'home', label: 'Home', icon: 'house', to: { name: 'Home' }, any: [] },
  // What changed, for everyone (each sees the entries for what they can open).
  { key: 'updates', label: 'Updates', icon: 'bullhorn', to: { name: 'Updates' }, any: [] },
  { key: 'messages', label: 'Messages', icon: 'inbox', to: { name: 'Inbox' }, any: ['crm.view'] },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'comments', to: { name: 'WhatsApp' }, any: ['whatsapp.view'] },
  // The router moves an account without billing.view to the first billing
  // tab it may open.
  { key: 'billing', label: 'Billing', icon: 'file-invoice-dollar', to: { name: 'BillingOverview' }, any: ['billing.view', 'billing.status', 'whatsapp.contacts'] },
  { key: 'calls', label: 'Calls', icon: 'phone-volume', to: { name: 'Calls' }, any: ['calls.view'] },
  // Administrators only: connecting RingCentral, accounts, the activity log,
  // test forms.
  { key: 'integrations', label: 'Integrations', icon: 'plug', to: { name: 'Integrations' }, any: ['integrations.manage'], admin: true },
  { key: 'team', label: 'Team', icon: 'users', to: { name: 'Team' }, any: ['team.manage'], admin: true },
  { key: 'activity', label: 'Activity', icon: 'clock-rotate-left', to: { name: 'Activity' }, any: ['activity.view'], admin: true },
  { key: 'test-channel', label: 'Test channel', icon: 'flask', to: { name: 'TestChannel' }, any: ['forms.test'], admin: true },
]

/** The sections this account may open, except the one it is on. An empty `any` means everyone. */
export const visibleSections = (current, canAny) =>
  SECTIONS.filter((s) => s.key !== current && (!s.any.length || canAny(...s.any)))

// Whole class names, so Tailwind sees them.
// 'never': icons only (the Messages header, the busiest in the portal).
const LABEL_AT = { sm: 'hidden sm:inline', lg: 'hidden lg:inline', xl: 'hidden xl:inline', '2xl': 'hidden 2xl:inline', never: 'hidden' }
const UNLABELLED_AT = { sm: 'sm:hidden', lg: 'lg:hidden', xl: 'xl:hidden', '2xl': '2xl:hidden', never: '' }
export const LABEL_WIDTHS = Object.keys(LABEL_AT)

/**
 * The classes that show a link's text label from a width on. An unknown
 * value shows icons only, rather than every label at once (which once made
 * the Messages header overflow onto itself).
 */
export const labelClass = (at) => (Object.hasOwn(LABEL_AT, at) ? LABEL_AT[at] : LABEL_AT.never)
/** The classes for what shows only while there is no label (the Updates dot). */
export const unlabelledClass = (at) => (Object.hasOwn(UNLABELLED_AT, at) ? UNLABELLED_AT[at] : UNLABELLED_AT.never)

/**
 * What a screen reader hears for a link. The accessible name comes from
 * aria-label, which replaces the link's text, so "new" has to be in it.
 */
export const linkName = (s, updatesNew) => (s.key === 'updates' && updatesNew ? `${s.label}, new` : s.label)
