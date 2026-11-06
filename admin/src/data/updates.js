// What changed in the portal, for the people it changes things for
// (Updates, in every section's header).
//
// Add an entry when a change staff will notice goes live, newest first:
//   id       unique, never reused
//   at       when it went live (the deploy), ISO with a time zone
//   section  which part of the portal it is about (SECTIONS below)
//   any      who sees it: accounts holding any of these capabilities
//            (server/auth/capabilities.js); [] means everyone
//   title, summary, points  plain words, no jargon
// For 48 hours after `at` the entry, and the Updates link, say "New".

export const NEW_FOR_MS = 48 * 60 * 60 * 1000

export const SECTIONS = {
  everyone: { label: 'Whole portal', icon: 'house' },
  calls: { label: 'Calls', icon: 'phone-volume' },
  messages: { label: 'Messages', icon: 'inbox' },
  whatsapp: { label: 'WhatsApp', icon: 'comments' },
  billing: { label: 'Billing', icon: 'file-invoice-dollar' },
  admin: { label: 'Administrator', icon: 'lock' },
}

export const UPDATES = [
  {
    id: 'calls-one-row-per-caller',
    at: '2026-11-06T08:50:41Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'Needs attention lists each caller once',
    summary: 'Someone who rang three times without getting through is now one row with one Call back, not three.',
    points: [
      'The row says how many calls, and when the first and last were. Open it to see each call and what RingCentral recorded.',
      'Handled on that row closes all of their calls; Undo reopens them. A callback that did not connect shows as tried and leaves them open.',
      'The Needs attention count is now people waiting for a call back. Missed and handled counts still count calls.',
      'At the bottom, “Check if they still need help” lists calls RingCentral recorded no outcome for. Nobody is counted as missing them, and they are not in the count.',
    ],
  },
  {
    id: 'calls-clear-list',
    at: '2026-11-06T07:22:26Z',
    section: 'calls',
    any: ['calls.clear'],
    title: 'Clear Needs attention in one go',
    summary: 'For administrators: empty the Needs attention list at once, for example after fixing where the phone system sends voicemail.',
    points: [
      'Calls → Needs attention → Clear the list… asks for a cutoff time and a reason, and shows how many calls it will clear.',
      'Cleared calls move to Handled as “Cleared from the list”. How each call is recorded, and the missed counts, stay the same.',
      'Undo puts the whole batch back; any one call can also be reopened from its ⋯ menu.',
    ],
  },
  {
    id: 'calls-handled-tab',
    at: '2026-11-06T07:05:31Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'See the calls you have dealt with',
    summary: 'Calls has a Handled tab, and the three counts at the top open their list.',
    points: [
      'Handled lists calls marked handled and calls closed by a callback that connected, grouped by the day they were dealt with. Reopen one from its ⋯ menu.',
      'Press Needs attention, Handled today or Total calls today at the top to open that list.',
      'In Filters, each outcome is a card with its count instead of a dropdown.',
    ],
  },
  {
    id: 'calls-inbox',
    at: '2026-11-06T06:35:56Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'A new Calls page: Needs attention',
    summary: 'Calls opens on the calls that still need someone, oldest trouble first, with the next step on each one.',
    points: [
      'Open calls are grouped: from earlier days, try again (a callback did not connect), and new today.',
      'Each call has Call back, Handled, and a ⋯ menu with No callback needed and Call details.',
      'Press a caller’s name for the details: what happened, what is left to do, and their other calls.',
      'New calls appear on their own while the page is open. No need to refresh.',
      'All calls keeps the full day-by-day log.',
    ],
  },
  {
    id: 'faster-switching',
    at: '2026-11-06T06:35:56Z',
    section: 'everyone',
    any: [],
    title: 'Faster switching between sections',
    summary: 'Going back to Home, Messages, Calls or WhatsApp now shows the page at once and refreshes it in the background.',
    points: [
      'Each section’s page is also downloaded ahead of time, so the first visit is quicker too.',
    ],
  },
  {
    id: 'portal-fixes-review',
    at: '2026-11-06T06:02:43Z',
    section: 'everyone',
    any: [],
    title: 'Fixes across the portal',
    summary: 'A round of fixes so the portal says what is going on instead of failing quietly.',
    points: [
      'If a list fails to load, the page says so and lets you try again, instead of showing it as empty.',
      'When your session ends, the portal tells you and keeps what you were typing.',
      'The dark theme no longer flashes white when a page loads.',
      'Keyboard focus is easier to see on buttons, checkboxes and fields.',
    ],
  },
  {
    id: 'calls-unconfirmed-quiet',
    at: '2026-11-06T05:21:40Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'Calls with no recorded outcome are not work to do',
    summary: 'When RingCentral records no outcome for a call, it is no longer counted as missed or listed for a callback.',
    points: [
      'These calls are still in All calls, under “No outcome recorded”, for anyone who wants to look.',
    ],
  },
  {
    id: 'calls-live-events',
    at: '2026-11-06T04:53:08Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'See what happened during a call',
    summary: 'For calls made after RingCentral’s live call events were switched on, the call details show whose phone rang, for how long, and how the call ended.',
    points: [
      'Open a call’s details and press What RingCentral recorded.',
    ],
  },
  {
    id: 'calls-evidence',
    at: '2026-11-06T04:06:54Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'Missed calls only count against someone when RingCentral shows it',
    summary: 'A call is labelled answered, not answered, caller hung up or voicemail only when RingCentral’s own record proves it. A missed call is attributed to a person only when a step shows it rang their phone.',
    points: [
      'Calls RingCentral cannot settle say “Not confirmed” and are not counted as missed.',
      'The call details list the evidence behind each label.',
    ],
  },
]

/** The entries an account sees: those for a part of the portal it can open. */
export function visibleUpdates(list, canAny) {
  return list.filter((u) => !u.any.length || canAny(...u.any))
}

/** Within 48 hours of going live. A date in the future is not new yet. */
export function isNew(u, now = Date.now()) {
  const at = Date.parse(u.at)
  return Number.isFinite(at) && now >= at && now - at < NEW_FOR_MS
}

/** Whether the Updates link should say "New" for this account. */
export function hasNew(list, canAny, now = Date.now()) {
  return visibleUpdates(list, canAny).some((u) => isNew(u, now))
}
