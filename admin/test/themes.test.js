// Theme contract and accessibility (src/data/themes.js): every theme defines
// the same tokens, and every text/background pairing the portal actually
// uses meets WCAG AA (4.5:1 text, 3:1 focus rings and active indicators).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { THEMES, TOKEN_NAMES, DEFAULT_THEME } from '../src/data/themes.js'
import { hex, contrast, PAIRS, over } from './contrast.js'

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
