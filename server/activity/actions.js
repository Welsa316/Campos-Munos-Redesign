// What the activity log calls each request (docs/staff-accounts.md,
// "Activity log"). Keyed by method and the route pattern Express matched.
//
// Every request that changes something is logged, catalogued here or not: an
// unlisted one is recorded under its method and path, and
// server/activity.test.js fails until it is listed. Reads are logged only
// when listed (downloads, for example); the rest would bury the changes.
//
// details(req) picks what is worth keeping from the request. Never message
// text, notes, passwords or full phone numbers: those stay in their own
// tables, where the row's entity id leads.
const body = (req) => req.body || {}
const last4 = (v) => (typeof v === 'string' && v.replace(/\D/g, '').length >= 4 ? `…${v.replace(/\D/g, '').slice(-4)}` : null)
const count = (v) => (Array.isArray(v) ? v.length : undefined)

export const ACTIONS = {
  // Signing in and the account itself
  'POST /api/auth/login': { key: 'auth.sign_in', label: 'Signed in', entity: 'account', anonymous: true,
    details: (req) => ({ email: typeof body(req).email === 'string' ? body(req).email.slice(0, 120) : undefined }) },
  'POST /api/auth/logout': { key: 'auth.sign_out', label: 'Signed out', entity: 'account' },
  'POST /api/auth/change-password': { key: 'auth.password_changed', label: 'Changed their own password', entity: 'account' },
  'PUT /api/auth/avatar': { key: 'auth.avatar_changed', label: 'Changed their profile picture', entity: 'account' },
  // Colours only; not worth a line.
  'PUT /api/auth/theme': { skip: true },

  // Desktop notifications (their own computers only)
  'POST /api/push/subscriptions': { key: 'push.enabled', label: 'Turned on desktop notifications on a computer', entity: 'account' },
  'DELETE /api/push/subscriptions': { key: 'push.disabled', label: 'Turned off desktop notifications on a computer', entity: 'account' },
  // A read sent as POST (the endpoint stays out of the URL); not worth a line.
  'POST /api/push/subscriptions/status': { skip: true },
  'POST /api/push/test': { key: 'push.tested', label: 'Sent themselves a test notification', entity: 'account' },
  'POST /api/notifications/test': { key: 'notifications.tested', label: 'Sent themselves a test notification in the desktop app', entity: 'account' },

  // Website leads (Messages)
  'PATCH /api/submissions/:id/read': { key: 'lead.read', label: 'Marked a lead read or unread', entity: 'lead',
    details: (req) => ({ read: body(req).read !== false }) },
  'PATCH /api/submissions/:id/archive': { key: 'lead.archived', label: 'Archived or restored a lead', entity: 'lead',
    details: (req) => ({ archived: body(req).archived !== false }) },
  'PATCH /api/submissions/:id/status': { key: 'lead.status', label: 'Changed a lead’s status', entity: 'lead',
    details: (req) => ({ status: body(req).status }) },
  'POST /api/submissions/:id/notes': { key: 'lead.note_added', label: 'Added a note to a lead', entity: 'lead' },
  'DELETE /api/submissions/:id/notes/:noteId': { key: 'lead.note_deleted', label: 'Deleted a note on a lead', entity: 'lead' },
  'POST /api/submissions/:id/reply': { key: 'lead.replied', label: 'Emailed a lead', entity: 'lead' },
  'GET /api/submissions/export/csv': { key: 'lead.exported', label: 'Downloaded every lead as CSV' },
  'PATCH /api/submissions/:id/automation': { key: 'lead.automation', label: 'Stopped or allowed automatic messages to a lead', entity: 'lead',
    details: (req) => ({ paused: body(req).paused === true }) },
  'PUT /api/submissions/:id/owner': { key: 'lead.owner', label: 'Changed who follows a lead up', entity: 'lead',
    details: (req) => ({ ownerId: body(req).ownerId ?? null }) },
  'POST /api/submissions/:id/spam': { key: 'lead.spam', label: 'Marked a lead as spam or not spam', entity: 'lead',
    details: (req) => ({ state: body(req).state }) },
  'POST /api/submissions/:id/text-replies/handled': { key: 'lead.text_replies_handled', label: 'Marked a lead’s text replies as seen to', entity: 'lead' },

  // Automation (administrator): what the portal does on its own
  'PUT /api/automation/flags/:key': { key: 'automation.paused', label: 'Paused or resumed an automation' },
  'PUT /api/automation/settings/:section': { key: 'automation.settings', label: 'Changed the automation settings' },
  'POST /api/automation/jobs/:id/retry': { key: 'automation.job_retried', label: 'Retried a failed automatic step', entity: 'job' },
  'POST /api/automation/jobs/:id/acknowledge': { key: 'automation.job_dismissed', label: 'Dismissed a failed automatic step', entity: 'job' },
  'POST /api/automation/suppressions': { key: 'automation.suppressed', label: 'Added someone to the no-automatic-messages list' },
  'DELETE /api/automation/suppressions/:id': { key: 'automation.unsuppressed', label: 'Removed someone from the no-automatic-messages list', entity: 'suppression' },
  'POST /api/automation/spam/apply': { key: 'automation.spam_applied', label: 'Ran the vendor rules over new leads' },
  'POST /api/automation/sms/check': { key: 'automation.sms_checked', label: 'Checked whether RingCentral can send text messages' },

  // Test channel (administrator only): test forms kept out of the inbox
  'POST /api/test-channel/link': { key: 'test_channel.link', label: 'Made a test link for the website forms' },
  'DELETE /api/test-channel/:id': { key: 'test_channel.removed', label: 'Removed a test form', entity: 'test_form' },
  'DELETE /api/test-channel': { key: 'test_channel.cleared', label: 'Cleared the test channel' },

  // WhatsApp inbox
  'POST /api/whatsapp/conversations/:id/messages': { key: 'whatsapp.replied', label: 'Sent a WhatsApp reply', entity: 'conversation' },
  'POST /api/whatsapp/conversations/:id/notes': { key: 'whatsapp.note_added', label: 'Added a note to a WhatsApp conversation', entity: 'conversation' },
  'PUT /api/whatsapp/conversations/:id/assignee': { key: 'whatsapp.assigned', label: 'Reassigned a WhatsApp conversation', entity: 'conversation',
    details: (req) => ({ assigneeId: body(req).accountId ?? null }) },
  'PUT /api/whatsapp/conversations/:id/status': { key: 'whatsapp.status', label: 'Closed or reopened a WhatsApp conversation', entity: 'conversation',
    details: (req) => ({ status: body(req).status }) },

  // Calls (RingCentral)
  'POST /api/calls/sync': { key: 'calls.refreshed', label: 'Refreshed the call log' },
  'POST /api/calls/:id/exclusion': { key: 'calls.excluded', label: 'Marked a missed call as needing no callback', entity: 'call',
    details: (req) => ({ reason: body(req).reason, scope: body(req).scope }) },
  'POST /api/calls/:id/handled': { key: 'calls.handled', label: 'Marked a call handled', entity: 'call' },
  'DELETE /api/calls/:id/handled': { key: 'calls.reopened', label: 'Reopened a handled call', entity: 'call' },
  'POST /api/contacts/notes': { key: 'contacts.note_added', label: 'Added a note to a call', entity: 'call', details: (req) => ({ callId: Number(body(req).callId) || undefined }) },
  'PATCH /api/contacts/notes/:id': { key: 'contacts.note_edited', label: 'Edited a call note', entity: 'note' },
  'DELETE /api/contacts/notes/:id': { key: 'contacts.note_deleted', label: 'Deleted a call note', entity: 'note' },
  'PUT /api/contacts/matches': { key: 'contacts.match_decided', label: 'Decided whether a website lead is the same person as a caller', entity: 'lead', details: (req) => ({ lead: Number(body(req).lead) || undefined, state: typeof body(req).state === 'string' ? body(req).state : undefined }) },
  'POST /api/calls/episodes/handled': { key: 'calls.episode_handled', label: 'Marked a caller’s unanswered calls handled', entity: 'call',
    details: (req) => ({ calls: Array.isArray(body(req).callIds) ? body(req).callIds.length : 0 }) },
  'POST /api/calls/episodes/reopen': { key: 'calls.episode_reopened', label: 'Reopened a caller’s handled calls', entity: 'call',
    details: (req) => ({ calls: Array.isArray(body(req).callIds) ? body(req).callIds.length : 0 }) },
  'POST /api/calls/handled/bulk': { key: 'calls.cleared', label: 'Cleared Needs attention (marked every open call handled)', entity: 'call' },
  'DELETE /api/calls/handled/bulk/:batch': { key: 'calls.clear_undone', label: 'Undid clearing Needs attention', entity: 'call' },
  'DELETE /api/calls/:id/exclusion': { key: 'calls.included', label: 'Put a missed call back in the counts', entity: 'call' },
  'PUT /api/calls/ringout/me': { key: 'calls.own_phone', label: 'Changed the phone their calls ring first' },
  'POST /api/calls/ringout': { key: 'calls.placed', label: 'Placed a call from the portal',
    details: (req) => ({ to: last4(body(req).to) }) },
  'DELETE /api/calls/ringout/:id': { key: 'calls.cancelled', label: 'Cancelled a call from the portal', entity: 'ringout' },

  // Callback reminders (on a caller or a website lead). Never the note.
  'POST /api/reminders': { key: 'followups.set', label: 'Set a callback reminder', entity: 'followup',
    details: (req) => ({ target: typeof body(req).target?.kind === 'string' ? body(req).target.kind : undefined, assigned: body(req).assignee != null }) },
  'PATCH /api/reminders/:id': { key: 'followups.changed', label: 'Changed a callback reminder', entity: 'followup',
    details: (req) => ({ time: body(req).dueAt !== undefined, assignee: body(req).assignee !== undefined, note: body(req).note !== undefined }) },
  'POST /api/reminders/:id/complete': { key: 'followups.done', label: 'Marked a callback reminder done', entity: 'followup' },
  'POST /api/reminders/:id/cancel': { key: 'followups.cancelled', label: 'Cancelled a callback reminder', entity: 'followup' },
  'POST /api/reminders/:id/snooze': { key: 'followups.snoozed', label: 'Snoozed a callback reminder', entity: 'followup',
    details: (req) => ({ minutes: Number(body(req).minutes) || undefined }) },

  // Integrations
  'POST /api/integrations/ringcentral/authorize': { key: 'integrations.rc_authorize', label: 'Started connecting RingCentral' },
  'GET /api/integrations/ringcentral/callback': { key: 'integrations.rc_connected', label: 'Finished connecting RingCentral' },
  'POST /api/integrations/ringcentral/refresh': { key: 'integrations.rc_checked', label: 'Checked the RingCentral connection' },
  'POST /api/integrations/ringcentral/disconnect': { key: 'integrations.rc_disconnected', label: 'Disconnected RingCentral' },
  'POST /api/integrations/ringcentral/events': { key: 'integrations.rc_events_registered', label: 'Registered RingCentral live call events' },
  'POST /api/integrations/ringcentral/events/check': { key: 'integrations.rc_events_checked', label: 'Checked the RingCentral live call events' },
  'DELETE /api/integrations/ringcentral/events': { key: 'integrations.rc_events_removed', label: 'Removed RingCentral live call events' },

  // Billing
  'POST /api/billing/imports': { key: 'billing.import_uploaded', label: 'Uploaded an eImmigration report' },
  'POST /api/billing/imports/:id/preview': { key: 'billing.import_previewed', label: 'Previewed an eImmigration import', entity: 'import' },
  'POST /api/billing/imports/:id/approve': { key: 'billing.import_approved', label: 'Approved an eImmigration import', entity: 'import' },
  'POST /api/billing/imports/:id/cancel': { key: 'billing.import_cancelled', label: 'Cancelled an eImmigration import', entity: 'import' },
  'GET /api/billing/imports/:id/exceptions.csv': { key: 'billing.import_exceptions', label: 'Downloaded an import’s exceptions', entity: 'import' },
  'POST /api/billing/matching/:clientId': { key: 'billing.linked', label: 'Linked a client to a monday.com item', entity: 'client',
    details: (req) => ({ itemId: body(req).mondayItemId }) },
  'DELETE /api/billing/matching/:clientId/:itemId': { key: 'billing.unlinked', label: 'Unlinked a client from a monday.com item', entity: 'client' },
  'POST /api/billing/monday/check': { key: 'monday.checked', label: 'Checked the monday.com connection' },
  'PUT /api/billing/monday/config': { key: 'monday.mapping_saved', label: 'Changed the monday.com board and columns',
    details: (req) => ({ boardId: body(req).boardId }) },
  'POST /api/billing/monday/sync/preview': { key: 'monday.sync_previewed', label: 'Previewed the monday.com sync' },
  'POST /api/billing/monday/sync/:jobId/apply': { key: 'monday.sync_applied', label: 'Applied the monday.com sync', entity: 'sync' },
  'POST /api/billing/reminders/evaluate': { key: 'reminders.drafted', label: 'Drafted payment reminders' },
  'POST /api/billing/reminders/approve': { key: 'reminders.approved', label: 'Approved payment reminders',
    details: (req) => ({ count: count(body(req).ids) }) },
  'POST /api/billing/reminders/:id/cancel': { key: 'reminders.cancelled', label: 'Cancelled a payment reminder', entity: 'reminder' },
  'POST /api/billing/reminders/:id/retry': { key: 'reminders.retried', label: 'Retried a payment reminder', entity: 'reminder' },
  'POST /api/billing/reminders/:id/resolve': { key: 'reminders.resolved', label: 'Resolved a payment reminder', entity: 'reminder' },
  'POST /api/billing/reminders/dispatch': { key: 'reminders.sent', label: 'Sent approved payment reminders' },
  'PUT /api/billing/reminders/rules/:key': { key: 'reminders.rule_changed', label: 'Changed a reminder rule', entity: 'rule' },
  'PUT /api/billing/reminders/templates/:key': { key: 'reminders.template_changed', label: 'Changed a reminder template', entity: 'template' },
  'PUT /api/billing/reminders/settings': { key: 'reminders.settings_changed', label: 'Changed reminder sending hours' },
  'PUT /api/billing/consent': { key: 'consent.policy_changed', label: 'Changed the firm-wide WhatsApp consent setting' },
  'PUT /api/billing/contacts/:clientId': { key: 'contacts.changed', label: 'Edited a client’s WhatsApp number', entity: 'client' },
  'POST /api/billing/contacts/:clientId/opt-in': { key: 'contacts.opted_in', label: 'Recorded a client’s WhatsApp opt-in', entity: 'client' },
  'POST /api/billing/contacts/:clientId/opt-out': { key: 'contacts.opted_out', label: 'Recorded a client’s WhatsApp opt-out', entity: 'client' },
  'POST /api/billing/responses/:id/handled': { key: 'reminders.reply_handled', label: 'Marked a client’s reply handled', entity: 'response' },

  // Team (accounts)
  'POST /api/team': { key: 'team.created', label: 'Created an account',
    details: (req) => ({ email: body(req).email, role: body(req).role }) },
  'PUT /api/team/:id/role': { key: 'team.role', label: 'Changed someone’s role', entity: 'account',
    details: (req) => ({ role: body(req).role }) },
  'PUT /api/team/:id/name': { key: 'team.renamed', label: 'Renamed an account', entity: 'account' },
  'PUT /api/team/:id/extension': { key: 'team.extension', label: 'Linked an account to a RingCentral extension', entity: 'account',
    details: (req) => ({ extensionId: body(req).extensionId ?? null }) },
  'PUT /api/team/:id/capabilities/:capability': { key: 'team.capability', label: 'Changed one permission for an account', entity: 'account',
    details: (req) => ({ capability: req.params.capability, state: body(req).state }) },
  'POST /api/team/:id/clear-overrides': { key: 'team.overrides_cleared', label: 'Reset an account to its role’s permissions', entity: 'account' },
  'POST /api/team/:id/disable': { key: 'team.disabled', label: 'Revoked an account’s access', entity: 'account' },
  'POST /api/team/:id/enable': { key: 'team.enabled', label: 'Restored an account’s access', entity: 'account' },
  'POST /api/team/:id/sign-out': { key: 'team.signed_out', label: 'Signed someone out everywhere', entity: 'account' },
  'POST /api/team/:id/reset-password': { key: 'team.password_reset', label: 'Reset someone’s password', entity: 'account' },
}

export const actionFor = (method, pattern) => ACTIONS[`${method} ${pattern}`] || null
