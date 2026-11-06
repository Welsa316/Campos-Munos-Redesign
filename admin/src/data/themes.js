// Portal colour themes: the single source of truth for every colour the
// portal uses (server/auth/themes.js holds the same keys and decides what
// may be saved). applyTheme() writes a theme's tokens onto <html> as CSS
// custom properties; src/style.css points the portal's colour classes
// (bg-white, text-gray-500, bg-brand-navy, the status colours, …) at those
// tokens, so every screen follows. The Themes folder on Home draws its
// miniature dashboards from the same values.
//
// Every theme implements exactly the same token contract (pinned, with WCAG
// AA contrast checks for the pairings the portal uses, by
// test/themes.test.js). Values follow the firm's palette specification;
// a few were nudged only where a pairing fell short of AA (noted inline).

// Status colours shared by the five light themes, and by the dark one.
const LIGHT_STATUS = {
  success: '#21734D', 'success-soft': '#E8F5ED', 'success-solid': '#21734D',
  warning: '#8A5C10', 'warning-soft': '#FFF5DE', 'warning-solid': '#8A5C10', // #936313 → #8A5C10: AA on its soft tint
  error: '#B43B3B', 'error-soft': '#FCEAEA', 'danger-solid': '#B43B3B', 'danger-solid-hover': '#9C3131',
  info: '#315F9B', 'info-soft': '#E9F1FC', 'info-solid': '#315F9B',
  neutral: '#5D6876', 'neutral-soft': '#EEF1F4',
}
const DARK_STATUS = {
  success: '#8CCDAC', 'success-soft': '#20392F', 'success-solid': '#2E7556',
  warning: '#E3C080', 'warning-soft': '#433827', 'warning-solid': '#8A6420',
  error: '#E8A0A0', 'error-soft': '#442B31', 'danger-solid': '#B0474D', 'danger-solid-hover': '#C05359',
  info: '#A2C6F0', 'info-soft': '#24394D', 'info-solid': '#3A699C',
  neutral: '#ADBCCB', 'neutral-soft': '#2A3744',
}

