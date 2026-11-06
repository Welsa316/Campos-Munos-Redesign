// Theme contract and accessibility (src/data/themes.js): every theme defines
// the same tokens, and every text/background pairing the portal actually
// uses meets WCAG AA (4.5:1 text, 3:1 focus rings and active indicators).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { THEMES, TOKEN_NAMES, DEFAULT_THEME } from '../src/data/themes.js'

const hex = (v) => /^#[0-9a-f]{6}$/i.test(v)
function luminance(h) {
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
const PAIRS = [
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

test('every theme implements the same token contract; Classic is the default', () => {
  assert.equal(THEMES[0].key, DEFAULT_THEME)
  assert.equal(new Set(THEMES.map((t) => t.key)).size, 6)
  for (const t of THEMES) {
    assert.deepEqual(Object.keys(t.tokens).sort(), [...TOKEN_NAMES].sort(), t.key)
    assert.ok(['light', 'dark'].includes(t.scheme), t.key)
  }
})

test('WCAG AA for every pairing the portal uses, in every theme', () => {
  const failures = []
  for (const t of THEMES) {
    for (const [fg, bgs, min] of PAIRS) {
      for (const bg of bgs) {
        const a = t.tokens[fg]
        const b = t.tokens[bg]
        assert.ok(hex(a) && hex(b), `${t.key}: ${fg}/${bg} must be #rrggbb (${a} on ${b})`)
        const ratio = contrast(a, b)
        if (ratio < min) failures.push(`${t.key}: ${fg} ${a} on ${bg} ${b} = ${ratio.toFixed(2)} (needs ${min})`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

// The Updates "new" dot and tag sit on the header, whose background is the
// sidebar colour. Read the colours style.css actually gives them there and
// measure them in every theme (the dot once used the primary, which is
// Classic's sidebar colour: 1.00:1, invisible).
test('the Updates dot and New tag show on the header in every theme', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'style.css'), 'utf8')
  const rule = (sel) => {
    const m = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
    assert.ok(m, `${sel} is styled`)
    return (prop) => {
      const v = new RegExp(`(?:^|;)\\s*${prop}:\\s*var\\(--([\\w-]+)\\)`).exec(m[1])
      assert.ok(v, `${sel} sets ${prop} from a token`)
      return v[1]
    }
  }
  const dot = rule('.nav-chrome .updates-dot')('background-color')
  const tag = rule('.nav-chrome .updates-tag')
  const tagBg = tag('background-color')
  const tagText = tag('color')
  const failures = []
  for (const t of THEMES) {
    for (const bar of ['sidebar-bg', 'sidebar-hover']) {
      const r = contrast(t.tokens[dot], t.tokens[bar])
      if (r < 3) failures.push(`${t.key}: dot ${dot} on ${bar} = ${r.toFixed(2)}`)
    }
    const r = contrast(t.tokens[tagText], t.tokens[tagBg])
    if (r < 4.5) failures.push(`${t.key}: New text ${tagText} on ${tagBg} = ${r.toFixed(2)}`)
  }
  assert.deepEqual(failures, [])
})

// rgb(r g b / a) over an opaque #rrggbb, as the browser blends it.
function over(rgba, base) {
  const m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(rgba)
  assert.ok(m, `scrim must be rgb(r g b / a): ${rgba}`)
  const a = Number(m[4])
  const bg = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16))
  return '#' + [1, 2, 3].map((k, i) => Math.round(Number(m[k]) * a + bg[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
}

test('a scrim visibly dims the panels behind a dialog or slide-over, light and dark', () => {
  const failures = []
  for (const t of THEMES) {
    for (const name of ['scrim', 'scrim-soft']) {
      const dimmed = over(t.tokens[name], t.tokens.surface)
      const ratio = contrast(t.tokens.surface, dimmed)
      if (ratio < 1.25) failures.push(`${t.key}: ${name} over surface ${t.tokens.surface} = ${ratio.toFixed(2)} (needs 1.25)`)
    }
  }
  assert.deepEqual(failures, [])
})

test('status colours mean the same thing in every light theme', () => {
  const light = THEMES.filter((t) => t.scheme === 'light')
  for (const k of ['success', 'warning', 'error', 'info', 'neutral']) {
    assert.equal(new Set(light.map((t) => t.tokens[k])).size, 1, k)
  }
})
