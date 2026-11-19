// A person's own colours (Home → Themes → Custom; src/data/themes.js): a
// handful of picks derive the full token contract, every pairing the portal
// uses stays WCAG AA whatever they pick, bad input is refused, and the boot
// script puts a cached custom theme on the page before the app loads.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import vm from 'vm'
import {
  THEMES, TOKEN_NAMES, CUSTOM_MAIN, CUSTOM_ADVANCED, buildCustomTheme, normalizeCustom, customFromTheme, settleCustom, applyTheme,
} from '../src/data/themes.js'
import { hex, contrast, PAIRS } from './contrast.js'
import { THEME_WORDS } from '../src/i18n/themes.js'
import { missingKeys } from '../src/i18n/translator.js'

const ADMIN = join(dirname(fileURLToPath(import.meta.url)), '..')

// Same blend as the browser: a over b at alpha.
const blend = (a, b, alpha) => '#' + [1, 3, 5].map((i) => {
  const x = parseInt(a.slice(i, i + 2), 16)
  const y = parseInt(b.slice(i, i + 2), 16)
  return Math.round(x * alpha + y * (1 - alpha)).toString(16).padStart(2, '0')
}).join('')

/** Every failing pairing of a built custom theme, as readable lines. */
function failures(theme, label) {
  const t = theme.tokens
  const out = []
  const check = (fgName, fg, bgName, bg, min) => {
    const r = contrast(fg, bg)
    if (r < min) out.push(`${label}: ${fgName} ${fg} on ${bgName} ${bg} = ${r.toFixed(2)} (needs ${min})`)
  }
  for (const [fg, bgs, min] of PAIRS) {
    for (const bg of bgs) {
      assert.ok(hex(t[fg]) && hex(t[bg]), `${label}: ${fg}/${bg} must be #rrggbb (${t[fg]} on ${t[bg]})`)
      check(fg, t[fg], bg, t[bg], min)
    }
  }
  // The Updates dot and New tag on the header (style.css .nav-chrome).
  for (const bar of ['sidebar-bg', 'sidebar-hover']) check('updates dot', t['icon-sidebar-active'], bar, t[bar], 3)
  // Home's summary cards: glass of the card colour over the page, a white
  // sheen in a light base, words at 70 % opacity, chips on the first card.
  const light = theme.scheme === 'light'
  for (const [k, amount] of [['a', 0.88], ['b', 0.92]]) {
    const card = blend(t[`summary-${k}-bg`], t['app-bg'], amount)
    const sheen = blend('#ffffff', card, light ? 0.22 : 0.03)
    const ink = t[`summary-${k}-text`]
    for (const [name, bg] of [['card', card], ['sheen', sheen]]) {
      check(`summary-${k}-text`, ink, `${name}`, bg, 4.5)
      check(`summary-${k}-text at 70%`, blend(ink, bg, 0.7), name, bg, 4.5)
    }
    const chips = k === 'a' ? [0.7, 0.8].map((a) => blend(t['summary-a-chip'], card, a)) : [t['summary-b-chip']]
    for (const chip of chips) check(`summary-${k}-text`, ink, `summary-${k}-chip`, chip, 4.5)
  }
  return out
}

// A small seeded generator, so a failure names a pick that can be replayed.
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const randomHex = (r) => '#' + [0, 0, 0].map(() => Math.floor(r() * 256).toString(16).padStart(2, '0')).join('')

const AWKWARD = [
  { base: 'light', header: '#FFFF00', primary: '#FFFF00', page: '#FFFF00', surface: '#FFFF00', summaryA: '#FFFF00', summaryB: '#FFFF00' },
  { base: 'light', header: '#FAFAFA', primary: '#FFFFFF', page: '#FFFFFF', surface: '#FFFFFF', summaryA: '#FFFFFF', summaryB: '#FAFAFA' },
  { base: 'light', header: '#808080', primary: '#808080', page: '#808080', surface: '#808080', summaryA: '#808080', summaryB: '#808080' },
  { base: 'dark', header: '#808080', primary: '#808080', page: '#808080', surface: '#808080', summaryA: '#808080', summaryB: '#808080' },
  { base: 'dark', header: '#000000', primary: '#FFFF00', page: '#FFFFFF', surface: '#FFFFFF', summaryA: '#FFFF00', summaryB: '#000000' },
  { base: 'light', header: '#000000', primary: '#000000', page: '#000000', surface: '#000000', summaryA: '#000000', summaryB: '#000000' },
  { base: 'dark', header: '#767676', primary: '#777777', page: '#0A0A0A', surface: '#121212', summaryA: '#FF00FF', summaryB: '#00FFFF' },
  { base: 'light', header: '#00FF00', primary: '#FF0000', page: '#F5F7FA', surface: '#FFFFFF', summaryA: '#0000FF', summaryB: '#FF8800',
    text: '#FFFFFF', link: '#FFFF00', border: '#FFFFFF', navActive: '#00FF00', focus: '#FFFFFF', success: '#CCFFCC', danger: '#FFCCCC', input: '#000000' },
  { base: 'dark', header: '#FFFFFF', primary: '#000080', page: '#101418', surface: '#1A1F25', summaryA: '#FFFFFF', summaryB: '#FFFF00',
    text: '#000000', link: '#000080', border: '#000000', navActive: '#FFFFFF', focus: '#000000', success: '#003300', danger: '#330000', input: '#FFFFFF' },
]

