// Portal colour themes (server/auth/themes.js holds the same keys and decides
// what may be saved). The colours a theme applies live in src/style.css under
// :root[data-theme="…"]; the values below only draw each theme's miniature
// dashboard in the Themes folder on Home, so they mirror those tokens.
export const THEMES = [
  {
    key: 'classic', name: 'Campos Muños Classic', description: 'The firm’s navy and red',
    preview: { rail: '#003F8D', page: '#f0f2f7', panel: '#ffffff', accent: '#CE1D1D', primary: '#003F8D', soft: '#dbe6f6', ink: '#1f2937', line: '#e5e7eb' },
  },
  {
    key: 'midnight-executive', name: 'Midnight Executive', description: 'Premium, modern, professional',
    preview: { rail: '#141c2f', page: '#eef1f7', panel: '#ffffff', accent: '#3370d4', primary: '#2a56a8', soft: '#dde6f6', ink: '#141c2f', line: '#e3e7ef' },
  },
  {
    key: 'coastal-teal', name: 'Coastal Teal', description: 'Calm, contemporary workspace',
    preview: { rail: '#133f40', page: '#eef5f4', panel: '#ffffff', accent: '#1f8a7d', primary: '#17766b', soft: '#d6ece8', ink: '#133f40', line: '#e0ebe9' },
  },
  {
    key: 'graphite', name: 'Graphite Minimal', description: 'Neutral, distraction-free',
    preview: { rail: '#23272d', page: '#f2f3f5', panel: '#ffffff', accent: '#6b7488', primary: '#3f4653', soft: '#e3e6ea', ink: '#23272d', line: '#e5e7eb' },
  },
  {
    key: 'violet', name: 'Modern Violet', description: 'Creative but still professional',
    preview: { rail: '#2e2245', page: '#f2f1f8', panel: '#ffffff', accent: '#7559c2', primary: '#6347b0', soft: '#e6e0f5', ink: '#2e2245', line: '#e7e4f0' },
  },
  {
    key: 'midnight-dark', name: 'Midnight Dark', description: 'Dark mode for long workdays',
    preview: { rail: '#0b0f15', page: '#0e131a', panel: '#171e27', accent: '#5aa2f5', primary: '#5aa2f5', soft: '#1e2a3a', ink: '#e6ebf1', line: '#232c38' },
  },
]

export const DEFAULT_THEME = 'classic'
export const isTheme = (key) => THEMES.some((t) => t.key === key)

/** Put a theme on the page (the whole portal follows the root attribute). */
export function applyTheme(key) {
  if (typeof document === 'undefined') return
  const theme = isTheme(key) ? key : DEFAULT_THEME
  const root = document.documentElement
  if (theme === DEFAULT_THEME) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  // Native form controls and scrollbars follow too.
  root.style.colorScheme = theme === 'midnight-dark' ? 'dark' : 'light'
}
