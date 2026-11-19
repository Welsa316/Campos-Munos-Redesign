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
    // The two summary cards on Home (missed calls, unread messages): a card
    // colour, its words, and the chips on it. A preset keeps the rose card
    // and the navigation-coloured one; a custom theme picks its own.
    'summary-a-bg': t['error-soft'],
    'summary-a-text': t.error,
    'summary-a-chip': t.surface,
    'summary-b-bg': t['sidebar-bg'],
    'summary-b-text': t['text-on-sidebar'],
    'summary-b-chip': t['sidebar-hover'],
  }
}
for (const theme of THEMES) Object.assign(theme.tokens, derived(theme.tokens, theme.scheme))

export const DEFAULT_THEME = 'classic'
export const CUSTOM_THEME = 'custom'
export const TOKEN_NAMES = Object.keys(THEMES[0].tokens)
export const isTheme = (key) => THEMES.some((t) => t.key === key)
export const themeByKey = (key) => THEMES.find((t) => t.key === key) || THEMES[0]

// ---------------------------------------------------------------------------
// Custom theme: a person's own colours, saved on their account only
// (admin_users.custom_theme; server/auth/themes.js validates the same keys).
//
// They pick a handful of colours and light or dark; every other token is
// derived here, so the whole portal follows without anyone choosing sixty
// colours. Whatever they pick, every text colour is pushed until it meets
// WCAG AA on the backgrounds it sits on (4.5:1 text, 3:1 icons, rings and
// field edges); where a picked background cannot carry readable text, the
// background itself is nudged and the editor says "adjusted for
// readability". Pinned by test/customTheme.test.js.
// ---------------------------------------------------------------------------

/** The main colours everyone picks (all required). */
export const CUSTOM_MAIN = ['header', 'primary', 'page', 'surface', 'summaryA', 'summaryB']
/** Further colours under "More colours" (each optional: unset = derived). */
export const CUSTOM_ADVANCED = ['text', 'link', 'border', 'navActive', 'focus', 'success', 'danger', 'input']
export const CUSTOM_KEYS = ['base', ...CUSTOM_MAIN, ...CUSTOM_ADVANCED]
const HEX = /^#[0-9a-f]{6}$/i

/**
 * The person's choices, cleaned: { base, header, …, [advanced] } with
 * upper-case #RRGGBB values, or null when anything is unknown or malformed.
 */
export function normalizeCustom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (Object.keys(input).some((k) => !CUSTOM_KEYS.includes(k))) return null
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
 * A starting point: the colours of a preset, light or dark as it is, already
 * settled (any colour the readability rules would move is moved), so the
 * editor opens without an "adjusted" note the person did not cause.
 */
export function customFromTheme(key) {
  const theme = themeByKey(key)
  const t = theme.tokens
  return settleCustom({
    base: theme.scheme,
    header: t['sidebar-bg'], primary: t.primary, page: t['app-bg'], surface: t.surface,
    summaryA: t['error-soft'], summaryB: t['sidebar-bg'],
  })
}

// Where each main choice ends up in the built theme.
const MAIN_TOKEN = { header: 'sidebar-bg', primary: 'primary', page: 'app-bg', surface: 'surface', summaryA: 'summary-a-bg', summaryB: 'summary-b-bg' }

/** The choices with every adjusted main colour replaced by what is actually shown. */
export function settleCustom(input) {
  const built = buildCustomTheme(input)
  if (!built) return null
  const out = { ...built.choices }
  for (const k of built.adjusted) if (MAIN_TOKEN[k]) out[k] = built.tokens[MAIN_TOKEN[k]]
  return out
}

// --- colour arithmetic (sRGB, as the browser blends) --------------------------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
/** a with t (0–1) of b mixed in. */
export const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
export function luminance(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// AA is 4.5:1 for text and 3:1 for icons, rings and field edges; aimed a
// hair above so a browser's rounding of a blend never lands just under.
const TEXT = 4.55
const UI = 3.05
const WHITE = '#FFFFFF'
const BLACK = '#000000'
// Text at partial opacity, as the browser draws it.
const faded = (fg, bg, alpha) => mix(bg, fg, alpha)
const isLight = (c) => luminance(c) > 0.18

/** The least of `color` pushed toward `to` that satisfies ok (or `to` itself). */
function push(color, to, ok) {
  if (ok(color)) return color
  let lo = 0
  let hi = 1
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (ok(mix(color, to, mid))) hi = mid
    else lo = mid
  }
  return mix(color, to, hi)
}
/** Lighter or darker, whichever reads better against these backgrounds. */
function awayFrom(bgs) {
  const w = Math.min(...bgs.map((b) => contrast(WHITE, b)))
  const k = Math.min(...bgs.map((b) => contrast(BLACK, b)))
  return w >= k ? WHITE : BLACK
}
/** A text/icon colour that reaches `min` on every one of `bgs`. */
function readable(fg, bgs, min) {
  return push(fg, awayFrom(bgs), (c) => bgs.every((b) => contrast(c, b) >= min))
}
/** A background that carries `fg` at `min`: pushed away from the text. */
function carries(bg, fg, min) {
  return push(bg, isLight(fg) ? BLACK : WHITE, (c) => contrast(fg, c) >= min)
}
/** White-ish or near-black text for a background, tinted toward it. */
function inkFor(bg) {
  const light = mix(WHITE, bg, 0.04)
  const dark = mix('#10141A', bg, 0.12)
  return contrast(light, bg) >= TEXT || contrast(light, bg) >= contrast(dark, bg) ? light : dark
}