test('a custom theme carries the full token contract, light and dark', () => {
  for (const base of ['light', 'dark']) {
    const theme = buildCustomTheme({ ...customFromTheme(base === 'light' ? 'classic' : 'midnight-dark'), base })
    assert.equal(theme.key, 'custom')
    assert.equal(theme.scheme, base)
    assert.deepEqual(Object.keys(theme.tokens).sort(), [...TOKEN_NAMES].sort(), base)
    for (const [name, value] of Object.entries(theme.tokens)) assert.ok(typeof value === 'string' && value.length, `${base}: ${name} is empty`)
  }
})

test('every pairing passes AA for awkward picks: yellow, near-white, mid-grey, black, clashing advanced colours', () => {
  const all = []
  for (const [i, pick] of AWKWARD.entries()) {
    const theme = buildCustomTheme(pick)
    assert.ok(theme, `awkward #${i} builds`)
    all.push(...failures(theme, `awkward #${i}`))
  }
  assert.deepEqual(all, [])
})

test('every pairing passes AA for 400 random picks, half of them with advanced colours', () => {
  const r = rng(20261120)
  const all = []
  for (let i = 0; i < 400; i++) {
    const pick = { base: r() < 0.5 ? 'light' : 'dark' }
    for (const k of CUSTOM_MAIN) pick[k] = randomHex(r)
    if (i % 2) for (const k of CUSTOM_ADVANCED) if (r() < 0.6) pick[k] = randomHex(r)
    all.push(...failures(buildCustomTheme(pick), `random #${i} ${JSON.stringify(pick)}`))
  }
  assert.deepEqual(all.slice(0, 10), [])
})

test('a colour that cannot carry readable text is nudged, and says so', () => {
  // Mid-grey: neither white nor near-black text reaches 4.5:1 on it.
  const theme = buildCustomTheme({ ...customFromTheme('classic'), header: '#777777' })
  assert.ok(theme.adjusted.includes('header'), theme.adjusted.join())
  assert.notEqual(theme.tokens['sidebar-bg'], '#777777')
  assert.ok(contrast(theme.tokens['text-on-sidebar'], theme.tokens['sidebar-bg']) >= 4.5)
  // A dark page in a light base is lifted into the light range.
  assert.ok(buildCustomTheme({ ...customFromTheme('classic'), page: '#222222' }).adjusted.includes('page'))
  // Pure yellow buttons keep their yellow and get dark words instead.
  const yellow = buildCustomTheme({ ...customFromTheme('classic'), primary: '#FFFF00' })
  assert.equal(yellow.tokens.primary, '#FFFF00')
  assert.ok(!yellow.adjusted.includes('primary'))
  assert.ok(contrast(yellow.tokens['text-on-primary'], '#FFFF00') >= 4.5)
  // A preset's own colours, as the editor starts from them, need no note.
  for (const t of THEMES) assert.deepEqual(buildCustomTheme(customFromTheme(t.key)).adjusted, [], t.key)
  assert.deepEqual(settleCustom(customFromTheme('violet')), customFromTheme('violet'))
})

test('invalid choices are refused', () => {
  const good = customFromTheme('classic')
  assert.ok(normalizeCustom(good))
  const bad = [
    null, undefined, 'custom', 42, [], [good],
    { ...good, base: 'sepia' },
    { ...good, base: undefined },
    { ...good, header: '#FFF' },
    { ...good, header: 'red' },
    { ...good, header: '#GGGGGG' },
    { ...good, header: '#003F8D; background:url(x)' },
    { ...good, primary: 'url(javascript:alert(1))' },
    { ...good, page: 0x003f8d },
    { ...good, extra: '#FFFFFF' },
    { ...good, __proto__x: '#FFFFFF' },
    { ...good, link: 'blue' },
    { ...good, focus: '#12345' },
    (() => { const x = { ...good }; delete x.summaryB; return x })(),
  ]
  for (const b of bad) {
    assert.equal(normalizeCustom(b), null, JSON.stringify(b))
    assert.equal(buildCustomTheme(b), null, JSON.stringify(b))
  }
  // Values come back upper-case; unset advanced colours stay unset.
  const n = normalizeCustom({ ...good, header: '#abcdef', link: null })
  assert.equal(n.header, '#ABCDEF')
  assert.equal('link' in n, false)
})

