// Why a missed call needs no callback. Keys match EXCLUSION_REASONS in
// server/integrations/ringcentral/callExclusions.js and the CHECK on
// rc_call_exclusions / rc_ignored_numbers.
export const EXCLUSION_REASONS = [
  { key: 'verification', label: 'Verification code or automated call', short: 'Verification code', hint: 'A machine reading out a code, an appointment reminder, a recorded message' },
  { key: 'staff_test', label: 'Someone from the firm', short: 'Call from the firm', hint: 'A test of the line, or a colleague calling from their own phone' },
  { key: 'spam', label: 'Spam or robocall', short: 'Spam', hint: 'Sales calls, scams, wrong numbers' },
  { key: 'other', label: 'Something else', short: 'Other', hint: 'Say why in the note' },
]

export const exclusionLabel = (key) => EXCLUSION_REASONS.find((r) => r.key === key)?.short || 'No callback needed'
