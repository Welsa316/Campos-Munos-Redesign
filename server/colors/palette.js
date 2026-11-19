// Entry colours: the plain colours staff can give a caller, a website lead or
// a callback reminder, like a note in Google Keep. Shared: everyone who can
// see the entry sees its colour. No names or meanings, on purpose: a colour
// is a person's own visual cue, never the only sign of anything.
//
// The single list of keys the server accepts (and the table's CHECK). The
// portal's palette (admin/src/data/entryColors.js) gives each key its tints
// and is pinned to this list by admin/test/entryColors.test.js.
export const ENTRY_COLORS = Object.freeze([
  'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray',
])

// What can carry a colour, and what its key is:
//   caller    rc_calls.counterpart_key (every call from the number)
//   lead      submissions.id
//   reminder  follow_up_reminders.id
export const ENTRY_KINDS = Object.freeze(['caller', 'lead', 'reminder'])

export const isEntryColor = (v) => typeof v === 'string' && ENTRY_COLORS.includes(v)
export const isEntryKind = (v) => typeof v === 'string' && ENTRY_KINDS.includes(v)
