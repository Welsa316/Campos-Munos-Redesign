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
    id: 'test-channel',
    at: '2026-11-06T11:15:00Z',
    section: 'admin',
    any: ['forms.test'],
    title: 'A test channel for the website forms',
    summary: 'Send test forms and chats through the real website without them reaching the inbox. Open Test channel and get a test link.',
    points: [
      'A test goes through the same checks as a client’s form, then lands in the Test channel instead of Messages.',
      'It is not a lead: no unread badge, no lead count, no CSV row, no office email, and no notification for anyone but you.',
      'The link works for an hour in the browser tab it opens, which shows “Test mode” while it is on.',
    ],
  },
  {
    id: 'sign-out-and-desktop-app-details',
    at: '2026-11-06T11:06:32Z',
    section: 'everyone',
    any: [],
    title: 'Signing out, and a few desktop app details',
    summary: 'If Sign out cannot reach the server (no connection), the portal now says so and keeps you signed in, so you can press it again instead of thinking you are signed out.',
    points: [
      'The sign-in page remembers your email only when “Keep me signed in on this computer” is ticked. Leaving it off forgets the email kept from before.',
      'In the desktop app, clicking a notification opens its screen straight away, without reloading the portal.',
      'In the desktop app, Notifications says Paused while the app cannot reach the server, and Blocked if the computer will not show notifications.',
      'Billing → an import’s Exceptions (CSV) now downloads in the desktop app too.',
    ],
  },
  {
    id: 'my-follow-ups',
    at: '2026-11-06T10:13:02Z',
    section: 'everyone',
    any: ['calls.view', 'crm.view'],
    title: 'My follow-ups on Home',
    summary: 'Home now lists the few things waiting for you, most urgent first: your callback reminders that are overdue, due or later today, then website messages nobody has opened yet.',
    points: [
      'Click a line to open that caller or message. View all opens Needs attention or Messages.',
      'Only your own reminders are listed. A reminder you mark Done, or a caller who is reached, leaves the list.',
    ],
  },
  {
    id: 'callback-reminders',
    at: '2026-11-06T10:11:00Z',
    section: 'calls',
    any: ['calls.exclude', 'crm.manage'],
    title: 'Callback reminders',
    summary: 'Set a reminder to call someone back later. When it is due you get an email and, if you turned notifications on, a notification on your computer, even with the portal closed.',
    points: [
      'In Calls → Needs attention, open a caller’s ⋯ menu and choose Remind me, or use Remind me in their details. On a website message, Remind me is under the status.',
      'Pick In 30 minutes, In 1 hour, Tomorrow morning (9:00 AM, the next weekday) or a date and time. The exact time shows before you save. Times are New Orleans time.',
      'A reminder can be for you or a colleague, with a short note only staff see. The email and notification never say who the caller is: open the portal to see.',
      'If the caller is reached first (a callback connects, or they are marked handled), the reminder closes by itself and nothing is sent.',
    ],
  },
  {
    id: 'stay-signed-in',
    at: '2026-11-06T10:09:24Z',
    section: 'everyone',
    any: [],
    title: 'Stay signed in, and smoother switching between sections',
    summary: 'On the sign-in page, tick “Keep me signed in on this computer” to stay signed in for 30 days instead of 8 hours.',
    points: [
      'With the box ticked, the sign-in page also remembers your email, so only the password needs typing.',
      'Leave the box off on a shared computer. Signing out still ends it straight away.',
      'Moving between sections now fades smoothly instead of jumping.',
      'The Messages header no longer runs its labels over each other on wide screens.',
    ],
  },
  {
    id: 'missed-call-notifications',
    at: '2026-11-06T09:32:51Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'A notification for each new missed caller',
    summary: 'If you turned on notifications, a caller newly waiting for a call back now shows “New missed call”. Click it to open Calls.',
    points: [
      'One per person waiting, not one per call: someone who calls three times is announced once.',
      'It never shows who called or their number; that is in the portal once you open it.',
    ],
  },
  {
    id: 'lead-notifications-app',
    at: '2026-11-06T09:11:24Z',
    section: 'messages',
    any: ['crm.view'],
    title: 'A notification when someone writes in through the website',
    summary: 'If you turned on notifications, a new website message or chat now shows one on your computer. Click it to open the lead.',
    points: [
      'It says only that a message arrived, never who wrote or what they said.',
      'To have notifications show as Campos Muños instead of your browser, install the portal as an app: click the install icon at the right of Chrome’s or Edge’s address bar.',
    ],
  },
  {
    id: 'desktop-notifications',
    at: '2026-11-06T08:57:39Z',
    section: 'everyone',
    any: [],
    title: 'Notifications on your computer',
    summary: 'The portal can show a notification on your computer, even when its tab is closed. It is ready to switch on now, for the callback reminders that are coming next.',
    points: [
      'On Home, press the bell next to Password, then Enable notifications, and allow them when your browser asks.',
      'Send test notification checks it works. If nothing appears, the box says where your computer keeps the setting (Windows and Mac are different).',
      'Turn it off any time on that computer. Each computer is switched on separately.',
      'Notifications only show while the browser is running. On Windows, let it keep running when its windows are closed: in Chrome, Settings → System → Continue running background apps; in Edge, Settings → System and performance → Startup boost and Continue running background apps. A notification sent while the browser was quit shows when it next starts, up to a day later.',
      'Notifications never show a client’s name, number or case, only that something is ready to review.',
    ],
  },
  {
    id: 'calls-one-row-per-caller',
    at: '2026-11-06T08:57:31Z',
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
    id: 'calls-notes',
    at: '2026-11-06T08:38:27Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'Notes on calls, and a caller’s whole history',
    summary: 'Open a call to write a note about it and to see everything the portal knows about that number.',
    points: [
      'Notes are for staff only and are never sent to the client. Save with the button or Ctrl+Enter; edit or delete your own.',
      'A note follows the caller’s number, so it shows on their other calls too.',
      'Contact history lists their calls, website enquiries, email replies and notes, newest first.',
      'If a website lead uses the same number, it is marked as a possible match: press Same person or Someone else (a family phone, say).',
      'Confirmations now appear at the bottom of the screen; swipe one sideways to dismiss it.',
    ],
  },
  {
    id: 'messages-contact-history',
    at: '2026-11-06T08:38:27Z',
    section: 'messages',
    any: ['crm.view'],
    title: 'A website lead’s calls, beside their messages',
    summary: 'A lead in Messages now has a Contact history section under its notes, with any calls from the same number.',
    points: [
      'Press Contact history to open it. Calls and website enquiries from that number are listed together, newest first.',
      'The same number does not always mean the same person, so a match is only shown as possible until someone confirms it.',
    ],
  },
  {
    id: 'portal-fixes-more',
    at: '2026-11-06T08:24:58Z',
    section: 'everyone',
    any: [],
    title: 'More fixes across the portal',
    summary: 'Smaller changes from a review of the whole portal.',
    points: [
      'Signing out ends the session on that computer only; you stay signed in elsewhere.',
      'Questions like “Delete this note?” now appear next to the button instead of in a pop-up box.',
      'Fields, menus and dialogs are easier to see, especially in the dark theme.',
      'On a phone, the Messages header no longer overlaps; less-used buttons are under More.',
    ],
  },
  {
    id: 'calls-handled-not-returned',
    at: '2026-11-06T08:23:49Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'Handled calls no longer count as “not called back”',
    summary: 'A call marked handled, or cleared from Needs attention, has been dealt with, so it leaves Not called back on Calls and on Home.',
    points: [
      'Reopen the call and it counts again.',
    ],
  },
  {
    id: 'updates-page',
    at: '2026-11-06T08:23:39Z',
    section: 'everyone',
    any: [],
    title: 'This page: Updates',
    summary: 'What changed in the portal, for the parts you use, newest first. The Updates link says New for two days after something changes.',
    points: [],
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
