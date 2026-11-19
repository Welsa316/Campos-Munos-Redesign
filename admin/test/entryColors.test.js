// Entry colours (src/data/entryColors.js, src/components/colors/): the
// palette is the server's, every text colour a coloured row can show keeps
// WCAG AA on its tint in every theme, both languages name every colour, and
// a change shows at once and is undone when the server refuses it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ENTRY_COLORS, ENTRY_PALETTE, entryColorCss, isEntryColor } from '../src/data/entryColors.js'
import { ENTRY_COLORS as SERVER_COLORS } from '../../server/colors/palette.js'
import { THEMES } from '../src/data/themes.js'
import { COLOURS } from '../src/i18n/colours.js'
import { missingKeys, makeTranslate } from '../src/i18n/translator.js'
import { entryColor, setEntryColor, settleEntryColors, resetEntryColors } from '../src/components/colors/entryColorStore.js'

const HERE = dirname(fileURLToPath(import.meta.url))

function channels(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) }
function luminance(h) {
  const [r, g, b] = channels(h).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// color-mix(in srgb, a p%, b), as themes.js derives text-strong.
const mix = (a, b, p) => `#${channels(a).map((c, i) => Math.round(c * p + channels(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('')}`

test('the palette is the server’s list, with a tint, hover and edge for light and dark', () => {
  assert.deepEqual([...ENTRY_COLORS], [...SERVER_COLORS])
  assert.deepEqual(Object.keys(ENTRY_PALETTE), [...ENTRY_COLORS])
  assert.equal(ENTRY_COLORS.length, 10)
  for (const k of ENTRY_COLORS) {
    for (const scheme of ['light', 'dark']) {
      for (const part of ['tint', 'hover', 'edge']) assert.match(ENTRY_PALETTE[k][scheme][part], /^#[0-9A-F]{6}$/i, `${k} ${scheme} ${part}`)
      assert.notEqual(ENTRY_PALETTE[k][scheme].tint, ENTRY_PALETTE[k][scheme].hover, `${k} ${scheme}: hover must differ`)
    }
  }
  assert.ok(isEntryColor('teal'))
  assert.ok(!isEntryColor('magenta'))
  assert.ok(!isEntryColor(null))
})

test('every text colour on a coloured row meets WCAG AA (4.5:1) on its tint and hover, in all six themes', () => {
  // Inside a coloured row muted text is raised to secondary (entryColorCss),
  // so muted is not a colour a row shows; everything else is.
  const css = entryColorCss()
  assert.match(css, /\[data-entry-color\]\{[^}]*--text-muted:var\(--text-secondary\)/)
  assert.match(css, /\[data-entry-color\]\{[^}]*--color-gray-500:var\(--text-secondary\)/)
  const FG = ['text-primary', 'text-secondary', 'text-link', 'success', 'warning', 'error', 'info', 'neutral']
  const failures = []
  let worst = { ratio: Infinity }
  assert.equal(THEMES.length, 6)
  for (const theme of THEMES) {
    const tk = theme.tokens
    const fgs = [...FG.map((f) => [f, tk[f]]), ['text-strong', mix(tk['text-primary'], tk['text-secondary'], 0.62)]]
    for (const k of ENTRY_COLORS) {
      for (const part of ['tint', 'hover']) {
        const bg = ENTRY_PALETTE[k][theme.scheme][part]
        for (const [name, fg] of fgs) {
          const ratio = contrast(fg, bg)
          if (ratio < worst.ratio) worst = { ratio, theme: theme.key, k, part, name }
          if (ratio < 4.5) failures.push(`${theme.key} ${k} ${part}: ${name} ${fg} on ${bg} = ${ratio.toFixed(2)}`)
        }
      }
    }
  }
  assert.deepEqual(failures, [], `worst: ${JSON.stringify(worst)}`)
})

test('the dark theme gets its own values through the data-scheme hook themes.js sets', () => {
  const css = entryColorCss()
  assert.match(css, /:root\{[^}]*--ec-red-tint:#FBEAE9;/)
  assert.match(css, /\[data-scheme="dark"\]\{[^}]*--ec-red-tint:#443940;/)
  const themes = readFileSync(join(HERE, '..', 'src', 'data', 'themes.js'), 'utf8')
  assert.match(themes, /setAttribute\('data-scheme', theme\.scheme\)/)
  for (const k of ENTRY_COLORS) assert.ok(css.includes(`[data-entry-color="${k}"],[data-swatch="${k}"]{`), k)
})

test('every colour is named in English and Spanish, and no word is missing in either', () => {
  assert.deepEqual(missingKeys(COLOURS), { inEs: [], inEn: [] })
  const t = makeTranslate(COLOURS)
  for (const lang of ['en', 'es']) {
    const names = ENTRY_COLORS.map((k) => t(lang, `name.${k}`))
    for (const n of names) assert.doesNotMatch(n, /^name\./, `${lang}: ${n}`)
    assert.equal(new Set(names).size, names.length, `${lang}: two colours share a name`)
  }
  assert.equal(t('es', 'none'), 'Sin color')
  assert.equal(t('es', 'menu.item'), 'Color…')
  assert.equal(t('en', 'none'), 'No color')
})

test('a change shows at once, on every row of the same number, and stays once saved', async () => {
  resetEntryColors()
  let release
  const sent = []
  const send = (body) => { sent.push(body); return new Promise((r) => { release = () => r({ ...body }) }) }
  const row = { id: 7, number: '+1 (504) 555-0141', color: null }
  const p = setEntryColor({ kind: 'caller', id: 7, match: row.number, color: 'teal', targets: [row], send })
  // Before the server answers: shown on this row and on another call from the number.
  assert.equal(entryColor('caller', row.number, row.color), 'teal')
  assert.equal(entryColor('caller', '+15045550141', null), 'teal')
  assert.equal(entryColor('caller', '+15045550199', null), null, 'another number is untouched')
  release()
  assert.equal(await p, true)
  assert.deepEqual(sent, [{ kind: 'caller', id: 7, color: 'teal' }])
  assert.equal(row.color, 'teal', 'the row on screen carries the saved colour')
  // A load that started before the change cannot undo it on screen…
  settleEntryColors('caller', Date.now() - 60_000)
  assert.equal(entryColor('caller', '+15045550141', null), 'teal')
  // …a load that started after it is the truth from then on.
  settleEntryColors('caller', Date.now() + 1)
  assert.equal(entryColor('caller', '+15045550141', 'blue'), 'blue')
})

test('a refused change is undone and reported; clearing works the same way', async () => {
  resetEntryColors()
  const errors = []
  const lead = { id: 3, color: 'red' }
  const ok = await setEntryColor({
    kind: 'lead', id: 3, color: 'green', targets: [lead],
    send: async () => { throw Object.assign(new Error('Your account cannot change the colour of this'), { status: 403 }) },
    onError: (e) => errors.push(e.message),
  })
  assert.equal(ok, false)
  assert.equal(entryColor('lead', 3, lead.color), 'red', 'rolled back to what the server has')
  assert.equal(lead.color, 'red')
  assert.deepEqual(errors, ['Your account cannot change the colour of this'])

  const cleared = await setEntryColor({ kind: 'lead', id: 3, color: null, targets: [lead], send: async (b) => b })
  assert.equal(cleared, true)
  assert.equal(entryColor('lead', 3, 'red'), null, 'No colour wins over the stale server value until the next load')
  assert.equal(lead.color, null)
  // A server value outside the palette is never shown.
  resetEntryColors()
  assert.equal(entryColor('reminder', 9, 'magenta'), null)
})

test('a slower earlier change cannot overwrite a later one', async () => {
  resetEntryColors()
  const pending = []
  const send = (body) => new Promise((res, rej) => pending.push({ body, res, rej }))
  const a = setEntryColor({ kind: 'reminder', id: 4, color: 'pink', send, onError: () => {} })
  const b = setEntryColor({ kind: 'reminder', id: 4, color: 'blue', send })
  pending[1].res(pending[1].body)
  await b
  pending[0].rej(new Error('timeout'))
  await a
  assert.equal(entryColor('reminder', 4, null), 'blue')
})
