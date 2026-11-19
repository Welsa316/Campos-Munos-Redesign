// Portal colour themes each person picks on Home (docs/staff-accounts.md,
// "Themes"). Only these keys can be saved; the portal keeps the same list
// with the colours in admin/src/data/themes.js (pinned by avatars.test.js).
// Campos Muños Classic is the default for everyone who has not chosen.
export const THEMES = Object.freeze(['classic', 'midnight-executive', 'coastal-teal', 'graphite', 'violet', 'midnight-dark'])
export const DEFAULT_THEME = 'classic'

// A person's own colours (Home → Themes → Custom), saved on their account
// only (admin_users.custom_theme). The portal derives every other colour
// from these and keeps text readable; the server only lets through the
// known keys with #RRGGBB values. Same keys as CUSTOM_KEYS in
// admin/src/data/themes.js (pinned by customTheme.test.js).
export const CUSTOM_THEME = 'custom'
export const CUSTOM_MAIN = Object.freeze(['header', 'primary', 'page', 'surface', 'summaryA', 'summaryB'])
export const CUSTOM_ADVANCED = Object.freeze(['text', 'link', 'border', 'navActive', 'focus', 'success', 'danger', 'input'])
export const CUSTOM_KEYS = Object.freeze(['base', ...CUSTOM_MAIN, ...CUSTOM_ADVANCED])
// Every key set is about 270 bytes; anything much bigger is not a theme.
export const CUSTOM_MAX_BYTES = 512
const HEX = /^#[0-9a-f]{6}$/i

export const isTheme = (value) => THEMES.includes(value)

/** A clean copy of a custom theme ({ base, header, …, [advanced] }), or null if anything is off. */
export function parseCustomTheme(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  let size
  try { size = Buffer.byteLength(JSON.stringify(input)) } catch { return null }
  if (size > CUSTOM_MAX_BYTES) return null
  const keys = Object.keys(input)
  if (keys.some((k) => !CUSTOM_KEYS.includes(k))) return null
  if (input.base !== 'light' && input.base !== 'dark') return null
  const out = { base: input.base }
  for (const k of CUSTOM_MAIN) {
    if (typeof input[k] !== 'string' || !HEX.test(input[k])) return null
    out[k] = input[k].toUpperCase()
  }
  for (const k of CUSTOM_ADVANCED) {
    if (input[k] == null) continue
    if (typeof input[k] !== 'string' || !HEX.test(input[k])) return null
    out[k] = input[k].toUpperCase()
  }
  return out
}

/**
 * The theme to show: a listed preset, 'custom' when the account has valid
 * custom colours, else Classic.
 */
export function themeFor(value, custom) {
  if (value === CUSTOM_THEME) return parseCustomTheme(custom) ? CUSTOM_THEME : DEFAULT_THEME
  return isTheme(value) ? value : DEFAULT_THEME
}

export default { THEMES, DEFAULT_THEME, CUSTOM_THEME, CUSTOM_KEYS, isTheme, themeFor, parseCustomTheme }
