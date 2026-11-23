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
    id: 'lead-campaign-link',
    at: '2026-11-23T23:30:00Z',
    section: 'messages',
    any: ['crm.view'],
    title: 'See which ad brought a lead',
    summary: 'When someone reaches the website through one of the firm’s ad links and then sends the form or starts a chat, the lead now says which campaign it was.',
    points: [
      'Open the lead: under the service and country, a line reads Came from, with the campaign, the ad and the page they landed on.',
      'Most leads have no such line. It only appears for people who arrived through a tagged ad link in the last 30 days, on the same phone or computer.',
      'The email the office gets for a new lead has the same line, and the export has new columns for it at the end.',
      'Calls and WhatsApp messages do not carry it: it is only for the website form and chat.',
    ],
  },
  {
    id: 'whatsapp-firm-numbers-hidden',
    at: '2026-11-23T21:45:00Z',
    section: 'whatsapp',
    any: ['whatsapp.delete'],
    title: 'Coworkers’ numbers stay out of WhatsApp, and you can hide a number by typing it',
    summary: 'A number marked in Calls as someone from the firm is now kept out of WhatsApp in the portal too. Any other number can be hidden under Hidden numbers, before or after it writes.',
    points: [
      'From the firm: when a number is marked in Calls as Someone from the firm, for every call from that number, its WhatsApp chat no longer appears in the portal, and what it writes from then on is not saved.',
      'To show one of those numbers again, open one of its calls in Calls and choose Count it again. Its chat comes back as it was.',
      'Any other number (a coworker who has not called, a personal chat): open Hidden numbers under the chat list, type the number and press Hide. It works before the number has ever written.',
      'If the number you type already has a chat, the portal names the chat and asks before deleting it.',
      'Nothing changes on the phone: the chats are still there in WhatsApp itself.',
    ],
  },
  {
    id: 'spanish-billing-admin',
    at: '2026-11-20T21:03:00Z',
    section: 'everyone',
    any: [],
    title: 'Billing and the administrator pages in Spanish',
    summary: 'With ES chosen on the language switch, Billing is now in Spanish too, and so are Team, Activity, Integrations, Automation and the Test channel. The whole portal can now be used in Spanish.',
    points: [
      'Dates and amounts follow the language as well.',
      'Names, invoice numbers, spreadsheet columns and monday.com column names are shown as they are, and some explanations that come from the server stay in English.',
      'These update notes stay in English.',
    ],
  },
  {
    id: 'whatsapp-delete-and-hide',
    at: '2026-11-20T21:02:00Z',
    section: 'whatsapp',
    any: ['whatsapp.delete'],
    title: 'Delete WhatsApp messages and chats, and hide numbers',
    summary: 'You can now delete a message or a whole chat from the portal, and hide a number (a coworker, a personal chat) so its messages stop appearing.',
    points: [
      'Assigning a chat to yourself does not hide it: everyone who can open WhatsApp in the portal still sees every chat. To keep a chat private, delete it and hide the number.',
      'Delete a message: point at it (or tap it on a phone) and press the bin. Delete a chat: Delete chat at the top of the chat.',
      'When you delete a chat you can also tick Also hide this number. New messages from that number then never appear in the portal, and what they say is not saved.',
      'Deleting only removes it from the portal, for everyone. Nothing is deleted on the phone, and the client keeps what they were sent. Payment reminders stay in Billing.',
      'Changed your mind about a number? Open Hidden numbers under the chat list and press Show again. Its new messages appear again; what was deleted stays deleted.',
    ],
  },
  {
    id: 'whatsapp-text-size',
    at: '2026-11-20T21:02:00Z',
    section: 'whatsapp',
    any: ['whatsapp.view'],
    title: 'Choose how large WhatsApp text is',
    summary: 'Text size, at the top of any chat, makes messages, names, times and notes larger, in five steps.',
    points: [
      'Pick a size and the chat changes at once. Each step shows its own letter at the size it gives.',
      'It is only for you, and it is saved to your account, so it follows you to any computer. Colleagues keep their own.',
      'Standard is the size chats always had.',
    ],
  },
  {
    id: 'import-finds-the-table',
    at: '2026-11-20T03:45:00Z',
    section: 'billing',
    any: ['billing.import'],
    title: 'Imports find the table under a summary',
    summary: 'A spreadsheet that opens with a row of totals above the table now shows the table’s own columns when you map it.',
    points: [
      'Before, the totals row was read as the column names, so the column lists showed labels like PAID and PENDING instead of the real columns.',
      'Balance Remaining and Monthly Payment are now recognised as the balance and the installment amount.',
    ],
  },
  {
    id: 'language-switch-everywhere',
    at: '2026-11-19T21:36:00Z',
    section: 'everyone',
    any: [],
    title: 'Switch the portal to Spanish from any page',
    summary: 'The language switch is now at the bottom left of every page, and on the sign-in page, with a Mexican flag for Spanish (ES) and a US flag for English (EN).',
    points: [
      'Press ES for Spanish and EN for English. The portal remembers your choice on this computer.',
      'Calls, Messages, WhatsApp, reminders, notes and history, and the top bar of every page are now in Spanish too, as well as Home. Billing and the administrator pages are still in English.',
      'The switch has its own space at the bottom of the screen, so it never covers a message, a reply box or a button.',
      'These update notes stay in English.',
    ],
  },
  {
    id: 'custom-theme-colours',
    at: '2026-11-19T21:36:00Z',
    section: 'everyone',
    any: [],
    title: 'Choose your own portal colours',
    summary: 'Besides the six themes, Themes on Home now has Custom: pick your own colours for the portal. Only you see them.',
    points: [
      'Open Themes on Home and choose Custom. Pick the colour of the bar at the top, the buttons and links, the page, the cards, and the two cards at the top of Home, and light or dark.',
      'The portal changes as you pick. Save keeps it; Cancel puts back what you had.',
      'More colours lets you change a few more things, such as the main text, links and the green and red buttons. Leave them on Automatic and they follow your other choices.',
      'Writing always stays easy to read. If a colour would make words hard to read, the portal shows it a little lighter or darker and tells you.',
      'Your colours are saved to your account, so they follow you to any computer. Colleagues keep their own. You can go back to one of the six themes at any time, and Custom remembers your colours.',
    ],
  },
  {
    id: 'entry-colors',
    at: '2026-11-19T21:36:00Z',
    section: 'everyone',
    any: ['calls.exclude', 'crm.manage'],
    title: 'Give callers, leads and reminders a color',
    summary: 'Mark anyone you want to spot again with a color, like a note in Google Keep. Everyone sees the same colors.',
    points: [
      'Calls: open a caller’s ⋯ menu (or the call details) and choose Color…. Every call from that number gets the color, in Needs attention, Handled and All calls.',
      'Messages: use the color button on a lead in the list, or Color in the lead itself.',
      'Reminders: use the color button on a reminder. It shows on the reminder under the call and in My follow-ups on Home.',
      'Choose No color to take it off. Colors have no fixed meaning: agree among yourselves what each one is for.',
    ],
  },
  {
    id: 'reply-emoji',
    at: '2026-11-19T20:31:00Z',
    section: 'everyone',
    any: ['crm.manage', 'whatsapp.send'],
    title: 'Add emoji to your replies',
    summary: 'The reply box in Messages and in WhatsApp now has a smiley button next to Send. Press it to pick an emoji for your reply.',
    points: [
      'The emoji goes where your cursor is in the reply, so you can add it in the middle of a sentence.',
      'The list stays open so you can add more than one. Press Esc, the smiley again, or click outside it to close it.',
      'The last ones you picked show at the top under Recently used, on the computer where you picked them.',
      'Emoji are drawn by each phone and computer, so the client may see them looking slightly different.',
    ],
  },
  {
    id: 'reminders-on-any-call',
    at: '2026-11-19T19:52:00Z',
    section: 'calls',
    any: ['calls.exclude'],
    title: 'Set a reminder on any call',
    summary: 'Remind me… is now in the ⋯ menu of every call with a number, not only callers waiting in Needs attention.',
    points: [
      'Use it on an answered call, a call you made, or a caller already handled: for example, to call someone back next week about their documents.',
      'On a caller still waiting in Needs attention, the reminder closes by itself once someone reaches them or marks their calls handled, as before.',
      'On any other call it stays until someone marks it done or cancels it.',
      'A reminder’s email or notification opens that call, wherever it is in the log.',
    ],
  },
  {
    id: 'calls-longer-ranges',
    at: '2026-11-19T19:52:00Z',
    section: 'calls',
    any: ['calls.view'],
    title: 'Look further back in All calls',
    summary: 'The date range in All calls now goes back 90 days, 6 months or 12 months, or between any two dates you pick.',
    points: [
      'Open Filters on All calls and choose a range, or Dates… for your own two days.',
      'A long range shows the newest calls first; Show older calls at the bottom loads the next ones.',
      'Calls are kept for 12 months, and the log only has calls from when the RingCentral import started.',
    ],
  },
  {
    id: 'home-in-spanish',
    at: '2026-11-19T19:52:00Z',
    section: 'everyone',
    any: [],
    title: 'Home can now be shown in Spanish',
    summary: 'Next to Themes on Home there is a small EN | ES switch. Press ES to see Home in Spanish, and EN to go back to English.',
    points: [
      'It changes Home only: the greeting, the date, the figures at the top, My follow-ups and the Go to cards. The other pages stay in English.',
      'Your choice is kept on this computer or phone, so Home opens in the same language next time. Another device starts in English until you switch it there too.',
    ],
  },
  {
    id: 'office-manager-role',
    at: '2026-11-16T03:18:00Z',
    section: 'admin',
    any: ['team.manage'],
    title: 'A new role on the Team tab: Office Manager',
    summary: 'You can now give an account the Office Manager role when you add a person or change their role. Nobody has it yet.',
    points: [
      'Website leads: read, reply by email, change status, mark read or archived, add notes. No CSV export.',
      'WhatsApp: read conversations and notes, assign and reassign, add notes, close and reopen. No replies, and no client numbers or consent.',
      'Calls: the call log and missed calls, refresh, call out with RingOut, and mark missed calls handled.',
      'No billing and nothing from the administrator area. Single permissions can still be added or taken away per person, as for any role.',
    ],
  },
  {
    id: 'sms-consent-and-test-texts',
    at: '2026-11-12T03:35:00Z',
    section: 'admin',
    any: ['forms.test'],
    title: 'A text-consent box on the website, and real test texts',
    summary: 'The contact form and the chat now ask, optionally, whether the firm may text the person. And an automation test can really text your own phone.',
    points: [
      'The website’s box is optional and never ticked for the person. Only a lead who ticked it can ever get an automatic text; when they agreed is kept on the lead.',
      'In the Test channel, tick “Really text the messages” to have a test send its texts to the phone you typed, from the firm’s RingCentral number, each starting [TEST].',
      'A phone number that a lead or client already has needs a one-time “It is mine” first, as an email address does.',
      'Each test form now shows its language and whether the texts box was ticked.',
    ],
  },
  {
    id: 'test-automation-mode',
    at: '2026-11-12T00:45:00Z',
    section: 'admin',
    any: ['forms.test'],
    title: 'Rehearse the automation in the Test channel',
    summary: 'The Test channel can now run the whole lead automation on a test form, so you can watch it work before any of it is switched on. Nothing real is involved: no lead, no client, no colleague.',
    points: [
      'Start a test from the Test channel page, or have one start for each test form you send from the website.',
      'Accelerated timing runs the sequence in about five minutes: the acknowledgment at once, a follow-up after one and two minutes, the escalation after three and four, then “No response”.',
      'Only the acknowledgment email can really be sent, to the address you type for the test, marked [TEST]. Text messages are never sent; the page shows what each would say.',
      'Press “Client replied”, “Consultation booked” or a status button to see the sequence stop as it would for a lead.',
      'Everything a test did is in the test history on that page, and “Reset test data” removes it all.',
    ],
  },
  {
    id: 'automation-phase-1',
    at: '2026-11-12T00:45:00Z',
    section: 'admin',
    any: ['integrations.manage'],
    title: 'The portal can now do routine follow-up on its own',
    summary: 'A new Automation page (from Integrations) shows what the portal does without anyone opening it. Everything is switched off until it is turned on from the server, one piece at a time.',
    points: [
      'A new website lead can get an acknowledgment by email and, with their agreement, by text; then follow-up texts after one and three business days while nobody has reached them.',
      'A caller the firm missed can get one text, a few minutes after the call, if they are still waiting for a call back.',
      'A lead’s status changes on its own only when something proves it: a connected call, a reply from the portal, or a booking found on the calendar. The automatic acknowledgment never counts as contact.',
      'A new lead or a missed caller that waits too long is brought to the front desk’s attention, on Home and by notification.',
      'Each automation can be paused from the Automation page. Everything the portal did on its own is in the activity log, with why.',
    ],
  },
  {
    id: 'review-fixes-2026-11',
    at: '2026-11-06T17:33:28Z',
    section: 'everyone',
    any: [],
    title: 'Small fixes you may notice',
    summary: 'A few things in the portal now work the way you would expect.',
    points: [
      'Messages like “Reminder set” or “Note saved” that pop up while a caller’s details are open can now be clicked, so Undo and the close button work.',
      'The dot on Updates that says something is new now shows in every colour theme.',
      'If you mark a caller as handled and then press Undo, the reminder you had set for them comes back too.',
      'The date, time, person and note boxes in a reminder have clearer edges, and no longer zoom in on a phone.',
      'If Sign out cannot reach the server, you stay on the page and the portal says so, instead of looking signed out when you are not.',
    ],
  },
  {
    id: 'test-channel',
    at: '2026-11-06T11:28:20Z',
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
