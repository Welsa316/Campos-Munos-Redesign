// Whitelist of consultation types accepted by the contact form, chat widget,
// and admin filter. Must stay in lockstep with the same list in
// server/routes/submissions.js and the DB CHECK constraint in
// server/db/migrate.js (submissions_consultation_type_chk).
export const CONSULTATION_KEYS = [
  'greenCard', 'ciudadania', 'asilo', 'vawa', 'visaU', 'visaT', 'daca', 'tps',
  'tramiteConsular', 'visasPrometido', 'visasJovenes', 'peticionesFamiliares',
  'ead', 'defensaDeportacion', 'other',
]

/**
 * Translate a consultation key to its human label, using vue-i18n's `t`
 * function. `other` reads from the `consultationForm.notSure` key; everything
 * else maps to `services.<key>`. Returns the raw key if no translation exists.
 */
export function consultationLabel(key, t, te) {
  if (!key) return 'Other'
  if (key === 'other') return t('consultationForm.notSure')
  return te(`services.${key}`) ? t(`services.${key}`) : key
}