export const THEMES = [
  {
    key: 'classic', name: 'Campos Muños Classic', description: 'Official firm branding', scheme: 'light',
    tokens: {
      'app-bg': '#F5F7FA', 'content-bg': '#F7F9FC', 'sidebar-bg': '#003F8D',
      surface: '#FFFFFF', 'surface-elevated': '#FFFFFF', 'input-bg': '#FFFFFF',
      'surface-subtle': '#EFF3F8', 'surface-hover': '#E9F0F8', 'surface-selected': '#E3EDF9',
      'text-primary': '#19283B', 'text-secondary': '#536477', 'text-muted': '#607082', // #68798C → #607082: AA on subtle surfaces
      'text-on-primary': '#FFFFFF', 'text-on-sidebar': '#F7FAFF', 'text-sidebar-muted': '#C4D5EC', 'text-link': '#004B9E',
      'icon-primary': '#45566B', 'icon-secondary': '#6B7C90', 'icon-muted': '#8492A3', 'icon-active': '#003F8D',
      'icon-on-sidebar': '#E1ECFA', 'icon-sidebar-active': '#FFFFFF',
      primary: '#003F8D', 'primary-hover': '#003677', 'primary-soft': '#E3EDF9',
      accent: '#CE1D1D', 'accent-soft': '#FCEAEA',
      border: '#DDE5EE', 'border-strong': '#C4D0DE', 'input-border': '#7D8C9D', 'focus-ring': '#4B83CF', divider: '#E7ECF2',
      'sidebar-hover': '#17539A', 'sidebar-active': '#2863A8', 'sidebar-border': '#235A9B',
      'chart-1': '#003F8D', 'chart-2': '#5384C3', 'chart-3': '#8BA9CC', 'chart-4': '#CE1D1D', 'chart-5': '#9EACBD',
      ...LIGHT_STATUS,
      // Classic keeps the firm's red for "needs attention" fills.
      'danger-solid': '#CE1D1D', 'danger-solid-hover': '#B51818',
    },
  },
  {
    key: 'midnight-executive', name: 'Midnight Executive', description: 'Premium, modern, professional', scheme: 'light',
    tokens: {
      'app-bg': '#F1F3F7', 'content-bg': '#F5F7FA', 'sidebar-bg': '#172238',
      surface: '#FFFFFF', 'surface-elevated': '#FFFFFF', 'input-bg': '#FBFCFE',
      'surface-subtle': '#EDF1F6', 'surface-hover': '#E8EDF5', 'surface-selected': '#E1E9F5',
      'text-primary': '#202B3D', 'text-secondary': '#576479', 'text-muted': '#626E7E', // #6E7B8D → #626E7E: AA on subtle surfaces
      'text-on-primary': '#FFFFFF', 'text-on-sidebar': '#F2F5FA', 'text-sidebar-muted': '#ADBBD0', 'text-link': '#345F9B',
      'icon-primary': '#4C596D', 'icon-secondary': '#758196', 'icon-muted': '#8C98A9', 'icon-active': '#345F9B',
      'icon-on-sidebar': '#C3CFE0', 'icon-sidebar-active': '#FFFFFF',
      primary: '#345F9B', 'primary-hover': '#294E82', 'primary-soft': '#E4ECF7',
      accent: '#748BAA', 'accent-soft': '#EDF1F6',
      border: '#E0E6EF', 'border-strong': '#C7D1DE', 'input-border': '#7E8A9C', 'focus-ring': '#6488B9', divider: '#E9EDF3',
      'sidebar-hover': '#25334C', 'sidebar-active': '#334661', 'sidebar-border': '#334158',
      'chart-1': '#345F9B', 'chart-2': '#748BAA', 'chart-3': '#A3B5CA', 'chart-4': '#60758F', 'chart-5': '#C2CCD8',
      ...LIGHT_STATUS,
    },
  },
  {
    key: 'coastal-teal', name: 'Coastal Teal', description: 'Calm, contemporary workspace', scheme: 'light',
    tokens: {
      'app-bg': '#F1F7F6', 'content-bg': '#F5FAF9', 'sidebar-bg': '#174C4D',
      surface: '#FFFFFF', 'surface-elevated': '#FFFFFF', 'input-bg': '#FBFDFC',
      'surface-subtle': '#EAF3F1', 'surface-hover': '#E3F0ED', 'surface-selected': '#D9ECE7',
      'text-primary': '#203C3D', 'text-secondary': '#516C6D', 'text-muted': '#5C7172', // #557071 → #516C6D, #688081 → #5C7172: AA
      'text-on-primary': '#FFFFFF', 'text-on-sidebar': '#F2FAF8', 'text-sidebar-muted': '#BED8D3', 'text-link': '#176F6A',
      'icon-primary': '#456766', 'icon-secondary': '#718B88', 'icon-muted': '#86A09B', 'icon-active': '#176F6A',
      'icon-on-sidebar': '#D1E8E2', 'icon-sidebar-active': '#FFFFFF',
      primary: '#176F6A', 'primary-hover': '#115A56', 'primary-soft': '#DCEEE9',
      accent: '#4C9B91', 'accent-soft': '#E4F3EF',
      border: '#D9E8E4', 'border-strong': '#BED5CF', 'input-border': '#758F8D', 'focus-ring': '#58988E' /* #62A99E → 3:1 on the page */, divider: '#E5EFEC',
      'sidebar-hover': '#235D5D', 'sidebar-active': '#2F6B67', 'sidebar-border': '#336966',
      'chart-1': '#176F6A', 'chart-2': '#4C9B91', 'chart-3': '#85B9AF', 'chart-4': '#7D9793', 'chart-5': '#B8D2CB',
      ...LIGHT_STATUS,
    },
  },
  {
    key: 'graphite', name: 'Graphite Minimal', description: 'Neutral, distraction-free', scheme: 'light',
    tokens: {
      'app-bg': '#F3F4F5', 'content-bg': '#F7F7F8', 'sidebar-bg': '#2A2E34',
      surface: '#FFFFFF', 'surface-elevated': '#FFFFFF', 'input-bg': '#FCFCFD',
      'surface-subtle': '#EFF0F2', 'surface-hover': '#E9EBEE', 'surface-selected': '#E1E5EA',
      'text-primary': '#252A30', 'text-secondary': '#5E6670', 'text-muted': '#666E78', // #747C86 → #666E78
      'text-on-primary': '#FFFFFF', 'text-on-sidebar': '#F5F6F7', 'text-sidebar-muted': '#C4CAD2', 'text-link': '#424E62',
      'icon-primary': '#525A65', 'icon-secondary': '#737C86', 'icon-muted': '#939AA3', 'icon-active': '#424E62',
      'icon-on-sidebar': '#D7DCE2', 'icon-sidebar-active': '#FFFFFF',
      primary: '#424E62', 'primary-hover': '#343E4F', 'primary-soft': '#E6E9EE',
      accent: '#788394', 'accent-soft': '#ECEEF1',
      border: '#E0E3E7', 'border-strong': '#C9CED5', 'input-border': '#838A93', 'focus-ring': '#818D9E' /* #8996A8 → 3:1 on the page */, divider: '#E9EBEE',
      'sidebar-hover': '#383D45', 'sidebar-active': '#464D57', 'sidebar-border': '#464B53',
      'chart-1': '#424E62', 'chart-2': '#738092', 'chart-3': '#A0A9B5', 'chart-4': '#5F6978', 'chart-5': '#C2C8D0',
      ...LIGHT_STATUS,
    },
  },
  {
    key: 'violet', name: 'Modern Violet', description: 'Sophisticated, quietly distinctive', scheme: 'light',
    tokens: {
      'app-bg': '#F6F4F8', 'content-bg': '#FAF8FC', 'sidebar-bg': '#382F4C',
      surface: '#FFFFFF', 'surface-elevated': '#FFFFFF', 'input-bg': '#FDFBFE',
      'surface-subtle': '#F0ECF5', 'surface-hover': '#EAE5F1', 'surface-selected': '#E5DDF0',
      'text-primary': '#302B3D', 'text-secondary': '#655C73', 'text-muted': '#6F6679', // #6B6279 → #655C73, #82788D → #6F6679
      'text-on-primary': '#FFFFFF', 'text-on-sidebar': '#F8F5FC', 'text-sidebar-muted': '#D3C9DF', 'text-link': '#69518D',
      'icon-primary': '#655B73', 'icon-secondary': '#8B8197', 'icon-muted': '#A29BAE', 'icon-active': '#69518D',
      'icon-on-sidebar': '#DFD6E8', 'icon-sidebar-active': '#FFFFFF',
      primary: '#69518D', 'primary-hover': '#564176', 'primary-soft': '#EDE6F5',
      accent: '#9981AE', 'accent-soft': '#F1ECF6',
      border: '#E7E0ED', 'border-strong': '#D0C5DC', 'input-border': '#8D839A', 'focus-ring': '#9983B3' /* #A18ABC → 3:1 on the page */, divider: '#EEE9F2',
      'sidebar-hover': '#493C60', 'sidebar-active': '#594A73', 'sidebar-border': '#594C6D',
      'chart-1': '#69518D', 'chart-2': '#9981AE', 'chart-3': '#C0ADCF', 'chart-4': '#83778E', 'chart-5': '#D8CDDF',
      ...LIGHT_STATUS,
    },
  },
  {
    key: 'midnight-dark', name: 'Midnight Dark', description: 'Dark mode for long workdays', scheme: 'dark',
    tokens: {
      'app-bg': '#111820', 'content-bg': '#151D26', 'sidebar-bg': '#0D141C',
      surface: '#1C2631', 'surface-elevated': '#25313D', 'input-bg': '#19232D',
      'surface-subtle': '#222E39', 'surface-hover': '#2A3744', 'surface-selected': '#304459',
      'text-primary': '#EEF2F6', 'text-secondary': '#B3C0CD', 'text-muted': '#99AABA',
      'text-on-primary': '#FFFFFF', 'text-on-sidebar': '#E6EDF4', 'text-sidebar-muted': '#A4B5C5', 'text-link': '#A2C6F0',
      'icon-primary': '#CAD5DF', 'icon-secondary': '#9AABBB', 'icon-muted': '#8295A7', 'icon-active': '#A2C6F0',
      'icon-on-sidebar': '#BAC8D6', 'icon-sidebar-active': '#FFFFFF',
      primary: '#3A699C', 'primary-hover': '#4678AE', 'primary-soft': '#243B54',
      accent: '#7CA6CC', 'accent-soft': '#263A4C',
      border: '#33414F', 'border-strong': '#465766', 'input-border': '#697987', 'focus-ring': '#7CA6CC', divider: '#2C3946',
      'sidebar-hover': '#1B2733', 'sidebar-active': '#263849', 'sidebar-border': '#263543',
      'chart-1': '#8FB7DE', 'chart-2': '#73A49F', 'chart-3': '#C4A6D0', 'chart-4': '#D1AE85', 'chart-5': '#93A1B5',
      ...DARK_STATUS,
    },
  },
]