// A tiny stand-in for the browser: <html>'s style and attributes, and storage.
function fakeBrowser(storage = {}) {
  const props = {}
  const attrs = {}
  const style = { setProperty: (n, v) => { props[n] = v }, backgroundColor: '', colorScheme: '' }
  const documentElement = { style, setAttribute: (n, v) => { attrs[n] = v } }
  const localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v) },
    removeItem: (k) => { delete storage[k] },
  }
  return { document: { documentElement }, localStorage, props, attrs, style, storage }
}

test('the boot script puts a cached custom theme on <html> before the app loads', () => {
  const choices = { base: 'dark', header: '#3B0A45', primary: '#E8A33D', page: '#14101A', surface: '#1E1826', summaryA: '#5A1F2B', summaryB: '#E8A33D' }
  const theme = buildCustomTheme(choices)

  // applyTheme leaves the paint record in storage…
  const app = fakeBrowser()
  globalThis.document = app.document
  globalThis.localStorage = app.localStorage
  try {
    applyTheme('custom', choices)
  } finally {
    delete globalThis.document
    delete globalThis.localStorage
  }
  assert.equal(app.attrs['data-theme'], 'custom')

  // …and on the next load the boot script, alone, applies every token.
  const boot = readFileSync(join(ADMIN, 'public', 'theme-boot.js'), 'utf8')
  const next = fakeBrowser({ 'cm-theme-paint': app.storage['cm-theme-paint'] })
  vm.runInNewContext(boot, { document: next.document, localStorage: next.localStorage, JSON })
  for (const name of TOKEN_NAMES) assert.equal(next.props[`--${name}`], theme.tokens[name], name)
  assert.equal(next.style.backgroundColor, theme.tokens['app-bg'])
  assert.equal(next.style.colorScheme, 'dark')
  assert.equal(next.attrs['data-scheme'], 'dark')

  // A tampered record cannot inject anything but colour values.
  const evil = fakeBrowser({ 'cm-theme-paint': JSON.stringify({ bg: '#000000', scheme: 'dark', tokens: { primary: 'red;} body{display:none', 'x y': '#000000', surface: '#123456' } }) })
  vm.runInNewContext(boot, { document: evil.document, localStorage: evil.localStorage, JSON })
  assert.deepEqual(evil.props, { '--surface': '#123456' })

  // A preset leaves no tokens, so the boot paints only the background.
  const preset = fakeBrowser()
  globalThis.document = preset.document
  globalThis.localStorage = preset.localStorage
  try { applyTheme('violet') } finally { delete globalThis.document; delete globalThis.localStorage }
  const after = fakeBrowser({ 'cm-theme-paint': preset.storage['cm-theme-paint'] })
  vm.runInNewContext(boot, { document: after.document, localStorage: after.localStorage, JSON })
  assert.deepEqual(after.props, {})
  assert.equal(after.style.backgroundColor, THEMES.find((t) => t.key === 'violet').tokens['app-bg'])
})

test('every word of the editor exists in English and Spanish', () => {
  assert.deepEqual(missingKeys(THEME_WORDS), { inEs: [], inEn: [] })
  for (const k of [...CUSTOM_MAIN, ...CUSTOM_ADVANCED]) {
    assert.ok(THEME_WORDS.en[`color.${k}`] && THEME_WORDS.es[`color.${k}`], `a name for ${k}`)
    assert.notEqual(THEME_WORDS.es[`color.${k}`], THEME_WORDS.en[`color.${k}`], `${k} is translated`)
  }
})

test('applyTheme("custom") without valid choices falls back to Classic', () => {
  const b = fakeBrowser()
  globalThis.document = b.document
  globalThis.localStorage = b.localStorage
  try {
    applyTheme('custom', { base: 'light', header: 'nope' })
  } finally {
    delete globalThis.document
    delete globalThis.localStorage
  }
  assert.equal(b.attrs['data-theme'], 'classic')
  assert.equal(b.props['--sidebar-bg'], THEMES[0].tokens['sidebar-bg'])
})
