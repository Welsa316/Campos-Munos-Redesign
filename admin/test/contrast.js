// WCAG contrast, measured independently of src/data/themes.js, and the
// text/background pairings the portal actually uses (themes.test.js checks
// the six presets with them, customTheme.test.js every custom theme).
import assert from 'node:assert/strict'

export const hex = (v) => /^#[0-9a-f]{6}$/i.test(v)
export function luminance(h) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

// [foreground, [backgrounds], minimum]
const TEXT = 4.5
const UI = 3
export const PAIRS = [
  ['text-primary', ['surface', 'surface-elevated', 'app-bg', 'content-bg', 'surface-subtle', 'surface-hover', 'surface-selected', 'input-bg'], TEXT],
  ['text-secondary', ['surface', 'surface-elevated', 'app-bg', 'content-bg', 'surface-subtle', 'surface-hover', 'input-bg'], TEXT],
  // Muted text is also every field's placeholder (on input-bg).
  ['text-muted', ['surface', 'app-bg', 'content-bg', 'surface-subtle', 'input-bg'], TEXT],
  ['text-link', ['surface', 'app-bg', 'content-bg', 'surface-subtle', 'primary-soft'], TEXT],
  ['text-on-primary', ['primary', 'primary-hover', 'success-solid', 'warning-solid', 'danger-solid', 'danger-solid-hover', 'info-solid', 'inverse-bg'], TEXT],
  ['text-on-sidebar', ['sidebar-bg', 'sidebar-hover', 'sidebar-active'], TEXT],
  ['text-sidebar-muted', ['sidebar-bg', 'sidebar-hover'], TEXT],
  ['icon-on-sidebar', ['sidebar-bg', 'sidebar-hover'], UI],
  ['sidebar-danger', ['sidebar-bg', 'sidebar-hover'], TEXT],
  ['success', ['success-soft', 'surface'], TEXT],
  ['warning', ['warning-soft', 'surface'], TEXT],
  ['error', ['error-soft', 'surface', 'app-bg'], TEXT],
  ['info', ['info-soft', 'surface'], TEXT],
  ['neutral', ['neutral-soft', 'surface'], TEXT],
  ['focus-ring', ['surface', 'app-bg'], UI],
  // A field's edge is how it is found (WCAG 1.4.11), wherever it sits.
  ['input-border', ['surface', 'input-bg', 'app-bg', 'content-bg', 'surface-subtle'], UI],
  ['primary-ring', ['surface', 'app-bg'], UI],
  ['icon-active', ['surface'], UI],
  ['icon-primary', ['surface', 'app-bg'], UI],
  ['icon-secondary', ['surface'], UI],
  ['icon-sidebar-active', ['sidebar-active'], UI],
]

// rgb(r g b / a) over an opaque #rrggbb, as the browser blends it.
export function over(rgba, base) {
  const m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(rgba)
  assert.ok(m, `scrim must be rgb(r g b / a): ${rgba}`)
  const a = Number(m[4])
  const bg = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16))
  return '#' + [1, 2, 3].map((k, i) => Math.round(Number(m[k]) * a + bg[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
}
