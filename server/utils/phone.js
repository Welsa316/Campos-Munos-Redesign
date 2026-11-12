// Phone numbers, one set of rules for the whole server: billing reminders
// (who can be messaged) and RingOut (who can be called) used to keep their
// own, and they disagreed.

/**
 * A phone number as E.164 digits (no '+'), or null.
 *
 * Accepts spaces, dashes, dots, parentheses and a leading '+'. A bare
 * 10-digit number gets defaultCountry ('1', the US). Rejects letters
 * (extensions), fewer than 8 or more than 15 digits, a leading 0, all-same
 * digits, and North American numbers that are not exactly 11 digits or
 * whose area code or exchange starts with 0 or 1.
 *
 * requirePlus: digits typed without '+' are read only as a North American
 * number (10 digits, or 11 starting with 1). For dialing, where a guess
 * about the country is a call to the wrong person.
 */
export function phoneDigits(raw, { defaultCountry = '1', requirePlus = false } = {}) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s.length > 32 || !/^\+?[\d\s\-().]+$/.test(s)) return null
  const plus = s.startsWith('+')
  let digits = s.replace(/\D/g, '')
  if (!plus && digits.length === 10) digits = defaultCountry + digits
  else if (!plus && requirePlus && !(digits.length === 11 && digits.startsWith('1'))) return null
  if (digits.length < 8 || digits.length > 15) return null
  if (digits.startsWith('0')) return null
  if (/^(\d)\1+$/.test(digits) || /^(\d)\1+$/.test(digits.slice(1))) return null
  if (digits.startsWith('1')) {
    if (digits.length !== 11) return null
    if (/[01]/.test(digits[1]) || /[01]/.test(digits[4])) return null
  }
  return digits
}

// Numbers that cost the caller by design, by E.164 prefix. Each is a
// premium or satellite range as allocated, not a guess from fraud reports,
// so no client's own phone is on one:
//   979        ITU International Premium Rate Service
//   881-883    satellite and international networks (no country)
//   1 900      North American premium rate (and 976, never an area code)
//   1 NXX-976  North American premium exchange
//   44 9       UK premium rate (09)
//   49 900     Germany premium rate (0900)
//   33 89      France premium rate (089)
//   34 803/806/807/905  Spain premium rate and televoting
//   52 900     Mexico premium rate (01-900)
const PREMIUM = [/^979/, /^88[123]/, /^1(900|976)/, /^1\d{3}976/, /^449/, /^49900/, /^3389/, /^34(80[367]|905)/, /^52900/]

export const isPremiumNumber = (digits) => PREMIUM.some((re) => re.test(String(digits || '')))

/**
 * The calling codes allowed by a comma-separated list ("1,52,502"), or null
 * when the list is empty (every country allowed). Entries that are not 1-3
 * digits are ignored. Calling codes are prefix-free, so a number belongs to
 * at most one of them.
 */
export function parseCountryCodes(list) {
  const codes = String(list ?? '').split(',').map((c) => c.trim().replace(/^\+/, '')).filter((c) => /^\d{1,3}$/.test(c))
  return codes.length ? codes : null
}

export const inCountries = (digits, codes) => !codes || codes.some((c) => String(digits || '').startsWith(c))

/**
 * The comparable key for a number, the same as the database's cm_phone_key():
 * digits only, and for North American numbers the last ten. '' for none.
 */
export function phoneKey(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  return /^1\d{10}$/.test(d) ? d.slice(1) : d
}