// Tokens every theme derives the same way from its palette: the text tone
// between primary and secondary, the ring/border colour of selected and
// focused controls, the "inverse" button, the glass and shadow tints, and
// the scrims behind a dialog (scrim) and a slide-over panel (scrim-soft).
// On a dark page black at 20 % is invisible, so the dark scrims are deeper.
function derived(t, scheme) {
  const dark = scheme === 'dark'
  return {
    'text-strong': `color-mix(in srgb, ${t['text-primary']} 62%, ${t['text-secondary']})`,
    'primary-ring': dark ? t['focus-ring'] : t.primary,
    'inverse-bg': dark ? '#3A4A5C' : t['text-primary'],
    'inverse-bg-hover': dark ? '#465A6F' : `color-mix(in srgb, ${t['text-primary']} 85%, #000)`,
    'sidebar-danger': '#FFC2C2',
    'glass-sheen': dark ? 'rgb(255 255 255 / 0.04)' : 'rgb(255 255 255 / 0.4)',
    'glass-edge': dark ? 'rgb(255 255 255 / 0.08)' : 'rgb(255 255 255 / 0.65)',
    'shadow-color': dark ? 'rgb(0 0 0 / 0.45)' : 'rgb(22 28 45 / 0.22)',
    scrim: dark ? 'rgb(0 0 0 / 0.72)' : 'rgb(15 23 42 / 0.5)',
    'scrim-soft': dark ? 'rgb(0 0 0 / 0.62)' : 'rgb(15 23 42 / 0.2)',
  }
}
for (const theme of THEMES) Object.assign(theme.tokens, derived(theme.tokens, theme.scheme))