const PAGE_LIGHT_MIN = 0.45 // a light page or card is at least this bright (about #B4B4B4)
const PAGE_DARK_MAX = 0.06 // a dark one at most this (about #464646)
function fitBase(color, light) {
  return light
    ? push(color, WHITE, (c) => luminance(c) >= PAGE_LIGHT_MIN)
    : push(color, BLACK, (c) => luminance(c) <= PAGE_DARK_MAX)
}

/**
 * A full theme ({ key: 'custom', scheme, tokens, choices, adjusted }) from a
 * person's choices, or null when they do not validate. `adjusted` lists the
 * choices that were changed to keep the portal readable.
 */
export function buildCustomTheme(input) {
  const c = normalizeCustom(input)
  if (!c) return null
  const light = c.base === 'light'
  const adjusted = new Set()
  const note = (key, before, after) => { if (before.toUpperCase() !== after.toUpperCase()) adjusted.add(key) }

  // Page and cards, kept in the range of the chosen base.
  const page = fitBase(c.page, light)
  note('page', c.page, page)
  const surface = fitBase(c.surface, light)
  note('surface', c.surface, surface)
  const tint = c.primary
  const t = {}
  t['app-bg'] = page
  t.surface = surface
  t['content-bg'] = mix(page, surface, 0.4)
  t['surface-elevated'] = light ? surface : mix(surface, WHITE, 0.06)
  t['input-bg'] = fitBase(c.input || (light ? mix(surface, page, 0.15) : mix(surface, page, 0.35)), light)
  if (c.input) note('input', c.input, t['input-bg'])
  t['surface-subtle'] = light ? mix(surface, tint, 0.06) : mix(surface, WHITE, 0.04)
  t['surface-hover'] = light ? mix(surface, tint, 0.09) : mix(surface, WHITE, 0.08)
  t['surface-selected'] = light ? mix(surface, tint, 0.14) : mix(surface, tint, 0.26)
  t['primary-soft'] = light ? mix(surface, tint, 0.12) : mix(surface, tint, 0.22)

  // Text on the page and the cards.
  const textBgs = ['surface', 'surface-elevated', 'app-bg', 'content-bg', 'surface-subtle', 'surface-hover', 'surface-selected', 'input-bg', 'primary-soft'].map((k) => t[k])
  const quietBgs = ['surface', 'surface-elevated', 'app-bg', 'content-bg', 'surface-subtle', 'surface-hover', 'input-bg'].map((k) => t[k])
  t['text-primary'] = readable(c.text || (light ? mix('#151A21', tint, 0.1) : mix('#F1F4F8', tint, 0.05)), textBgs, TEXT)
  if (c.text) note('text', c.text, t['text-primary'])
  t['text-secondary'] = readable(mix(t['text-primary'], surface, 0.3), quietBgs, TEXT)
  t['text-muted'] = readable(mix(t['text-primary'], surface, 0.38), quietBgs, TEXT)
  t['text-link'] = readable(c.link || (light ? c.primary : mix(c.primary, WHITE, 0.45)), [surface, page, t['content-bg'], t['surface-subtle'], t['primary-soft']], TEXT)
  if (c.link) note('link', c.link, t['text-link'])
  t['icon-primary'] = readable(mix(t['text-primary'], surface, 0.2), [surface, page], UI)
  t['icon-secondary'] = readable(mix(t['text-primary'], surface, 0.4), [surface], UI)
  t['icon-muted'] = mix(t['text-primary'], surface, 0.5)

  // Buttons: the primary colour carries its own text, white or near-black.
  // Every solid fill shares that text colour (it is the portal's one "text
  // on a colour"), so the status fills are re-fitted to it as well.
  const inkPick = inkFor(c.primary)
  const onPrimary = contrast(inkPick, c.primary) >= TEXT ? inkPick : (contrast(WHITE, c.primary) >= contrast(BLACK, c.primary) ? WHITE : '#0B0D10')
  const primary = carries(c.primary, onPrimary, TEXT)
  note('primary', c.primary, primary)
  const away = isLight(onPrimary) ? BLACK : WHITE
  t.primary = primary
  t['text-on-primary'] = onPrimary
  t['primary-hover'] = carries(mix(primary, away, isLight(onPrimary) ? 0.14 : 0.2), onPrimary, TEXT)
  t['icon-active'] = readable(primary, [surface], UI)

  // Status colours: the base's own set, re-fitted to these cards.
  const S = light ? LIGHT_STATUS : DARK_STATUS
  for (const k of ['success', 'warning', 'error', 'info', 'neutral']) {
    const soft = light ? mix(surface, S[k], 0.1) : mix(surface, S[k], 0.16)
    t[`${k}-soft`] = soft
    t[k] = readable(S[k], [soft, surface, page], TEXT)
  }
  for (const k of ['success-solid', 'warning-solid', 'info-solid']) t[k] = carries(S[k], onPrimary, TEXT)
  if (c.success) {
    t['success-solid'] = carries(c.success, onPrimary, TEXT)
    note('success', c.success, t['success-solid'])
  }
  t['danger-solid'] = carries(c.danger || S['danger-solid'], onPrimary, TEXT)
  if (c.danger) note('danger', c.danger, t['danger-solid'])
  t['danger-solid-hover'] = carries(mix(t['danger-solid'], away, 0.12), onPrimary, TEXT)

  // The header (the portal's navigation bar) and its text.
  const onHeader = inkFor(c.header)
  const header = carries(c.header, onHeader, TEXT)
  note('header', c.header, header)
  const toward = (n) => mix(header, onHeader, n)
  t['sidebar-bg'] = header
  t['text-on-sidebar'] = onHeader
  t['sidebar-hover'] = carries(toward(0.08), onHeader, TEXT)
  t['sidebar-active'] = carries(c.navActive || toward(0.16), onHeader, TEXT)
  if (c.navActive) note('navActive', c.navActive, t['sidebar-active'])
  t['sidebar-border'] = toward(0.18)
  const barBgs = [header, t['sidebar-hover']]
  t['text-sidebar-muted'] = readable(mix(onHeader, header, 0.25), barBgs, TEXT)
  t['icon-on-sidebar'] = readable(mix(onHeader, header, 0.15), barBgs, UI)
  t['icon-sidebar-active'] = onHeader

  // Lines, field edges and focus.
  t.border = c.border || mix(surface, t['text-primary'], 0.13)
  t['border-strong'] = mix(surface, t['text-primary'], 0.24)
  t.divider = mix(surface, t['text-primary'], 0.08)
  t['input-border'] = readable(mix(surface, t['text-primary'], 0.45), [surface, t['input-bg'], page, t['content-bg'], t['surface-subtle']], UI)
  t['focus-ring'] = readable(c.focus || (light ? c.primary : mix(c.primary, WHITE, 0.35)), [surface, page], UI)
  if (c.focus) note('focus', c.focus, t['focus-ring'])

  // Accent and charts: the person's colours, in steps.
  t.accent = mix(c.primary, header, 0.45)
  t['accent-soft'] = mix(surface, t.accent, 0.12)
  t['chart-1'] = light ? primary : mix(primary, WHITE, 0.35)
  t['chart-2'] = mix(t['chart-1'], surface, 0.35)
  t['chart-3'] = mix(t['chart-1'], surface, 0.6)
  t['chart-4'] = light ? header : mix(header, WHITE, 0.45)
  t['chart-5'] = mix(t['text-primary'], surface, 0.55)

  Object.assign(t, derived(t, c.base))
  // Measured versions of what derived() would mix or fix, where a pairing
  // must hold for any colour.
  t['primary-ring'] = readable(light ? primary : t['focus-ring'], [surface, page], UI)
  // The "inverse" button (Save) is near-black (light) or a lifted slate
  // (dark) under white words; when the buttons carry dark words (a yellow
  // or pink primary), it would turn a washed-out grey, so it takes the
  // primary colour instead.
  if (isLight(onPrimary)) {
    t['inverse-bg'] = carries(light ? t['text-primary'] : mix(surface, WHITE, 0.16), onPrimary, TEXT)
    t['inverse-bg-hover'] = carries(mix(t['inverse-bg'], away, 0.12), onPrimary, TEXT)
  } else {
    t['inverse-bg'] = primary
    t['inverse-bg-hover'] = t['primary-hover']
  }
  t['sidebar-danger'] = readable(isLight(onHeader) ? '#FFC2C2' : '#8F1D1D', barBgs, TEXT)

  // Home's two summary cards. Each is glass: its colour at 88–92 % over the
  // page, a light sheen in the top corner (light base), some words at 70 %
  // opacity, and chips of the chip colour at 70–80 % on the missed-calls
  // card (the round arrow and the "all called back" pill).
  for (const [k, key, amount] of [['a', 'summaryA', 0.88], ['b', 'summaryB', 0.92]]) {
    // For one card colour: its words and chip, and whether they all read.
    const fit = (bg) => {
      const card = mix(page, bg, amount)
      const sheen = light ? mix(card, WHITE, 0.22) : mix(card, WHITE, 0.03)
      const lightInk = isLight(inkFor(card))
      const chip = k === 'a' ? (lightInk ? mix(bg, BLACK, 0.3) : mix(bg, WHITE, 0.55)) : mix(bg, lightInk ? WHITE : BLACK, 0.1)
      const chips = k === 'a' ? [mix(card, chip, 0.7), mix(card, chip, 0.8)] : [chip]
      const solid = [card, sheen, ...chips]
      const ok = (x) => solid.every((b) => contrast(x, b) >= TEXT) && [card, sheen].every((b) => contrast(faded(x, b, 0.7), b) >= TEXT)
      const ink = push(inkFor(card), lightInk ? WHITE : BLACK, ok)
      return { ink, chip, ok: ok(ink), lightInk }
    }
    const first = fit(c[key])
    // Too close to the middle for any words: darken (or lighten) the card.
    const bg = first.ok ? c[key] : push(c[key], first.lightInk ? BLACK : WHITE, (b) => fit(b).ok)
    const { ink, chip } = fit(bg)
    t[`summary-${k}-bg`] = bg
    t[`summary-${k}-text`] = ink
    t[`summary-${k}-chip`] = chip
    note(key, c[key], bg)
  }

  const tokens = {}
  for (const name of TOKEN_NAMES) tokens[name] = t[name]
  return { key: CUSTOM_THEME, name: 'Custom', scheme: c.base, tokens, choices: c, adjusted: CUSTOM_KEYS.filter((k) => adjusted.has(k)) }
}

