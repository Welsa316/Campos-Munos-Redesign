// What a signed-in staff account may do.
//
// Routes and screens check capabilities, never role names: a role is only a
// named bundle of capabilities, and an administrator can add or remove single
// capabilities for one account (admin_users.capability_grants / _revokes)
// without inventing a new role. Accounts are provisioned and changed on the
// portal's Team tab, or with server/scripts/staff.js (docs/staff-accounts.md).
//
// Keep descriptions short and concrete: staff.js prints them and the Team
// tab shows them.
export const CAPABILITIES = {
  'crm.view': 'Read website leads, their notes and email replies',
  'crm.manage': 'Work leads: reply by email, change status, mark read or archived, add notes',
  'crm.export': 'Download every lead as a CSV file',
  'whatsapp.view': 'Read WhatsApp conversations, internal notes and assignments',
  'whatsapp.send': 'Send WhatsApp replies from the portal',
  'whatsapp.manage': 'Assign WhatsApp conversations, add internal notes, close and reopen',
  'whatsapp.contacts': 'Edit client WhatsApp numbers and record consent (opt in or out)',
  'billing.status': 'Read-only invoice list: status, balance and next due date',
  'billing.view': 'Read all billing records: overview, invoice history, imports, sync runs, reminders',
  'billing.import': 'Upload, map, approve or cancel eImmigration report imports',
  'billing.reconcile': 'Link billing clients to monday.com items',
  'billing.sync': 'Preview and apply the monday.com payment-status sync',
  'billing.reminders': 'Draft, approve, cancel, retry and resolve payment reminders; review client replies',
  'billing.configure': 'Reminder rules, templates and sending hours; the firm-wide WhatsApp consent setting',
  'calls.view': 'See the RingCentral call log: who called, answered or missed, when, and refresh it',
  'calls.place': 'Call a number from the portal (RingCentral RingOut rings your own phone first, then the client)',
  'calls.exclude': 'Mark missed calls that need no callback (verification codes, test calls, spam) so they leave the missed-call counts',
  // Administrator only (ADMIN_ONLY below): connecting an account grants the
  // API standing access to the firm's phone system, the monday.com mapping
  // decides what the sync writes to the firm's board, and the activity log
  // shows what every person did.
  'integrations.view': 'See the status of every connected service (eImmigration, monday.com, WhatsApp, RingCentral)',
  'integrations.manage': "Connect, check or disconnect the firm's RingCentral account (OAuth)",
  'monday.configure': 'monday.com board and column mapping, status labels and connection check',
  'activity.view': 'Read the activity log: every change made in the portal, by whom and when',
  'calls.clear': 'Calls: mark every open call in Needs attention as handled at once (for example after fixing the phone system’s routing)',
  'team.manage': 'Team: create accounts, change roles and single permissions, revoke or restore access, sign people out, reset passwords',
}

// Held by the admin role and nobody else: no other role includes them and a
// per-account grant of one is ignored, so the only way to hold one is to be
// an administrator.
export const ADMIN_ONLY = Object.freeze(['integrations.view', 'integrations.manage', 'monday.configure', 'activity.view', 'team.manage', 'calls.clear'])

export const ALL_CAPABILITIES = Object.freeze(Object.keys(CAPABILITIES))

export const ROLES = {
  // Every capability, now and later, including the ADMIN_ONLY ones. Meant
  // for one account (the developer's); the firm's own logins use the
  // narrower roles below.
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
      'calls.view', 'calls.place', 'calls.exclude',
    ],
  },
  // Phones and WhatsApp, and the website intake inbox to read (not to work:
  // no replies, status changes, notes or export). No billing (not even
  // payment status), no WhatsApp contact/consent records (those live under
  // Billing).
  receptionist: {
    label: 'Receptionist',
    capabilities: ['crm.view', 'whatsapp.view', 'whatsapp.send', 'whatsapp.manage', 'calls.view', 'calls.place', 'calls.exclude'],
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
  const out = new Set([...base, ...known(grants).filter((c) => !ADMIN_ONLY.includes(c))])
  for (const c of known(revokes)) out.delete(c)
  return out
}

export const isCapability = (name) => Object.hasOwn(CAPABILITIES, name)
export const isRole = (name) => Object.hasOwn(ROLES, name)

export default { CAPABILITIES, ALL_CAPABILITIES, ADMIN_ONLY, ROLES, ROLE_NAMES, resolveCapabilities, isCapability, isRole }