export const DEFAULT_THEME = 'classic'
export const TOKEN_NAMES = Object.keys(THEMES[0].tokens)
export const isTheme = (key) => THEMES.some((t) => t.key === key)
export const themeByKey = (key) => THEMES.find((t) => t.key === key) || THEMES[0]

const CACHE_KEY = 'cm.theme'

/** Put a theme on the page: every token becomes a custom property on <html>. */
export function applyTheme(key) {
  if (typeof document === 'undefined') return
  const theme = themeByKey(key)
  const root = document.documentElement
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(`--${name}`, value)
  root.setAttribute('data-theme', theme.key)
  // Light or dark, for the few rules that differ by scheme rather than by theme.
  root.setAttribute('data-scheme', theme.scheme)
  // Native form controls and scrollbars follow too.
  root.style.colorScheme = theme.scheme
  root.style.backgroundColor = theme.tokens['app-bg']
  // What public/theme-boot.js paints first on the next load, before this runs.
  try { localStorage.setItem('cm-theme-paint', JSON.stringify({ bg: theme.tokens['app-bg'], scheme: theme.scheme })) } catch { /* private mode */ }
}

/**
 * The last theme this browser showed, so the first paint already has it
 * (the account's saved theme replaces it as soon as the profile loads).
 */
export function cachedTheme() {
  try { return localStorage.getItem(CACHE_KEY) } catch { return null }
}
export function cacheTheme(key) {
  try {
    if (key && key !== DEFAULT_THEME) localStorage.setItem(CACHE_KEY, key)
    else localStorage.removeItem(CACHE_KEY)
  } catch { /* private mode: no cache, no harm */ }
}
