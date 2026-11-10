// Blog content integrity. These run against the real article data, so a typo
// in a link path, a translation that drops a block, or a broken **bold** marker
// fails here instead of shipping as a dead link or literal asterisks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { posts } from '../src/data/blog/posts.js'
import { baseServices } from '../src/data/seoServices.js'
import { parseInline } from '../src/utils/inlineMarkup.js'

const ARTICLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'blog', 'articles')
const LOCALES = ['es', 'en']

const articles = {}
for (const post of posts) {
  articles[post.slug] = (await import(join(ARTICLES, `${post.slug}.js`))).default
}

// Every string in a content tree that may carry inline markup.
function inlineStrings(content) {
  const out = []
  for (const b of content.blocks) {
    if (b.text) out.push(b.text)
    if (b.items) out.push(...b.items)
  }
  for (const f of content.faqs || []) out.push(f.q, f.a)
  return out
}

// Pages the site actually serves (mirrors src/router/index.js).
const validPaths = new Set([
  '/', '/servicios', '/consulta', '/pago', '/acerca-de', '/blog',
  ...Object.keys(baseServices).map(s => `/servicios/${s}`),
  ...['juan', 'angenette', 'diana', 'rio'].map(m => `/el-equipo/${m}`),
  ...posts.map(p => `/blog/${p.slug}`),
])

test('parseInline turns links and bold into parts and leaves plain text alone', () => {
  assert.deepEqual(parseInline('Vea [la guía](/blog/x) y **esto**.'), [
    { type: 'text', text: 'Vea ' },
    { type: 'link', text: 'la guía', to: '/blog/x' },
    { type: 'text', text: ' y ' },
    { type: 'bold', text: 'esto' },
    { type: 'text', text: '.' },
  ])
  // External URLs are not links: articles only point inside the site.
  assert.deepEqual(parseInline('[x](https://evil.example)'), [{ type: 'text', text: '[x](https://evil.example)' }])
})

test('every post has a unique slug, a real service and an ISO date', () => {
  assert.equal(new Set(posts.map(p => p.slug)).size, posts.length)
  for (const p of posts) {
    assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.slug)
    assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, p.slug)
    if (p.service !== null) assert.ok(baseServices[p.service], `${p.slug}: unknown service ${p.service}`)
    else assert.ok(p.topic?.es && p.topic?.en && p.coverText, `${p.slug}: no service, so it needs topic + coverText`)
    for (const loc of LOCALES) {
      assert.ok(p.title[loc]?.trim(), `${p.slug}: missing ${loc} title`)
      assert.ok(p.description[loc]?.length <= 200, `${p.slug}: ${loc} description over 200 chars`)
    }
  }
})

test('every article file belongs to a post (no orphans)', () => {
  const files = readdirSync(ARTICLES).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  assert.deepEqual(files.sort(), posts.map(p => p.slug).sort())
})

test('English mirrors Spanish block for block, link for link', () => {
  for (const [slug, a] of Object.entries(articles)) {
    assert.ok(a.es && a.en, `${slug}: missing a locale`)
    assert.equal(a.en.blocks.length, a.es.blocks.length, `${slug}: block count`)
    a.es.blocks.forEach((es, i) => {
      const en = a.en.blocks[i]
      const where = `${slug} block ${i} (${es.type})`
      assert.equal(en.type, es.type, where)
      assert.equal((en.items || []).length, (es.items || []).length, `${where}: list length`)
      assert.equal((en.head || []).length, (es.head || []).length, `${where}: table columns`)
      assert.deepEqual((en.rows || []).map(r => r.length), (es.rows || []).map(r => r.length), `${where}: table rows`)
      const links = b => [b.text, ...(b.items || [])].filter(Boolean).flatMap(s => parseInline(s)).filter(p => p.type === 'link').map(p => p.to)
      assert.deepEqual(links(en), links(es), `${where}: link targets`)
    })
    assert.equal(a.en.faqs.length, a.es.faqs.length, `${slug}: FAQ count`)
  }
})

test('every inline link points at a page the site serves', () => {
  for (const [slug, a] of Object.entries(articles)) {
    for (const loc of LOCALES) {
      for (const s of inlineStrings(a[loc])) {
        for (const part of parseInline(s)) {
          if (part.type === 'link') assert.ok(validPaths.has(part.to), `${slug}/${loc}: dead link ${part.to}`)
        }
      }
    }
  }
})

test('no malformed markup survives as literal characters', () => {
  for (const [slug, a] of Object.entries(articles)) {
    for (const loc of LOCALES) {
      for (const s of inlineStrings(a[loc])) {
        for (const part of parseInline(s)) {
          if (part.type !== 'text') continue
          assert.ok(!/\*\*|\]\(|\[[^\]]*\]/.test(part.text), `${slug}/${loc}: stray markup in "${part.text}"`)
        }
      }
    }
  }
})

test('the firm name is always spelled Campos Muños', () => {
  for (const [slug, a] of Object.entries(articles)) {
    const all = JSON.stringify(a)
    assert.ok(!/Campos Muñoz|Campus Mu/i.test(all), `${slug}: misspelled firm name`)
  }
})
