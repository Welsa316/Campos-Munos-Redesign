// Portal colour themes each person picks on Home (docs/staff-accounts.md,
// "Themes"). Only these keys can be saved; the portal keeps the same list
// with the colours in admin/src/data/themes.js (pinned by avatars.test.js).
// Campos Muños Classic is the default for everyone who has not chosen.
export const THEMES = Object.freeze(['classic', 'midnight-executive', 'coastal-teal', 'graphite', 'violet', 'midnight-dark'])
export const DEFAULT_THEME = 'classic'

export const isTheme = (value) => THEMES.includes(value)
export const themeFor = (value) => (isTheme(value) ? value : DEFAULT_THEME)

export default { THEMES, DEFAULT_THEME, isTheme, themeFor }