const CACHE_KEY = 'cm.theme'
const CUSTOM_CACHE_KEY = 'cm.theme.custom'

function cachedCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_CACHE_KEY) || 'null') } catch { return null }
}

/**
 * Put a theme on the page: every token becomes a custom property on <html>.
 * 'custom' takes the person's choices (else the ones cached in this
 * browser); without valid choices it falls back to Classic. A live preview
 * passes { remember: false }, so a reload mid-edit paints the saved theme.
 */
export function applyTheme(key, custom, { remember = true } = {}) {
  if (typeof document === 'undefined') return null
  const theme = (key === CUSTOM_THEME && buildCustomTheme(custom ?? cachedCustom())) || themeByKey(key)
  const root = document.documentElement
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(`--${name}`, value)
  root.setAttribute('data-theme', theme.key)
  // Light or dark, for the few rules that differ by scheme rather than by theme.
  root.setAttribute('data-scheme', theme.scheme)
  // Native form controls and scrollbars follow too.
  root.style.colorScheme = theme.scheme
  root.style.backgroundColor = theme.tokens['app-bg']
  // What public/theme-boot.js paints first on the next load, before this
  // runs. A custom theme's colours exist nowhere else, so all its tokens go
  // too and the boot puts them on <html> straight away.
  if (remember) {
    const paint = { bg: theme.tokens['app-bg'], scheme: theme.scheme }
    if (theme.key === CUSTOM_THEME) paint.tokens = theme.tokens
    try { localStorage.setItem('cm-theme-paint', JSON.stringify(paint)) } catch { /* private mode */ }
  }
  return theme
}

/**
 * The last theme this browser showed, so the first paint already has it
 * (the account's saved theme replaces it as soon as the profile loads).
 */
export function cachedTheme() {
  try { return localStorage.getItem(CACHE_KEY) } catch { return null }
}
/** Remember the theme (and the person's custom colours) for the next load; cacheTheme(null) forgets both. */
export function cacheTheme(key, custom) {
  try {
    if (key && key !== DEFAULT_THEME) localStorage.setItem(CACHE_KEY, key)
    else localStorage.removeItem(CACHE_KEY)
    const c = normalizeCustom(custom)
    if (c) localStorage.setItem(CUSTOM_CACHE_KEY, JSON.stringify(c))
    else if (!key) localStorage.removeItem(CUSTOM_CACHE_KEY)
  } catch { /* private mode: no cache, no harm */ }
}
