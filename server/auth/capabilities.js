// What a signed-in staff account may do.
//
// Routes and screens check capabilities, never role names: a role is only a
// named bundle of capabilities, and an administrator can add or remove single
// capabilities for one account (admin_users.capability_grants / _revokes)
// without inventing a new role. Accounts are provisioned and changed with
// server/scripts/staff.js (docs/staff-accounts.md); there is no screen for it.
//
// Keep descriptions short and concrete: staff.js prints them.
export const CAPABILITIES = {
  'crm.view': 'Read website leads, their notes and email replies',
  'crm.manage': 'Work leads: reply by email, change status, mark read or archived, add notes',
  'crm.export': 'Download every lead as a CSV file',
  'whatsapp.view': 'Read WhatsApp conversations, internal notes and assignments',
  'whatsapp.send': 'Send WhatsApp replies from the portal (within the rules in docs/staff-accounts.md)',
  'whatsapp.manage': 'Assign WhatsApp conversations, add internal notes, close and reopen',
  'whatsapp.contacts': 'Edit client WhatsApp numbers and record consent (opt in or out)',
  'billing.status': 'Read-only invoice list: status, balance and next due date',
  'billing.view': 'Read all billing records: overview, invoice history, imports, sync runs, reminders, integration status',
  'billing.import': 'Upload, map, approve or cancel eImmigration report imports',
  'billing.reconcile': 'Link billing clients to monday.com items',
  'billing.sync': 'Preview and apply the monday.com payment-status sync',
  'billing.reminders': 'Draft, approve, cancel, retry and resolve payment reminders; review client replies',
  'billing.configure': 'monday.com board mapping and connection check; reminder rules, templates and sending hours',
}

export const ALL_CAPABILITIES = Object.freeze(Object.keys(CAPABILITIES))

export const ROLES = {
  // Every capability, now and later. Existing accounts are admins.
  admin: { label: 'Administrator', capabilities: ALL_CAPABILITIES },
  // The view-only account that existed before these roles: the lead inbox as
  // it always worked, and billing to read.
  staff: {
    label: 'Staff (view billing)',
    capabilities: ['crm.view', 'crm.manage', 'crm.export', 'billing.status', 'billing.view'],
  },
  front_desk: {
    label: 'Front desk',
    capabilities: [
      'crm.view', 'crm.manage', 'crm.export',
      'whatsapp.view', 'whatsapp.send', 'whatsapp.manage', 'whatsapp.contacts',
      'billing.status',
    ],
  },
  // No website leads (Messages: inbox and contacts); the firm keeps those
  // with the front desk.
  billing_paralegal: {
    label: 'Billing paralegal',
    capabilities: [
      'whatsapp.view', 'whatsapp.send', 'whatsapp.manage', 'whatsapp.contacts',
      'billing.status', 'billing.view', 'billing.import', 'billing.reconcile', 'billing.sync', 'billing.reminders',
    ],
  },
}

export const ROLE_NAMES = Object.freeze(Object.keys(ROLES))

/**
 * The capabilities an account actually has. Unknown names (a typo in the
 * database, a capability since removed) grant nothing. An unknown role
 * grants nothing either: failing closed beats guessing.
 */
export function resolveCapabilities({ role, grants = [], revokes = [] } = {}) {
  const known = (list) => (Array.isArray(list) ? list : []).filter((c) => Object.hasOwn(CAPABILITIES, c))
  const base = ROLES[role]?.capabilities ?? []
  const out = new Set([...base, ...known(grants)])
  for (const c of known(revokes)) out.delete(c)
  return out
}

export const isCapability = (name) => Object.hasOwn(CAPABILITIES, name)
export const isRole = (name) => Object.hasOwn(ROLES, name)

export default { CAPABILITIES, ALL_CAPABILITIES, ROLES, ROLE_NAMES, resolveCapabilities, isCapability, isRole }
