// Why a missed call needs no callback. Keys match EXCLUSION_REASONS in
// server/integrations/ringcentral/callExclusions.js and the CHECK on
// rc_call_exclusions / rc_ignored_numbers. The words are in i18n/calls.js.
import { tc } from '../../i18n/calls.js'

const KEYS = ['verification', 'staff_test', 'spam', 'other']

/** The reasons, worded in a language (English by default). */
export const exclusionReasons = (lang = 'en') => KEYS.map((key) => ({
  key,
  label: tc(lang, `excl.${key}`),
  short: tc(lang, `excl.${key}.short`),
  hint: tc(lang, `excl.${key}.hint`),
}))

export const EXCLUSION_REASONS = exclusionReasons('en')

export const exclusionLabel = (key, lang = 'en') => (KEYS.includes(key) ? tc(lang, `excl.${key}.short`) : tc(lang, 'line.no_callback'))
