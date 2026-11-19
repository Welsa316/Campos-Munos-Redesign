// Entry colours: the plain colours staff can give a caller, a website lead or
// a callback reminder (like a Google Keep note). Shared through the server
// (PUT /api/colors); the keys are server/colors/palette.js's, pinned by
// test/entryColors.test.js.
//
// Each key has a soft tint for the row's background, a slightly stronger
// one for hover, and an edge (the 4px bar on the row's left), for light
// themes and for the dark one. Inside a coloured row, muted text is raised
// to the secondary text colour (see entryColorCss), and every text colour a
// row can show keeps WCAG AA (4.5:1) on both tints in all six themes, pinned
// by test/entryColors.test.js. A colour is decoration only: it never stands
// for anything, and the picker names every colour for screen readers.
//
// Not a theme: themes (data/themes.js) are personal; these are shared.

export const ENTRY_COLORS = Object.freeze([
  'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray',
])

export const ENTRY_PALETTE = Object.freeze({
  red: { light: { tint: '#FBEAE9', hover: '#FAE3E2', edge: '#D93025' }, dark: { tint: '#443940', hover: '#523F45', edge: '#F28B82' } },
  orange: { light: { tint: '#FCEBDC', hover: '#FBE4D0', edge: '#E8710A' }, dark: { tint: '#3F3B3B', hover: '#4B423E', edge: '#FCAD70' } },
  yellow: { light: { tint: '#F8EEC5', hover: '#F6E8B1', edge: '#E3B505' }, dark: { tint: '#3A3D38', hover: '#43453A', edge: '#FDD663' } },
  green: { light: { tint: '#E4F1E8', hover: '#DBEDE0', edge: '#1E8E3E' }, dark: { tint: '#2C4041', hover: '#314846', edge: '#81C995' } },
  teal: { light: { tint: '#DDF1F4', hover: '#D2EDF0', edge: '#129EAF' }, dark: { tint: '#293F4B', hover: '#2D4754', edge: '#78D9EC' } },
  blue: { light: { tint: '#E5EFFC', hover: '#DDEAFC', edge: '#1A73E8' }, dark: { tint: '#2E3D52', hover: '#34455D', edge: '#8AB4F8' } },
  purple: { light: { tint: '#F4EAFC', hover: '#F0E3FC', edge: '#9334E6' }, dark: { tint: '#3C3957', hover: '#463F63', edge: '#C58AF9' } },
  pink: { light: { tint: '#FBE9F3', hover: '#F9E2F0', edge: '#D01884' }, dark: { tint: '#43374C', hover: '#503D54', edge: '#FF8BCB' } },
  brown: { light: { tint: '#F1EDEC', hover: '#ECE7E5', edge: '#8D6E63' }, dark: { tint: '#393C42', hover: '#434348', edge: '#C8A898' } },
  gray: { light: { tint: '#EDEEEE', hover: '#E7E8E9', edge: '#80868B' }, dark: { tint: '#343D47', hover: '#3C454F', edge: '#BDC1C6' } },
})

export const isEntryColor = (v) => typeof v === 'string' && ENTRY_COLORS.includes(v)

/**
 * The stylesheet: per-scheme custom properties for every key, and the look
 * of anything marked data-entry-color="<key>" (a row, a card, a chip): the
 * tint behind it and the edge on its left, drawn as a background image so
 * it moves no layout and leaves rings and shadows alone. A picker swatch
 * (data-swatch="<key>") is filled with the edge colour.
 */
export function entryColorCss() {
  const vars = (scheme) => ENTRY_COLORS.map((k) => {
    const v = ENTRY_PALETTE[k][scheme]
    return `--ec-${k}-tint:${v.tint};--ec-${k}-hover:${v.hover};--ec-${k}-edge:${v.edge};`
  }).join('')
  const keys = ENTRY_COLORS.map((k) => `[data-entry-color="${k}"],[data-swatch="${k}"]{--ec-tint:var(--ec-${k}-tint);--ec-hover:var(--ec-${k}-hover);--ec-edge:var(--ec-${k}-edge);}`).join('\n')
  return `:root{${vars('light')}}
[data-scheme="dark"]{${vars('dark')}}
${keys}
[data-entry-color]{
  background-color:var(--ec-tint)!important;
  background-image:linear-gradient(to right,var(--ec-edge) 0 4px,transparent 4px)!important;
  --text-muted:var(--text-secondary);
  --color-gray-500:var(--text-secondary);
}
[data-entry-color]:hover{background-color:var(--ec-hover)!important;}
[data-entry-color][data-reminder-chip]{width:fit-content;max-width:100%;border-radius:6px;padding-top:2px;padding-bottom:2px;padding-right:8px;}
[data-entry-color]:has([aria-current="true"]){outline:2px solid var(--focus-ring);outline-offset:-2px;}
[data-swatch]{background-color:var(--ec-edge);}
`
}

const STYLE_ID = 'entry-color-tokens'

/** Put the stylesheet on the page once (from any component that shows colours). */
export function ensureEntryColorStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = entryColorCss()
  document.head.appendChild(el)
}
